const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const START_DATE =
  process.env.START_DATE ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const HORIZON_DAYS = Math.min(Math.max(Number(process.env.HORIZON_DAYS || 180), 1), 220);
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAGE_SIZE || process.env.LIMIT || 500), 1), 1000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const request = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const normalize = (value) =>
  decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`´']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const monthKeysBetween = (startDate, endDate) => {
  const keys = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
};

const seriesKey = (value) => {
  const text = normalize(value);
  if (/\bdefected\b/.test(text)) return text.includes("closing") ? "defected_closing" : "defected";
  if (/\bmasquerade\b|\bclaptone\b/.test(text)) return text.includes("closing") ? "masquerade_closing" : "masquerade";
  if (/\bsaga\b|\bbedouin\b/.test(text)) return text.includes("closing") ? "saga_closing" : "saga";
  if (/\bla troya\b/.test(text)) return text.includes("closing") ? "la_troya_closing" : "la_troya";
  if (/\bmahmut orhan\b/.test(text)) return text.includes("closing") ? "mahmut_orhan_closing" : "mahmut_orhan";
  if (/\banjunadeep\b/.test(text)) return "anjunadeep";
  if (/\bechoes of tomorrow\b|\bmajor league djz\b/.test(text)) return "echoes_of_tomorrow";
  if (/\bappetite\b/.test(text)) return "appetite";
  return "";
};

const dateFromEventSlug = (slug) => {
  const match = String(slug || "").match(/-(\d{2})-(\d{2})-(20\d{2})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const dateFromUnixSeconds = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
};

const isVisible = (row) => {
  const status = String(row.status || "").toLowerCase();
  return status !== "hidden" && status !== "cancelled" && !row.source_missing_since;
};

const isFourvenuesOwnedChinois = (row) =>
  Boolean(row.fourvenues_event_id) ||
  String(row.notion_page_id || "").startsWith("fourvenues:") ||
  /fourvenues\.com\/iframe\/ibiza-maps/i.test(String(row.event_url || ""));

const isPrimaryChannelManagerRow = (row) => /fourvenues\.com\/iframe\/ibiza-maps/i.test(String(row.event_url || ""));

const eventText = (row) => `${row.event_name || ""} ${row.event_series || ""} ${row.lineup_details || ""}`;

const scoreMatch = (row, candidate) => {
  if (!row || !candidate || row.date !== candidate.date) return 0;
  const rowSeries = seriesKey(eventText(row));
  const candidateSeries = seriesKey(candidate.eventName);
  if (rowSeries && candidateSeries && rowSeries === candidateSeries) return 100;
  if (String(row.event_url || "").includes(`/${candidate.code}`)) return 90;
  if (String(row.event_url || "").includes(`${candidate.code}`)) return 75;

  const candidateWords = new Set(normalize(candidate.eventName).split(" ").filter((word) => word.length > 3));
  const rowWords = normalize(eventText(row)).split(" ").filter((word) => word.length > 3);
  return rowWords.filter((word) => candidateWords.has(word)).length;
};

const scrapeChinoisPublicEvents = async (startDate, endDate) => {
  const candidatesByKey = new Map();
  const months = monthKeysBetween(startDate, endDate);

  for (const month of months) {
    const url = `https://web.fourvenues.com/en/iframe/chinois-ibiza/events?date=${month}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const html = await response.text();

    for (const match of html.matchAll(
      /data-eventslug="([^"]+)"\s+data-eventcode="([^"]+)"\s+data-eventname="([^"]+)"\s+data-eventdate="([^"]+)"\s+data-eventid="([^"]+)"/g,
    )) {
      const [, slug, code, rawName, rawTimestamp, eventId] = match;
      const date = dateFromEventSlug(slug) || dateFromUnixSeconds(rawTimestamp);
      if (!date || date < startDate || date > endDate) continue;
      const eventName = decodeHtmlEntities(rawName).replace(/\s+/g, " ").trim();
      const exactUrl = `https://web.fourvenues.com/en/iframe/chinois-ibiza/events/${slug}-${code}`;
      candidatesByKey.set(`${date}:${code}`, {
        date,
        eventName,
        slug,
        code,
        eventId,
        timestamp: rawTimestamp,
        url: exactUrl,
        sourceCalendarUrl: url,
      });
    }
  }

  return [...candidatesByKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.eventName.localeCompare(b.eventName));
};

