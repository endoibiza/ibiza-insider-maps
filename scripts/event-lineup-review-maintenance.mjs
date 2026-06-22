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

const weakLineupPattern = /^(tba|tbc|line\s*up\s*tba|lineup\s*tba|to be announced|more tba|coming soon|line\s*up\s*coming soon)[.!…]*$/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more)/i;
const internalMetadataPattern = /\b(agent run|run id|verified on|last verified|last checked|confidence|snapshot id)\b/i;
const timeOnlyLineupPattern =
  /^(?:\d{1,2}|00|30)(?:\s*\([^)]+\)\s*\/\s*\d{1,2}:\d{2}\s*\([^)]+\))?$/i;
const truncatedLineupPattern = /(?:\.{3}|…)\s*$/;

const shouldReject = (value) => {
  const normalized = normalizeWhitespace(value);
  return (
    !normalized ||
    weakLineupPattern.test(normalized) ||
    genericLineupPattern.test(normalized) ||
    internalMetadataPattern.test(normalized) ||
    timeOnlyLineupPattern.test(normalized) ||
    truncatedLineupPattern.test(normalized)
  );
};

const todayInMadrid = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const rejectionReason = (proposal, todayMadrid) => {
  if (proposal.event_date && proposal.event_date < todayMadrid) return "rejected_past_event";
  if (shouldReject(proposal.proposed_lineup_details)) return "rejected_generic_or_partial_lineup";
  return null;
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const todayMadrid = todayInMadrid();

const { data: proposals, error } = await supabase
  .from("event_lineup_review_queue")
  .select("id,event_name,event_date,venue,approval_status,proposed_lineup_details,raw_metadata")
  .in("approval_status", ["pending", "auto_safe", "approved"])
  .order("created_at", { ascending: false })
  .limit(1000);

if (error) throw error;

const rejects = (proposals || [])
  .map((proposal) => ({ proposal, reason: rejectionReason(proposal, todayMadrid) }))
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
