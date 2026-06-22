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
const freshnessDays = Math.max(Number(process.env.FRESHNESS_DAYS || 14), 1);
const freshnessCutoff = addDays(today, -freshnessDays).toISOString();

const weakLineupPattern =
  /(?:^|\b)(tba|tbc|artists?\s*tba|line\s*-?\s*up\s*tba|lineup\s*tba|to be announced|lineup not yet posted)(?:\b|$)/i;
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

const monthLookup = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

const toIsoDate = (year, month, day) => {
  const yyyy = String(year || "");
  const mm = String(month || "").padStart(2, "0");
  const dd = String(day || "").padStart(2, "0");
  if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return "";
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return "";
  return `${yyyy}-${mm}-${dd}`;
};

const extractDateTokensFromUrl = (value) => {
  const raw = normalizeWhitespace(value);
  if (!raw) return [];

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })().toLowerCase();

  const dates = new Set();

  for (const match of decoded.matchAll(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/g)) {
    const date = toIsoDate(match[1], match[2], match[3]);
    if (date) dates.add(date);
  }

  for (const match of decoded.matchAll(/\b(\d{1,2})[-_/](\d{1,2})[-_/](20\d{2})\b/g)) {
    const firstNumber = Number(match[1]);
    const secondNumber = Number(match[2]);
    const dmyDate = toIsoDate(match[3], match[2], match[1]);
    if (dmyDate) dates.add(dmyDate);

    // Some official venue slugs use month-day-year, e.g. chinois.com/events/defected-7-2-2026.
    // Keep both interpretations when ambiguous so exact event-date matches are not falsely queued.
    if (firstNumber <= 12 && secondNumber <= 31) {
      const mdyDate = toIsoDate(match[3], match[1], match[2]);
      if (mdyDate) dates.add(mdyDate);
    }
  }

  for (const match of decoded.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[-_\s]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-_\s]*(20\d{2})\b/gi)) {
    const month = monthLookup[match[2].toLowerCase()];
    const date = toIsoDate(match[3], month, match[1]);
    if (date) dates.add(date);
  }

  return [...dates];
};

const dateMismatchFor = (dateValue, urlValue) => {
  const eventDate = String(dateValue || "");
  const urlDates = extractDateTokensFromUrl(urlValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !urlDates.length) return null;
  if (urlDates.includes(eventDate)) return null;
  return urlDates;
};

const hasEventUrlDateMismatch = (event) => Boolean(dateMismatchFor(event.date, event.event_url));

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
  "id,event_id,run_id,event_name,event_date,venue,source_type,source_url,current_lineup_details,proposed_lineup_details,lineup_confidence,approval_status,raw_metadata,created_at",
  (query) => query.gte("event_date", startDate).lte("event_date", endDate).order("created_at", { ascending: false }),
);

const sourceLinks = await fetchAll(
  "event_source_links",
  "event_id,source_url,source_type,canonical_for_updates,status,confidence,last_checked_at,updated_at",
  (query) => query.order("updated_at", { ascending: false }),
);
const upcomingSourceLinks = sourceLinks.filter((link) => eventIds.has(link.event_id));
const sourceLinksByEventId = upcomingSourceLinks.reduce((map, link) => {
  const links = map.get(link.event_id) || [];
  links.push(link);
  map.set(link.event_id, links);
  return map;
}, new Map());

const hasRecentCanonicalSourceCheck = (eventId) =>
  (sourceLinksByEventId.get(eventId) || []).some(
    (link) =>
      link.status === "active" &&
      link.canonical_for_updates &&
      link.last_checked_at &&
      new Date(link.last_checked_at).toISOString() >= freshnessCutoff,
  );

const latestCanonicalSourceCheck = (eventId) =>
  (sourceLinksByEventId.get(eventId) || [])
    .filter((link) => link.canonical_for_updates && link.last_checked_at)
    .sort((left, right) => String(right.last_checked_at).localeCompare(String(left.last_checked_at)))[0]?.last_checked_at || "";

const recentRuns = await fetchAll(
  "event_ingestion_runs",
  "id,run_type,mode,status,started_at,finished_at,sources_seen,snapshots_inserted,candidates_seen,candidates_inserted,source_failures,metadata,error_message",
  (query) => query.order("started_at", { ascending: false }).limit(20),
  20,
);