const fetchAllRows = async (startDate, endDate) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      select:
        "id,notion_page_id,event_name,event_series,lineup_details,date,slug,venue,event_url,status,source_missing_since,fourvenues_event_id,mikes_pick,featured_on_party_calendar,residents_pass",
      venue: "eq.Chinois",
      order: "date.asc",
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    params.append("date", `gte.${startDate}`);
    params.append("date", `lte.${endDate}`);
    const page = await request(`ibiza_events?${params.toString()}`);
    rows.push(...(page || []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  return rows;
};

const chooseCandidate = (row, candidatesByDate) => {
  const candidates = candidatesByDate.get(row.date) || [];
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreMatch(row, candidate) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || a.candidate.eventName.localeCompare(b.candidate.eventName));
  return scored[0] || null;
};

const endDate = addDays(START_DATE, HORIZON_DAYS);
const [rows, candidates] = await Promise.all([fetchAllRows(START_DATE, endDate), scrapeChinoisPublicEvents(START_DATE, endDate)]);
const visibleRows = rows.filter(isVisible);
const fourvenuesRows = visibleRows.filter(isPrimaryChannelManagerRow);
const duplicateCandidateRows = visibleRows.filter((row) => !isPrimaryChannelManagerRow(row));

const candidatesByDate = new Map();
for (const candidate of candidates) {
  candidatesByDate.set(candidate.date, [...(candidatesByDate.get(candidate.date) || []), candidate]);
}

const targetEventIds = fourvenuesRows.map((row) => row.id);
const optionRows = [];
for (let index = 0; index < targetEventIds.length; index += 100) {
  const ids = targetEventIds.slice(index, index + 100);
  if (ids.length === 0) continue;
  optionRows.push(
    ...(await request(
      `event_booking_options?select=id,ibiza_event_id,kind,provider,label,url,priority,active,metadata&active=eq.true&ibiza_event_id=in.(${ids.join(",")})`,
    )),
  );
}

const optionsByEvent = new Map();
for (const option of optionRows) {
  optionsByEvent.set(option.ibiza_event_id, [...(optionsByEvent.get(option.ibiza_event_id) || []), option]);
}

const actions = [];
for (const row of fourvenuesRows) {
  const match = chooseCandidate(row, candidatesByDate);
  if (!match) continue;

  const sameDateLegacy = duplicateCandidateRows
    .map((legacy) => ({ legacy, score: scoreMatch(legacy, match.candidate) }))
    .filter((item) => item.legacy.date === row.date && item.score >= 4)
    .sort((a, b) => b.score - a.score);
  const duplicateLegacy = sameDateLegacy[0]?.legacy || null;

  const existingOptions = optionsByEvent.get(row.id) || [];
  const broadFallbackOptions = existingOptions.filter(
    (option) =>
      option.active &&
      option.kind === "official_event_page" &&
      /https:\/\/chinois\.com\/events-and-tickets\/?$/i.test(option.url),
  );
  const weakerOfficialOptions = existingOptions.filter(
    (option) =>
      option.active &&
      option.kind === "official_event_page" &&
      (/https:\/\/chinois\.com\/events(?:\/|-and-tickets\/?$)/i.test(option.url) ||
        /https:\/\/web\.fourvenues\.com\/(?:en\/)?(?:iframe\/)?chinois-ibiza/i.test(option.url)),
  );
  const hasExactOption = existingOptions.some(
    (option) =>
      option.active &&
      option.kind === "tickets" &&
      option.url.replace(/\/$/, "") === match.candidate.url.replace(/\/$/, ""),
  );

  const option = {
    ibiza_event_id: row.id,
    kind: "tickets",
    provider: "official_venue",
    label: "Tickets",
    url: match.candidate.url,
    priority: 10,
    source_url: match.candidate.sourceCalendarUrl,
    source_event_id: duplicateLegacy?.id || null,
    verified_at: new Date().toISOString(),
    active: true,
    confidence: 0.92,
    metadata: {
      generated_from: "chinois-exact-official-links-repair",
      fourvenues_public_event_code: match.candidate.code,
      fourvenues_public_event_id: match.candidate.eventId,
      fourvenues_public_event_name: match.candidate.eventName,
      matched_score: match.score,
      matched_legacy_event_id: duplicateLegacy?.id || null,
      note: "Exact public Chinois/Fourvenues event ticket page. Non-channel fallback until Chinois Channel Manager ticket rates are exposed.",
    },
  };

  const eventUpdate = {};
  if (duplicateLegacy?.mikes_pick && !row.mikes_pick) eventUpdate.mikes_pick = true;
  if (duplicateLegacy?.featured_on_party_calendar && !row.featured_on_party_calendar) {
    eventUpdate.featured_on_party_calendar = true;
  }
  if (duplicateLegacy?.residents_pass && duplicateLegacy.residents_pass !== row.residents_pass) {
    eventUpdate.residents_pass = duplicateLegacy.residents_pass;
  }

  actions.push({
    row,
    candidate: match.candidate,
    matchScore: match.score,
    option,
    hasExactOption,
    broadFallbackOptions,
    weakerOfficialOptions,
    duplicateLegacy,
    eventUpdate,
  });
}

