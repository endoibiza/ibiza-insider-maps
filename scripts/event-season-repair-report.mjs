import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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

const normalizeWhitespace = (value) => decodeHtmlEntities(value).replace(/\s+/g, " ").trim();

const today = new Date();
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
const toDateOnly = (date) => date.toISOString().slice(0, 10);

const startDate = process.env.START_DATE || toDateOnly(today);
const endDate = process.env.END_DATE || toDateOnly(addDays(today, Number(process.env.WINDOW_DAYS || 180)));
const outputFile = process.env.OUTPUT_FILE || "";

const weakLineupPattern = /^(tba|tbc|line\s*up\s*tba|lineup\s*tba|to be announced|more tba|coming soon|line\s*up\s*coming soon)\.?$/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more)/i;
const internalMetadataPattern = /\b(agent run|run id|verified on|last verified|last checked|confidence|snapshot id)\b/i;
const ticketingUrlPattern = /(ra\.co|shotgun\.live|eventbrite|skiddle|dice\.fm|ticketing|tickets|ticketmaster|seetickets|xceed|bacantix|reservaentradas)/i;
const officialVenuePattern =
  /(pacha\.com|hiibiza\.com|theushuaiaexperience\.com|unvrs\.com|amnesia\.es|dc10ibiza\.com|circolocoibiza\.com|covasanta\.com|ibizarocks\.com|pikesibiza\.com|528ibiza\.com|chinois\.com|akashaibiza\.com|lasdalias\.es|edenibiza\.com|liogroup\.com|bluemarlinibiza\.com|nikkibeach\.com|jockeyclubibiza\.com|ibiza\.cafedelmar\.com)/i;

const isMissingLineup = (event) => !normalizeWhitespace(event.lineup_details);
const isWeakLineup = (event) => {
  const lineup = normalizeWhitespace(event.lineup_details);
  return !lineup || weakLineupPattern.test(lineup) || internalMetadataPattern.test(lineup);
};
const isGenericLineup = (event) => genericLineupPattern.test(normalizeWhitespace(event.lineup_details));
const isMissingUrl = (event) => !normalizeWhitespace(event.event_url);
const isGenericUrl = (event) => {
  const url = normalizeWhitespace(event.event_url);
  return Boolean(url) && (/ibiza-spotlight\.com\/(night\/events|events\/?$)/i.test(url) || /\/(events|calendar|agenda)\/?$/i.test(url));
};
const isSpotlightUrl = (event) => /ibiza-spotlight\.com/i.test(normalizeWhitespace(event.event_url));
const isTicketingUrl = (event) => ticketingUrlPattern.test(normalizeWhitespace(event.event_url));
const isOfficialUrl = (event) => officialVenuePattern.test(normalizeWhitespace(event.event_url));

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

const fetchAll = async (table, select, build = (query) => query, pageSize = 1000) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await build(supabase.from(table).select(select)).range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const countBy = (rows, keyFn) =>
  rows.reduce((counts, row) => {
    const key = keyFn(row) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

const topCounts = (counts, limit = 12) =>
  Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);

const formatTable = (headers, rows) => {
  if (!rows.length) return "_None._";
  const clean = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = `| ${headers.map(clean).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(clean).join(" | ")} |`);
  return [head, divider, ...body].join("\n");
};

const events = await fetchAll(
  "ibiza_events",
  "id,notion_page_id,event_name,date,venue,event_series,event_url,lineup_details,status,source_missing_since,fourvenues_event_id",
  (query) =>
    query
      .gte("date", startDate)
      .lte("date", endDate)
      .neq("status", "Cancelled")
      .is("source_missing_since", null)
      .order("date", { ascending: true }),
);

const visibleEvents = events.filter((event) => !event.fourvenues_event_id && !String(event.notion_page_id || "").startsWith("fourvenues:"));
const eventIds = new Set(visibleEvents.map((event) => event.id));

const proposals = await fetchAll(
  "event_lineup_review_queue",
  "id,event_id,event_name,event_date,venue,source_type,source_url,current_lineup_details,proposed_lineup_details,lineup_confidence,approval_status,raw_metadata,created_at",
  (query) => query.gte("event_date", startDate).lte("event_date", endDate).order("created_at", { ascending: false }),
);

