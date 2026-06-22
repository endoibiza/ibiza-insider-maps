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
const ticketTierPattern = /\b(?:early access|entry before|before\s+\d{1,2}[:.]?\d{2}|standard ticket|vip ticket|vip experience|vip access|vip table|vip upgrade|balcony ticket|general admission|tickets?\s+from|drinks?\s+package|water\s+pack|discount|meet\s*&?\s*greet)\b/i;
const timeOnlyLineupPattern =
  /^(?:\d{1,2}|00|30)(?:\s*\([^)]+\)\s*\/\s*\d{1,2}:\d{2}\s*\([^)]+\))?$/i;
const truncatedLineupPattern = /(?:\.{3}|…)\s*$/;
const eventListingLineupPattern =
  /\bon\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2},?\s+\d{1,2}:\d{2}\b/i;
const eventDescriptionLineupPattern =
  /\b(?:live at|at)\s+\[?[^\]]+\]?\s+ibiza\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+20\d{2})?/i;

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
  const numericDay = Number(day);
  const numericMonth = Number(month);
  const ordinalSuffix =
    numericDay % 100 >= 11 && numericDay % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[numericDay % 10] || "th";
  const monthName = monthNames[numericMonth] || "";
  return [
    `${year}-${month}-${day}`,
    `${day}-${month}-${year}`,
    `${Number(day)}-${Number(month)}-${year}`,
    `${month}-${day}-${year}`,
    `${Number(month)}-${Number(day)}-${year}`,
    `${numericDay}${ordinalSuffix}${monthName}${year}`,
    `${numericDay}${monthName}${year}`,
    `${numericDay}-${monthName}-${year}`,
  ];
};

const sourceUrlMatchesDate = (sourceUrl, dateValue) => {
  const lower = String(sourceUrl || "").toLowerCase();
  return dateTokensFor(dateValue).some((token) => lower.includes(token.toLowerCase()));
};

const shouldReject = (value) => {
  const normalized = normalizeWhitespace(value);
  return (
    !normalized ||
    weakLineupPattern.test(normalized) ||
    genericLineupPattern.test(normalized) ||
    internalMetadataPattern.test(normalized) ||
    locationNoisePattern.test(normalized) ||
    ticketTierPattern.test(normalized) ||
    timeOnlyLineupPattern.test(normalized) ||
    truncatedLineupPattern.test(normalized) ||
    eventListingLineupPattern.test(normalized) ||
    eventDescriptionLineupPattern.test(normalized)
  );
};

const currentLineupIsWeak = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || weakLineupPattern.test(normalized) || genericLineupPattern.test(normalized) || internalMetadataPattern.test(normalized);
};

const todayInMadrid = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const rejectionReason = (proposal, event, todayMadrid) => {
  if (proposal.event_date && proposal.event_date < todayMadrid) return "rejected_past_event";
  if (shouldReject(proposal.proposed_lineup_details)) return "rejected_generic_or_partial_lineup";
  if (proposal.source_type === "ticketing_platform" && !sourceUrlMatchesDate(proposal.source_url, proposal.event_date)) {
    return "rejected_source_url_date_mismatch";
  }
  if (event && !currentLineupIsWeak(event.lineup_details)) return "rejected_current_lineup_not_weak";
  return null;
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const todayMadrid = todayInMadrid();

const { data: proposals, error } = await supabase
  .from("event_lineup_review_queue")
  .select("id,event_id,event_name,event_date,venue,source_url,source_type,approval_status,proposed_lineup_details,raw_metadata")
  .in("approval_status", ["pending", "auto_safe", "approved"])
  .order("created_at", { ascending: false })
  .limit(1000);

if (error) throw error;

const eventIds = [...new Set((proposals || []).map((proposal) => proposal.event_id).filter(Boolean))];
const { data: events, error: eventsError } = eventIds.length
  ? await supabase
    .from("ibiza_events")
    .select("id,lineup_details,status,source_missing_since,fourvenues_event_id,notion_page_id")
    .in("id", eventIds)
  : { data: [], error: null };

if (eventsError) throw eventsError;

const eventById = new Map((events || []).map((event) => [event.id, event]));

const rejects = (proposals || [])
  .map((proposal) => ({ proposal, reason: rejectionReason(proposal, eventById.get(proposal.event_id), todayMadrid) }))
  .filter((entry) => entry.reason);

if (apply && rejects.length) {
  const updates = rejects.map(({ proposal, reason }) =>
    supabase
      .from("event_lineup_review_queue")
      .update({
        approval_status: "rejected",
        raw_metadata: {
          ...(proposal.raw_metadata || {}),
          quality_gate: reason,
          maintenance_rejected_at: new Date().toISOString(),
        },
      })
      .eq("id", proposal.id),
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

console.log(JSON.stringify({
  apply,
  today_madrid: todayMadrid,
  proposals_checked: proposals?.length || 0,
  proposals_to_reject: rejects.length,
  rejected: apply ? rejects.length : 0,
  samples: rejects.slice(0, 20).map(({ proposal, reason }) => ({
    event_date: proposal.event_date,
    venue: proposal.venue,
    event_name: proposal.event_name,
    reason,
    proposed_lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
  })),
}, null, 2));
