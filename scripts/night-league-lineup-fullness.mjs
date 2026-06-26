import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY_STAGING = String(process.env.APPLY_STAGING || "false").toLowerCase() === "true";
const INCLUDE_FULL_REFRESH = String(process.env.INCLUDE_FULL_REFRESH || "false").toLowerCase() === "true";
const WINDOW_DAYS = Math.min(Math.max(Number(process.env.WINDOW_DAYS || 180), 1), 260);
const LIMIT = Math.min(Math.max(Number(process.env.LIMIT || 260), 1), 500);
const OUTPUT_FILE = process.env.OUTPUT_FILE || "night-league-lineup-fullness-report.md";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sourcePages = {
  unvrsCalendar: "https://www.unvrs.com/events-calendar",
  ushuaiaCalendar: "https://www.theushuaiaexperience.com/en/club/calendar",
  hiCalendar: "https://www.hiibiza.com/events-calendar?from=23-06-2026&to=20-09-2026",
  playaSoleil: "https://www.playasoleil.com",
};

const trackedVenues = ["UNVRS Ibiza", "Ushuaïa Ibiza", "Hï Ibiza", "Playa Soleil"];
const trackedSeries = [
  "ANYMA",
  "John Summit",
  "David Guetta",
  "Galactic Circus",
  "Martin Garrix",
  "Calvin Harris",
  "Swedish House Mafia",
  "Famous",
  "HUGEL",
  "Dom Dolla",
  "Glitterbox",
  "Black Coffee",
  "Eric Prydz",
  "Afterlife",
  "Playa Soleil",
];

const acronymAllowlist = new Set([
  "2MANYDJS",
  "8KAYS",
  "ALOK",
  "ANOTR",
  "ANYMA",
  "ARTBAT",
  "DJ",
  "HUGEL",
  "JO",
  "LP",
  "MK",
  "RY",
  "SHM",
  "TBA",
  "TSHA",
  "UNVRS",
  "ZSS",
]);

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");

const normalizeWhitespace = (value) => decodeHtmlEntities(value).replace(/\s+/g, " ").trim();

const stripTags = (value) =>
  normalizeWhitespace(
    decodeHtmlEntities(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );

const normalizeKey = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeUrl = (value) => String(value || "").replace(/\\\//g, "/");

const titleCaseAllCaps = (token) => {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  const bare = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (acronymAllowlist.has(bare.toUpperCase())) return trimmed;
  if (!/[A-Z]/.test(trimmed) || /[a-z]/.test(trimmed)) return trimmed;
  if (bare.length <= 2) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[-'([{/\s])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
};

const cleanArtistName = (value) =>
  normalizeWhitespace(value)
    .replace(/\s+([,()])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .split(/\s+/)
    .map((token) => {
      if (/^(b2b|live|hybrid|dj|set)$/i.test(token)) return token.toLowerCase();
      return titleCaseAllCaps(token);
    })
    .join(" ")
    .replace(/\bDj\b/g, "DJ")
    .replace(/\bB2b\b/gi, "b2b")
    .replace(/\bMk\b/g, "MK")
    .replace(/\bAnyma\b/g, "ANYMA")
    .replace(/\bAlok\b/g, "ALOK")
    .replace(/\bTsha\b/g, "TSHA")
    .replace(/\bZss\b/g, "ZSS")
    .replace(/\bHugel\b/g, "HUGEL")
    .replace(/\bLp\b/g, "LP")
    .trim();

const cleanupLineup = (value) => {
  const text = decodeHtmlEntities(value)
    .replace(/\\n/g, "\n")
    .replace(/\\\//g, "/")
    .replace(/\r/g, "\n")
    .replace(/\s*[•·]\s*/g, "\n")
    .replace(/\s*,\s*/g, "\n");

  const artists = text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(artists?|line-?up|theatre|club room|main room|terrace|garden|room|stage)$/i.test(item))
    .filter((item) => !/^(special guests?|resident djs?|guest djs?|coming soon|lineup tba|artists? tba)$/i.test(item))
    .filter((item) => !/^\+?\s*(?:more\s*)?(?:tba|tbc)$/i.test(item))
    .map((item) => cleanArtistName(item))
    .filter(Boolean);

  return [...new Set(artists)].join(", ");
};

const isGenericLineup = (value) =>
  !normalizeWhitespace(value) ||
  /\b(tba|tbc|coming soon|resident djs?|special guests?|guest djs?|lineup not yet posted|to be announced)\b/i.test(value) ||
  /(?:^|,\s*)\+\s*(?:more\s*)?(?:tba|tbc)(?:,|$)/i.test(value) ||
  /&\s*more\b/i.test(value);

const lineupsEqual = (left, right) => normalizeKey(left) === normalizeKey(right);

const artistTokens = (value) =>
  cleanupLineup(value)
    .split(/\s*,\s*/)
    .map(normalizeKey)
    .filter(Boolean);

const isHeadlinerOnly = (event) => {
  const lineup = normalizeWhitespace(event.lineup_details);
  if (!lineup || isGenericLineup(lineup)) return false;
  if (lineup.includes(",")) return false;

  const haystack = normalizeKey(`${event.event_name} ${event.event_series || ""}`);
  const lineupKey = normalizeKey(lineup);
  if (!lineupKey || !haystack.includes(lineupKey)) return false;

  return trackedSeries.some((series) => haystack.includes(normalizeKey(series)));
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

const addDays = (date, days) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const text = await response.text();
  return { url, status: response.status, text };
};

const getJsonName = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) return getJsonName(value.name);
  return "";
};

const getEventObjects = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(getEventObjects);
  if (typeof value !== "object") return [];
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  const own = types.some((type) => typeof type === "string" && /Event$/.test(type)) ? [value] : [];
  return [...own, ...getEventObjects(value["@graph"])];
};

const parseJsonLdEvents = (html) => {
  const events = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      events.push(...getEventObjects(JSON.parse(match[1].trim())));
    } catch {
      // Ignore malformed source JSON-LD.
    }
  }
  return events;
};