const sourceLinks = await fetchAll(
  "event_source_links",
  "event_id,source_url,source_type,canonical_for_updates,status,confidence,last_checked_at,updated_at",
  (query) => query.order("updated_at", { ascending: false }),
);
const upcomingSourceLinks = sourceLinks.filter((link) => eventIds.has(link.event_id));

const recentRuns = await fetchAll(
  "event_ingestion_runs",
  "id,run_type,mode,status,started_at,finished_at,sources_seen,snapshots_inserted,candidates_seen,candidates_inserted,metadata,error_message",
  (query) => query.order("started_at", { ascending: false }).limit(20),
  20,
);

const issueRows = visibleEvents.map((event) => ({
  event,
  missingLineup: isMissingLineup(event),
  weakLineup: isWeakLineup(event),
  genericLineup: isGenericLineup(event),
  missingUrl: isMissingUrl(event),
  genericUrl: isGenericUrl(event),
  spotlightUrl: isSpotlightUrl(event),
  ticketingUrl: isTicketingUrl(event),
  officialUrl: isOfficialUrl(event),
}));

const issueCounts = {
  total_visible_upcoming: visibleEvents.length,
  missing_lineups: issueRows.filter((row) => row.missingLineup).length,
  weak_tba_lineups: issueRows.filter((row) => row.weakLineup).length,
  generic_lineups: issueRows.filter((row) => row.genericLineup).length,
  missing_urls: issueRows.filter((row) => row.missingUrl).length,
  generic_urls: issueRows.filter((row) => row.genericUrl).length,
  spotlight_urls: issueRows.filter((row) => row.spotlightUrl).length,
  ticketing_urls: issueRows.filter((row) => row.ticketingUrl).length,
  official_urls: issueRows.filter((row) => row.officialUrl).length,
  fourvenues_rows_in_scope: events.length - visibleEvents.length,
};

const duplicateKeys = countBy(visibleEvents, (event) =>
  [event.date, event.venue, event.event_series || event.event_name].map((part) => normalizeWhitespace(part).toLowerCase()).join("|"),
);
const duplicateRows = topCounts(duplicateKeys, 20).filter(([, count]) => count > 1);

const venueIssueCounts = {};
for (const row of issueRows) {
  const venue = row.event.venue || "Unknown";
  const current = venueIssueCounts[venue] || {
    issues: 0,
    missing_lineups: 0,
    weak_lineups: 0,
    generic_lineups: 0,
    missing_urls: 0,
    generic_urls: 0,
    spotlight_urls: 0,
    ticketing_urls: 0,
  };
  const flags = [
    row.missingLineup,
    row.weakLineup,
    row.genericLineup,
    row.missingUrl,
    row.genericUrl,
    row.spotlightUrl,
    row.ticketingUrl,
  ];
  if (flags.some(Boolean)) current.issues += 1;
  if (row.missingLineup) current.missing_lineups += 1;
  if (row.weakLineup) current.weak_lineups += 1;
  if (row.genericLineup) current.generic_lineups += 1;
  if (row.missingUrl) current.missing_urls += 1;
  if (row.genericUrl) current.generic_urls += 1;
  if (row.spotlightUrl) current.spotlight_urls += 1;
  if (row.ticketingUrl) current.ticketing_urls += 1;
  venueIssueCounts[venue] = current;
}

const proposalStatusCounts = countBy(proposals, (proposal) => proposal.approval_status);
const proposalSourceCounts = countBy(proposals, (proposal) => proposal.source_type);
const sourceLinkTypeCounts = countBy(upcomingSourceLinks, (link) => link.source_type);
const sourceLinkStatusCounts = countBy(upcomingSourceLinks, (link) => link.status);

const safeProposals = proposals
  .filter((proposal) => ["auto_safe", "approved"].includes(proposal.approval_status))
  .slice(0, 25);

const pendingProposals = proposals
  .filter((proposal) => proposal.approval_status === "pending")
  .slice(0, 25);

const rejectedProposals = proposals
  .filter((proposal) => proposal.approval_status === "rejected")
  .slice(0, 12);

const sourceLinkCoverage = {
  upcoming_events_with_source_links: new Set(upcomingSourceLinks.map((link) => link.event_id)).size,
  upcoming_events_with_canonical_links: new Set(upcomingSourceLinks.filter((link) => link.canonical_for_updates).map((link) => link.event_id)).size,
  active_source_links: upcomingSourceLinks.filter((link) => link.status === "active").length,
  needs_review_source_links: upcomingSourceLinks.filter((link) => link.status === "needs_review").length,
};

