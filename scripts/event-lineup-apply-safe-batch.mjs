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

const weakLineupPattern = /(?:^|\b)(tba|tbc|line\s*-?\s*up\s*tba|lineup\s*tba|to be announced|lineup not yet posted)(?:\b|$)/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more)/i;
const internalMetadataPattern = /\b(agent run|run id|verified on|last verified|last checked|confidence|snapshot id)\b/i;
const timeOnlyLineupPattern =
  /^(?:\d{1,2}|00|30)(?:\s*\([^)]+\)\s*\/\s*\d{1,2}:\d{2}\s*\([^)]+\))?$/i;
const truncatedLineupPattern = /(?:\.{3}|…)\s*$/;
const genericUrlPattern = /(?:ibiza-spotlight\.com\/(?:night\/events|events\/?$)|\/(?:events|calendar|agenda)\/?$)/i;

const isSafeProposedLineup = (value) => {
  const normalized = normalizeWhitespace(value);
  return Boolean(normalized) &&
    !weakLineupPattern.test(normalized) &&
    !genericLineupPattern.test(normalized) &&
    !internalMetadataPattern.test(normalized) &&
    !timeOnlyLineupPattern.test(normalized) &&
    !truncatedLineupPattern.test(normalized);
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
  normalizeWhitespace(left).toLowerCase() === normalizeWhitespace(right).toLowerCase();

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const limit = Math.min(Math.max(Number(process.env.LIMIT || 10), 1), 50);
const sourceType = process.env.SOURCE_TYPE || "fourvenues_public";

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
  if (event?.date !== proposal.event_date) reasons.push("date_mismatch");
  if (event?.venue !== proposal.venue) reasons.push("venue_mismatch");
  if (!isSafeProposedLineup(proposal.proposed_lineup_details)) reasons.push("unsafe_proposed_lineup");
  if (!canReplaceCurrentLineup(event?.lineup_details)) reasons.push("current_lineup_not_weak");
  if (!proposal.source_url) reasons.push("missing_source_url");

  if (reasons.length) {
    if (event && reasons.length === 1 && reasons[0] === "current_lineup_not_weak" && sameLineup(event.lineup_details, proposal.proposed_lineup_details)) {
      alreadyApplied.push({ proposal, event });
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
  for (const { proposal } of alreadyApplied) {
    const { error: proposalError } = await supabase
      .from("event_lineup_review_queue")
      .update({
        approval_status: "applied",
        applied_at: new Date().toISOString(),
        raw_metadata: {
          ...(proposal.raw_metadata || {}),
          safe_apply_batch: true,
          safe_apply_noop: true,
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
      lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
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
    proposed_lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
    source_url: proposal.source_url,
    would_replace_event_url: canReplaceEventUrl(event.event_url),
  })),
  already_applied_samples: alreadyApplied.map(({ proposal, event }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    proposed_lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
    source_url: proposal.source_url,
  })),
  rejected_samples: rejected.slice(0, 20).map(({ proposal, event, reasons }) => ({
    date: event?.date || proposal.event_date,
    venue: proposal.venue,
    event_name: proposal.event_name,
    reasons,
    proposed_lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
  })),
}, null, 2));