const issueRows = visibleEvents.map((event) => {
  const missingLineup = isMissingLineup(event);
  const weakLineup = isWeakLineup(event);
  const genericLineup = isGenericLineup(event);
  const recentCanonicalSourceCheck = hasRecentCanonicalSourceCheck(event.id);
  return {
    event,
    missingLineup,
    weakLineup,
    genericLineup,
    missingUrl: isMissingUrl(event),
    genericUrl: isGenericUrl(event),
    spotlightUrl: isSpotlightUrl(event),
    ticketingUrl: isTicketingUrl(event),
    officialUrl: isOfficialUrl(event),
    eventUrlDateMismatch: hasEventUrlDateMismatch(event),
    recentCanonicalSourceCheck,
    completeLineupNeedsFreshnessCheck: !missingLineup && !weakLineup && !genericLineup && !recentCanonicalSourceCheck,
    latestCanonicalSourceCheck: latestCanonicalSourceCheck(event.id),
  };
});

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
  event_url_date_mismatches: issueRows.filter((row) => row.eventUrlDateMismatch).length,
  recent_canonical_source_checks: issueRows.filter((row) => row.recentCanonicalSourceCheck).length,
  complete_lineups_needing_freshness_check: issueRows.filter((row) => row.completeLineupNeedsFreshnessCheck).length,
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
    date_mismatched_urls: 0,
    freshness_check_needed: 0,
  };
  const flags = [
    row.missingLineup,
    row.weakLineup,
    row.genericLineup,
    row.missingUrl,
    row.genericUrl,
    row.spotlightUrl,
    row.ticketingUrl,
    row.eventUrlDateMismatch,
    row.completeLineupNeedsFreshnessCheck,
  ];
  if (flags.some(Boolean)) current.issues += 1;
  if (row.missingLineup) current.missing_lineups += 1;
  if (row.weakLineup) current.weak_lineups += 1;
  if (row.genericLineup) current.generic_lineups += 1;
  if (row.missingUrl) current.missing_urls += 1;
  if (row.genericUrl) current.generic_urls += 1;
  if (row.spotlightUrl) current.spotlight_urls += 1;
  if (row.ticketingUrl) current.ticketing_urls += 1;
  if (row.eventUrlDateMismatch) current.date_mismatched_urls += 1;
  if (row.completeLineupNeedsFreshnessCheck) current.freshness_check_needed += 1;
  venueIssueCounts[venue] = current;
}

const proposalStatusCounts = countBy(proposals, (proposal) => proposal.approval_status);
const proposalSourceCounts = countBy(proposals, (proposal) => proposal.source_type);
const sourceLinkTypeCounts = countBy(upcomingSourceLinks, (link) => link.source_type);
const sourceLinkStatusCounts = countBy(upcomingSourceLinks, (link) => link.status);
const eventById = new Map(visibleEvents.map((event) => [event.id, event]));
const sourceLinkDateMismatchRows = upcomingSourceLinks
  .map((link) => {
    const event = eventById.get(link.event_id);
    const mismatchedDates = dateMismatchFor(event?.date, link.source_url);
    return mismatchedDates ? { link, event, mismatchedDates } : null;
  })
  .filter(Boolean);
const canonicalSourceLinkDateMismatchRows = sourceLinkDateMismatchRows.filter(({ link }) => link.canonical_for_updates);
const activeCanonicalSourceLinkDateMismatchRows = canonicalSourceLinkDateMismatchRows.filter(
  ({ link }) => link.status === "active",
);

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
  source_link_date_mismatches: sourceLinkDateMismatchRows.length,
  canonical_source_link_date_mismatches: canonicalSourceLinkDateMismatchRows.length,
  active_canonical_source_link_date_mismatches: activeCanonicalSourceLinkDateMismatchRows.length,
};

const issueFlagsFor = (row) =>
  [
    row.missingLineup && "missing_lineup",
    row.weakLineup && "weak_tba_lineup",
    row.genericLineup && "generic_lineup",
    row.missingUrl && "missing_url",
    row.genericUrl && "generic_url",
    row.spotlightUrl && "spotlight_url",
    row.ticketingUrl && "ticketing_url",
    row.eventUrlDateMismatch && `url_date_mismatch:${dateMismatchFor(row.event.date, row.event.event_url).join("/")}`,
    row.completeLineupNeedsFreshnessCheck && "lineup_freshness_check_needed",
  ].filter(Boolean);

const rowPriority = (row) =>
  (row.missingUrl ? 10 : 0) +
  (row.missingLineup ? 9 : 0) +
  (row.weakLineup ? 7 : 0) +
  (row.genericLineup ? 5 : 0) +
  (row.genericUrl ? 4 : 0) +
  (row.ticketingUrl ? 3 : 0) +
  (row.spotlightUrl ? 2 : 0) +
  (row.eventUrlDateMismatch ? 12 : 0) +
  (row.completeLineupNeedsFreshnessCheck ? 6 : 0);

const sampleRows = (filterFn, limit = 25) =>
  issueRows
    .filter(filterFn)
    .sort((left, right) => rowPriority(right) - rowPriority(left) || String(left.event.date).localeCompare(String(right.event.date)))
    .slice(0, limit)
    .map((row) => [
      row.event.date,
      row.event.venue,
      row.event.event_name,
      issueFlagsFor(row).join(", "),
      normalizeWhitespace(row.event.lineup_details).slice(0, 120),
      row.event.event_url || "",
      row.latestCanonicalSourceCheck || "",
    ]);

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