const canonicalEventIds = new Set(actions.map((action) => action.row.id));
const matchedDuplicateIds = new Set(actions.map((action) => action.duplicateLegacy?.id).filter(Boolean));
const duplicateGroups = new Map();

for (const row of visibleRows) {
  const key = `${row.date}:${seriesKey(eventText(row)) || normalize(row.event_name)}`;
  duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), row]);
}

const extraDuplicateRows = [];
for (const group of duplicateGroups.values()) {
  if (group.length < 2) continue;
  const canonical =
    group.find((row) => canonicalEventIds.has(row.id)) ||
    group.find((row) => /fourvenues\.com\/iframe\/ibiza-maps/i.test(String(row.event_url || ""))) ||
    null;
  if (!canonical) continue;

  for (const row of group) {
    if (row.id === canonical.id || matchedDuplicateIds.has(row.id)) continue;
    if (/-club-chinois-club-chinois-/.test(row.slug || "") || !/fourvenues\.com\/iframe\/ibiza-maps/i.test(String(row.event_url || ""))) {
      extraDuplicateRows.push(row);
    }
  }
}

const broadFallbackIds = [
  ...new Set(
    actions.flatMap((action) =>
      [...action.broadFallbackOptions, ...action.weakerOfficialOptions].map((option) => option.id),
    ),
  ),
];
const duplicateLegacyRows = [
  ...new Map(
    [
      ...actions.filter((action) => action.duplicateLegacy).map((action) => action.duplicateLegacy),
      ...extraDuplicateRows,
    ].map((row) => [row.id, row]),
  ).values(),
];

const summary = {
  apply: APPLY,
  start_date: START_DATE,
  end_date: endDate,
  horizon_days: HORIZON_DAYS,
  scraped_public_fourvenues_events: candidates.length,
  visible_chinois_rows: visibleRows.length,
  fourvenues_rows: fourvenuesRows.length,
  duplicate_candidate_rows: duplicateCandidateRows.length,
  matched_fourvenues_rows: actions.length,
  exact_options_to_insert_or_refresh: actions.filter((action) => !action.hasExactOption).length,
  weaker_official_options_to_deactivate: broadFallbackIds.length,
  duplicate_legacy_rows_to_hide: duplicateLegacyRows.length,
  extra_duplicate_rows_to_hide: extraDuplicateRows.length,
  preview: actions.slice(0, 50).map((action) => ({
    date: action.row.date,
    event: action.row.event_name,
    current_event_url: action.row.event_url,
    exact_url: action.candidate.url,
    matched_public_name: action.candidate.eventName,
    score: action.matchScore,
    has_exact_option: action.hasExactOption,
    broad_fallback_count: action.broadFallbackOptions.length,
    weaker_official_count: action.weakerOfficialOptions.length,
    duplicate_legacy_event: action.duplicateLegacy?.event_name || null,
  })),
};

console.log(JSON.stringify(summary, null, 2));

if (!APPLY || actions.length === 0) {
  process.exit(0);
}

await request("event_booking_options?on_conflict=ibiza_event_id,kind,provider,url", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(actions.map((action) => action.option)),
});

const now = new Date().toISOString();
for (const action of actions) {
  if (Object.keys(action.eventUpdate).length > 0) {
    await request(`ibiza_events?id=eq.${action.row.id}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify(action.eventUpdate),
    });
  }
}

for (const optionId of broadFallbackIds) {
  const option = optionRows.find((item) => item.id === optionId);
  await request(`event_booking_options?id=eq.${optionId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      active: false,
      metadata: {
        ...(option?.metadata || {}),
        deactivated_by: "chinois-exact-official-links-repair",
        deactivated_at: now,
        deactivation_reason: "replaced_weaker_chinois_official_link_with_exact_public_fourvenues_event_url",
      },
    }),
  });
}

for (const legacy of duplicateLegacyRows) {
  await request(`ibiza_events?id=eq.${legacy.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      status: "Hidden",
      source_missing_since: now,
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_chinois_exact_links",
    records_upserted: actions.length,
    metadata: {
      status: "success",
      summary,
      repair:
        "Seeded exact Chinois public Fourvenues event links, deactivated weaker Chinois official fallback options, and hid matched duplicate legacy rows.",
    },
  }),
});

console.log(
  JSON.stringify(
    {
      inserted_or_refreshed_exact_options: actions.length,
      deactivated_weaker_official_options: broadFallbackIds.length,
      hidden_duplicate_legacy_rows: duplicateLegacyRows.length,
    },
    null,
    2,
  ),
);