const runRows = recentRuns.map((run) => [
  run.started_at,
  run.run_type,
  run.mode,
  run.status,
  run.sources_seen ?? 0,
  run.snapshots_inserted ?? 0,
  run.candidates_inserted ?? 0,
  run.metadata?.events_updated ?? 0,
  run.metadata?.events_inserted ?? 0,
  run.metadata?.venue_pattern || "",
]);

const report = [
  "# Ibiza Events Season Repair Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Window: ${startDate} to ${endDate}`,
  "",
  "## Public Event Audit",
  "",
  formatTable(
    ["Metric", "Count"],
    Object.entries(issueCounts).map(([key, value]) => [key, value]),
  ),
  "",
  "## Top Venue Repair Board",
  "",
  formatTable(
    ["Venue", "Issue Rows", "Missing Lineups", "Weak/TBA", "Generic Lineups", "Missing URLs", "Generic URLs", "Spotlight URLs", "Ticketing URLs"],
    Object.entries(venueIssueCounts)
      .sort((left, right) => right[1].issues - left[1].issues || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([venue, counts]) => [
        venue,
        counts.issues,
        counts.missing_lineups,
        counts.weak_lineups,
        counts.generic_lineups,
        counts.missing_urls,
        counts.generic_urls,
        counts.spotlight_urls,
        counts.ticketing_urls,
      ]),
  ),
  "",
  "## Source Link Coverage",
  "",
  formatTable(
    ["Metric", "Count"],
    Object.entries(sourceLinkCoverage).map(([key, value]) => [key, value]),
  ),
  "",
  "### Source Link Types",
  "",
  formatTable(["Source Type", "Count"], topCounts(sourceLinkTypeCounts, 20)),
  "",
  "### Source Link Status",
  "",
  formatTable(["Status", "Count"], topCounts(sourceLinkStatusCounts, 20)),
  "",
  "## Lineup Proposal Staging",
  "",
  formatTable(["Approval Status", "Count"], topCounts(proposalStatusCounts, 20)),
  "",
  "### Proposal Source Types",
  "",
  formatTable(["Source Type", "Count"], topCounts(proposalSourceCounts, 20)),
  "",
  "### Safe Proposal Candidates",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Status", "Confidence", "Proposed Lineup", "Source URL"],
    safeProposals.map((proposal) => [
      proposal.event_date,
      proposal.venue,
      proposal.event_name,
      proposal.approval_status,
      proposal.lineup_confidence,
      normalizeWhitespace(proposal.proposed_lineup_details).slice(0, 180),
      proposal.source_url,
    ]),
  ),
  "",
  "### Pending Proposal Candidates",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Confidence", "Proposed Lineup", "Source URL"],
    pendingProposals.map((proposal) => [
      proposal.event_date,
      proposal.venue,
      proposal.event_name,
      proposal.lineup_confidence,
      normalizeWhitespace(proposal.proposed_lineup_details).slice(0, 180),
      proposal.source_url,
    ]),
  ),
  "",
  "### Recent Rejected Proposal Samples",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Reason", "Proposed Lineup"],
    rejectedProposals.map((proposal) => [
      proposal.event_date,
      proposal.venue,
      proposal.event_name,
      proposal.raw_metadata?.quality_gate || "rejected",
      normalizeWhitespace(proposal.proposed_lineup_details).slice(0, 180),
    ]),
  ),
  "",
  "## Duplicate-Looking Public Rows",
  "",
  formatTable(["Date | Venue | Series/Event", "Count"], duplicateRows),
  "",
  "## Recent Ingestion Runs",
  "",
  formatTable(
    ["Started", "Type", "Mode", "Status", "Sources", "Snapshots", "Candidates", "Updates", "Inserts", "Venue Pattern"],
    runRows,
  ),
  "",
  "## Next Best Packets",
  "",
  "- If `Safe Proposal Candidates` is empty, do not apply public lineup updates yet.",
  "- Prioritize official URL/source-link repair for venues with missing or generic URLs before another broad lineup sweep.",
  "- Run targeted browser packets for the top venue rows above, using official venue pages first and Ibiza Spotlight only as fallback evidence.",
  "- Keep Fourvenues rows out of generic scraping until Channel Manager access is available.",
  "",
].join("\n");

console.log(report);

if (outputFile) {
  await writeFile(outputFile, report, "utf8");
}