const proposalRunIds = new Set(proposals.map((proposal) => proposal.run_id).filter(Boolean));
const sourceFailureCount = (run) => Array.isArray(run.source_failures) ? run.source_failures.length : 0;
const browserRuns = recentRuns.filter((run) => run.metadata?.job === "browser_lineup_sweep");
const browserRunRows = browserRuns.map((run) => [
  run.started_at,
  run.status,
  run.metadata?.venue_pattern || "all venues",
  run.sources_seen ?? 0,
  run.snapshots_inserted ?? 0,
  run.metadata?.proposals_inserted ?? run.candidates_inserted ?? 0,
  JSON.stringify(run.metadata?.proposal_status_counts || {}),
  sourceFailureCount(run),
]);
const checkedNoProposalRows = browserRuns
  .filter((run) =>
    run.status === "completed" &&
    Number(run.snapshots_inserted || 0) > 0 &&
    Number(run.metadata?.proposals_inserted ?? run.candidates_inserted ?? 0) === 0 &&
    !proposalRunIds.has(run.id)
  )
  .map((run) => [
    run.started_at,
    run.metadata?.venue_pattern || "all venues",
    run.sources_seen ?? 0,
    run.snapshots_inserted ?? 0,
    sourceFailureCount(run),
    "checked_official_sources_no_clean_lineup_proposal",
  ]);

const report = [
  "# Ibiza Events Season Repair Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Window: ${startDate} to ${endDate}`,
  `Freshness check: canonical source must have been rendered within the last ${freshnessDays} days (since ${freshnessCutoff.slice(0, 10)}).`,
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
    ["Venue", "Issue Rows", "Missing Lineups", "Weak/TBA", "Generic Lineups", "Freshness Needed", "Missing URLs", "Generic URLs", "Spotlight URLs", "Ticketing URLs", "Date-Mismatched URLs"],
    Object.entries(venueIssueCounts)
      .sort((left, right) => right[1].issues - left[1].issues || left[0].localeCompare(right[0]))
      .slice(0, 20)
      .map(([venue, counts]) => [
        venue,
        counts.issues,
        counts.missing_lineups,
        counts.weak_lineups,
        counts.generic_lineups,
        counts.freshness_check_needed,
        counts.missing_urls,
        counts.generic_urls,
        counts.spotlight_urls,
        counts.ticketing_urls,
        counts.date_mismatched_urls,
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
  "## Exact Repair Samples",
  "",
  "### Missing URL Rows",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.missingUrl, 40),
  ),
  "",
  "### Missing Or Weak Lineup Rows",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.missingLineup || row.weakLineup, 40),
  ),
  "",
  "### Complete-Looking Lineups Needing Freshness Check",
  "",
  "Rows here may look complete, but do not yet have a recent rendered canonical source check. They should be rechecked before being treated as finished.",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.completeLineupNeedsFreshnessCheck, 40),
  ),
  "",
  "### Spotlight Or Generic URL Rows",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.spotlightUrl || row.genericUrl, 40),
  ),
  "",
  "### Ticketing URL Rows",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.ticketingUrl, 40),
  ),
  "",
  "### Date-Mismatched Event URL Rows",
  "",
  "Rows here have an explicit date embedded in the current public event URL that does not match the event date. These should be queued for official URL repair before lineup automation trusts the link.",
  "",
  formatTable(
    ["Date", "Venue", "Event", "Flags", "Current Lineup", "Current URL", "Latest Canonical Check"],
    sampleRows((row) => row.eventUrlDateMismatch, 40),
  ),
  "",
  "### Date-Mismatched Source Link Rows",
  "",
  "Rows here have staged source links whose URL date token does not match the Supabase event date. Keep them out of safe apply batches until the correct date-specific source is found.",
  "",
  formatTable(
    ["Event Date", "Venue", "Event", "Link Date(s)", "Source Type", "Canonical", "Status", "Source URL"],
    sourceLinkDateMismatchRows.slice(0, 40).map(({ link, event, mismatchedDates }) => [
      event?.date || "",
      event?.venue || "",
      event?.event_name || "",
      mismatchedDates.join(", "),
      link.source_type,
      link.canonical_for_updates ? "yes" : "no",
      link.status,
      link.source_url,
    ]),
  ),
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
  "## Checked Source Packets",
  "",
  "These are recent browser-rendered shadow sweeps. They prove which official/source packets were checked before any public `ibiza_events` write was considered.",
  "",
  formatTable(
    ["Started", "Status", "Venue Pattern", "Targets Checked", "Snapshots", "Proposals", "Proposal Status Counts", "Failures"],
    browserRunRows,
  ),
  "",
  "### Queued Exceptions: Checked With No Clean Proposal",
  "",
  "Rows here were rendered and snapshotted, but no clean public-safe lineup proposal was found. Keep them queued for source-specific parser work or manual review instead of fabricating lineups.",
  "",
  formatTable(
    ["Started", "Venue Pattern", "Targets Checked", "Snapshots", "Failures", "Queue Reason"],
    checkedNoProposalRows,
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
