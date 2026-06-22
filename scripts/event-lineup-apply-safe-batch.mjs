import { createClient } from "@supabase/supabase-js";

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

const weakLineupPattern =
  /(?:^|\b)(tba|tbc|artists?\s*tba|line\s*-?\s*up\s*tba|lineup\s*tba|to be announced|lineup not yet posted)(?:\b|$)/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more|\+\s*(?:tba|tbc)\b)/i;
const internalMetadataPattern = /\b(agent run|run id|verified on|last verified|last checked|confidence|snapshot id)\b/i;
const locationNoisePattern = /\bbalearic islands\b/i;
const ticketTierPattern = /\b(?:early access|entry before|before\s+\d{1,2}[:.]?\d{2}|standard ticket|vip ticket|vip experience|vip access|vip table|vip upgrade|balcony ticket|general admission|tickets?\s+from|drinks?\s+(?:package|included)|water\s+pack|discount|meet\s*&?\s*greet|entry\s+via|access\s+to\s+(?:private\s+)?terrace|private\s+terrace|valet\s+parking|table\s+service)\b/i;
const timeOnlyLineupPattern =
  /^(?:\d{1,2}|00|30)(?:\s*\([^)]+\)\s*\/\s*\d{1,2}:\d{2}\s*\([^)]+\))?$/i;
const truncatedLineupPattern = /(?:\.{3}|…)\s*$/;
const eventListingLineupPattern =
  /\bon\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2},?\s+\d{1,2}:\d{2}\b/i;
const eventDescriptionLineupPattern =
  /\b(?:live at|at)\s+\[?[^\]]+\]?\s+ibiza\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+20\d{2})?/i;
const embeddedRoomLabelPattern =
  /(?:^|[,•·]\s*)(?:[✹⏾*]\s*)?(?:theatre|club room|main room|club|terrace|garden|wild corner|the bunker|room|stage)\s*\([^)]+\)/i;
const genericUrlPattern = /(?:ibiza-spotlight\.com\/(?:night\/events|events\/?$)|\/(?:events|calendar|agenda)\/?$)/i;

const normalizePublicLineup = (value) =>
  normalizeWhitespace(value)
    .replace(/\s*[•·]\s*/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^,\s*|\s*,\s*$/g, "");

const isSafeProposedLineup = (value) => {
  const normalized = normalizePublicLineup(value);
  return Boolean(normalized) &&
    !weakLineupPattern.test(normalized) &&
    !genericLineupPattern.test(normalized) &&
    !internalMetadataPattern.test(normalized) &&
    !locationNoisePattern.test(normalized) &&
    !ticketTierPattern.test(normalized) &&
    !timeOnlyLineupPattern.test(normalized) &&
    !truncatedLineupPattern.test(normalized) &&
    !eventListingLineupPattern.test(normalized) &&
    !eventDescriptionLineupPattern.test(normalized) &&
    !embeddedRoomLabelPattern.test(normalized);
};

const canReplaceCurrentLineup = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || weakLineupPattern.test(normalized) || genericLineupPattern.test(normalized) || internalMetadataPattern.test(normalized);
};

const canReplaceEventUrl = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || genericUrlPattern.test(normalized);
};

const sameLineup = (left, right) =>
  normalizePublicLineup(left).toLowerCase() === normalizePublicLineup(right).toLowerCase();

const lineupArtistTokens = (value) =>
  normalizePublicLineup(value)
    .split(/\s*,\s*/)
    .map((item) => item.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);

const sameLineupArtistSet = (left, right) => {
  const leftTokens = lineupArtistTokens(left);
  const rightTokens = lineupArtistTokens(right);
  if (leftTokens.length < 2 || leftTokens.length !== rightTokens.length) return false;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  if (leftSet.size !== leftTokens.length || rightSet.size !== rightTokens.length) return false;
  return leftTokens.every((token) => rightSet.has(token));
};