const parseUnvrs = (html) => {
  const parsed = [];
  for (const event of parseJsonLdEvents(html)) {
    const date = String(event.startDate || "").slice(0, 10);
    const eventName = normalizeWhitespace(event.name);
    if (!date || !eventName || !String(event.url || "").includes("/events/2026/")) continue;
    const performers = Array.isArray(event.performer)
      ? event.performer.map((performer) => getJsonName(performer)).filter(Boolean)
      : [];
    const lineup = cleanupLineup(performers.join("\n"));
    if (!lineup) continue;
    parsed.push({
      date,
      venue: "UNVRS Ibiza",
      event_name: eventName,
      lineup,
      source_url: String(event.url),
      source_page: sourcePages.unvrsCalendar,
      source_type: "official_venue",
      source_key: "night-league-unvrs-jsonld",
    });
  }
  return parsed;
};

const parseUshuaia = (html, sourcePage) => {
  const decoded = normalizeUrl(decodeHtmlEntities(html));
  const records = [];
  const pattern =
    /"(?<date>2026-\d{2}-\d{2})":\[\{"image":[\s\S]*?"lineup":"(?<lineup>[\s\S]*?)"[\s\S]*?"url":"(?<url>https:\/\/www\.clubtickets\.com[^"]+)"/g;

  for (const match of decoded.matchAll(pattern)) {
    const date = match.groups?.date;
    const url = normalizeUrl(match.groups?.url || "");
    const slug = url.split("/clubbing/ushuaia-ibiza/")[1]?.split("/")[0] || "";
    const lineup = cleanupLineup(match.groups?.lineup || "");
    if (!date || !slug || !lineup) continue;

    records.push({
      date,
      venue: "Ushuaïa Ibiza",
      event_name: slug.replace(/-/g, " "),
      event_slug: slug,
      lineup,
      source_url: `https://www.theushuaiaexperience.com/en/club/events/${slug}-on-${date}`,
      ticket_url: url,
      source_page: sourcePage,
      source_type: "official_venue",
      source_key: "night-league-ushuaia-livewire",
    });
  }

  const unique = new Map();
  for (const record of records) unique.set(`${record.date}:${record.event_slug}`, record);
  return [...unique.values()];
};

