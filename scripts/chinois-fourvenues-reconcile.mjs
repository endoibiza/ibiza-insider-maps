const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const HORIZON_DAYS = Math.min(Math.max(Number(process.env.HORIZON_DAYS || 7), 1), 220);
const CHINOIS_ORGANIZATION_ID = process.env.ORGANIZATION_ID || "wlw4t6xtf013101dd1sstd9pw5199tkW";

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
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const todayMadrid = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`´']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeLineup = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/,([^\s])/g, ", $1")
    .replace(/\s+,/g, ",")
    .trim();

const genericLineupPattern =
  /\b(line-?ups? will be revealed|coming soon|tba|to be announced|special guests|residents?|returns? to chinois|every friday|every sunday|this residency|expect |set in the heart|ibiza cult favourite|shakespeare was right|bedouin return|following a standout|house music|another huge night)\b/i;

const artistListFromEventName = (eventName) => {
  const text = String(eventName || "");
  const colonIndex = text.indexOf(":");
  if (colonIndex === -1) return "";
  const candidate = normalizeLineup(text.slice(colonIndex + 1));
  if (!candidate || genericLineupPattern.test(candidate)) return "";
  if (!candidate.includes(",")) return "";
  return candidate;
};

const lineupItems = (value) => {
  const text = normalizeLineup(value);
  if (!text || genericLineupPattern.test(text) || text.length > 260) return [];
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

const displayNameFromFourvenues = (row) => {
  const raw = String(row.event_name || "").trim();
  const prefix = raw.includes(":") ? raw.split(":")[0].trim() : raw;
  const key = seriesKey(raw);
  if (key === "saga") return "Bedouin presents Saga at Chinois";
  if (key === "saga_closing") return "Bedouin presents Saga Closing at Chinois";
  if (key === "masquerade") return "Claptone: The Masquerade at Chinois";
  if (key === "masquerade_closing") return "Claptone: The Masquerade Closing at Chinois";
  if (key === "defected") return "Defected at Chinois";
  if (key === "defected_closing") return "Defected Closing at Chinois";
  if (key === "la_troya") return "La Troya at Chinois";
  if (key === "la_troya_closing") return "La Troya Closing at Chinois";
  if (key === "appetite") return "Appetite x Chinois";
  return prefix && !/ at chinois$/i.test(prefix) ? `${prefix} at Chinois` : prefix || "Chinois";
};

const chooseLineup = (fourvenuesRow, legacyRow) => {
  const fromTitle = artistListFromEventName(fourvenuesRow.event_name);
  const fromFourvenues = normalizeLineup(fourvenuesRow.lineup_details);
  const fromLegacy = normalizeLineup(legacyRow?.lineup_details);
  const candidates = [
    { source: "fourvenues_title", text: fromTitle, count: lineupItems(fromTitle).length },
    { source: "fourvenues_lineup", text: fromFourvenues, count: lineupItems(fromFourvenues).length },
    { source: "legacy_lineup", text: fromLegacy, count: lineupItems(fromLegacy).length },
  ].filter((candidate) => candidate.text && candidate.count > 0);

  if (candidates.length === 0) {
    return { text: "Lineup TBA", source: "fourvenues_unpublished", count: 0 };
  }

  candidates.sort((a, b) => b.count - a.count || (a.source === "fourvenues_title" ? -1 : 1));
  return candidates[0];
};

const visibleStatus = (row) => {
  const status = String(row.status || "").toLowerCase();
  return status !== "hidden" && status !== "cancelled" && !row.source_missing_since;
};

const scoreMatch = (fourvenuesRow, legacyRow) => {
  if (!legacyRow || fourvenuesRow.date !== legacyRow.date) return 0;
  const fvText = `${fourvenuesRow.event_name || ""} ${fourvenuesRow.event_series || ""}`;
  const legacyText = `${legacyRow.event_name || ""} ${legacyRow.event_series || ""} ${legacyRow.lineup_details || ""}`;
  const fvSeries = seriesKey(fvText);
  const legacySeries = seriesKey(legacyText);
  if (fvSeries && legacySeries && fvSeries === legacySeries) return 100;

  const fvWords = new Set(normalize(fvText).split(" ").filter((word) => word.length > 3));
  const legacyWords = normalize(legacyText).split(" ").filter((word) => word.length > 3);
  const overlap = legacyWords.filter((word) => fvWords.has(word)).length;
  return overlap;
};

const findLegacyMatch = (fourvenuesRow, legacyRows) => {
  const scored = legacyRows
    .map((legacy) => ({ legacy, score: scoreMatch(fourvenuesRow, legacy) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.legacy ?? null;
};

const copyableOption = (option, targetEventId, sourceEventId) => ({
  ibiza_event_id: targetEventId,
  kind: option.kind,
  provider: option.provider,
  label: option.label,
  url: option.url,
  priority: Math.max(Number(option.priority || 60), 25),
  source_url: option.source_url || option.url,
  source_event_id: sourceEventId,
  verified_at: new Date().toISOString(),
  active: true,
  confidence: Math.min(Number(option.confidence || 0.82), 0.9),
  metadata: {
    ...(option.metadata || {}),
    copied_from_event_id: sourceEventId,
    generated_from: "chinois-fourvenues-reconcile",
    note: "Preserved legacy official/manual link as fallback because Chinois Channel Manager did not expose ticket rates.",
  },
});

const today = todayMadrid();
const endDate = addDays(today, HORIZON_DAYS);

const params = new URLSearchParams({
  select:
    "id,notion_page_id,event_name,event_series,lineup_details,date,slug,venue,source,event_url,status,source_missing_since,fourvenues_event_id,fourvenues_organization_id,mikes_pick,featured_on_party_calendar,residents_pass",
  venue: "eq.Chinois",
  date: `gte.${today}`,
  date: `gte.${today}`,
  order: "date.asc",
  limit: "500",
});

// URLSearchParams cannot represent both bounds with the same key in object form.
params.delete("date");
params.append("date", `gte.${today}`);
params.append("date", `lte.${endDate}`);

const rows = await request(`ibiza_events?${params.toString()}`);
const visibleRows = (rows || []).filter(visibleStatus);
const fourvenuesRows = visibleRows.filter(
  (row) =>
    row.fourvenues_event_id ||
    String(row.notion_page_id || "").startsWith("fourvenues:") ||
    row.fourvenues_organization_id === CHINOIS_ORGANIZATION_ID,
);
const legacyRows = visibleRows.filter(
  (row) => !row.fourvenues_event_id && !String(row.notion_page_id || "").startsWith("fourvenues:"),
);

const legacyByDate = new Map();
for (const legacy of legacyRows) {
  legacyByDate.set(legacy.date, [...(legacyByDate.get(legacy.date) || []), legacy]);
}

const fvEventIds = fourvenuesRows.map((row) => row.id);
const legacyEventIds = legacyRows.map((row) => row.id);
const allEventIds = [...fvEventIds, ...legacyEventIds];
const options =
  allEventIds.length > 0
    ? await request(
        `event_booking_options?select=*&ibiza_event_id=in.(${allEventIds.join(",")})&active=eq.true&order=priority.asc`,
      )
    : [];

const optionsByEvent = new Map();
for (const option of options || []) {
  optionsByEvent.set(option.ibiza_event_id, [...(optionsByEvent.get(option.ibiza_event_id) || []), option]);
}

const actions = [];
const unmatchedFourvenues = [];

for (const fourvenuesRow of fourvenuesRows) {
  const legacy = findLegacyMatch(fourvenuesRow, legacyByDate.get(fourvenuesRow.date) || []);
  if (!legacy) {
    unmatchedFourvenues.push({
      id: fourvenuesRow.id,
      date: fourvenuesRow.date,
      event_name: fourvenuesRow.event_name,
      lineup_source: chooseLineup(fourvenuesRow, null).source,
    });
  }

  const lineup = chooseLineup(fourvenuesRow, legacy);
  const update = {};
  if (legacy?.event_name) {
    update.event_name = legacy.event_name;
  } else {
    update.event_name = displayNameFromFourvenues(fourvenuesRow);
  }

  if (lineup.text) update.lineup_details = lineup.text;
  if (legacy?.mikes_pick && !fourvenuesRow.mikes_pick) update.mikes_pick = true;
  if (legacy?.featured_on_party_calendar && !fourvenuesRow.featured_on_party_calendar) {
    update.featured_on_party_calendar = true;
  }
  if (legacy?.residents_pass && legacy.residents_pass !== fourvenuesRow.residents_pass) {
    update.residents_pass = legacy.residents_pass;
  }
  update.status = "Published";
  update.source_missing_since = null;

  const fvOptions = optionsByEvent.get(fourvenuesRow.id) || [];
  const fvHasTickets = fvOptions.some((option) => option.kind === "tickets" && option.provider === "fourvenues");
  const legacyOptions = legacy ? optionsByEvent.get(legacy.id) || [] : [];
  const copiedOptions = fvHasTickets ? [] : legacyOptions.map((option) => copyableOption(option, fourvenuesRow.id, legacy.id));
  const hasUsableOption = fvOptions.length > 0 || copiedOptions.length > 0 || Boolean(fourvenuesRow.event_url);

  const hideLegacy = Boolean(legacy && lineup.text && hasUsableOption);

  actions.push({
    fourvenuesRow,
    legacy,
    update,
    copiedOptions,
    hideLegacy,
    lineup,
    fvHasTickets,
    fvOptionKinds: fvOptions.map((option) => `${option.kind}:${option.provider}`),
  });
}

const summary = {
  apply: APPLY,
  window: { today, end_date: endDate, horizon_days: HORIZON_DAYS },
  chinois_org_id: CHINOIS_ORGANIZATION_ID,
  rows_checked: rows?.length ?? 0,
  visible_rows: visibleRows.length,
  fourvenues_rows: fourvenuesRows.length,
  legacy_rows: legacyRows.length,
  matched_fourvenues_rows: actions.filter((action) => action.legacy).length,
  legacy_rows_to_hide: actions.filter((action) => action.hideLegacy).length,
  copied_legacy_options: actions.reduce((total, action) => total + action.copiedOptions.length, 0),
  fourvenues_ticket_rows: actions.filter((action) => action.fvHasTickets).length,
  lineup_sources: actions.reduce((counts, action) => {
    counts[action.lineup.source] = (counts[action.lineup.source] || 0) + 1;
    return counts;
  }, {}),
  action_preview: actions.slice(0, 40).map((action) => ({
    date: action.fourvenuesRow.date,
    fourvenues_event: action.fourvenuesRow.event_name,
    legacy_event: action.legacy?.event_name || null,
    update_event_name: action.update.event_name,
    lineup_source: action.lineup.source,
    lineup: action.update.lineup_details || null,
    copy_options: action.copiedOptions.map((option) => `${option.kind}:${option.provider}`),
    hide_legacy: action.hideLegacy,
    mikes_pick: Boolean(action.update.mikes_pick || action.fourvenuesRow.mikes_pick),
    fv_options: action.fvOptionKinds,
  })),
  unmatched_fourvenues: unmatchedFourvenues.slice(0, 40),
};

console.log(JSON.stringify(summary, null, 2));

if (!APPLY || actions.length === 0) {
  process.exit(0);
}

const now = new Date().toISOString();
let updatedRows = 0;
let copiedOptions = 0;
let hiddenLegacy = 0;

for (const action of actions) {
  await request(`ibiza_events?id=eq.${action.fourvenuesRow.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(action.update),
  });
  updatedRows += 1;

  if (action.copiedOptions.length > 0) {
    await request("event_booking_options?on_conflict=ibiza_event_id,kind,provider,url", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(action.copiedOptions),
    });
    copiedOptions += action.copiedOptions.length;
  }

  if (action.hideLegacy) {
    await request(`ibiza_events?id=eq.${action.legacy.id}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        status: "Hidden",
        source_missing_since: now,
        notes: null,
      }),
    });
    hiddenLegacy += 1;

    if (action.legacy.event_url) {
      await request("event_source_links?on_conflict=event_id,source_url", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          event_id: action.fourvenuesRow.id,
          source_url: action.legacy.event_url,
          source_type: "official_venue",
          source_label: "Legacy Chinois source preserved before duplicate hide",
          source_key: `chinois-fourvenues-reconcile-${action.legacy.date}-${action.legacy.id}`,
          canonical_for_updates: false,
          confidence: 0.9,
          status: "active",
          raw_metadata: {
            generated_from: "chinois-fourvenues-reconcile",
            hidden_duplicate_event_id: action.legacy.id,
            replacement_event_id: action.fourvenuesRow.id,
          },
        }),
      });
    }
  }
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_chinois_fourvenues_reconcile",
    records_upserted: updatedRows,
    metadata: {
      status: "success",
      horizon_days: HORIZON_DAYS,
      hidden_legacy_duplicates: hiddenLegacy,
      copied_legacy_options: copiedOptions,
      protected_fields: ["mikes_pick", "featured_on_party_calendar", "residents_pass"],
      summary,
    },
  }),
});

console.log(JSON.stringify({ updated_rows: updatedRows, copied_options: copiedOptions, hidden_legacy: hiddenLegacy }, null, 2));