const dateTokensFor = (dateValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return [];
  const [year, month, day] = dateValue.split("-");
  const monthNames = [
    "",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthShortNames = [
    "",
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const numericDay = Number(day);
  const numericMonth = Number(month);
  const ordinalSuffix =
    numericDay % 100 >= 11 && numericDay % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[numericDay % 10] || "th";
  const monthName = monthNames[numericMonth] || "";
  const monthShortName = monthShortNames[numericMonth] || "";
  return [
    `${year}-${month}-${day}`,
    `${day}-${month}-${year}`,
    `${Number(day)}-${Number(month)}-${year}`,
    `${month}-${day}-${year}`,
    `${Number(month)}-${Number(day)}-${year}`,
    `${numericDay}${ordinalSuffix}${monthName}${year}`,
    `${numericDay}${monthName}${year}`,
    `${numericDay}-${monthName}-${year}`,
    `${numericDay}${ordinalSuffix}${monthShortName}${year}`,
    `${numericDay}${monthShortName}${year}`,
    `${numericDay}-${monthShortName}-${year}`,
    ...(monthShortName === "sep"
      ? [
        `${numericDay}${ordinalSuffix}sept${year}`,
        `${numericDay}sept${year}`,
        `${numericDay}-sept-${year}`,
      ]
      : []),
  ];
};

const sourceUrlMatchesDate = (sourceUrl, dateValue) => {
  const lower = String(sourceUrl || "").toLowerCase();
  return dateTokensFor(dateValue).some((token) => lower.includes(token.toLowerCase()));
};

const exactDateSeededProposal = (proposal, event) =>
  Boolean(
    event?.date &&
      proposal?.raw_metadata?.event_date === event.date &&
      /known[-_](?:official|fourvenues|shotgun|ticketing)|known-official-ticketing/i.test(
        String(
          proposal?.raw_metadata?.source_key ||
            proposal?.raw_metadata?.seeded_from ||
            proposal?.raw_metadata?.seed_label ||
            "",
        ),
      ),
  );

const proposalSourceMatchesDate = (proposal, event) =>
  sourceUrlMatchesDate(proposal?.source_url, event?.date) || exactDateSeededProposal(proposal, event);

const todayInMadrid = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const todayMadrid = todayInMadrid();

const canEnrichCurrentLineup = (proposal, event) => {
  const current = normalizeWhitespace(event?.lineup_details);
  const proposed = normalizePublicLineup(proposal.proposed_lineup_details);

  if (!current || !proposed || sameLineup(current, proposed)) return false;
  if (!["official_venue", "fourvenues_public"].includes(proposal.source_type)) return false;
  if (Number(proposal.lineup_confidence || 0) < 0.9) return false;
  if (!proposalSourceMatchesDate(proposal, event)) return false;
  if (current.includes(",") || current.length > 80) return false;
  if (proposed.length <= current.length + 5) return false;
  return proposed.toLowerCase().includes(current.toLowerCase());
};

const canRefreshExactDateLineup = (proposal, event) => {
  const current = normalizeWhitespace(event?.lineup_details);
  const proposed = normalizePublicLineup(proposal.proposed_lineup_details);

  if (!current || !proposed || sameLineup(current, proposed)) return false;
  if (!["official_venue", "fourvenues_public", "ticketing_platform"].includes(proposal.source_type)) return false;
  if (Number(proposal.lineup_confidence || 0) < 0.9) return false;
  if (!proposalSourceMatchesDate(proposal, event)) return false;
  return true;
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const limit = Math.min(Math.max(Number(process.env.LIMIT || 10), 1), 50);
const sourceType = process.env.SOURCE_TYPE || "fourvenues_public";
const allowSupersetEnrichment = String(process.env.ALLOW_SUPERSET_ENRICHMENT || "false").toLowerCase() === "true";
const allowExactDateRefresh = String(process.env.ALLOW_EXACT_DATE_REFRESH || "false").toLowerCase() === "true";

const { data: proposals, error } = await supabase
  .from("event_lineup_review_queue")
  .select("id,event_id,event_name,event_date,venue,source_url,source_type,current_lineup_details,proposed_lineup_details,lineup_confidence,approval_status,raw_metadata")
  .eq("source_type", sourceType)
  .eq("approval_status", "pending")
  .gte("lineup_confidence", 0.9)
  .order("event_date", { ascending: true })
  .limit(limit);

if (error) throw error;

const eventIds = [...new Set((proposals || []).map((proposal) => proposal.event_id).filter(Boolean))];
const { data: events, error: eventsError } = eventIds.length
  ? await supabase
    .from("ibiza_events")
    .select("id,notion_page_id,event_name,date,venue,event_url,lineup_details,status,source_missing_since,fourvenues_event_id")
    .in("id", eventIds)
  : { data: [], error: null };

if (eventsError) throw eventsError;

const eventById = new Map((events || []).map((event) => [event.id, event]));
const approved = [];
const rejected = [];
const alreadyApplied = [];

for (const proposal of proposals || []) {
  const event = eventById.get(proposal.event_id);
  const reasons = [];
  if (!event) reasons.push("missing_event");
  if (event?.fourvenues_event_id || String(event?.notion_page_id || "").startsWith("fourvenues:")) reasons.push("fourvenues_owned_row");
  if (String(event?.status || "").toLowerCase() === "cancelled") reasons.push("cancelled_event");
  if (event?.source_missing_since) reasons.push("source_missing_event");
  if (event?.date && event.date < todayMadrid) reasons.push("past_event");
  if (event?.date !== proposal.event_date) reasons.push("date_mismatch");
  if (event?.venue !== proposal.venue) reasons.push("venue_mismatch");
  if (!isSafeProposedLineup(proposal.proposed_lineup_details)) reasons.push("unsafe_proposed_lineup");
  if (proposal.source_type === "ticketing_platform" && !proposalSourceMatchesDate(proposal, event)) {
    reasons.push("source_url_date_mismatch");
  }
  const canApplyRefresh = allowExactDateRefresh && canRefreshExactDateLineup(proposal, event);
  if (!canReplaceCurrentLineup(event?.lineup_details) && !(allowSupersetEnrichment && canEnrichCurrentLineup(proposal, event)) && !canApplyRefresh) {
    reasons.push("current_lineup_not_weak");
  }
  if (!proposal.source_url) reasons.push("missing_source_url");

  if (reasons.length) {
    if (event && reasons.length === 1 && reasons[0] === "current_lineup_not_weak" && sameLineup(event.lineup_details, proposal.proposed_lineup_details)) {
      alreadyApplied.push({ proposal, event });
    } else if (event && reasons.length === 1 && reasons[0] === "current_lineup_not_weak" && sameLineupArtistSet(event.lineup_details, proposal.proposed_lineup_details)) {
      alreadyApplied.push({ proposal, event, noopReason: "same_artist_set_different_order" });
    } else {
      rejected.push({ proposal, event, reasons });
    }
  } else {
    approved.push({ proposal, event });
  }
}

let updated = 0;
let markedApplied = 0;
if (apply && alreadyApplied.length) {
  for (const { proposal, noopReason } of alreadyApplied) {
    const { error: proposalError } = await supabase
      .from("event_lineup_review_queue")
      .update({
        approval_status: "applied",
        applied_at: new Date().toISOString(),
        raw_metadata: {
          ...(proposal.raw_metadata || {}),
          safe_apply_batch: true,
          safe_apply_noop: true,
          safe_apply_noop_reason: noopReason || "same_lineup_text",
          safe_apply_batch_at: new Date().toISOString(),
        },
      })
      .eq("id", proposal.id);

    if (proposalError) throw proposalError;
    markedApplied += 1;
  }
}

if (apply && approved.length) {
  for (const { proposal, event } of approved) {
    const updatePayload = {
      lineup_details: normalizePublicLineup(proposal.proposed_lineup_details),
      last_synced_at: new Date().toISOString(),
    };
    if (canReplaceEventUrl(event.event_url)) updatePayload.event_url = proposal.source_url;

    const { error: updateError } = await supabase
      .from("ibiza_events")
      .update(updatePayload)
      .eq("id", event.id)
      .neq("status", "Cancelled")
      .is("source_missing_since", null)
      .is("fourvenues_event_id", null);

    if (updateError) throw updateError;

    const { error: proposalError } = await supabase
      .from("event_lineup_review_queue")
      .update({
        approval_status: "applied",
        applied_at: new Date().toISOString(),
        raw_metadata: {
          ...(proposal.raw_metadata || {}),
          safe_apply_batch: true,
          safe_apply_batch_at: new Date().toISOString(),
          safe_apply_mode: allowExactDateRefresh && canRefreshExactDateLineup(proposal, event)
            ? "exact_date_reviewed_refresh"
            : allowSupersetEnrichment && canEnrichCurrentLineup(proposal, event)
              ? "superset_enrichment"
              : "weak_or_blank_replacement",
        },
      })
      .eq("id", proposal.id);

    if (proposalError) throw proposalError;
    updated += 1;
  }
}

console.log(JSON.stringify({
  apply,
  source_type: sourceType,
  allow_superset_enrichment: allowSupersetEnrichment,
  allow_exact_date_refresh: allowExactDateRefresh,
  today_madrid: todayMadrid,
  proposals_checked: proposals?.length || 0,
  approved_for_apply: approved.length,
  already_applied_noop: alreadyApplied.length,
  rejected_by_guard: rejected.length,
  public_rows_updated: updated,
  proposals_marked_applied_noop: markedApplied,
  approved_samples: approved.map(({ proposal, event }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    proposed_lineup_details: normalizePublicLineup(proposal.proposed_lineup_details),
    source_url: proposal.source_url,
    would_replace_event_url: canReplaceEventUrl(event.event_url),
  })),
  already_applied_samples: alreadyApplied.map(({ proposal, event }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    proposed_lineup_details: normalizePublicLineup(proposal.proposed_lineup_details),
    source_url: proposal.source_url,
  })),
  rejected_samples: rejected.slice(0, 20).map(({ proposal, event, reasons }) => ({
    date: event?.date || proposal.event_date,
    venue: proposal.venue,
    event_name: proposal.event_name,
    reasons,
    proposed_lineup_details: normalizePublicLineup(proposal.proposed_lineup_details),
  })),
}, null, 2));