const parseHi = (html) => {
  const parsed = [];
  for (const event of parseJsonLdEvents(html)) {
    const date = String(event.startDate || "").slice(0, 10);
    const eventName = normalizeWhitespace(event.name);
    if (!date || !eventName || !String(event.url || "").includes("/events/")) continue;
    const performers = Array.isArray(event.performer)
      ? event.performer.map((performer) => getJsonName(performer)).filter(Boolean)
      : [];
    const lineup = cleanupLineup(performers.join("\n"));
    if (!lineup) continue;
    parsed.push({
      date,
      venue: "Hï Ibiza",
      event_name: eventName,
      lineup,
      source_url: String(event.url),
      source_page: sourcePages.hiCalendar,
      source_type: "official_venue",
      source_key: "night-league-hi-jsonld",
    });
  }
  return parsed;
};

const scoreMatch = (event, source) => {
  if (event.date !== source.date || event.venue !== source.venue) return 0;
  const eventText = normalizeKey(`${event.event_name} ${event.event_series || ""} ${event.lineup_details || ""} ${event.event_url || ""}`);
  const sourceText = normalizeKey(`${source.event_name} ${source.event_slug || ""} ${source.source_url || ""} ${source.ticket_url || ""}`);
  const tokens = sourceText.split(/\s+/).filter((token) => token.length > 2);
  const overlap = tokens.filter((token) => eventText.includes(token)).length;
  const direct = sourceText && eventText.includes(sourceText) ? 0.4 : 0;
  const slugScore = source.event_slug && eventText.includes(normalizeKey(source.event_slug)) ? 0.45 : 0;
  const titleScore = overlap / Math.max(tokens.length, 1);
  return Math.min(1, direct + slugScore + titleScore);
};

const chooseSource = (event, sources) =>
  sources
    .map((source) => ({ source, score: scoreMatch(event, source) }))
    .filter((entry) => entry.score >= 0.3)
    .sort((left, right) => right.score - left.score)[0] || null;

const proposalHashFor = (eventId, sourceUrl, lineup) =>
  createHash("sha256").update(`${eventId}|${sourceUrl}|${cleanupLineup(lineup).toLowerCase()}`).digest("hex");

const table = (headers, rows) => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map((cell) => normalizeWhitespace(cell).replace(/\|/g, "\\|")).join(" | ")} |`),
].join("\n");

const startDate = todayMadrid();
const endDate = addDays(startDate, WINDOW_DAYS);

const { data: events, error } = await supabase
  .from("ibiza_events")
  .select("id,notion_page_id,event_name,date,venue,event_series,event_url,lineup_details,status,source_missing_since,fourvenues_event_id")
  .in("venue", trackedVenues)
  .gte("date", startDate)
  .lte("date", endDate)
  .is("source_missing_since", null)
  .neq("status", "Cancelled")
  .order("date", { ascending: true })
  .limit(LIMIT);

if (error) throw error;

const visibleEvents = (events || []).filter((event) => {
  const status = String(event.status || "").toLowerCase();
  return status !== "hidden" && status !== "cancelled" && !event.source_missing_since;
});

const sourceFetches = await Promise.allSettled([
  fetchText(sourcePages.unvrsCalendar),
  fetchText(sourcePages.ushuaiaCalendar),
  fetchText(sourcePages.hiCalendar),
  fetchText(sourcePages.playaSoleil),
]);

const sourceFailures = [];
const sourceResults = {};
for (const result of sourceFetches) {
  if (result.status === "fulfilled") {
    sourceResults[result.value.url] = result.value;
  } else {
    sourceFailures.push(String(result.reason?.message || result.reason));
  }
}

const sourceRecords = [
  ...parseUnvrs(sourceResults[sourcePages.unvrsCalendar]?.text || ""),
  ...parseUshuaia(sourceResults[sourcePages.ushuaiaCalendar]?.text || "", sourcePages.ushuaiaCalendar),
  ...parseHi(sourceResults[sourcePages.hiCalendar]?.text || ""),
];

const sourceByVenue = sourceRecords.reduce((acc, source) => {
  acc[source.venue] = (acc[source.venue] || 0) + 1;
  return acc;
}, {});

const issueRows = visibleEvents.map((event) => ({
  event,
  missingLineup: !normalizeWhitespace(event.lineup_details),
  genericLineup: isGenericLineup(event.lineup_details),
  headlinerOnly: isHeadlinerOnly(event),
}));

const proposals = [];
const queued = [];
const checked = [];

for (const row of issueRows) {
  const event = row.event;
  const match = chooseSource(event, sourceRecords);
  checked.push({ event, match });
  if (!match) {
    if (row.missingLineup || row.genericLineup || row.headlinerOnly) {
      queued.push({ event, reason: "no_exact_official_source_match" });
    }
    continue;
  }

  const source = match.source;
  const currentLineup = normalizeWhitespace(event.lineup_details);
  const proposedLineup = cleanupLineup(source.lineup);
  const proposedTokens = artistTokens(proposedLineup);
  const currentTokens = artistTokens(currentLineup);

  if (isGenericLineup(proposedLineup) || proposedTokens.length < 2) {
    queued.push({ event, source, reason: "official_source_has_no_clean_full_lineup" });
    continue;
  }

  if (lineupsEqual(currentLineup, proposedLineup)) {
    continue;
  }

  const canUpdate =
    row.missingLineup ||
    row.genericLineup ||
    row.headlinerOnly ||
    (INCLUDE_FULL_REFRESH && proposedTokens.length > currentTokens.length);

  if (!canUpdate) {
    queued.push({ event, source, reason: "current_lineup_not_obviously_weaker" });
    continue;
  }

  proposals.push({
    event,
    source,
    current_lineup_details: currentLineup,
    proposed_lineup_details: proposedLineup,
    match_score: match.score,
  });
}

const runId = randomUUID();

if (APPLY_STAGING && proposals.length) {
  const runInsert = await supabase.from("event_ingestion_runs").insert({
    id: runId,
    run_type: "manual",
    mode: "shadow",
    status: "completed",
    source_keys: ["night-league-fullness"],
    window_start: startDate,
    window_end: endDate,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    sources_seen: Object.keys(sourceResults).length,
    candidates_seen: proposals.length,
    existing_matches: checked.filter((entry) => entry.match).length,
    events_inserted: 0,
    events_updated: 0,
    source_failures: sourceFailures,
    metadata: {
      job: "night_league_lineup_fullness",
      source_records_by_venue: sourceByVenue,
      staged_public_writes: 0,
    },
  });
  if (runInsert.error) throw runInsert.error;

  const sourceLinkRows = proposals.map(({ event, source, match_score }) => ({
    event_id: event.id,
    source_url: source.source_url,
    source_type: source.source_type,
    source_key: source.source_key,
    source_label: `${source.venue} official lineup source`,
    canonical_for_updates: true,
    monetizable: false,
    confidence: Math.max(0.9, Math.min(0.99, match_score)),
    last_checked_at: new Date().toISOString(),
    status: "active",
    raw_metadata: {
      generated_from: "night-league-lineup-fullness",
      event_date: event.date,
      source_page: source.source_page,
      ticket_url: source.ticket_url || null,
      match_score,
    },
  }));

  const sourceLinkResult = await supabase
    .from("event_source_links")
    .upsert(sourceLinkRows, { onConflict: "event_id,source_url" })
    .select("id,event_id,source_url");
  if (sourceLinkResult.error) throw sourceLinkResult.error;

  const sourceLinkByKey = new Map(
    (sourceLinkResult.data || []).map((row) => [`${row.event_id}|${row.source_url}`, row.id]),
  );

  const proposalRows = proposals.map(({ event, source, current_lineup_details, proposed_lineup_details, match_score }) => ({
    event_id: event.id,
    run_id: runId,
    source_link_id: sourceLinkByKey.get(`${event.id}|${source.source_url}`) || null,
    source_url: source.source_url,
    source_type: source.source_type,
    event_name: event.event_name,
    event_date: event.date,
    venue: event.venue,
    current_lineup_details,
    proposed_lineup_details,
    proposal_hash: proposalHashFor(event.id, source.source_url, proposed_lineup_details),
    lineup_confidence: Math.max(0.92, Math.min(0.99, match_score)),
    approval_status: "pending",
    raw_metadata: {
      generated_from: "night-league-lineup-fullness",
      source_key: source.source_key,
      source_page: source.source_page,
      source_event_name: source.event_name,
      source_event_slug: source.event_slug || null,
      source_ticket_url: source.ticket_url || null,
      event_date: event.date,
      match_score,
      quality_gate: "exact_official_date_venue_match",
    },
  }));

  const proposalResult = await supabase
    .from("event_lineup_review_queue")
    .upsert(proposalRows, { onConflict: "event_id,source_url,proposal_hash" });
  if (proposalResult.error) throw proposalResult.error;
}

const venueCounts = visibleEvents.reduce((acc, event) => {
  acc[event.venue] = (acc[event.venue] || 0) + 1;
  return acc;
}, {});

const issueCounts = issueRows.reduce((acc, row) => {
  const current = acc[row.event.venue] || { missing: 0, generic: 0, headliner_only: 0 };
  if (row.missingLineup) current.missing += 1;
  if (row.genericLineup) current.generic += 1;
  if (row.headlinerOnly) current.headliner_only += 1;
  acc[row.event.venue] = current;
  return acc;
}, {});

const proposalRowsForReport = proposals.map(({ event, source, current_lineup_details, proposed_lineup_details }) => [
  event.date,
  event.venue,
  event.event_name,
  current_lineup_details,
  proposed_lineup_details,
  source.source_url,
]);

const queuedRowsForReport = queued.slice(0, 60).map(({ event, source, reason }) => [
  event.date,
  event.venue,
  event.event_name,
  normalizeWhitespace(event.lineup_details),
  reason,
  source?.source_url || "",
]);

const playaStatus = {
  public_rows: venueCounts["Playa Soleil"] || 0,
  source_fetch_status: sourceResults[sourcePages.playaSoleil]?.status || null,
  source_mentions_events:
    /events?|agenda|calendar|music|tickets?/i.test(stripTags(sourceResults[sourcePages.playaSoleil]?.text || "")) &&
    /playa soleil/i.test(sourceResults[sourcePages.playaSoleil]?.text || ""),
};

const markdown = [
  "# Night League Lineup Fullness Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Window: ${startDate} to ${endDate}`,
  `Apply staging: ${APPLY_STAGING}`,
  `Include full refresh candidates: ${INCLUDE_FULL_REFRESH}`,
  "",
  "## Summary",
  "",
  table(
    ["Venue", "Visible Rows", "Official Source Records", "Missing", "Generic/TBA", "Headliner Only"],
    trackedVenues.map((venue) => [
      venue,
      String(venueCounts[venue] || 0),
      String(sourceByVenue[venue] || 0),
      String(issueCounts[venue]?.missing || 0),
      String(issueCounts[venue]?.generic || 0),
      String(issueCounts[venue]?.headliner_only || 0),
    ]),
  ),
  "",
  "## Proposed Exact Official Updates",
  "",
  proposalRowsForReport.length
    ? table(["Date", "Venue", "Event", "Current", "Proposed", "Source"], proposalRowsForReport)
    : "No exact official lineup updates found.",
  "",
  "## Queued / Not Applied",
  "",
  queuedRowsForReport.length
    ? table(["Date", "Venue", "Event", "Current Lineup", "Reason", "Source"], queuedRowsForReport)
    : "No queued rows in the current window.",
  "",
  "## Playa Soleil Discovery",
  "",
  table(
    ["Public Rows", "Source Fetch Status", "Official Site Mentions Events"],
    [[String(playaStatus.public_rows), String(playaStatus.source_fetch_status || ""), String(playaStatus.source_mentions_events)]],
  ),
  "",
  "## Source Failures",
  "",
  sourceFailures.length ? sourceFailures.map((failure) => `- ${failure}`).join("\n") : "None.",
  "",
].join("\n");

fs.writeFileSync(path.resolve(OUTPUT_FILE), markdown);

console.log(JSON.stringify({
  apply_staging: APPLY_STAGING,
  include_full_refresh: INCLUDE_FULL_REFRESH,
  window_start: startDate,
  window_end: endDate,
  visible_rows_by_venue: venueCounts,
  source_records_by_venue: sourceByVenue,
  issue_counts_by_venue: issueCounts,
  proposals_found: proposals.length,
  proposals_staged: APPLY_STAGING ? proposals.length : 0,
  queued: queued.length,
  playa_soleil: playaStatus,
  proposal_preview: proposals.slice(0, 20).map(({ event, source, proposed_lineup_details }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    proposed_lineup_details,
    source_url: source.source_url,
  })),
  queued_preview: queued.slice(0, 20).map(({ event, reason }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    reason,
  })),
}, null, 2));
