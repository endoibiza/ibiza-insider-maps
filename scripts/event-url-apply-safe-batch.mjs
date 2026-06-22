import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const genericUrlPattern = /(?:ibiza-spotlight\.com\/(?:night\/events|events\/?$)|\/(?:events|calendar|agenda|events-and-tickets)\/?$)/i;

const canReplaceEventUrl = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || genericUrlPattern.test(normalized);
};

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const dateTokensFor = (dateValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return [];
  const [year, month, day] = dateValue.split("-");
  return [
    `${year}-${month}-${day}`,
    `${day}-${month}-${year}`,
    `${Number(day)}-${Number(month)}-${year}`,
  ];
};

const sourceUrlMatchesDate = (sourceUrl, dateValue) => {
  const lower = String(sourceUrl || "").toLowerCase();
  return dateTokensFor(dateValue).some((token) => lower.includes(token.toLowerCase()));
};

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const limit = Math.min(Math.max(Number(process.env.LIMIT || 20), 1), 100);
const sourceTypes = splitList(process.env.SOURCE_TYPES || "official_venue,fourvenues_public");
const minConfidence = Number(process.env.MIN_CONFIDENCE || 0.88);

const { data: links, error } = await supabase
  .from("event_source_links")
  .select("id,event_id,source_url,source_type,source_label,confidence,status,canonical_for_updates,raw_metadata")
  .in("source_type", sourceTypes)
  .eq("status", "active")
  .eq("canonical_for_updates", true)
  .gte("confidence", minConfidence)
  .order("updated_at", { ascending: false })
  .limit(limit);

if (error) throw error;

const eventIds = [...new Set((links || []).map((link) => link.event_id).filter(Boolean))];
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

for (const link of links || []) {
  const event = eventById.get(link.event_id);
  const reasons = [];

  if (!event) reasons.push("missing_event");
  if (event?.fourvenues_event_id || String(event?.notion_page_id || "").startsWith("fourvenues:")) reasons.push("fourvenues_owned_row");
  if (String(event?.status || "").toLowerCase() === "cancelled") reasons.push("cancelled_event");
  if (event?.source_missing_since) reasons.push("source_missing_event");
  if (!canReplaceEventUrl(event?.event_url)) reasons.push("event_url_not_missing_or_generic");
  if (!isValidUrl(link.source_url)) reasons.push("invalid_source_url");
  if (!["official_venue", "fourvenues_public"].includes(link.source_type)) reasons.push("unsupported_source_type");
  if (!sourceUrlMatchesDate(link.source_url, event?.date)) reasons.push("source_url_date_mismatch");

  if (reasons.length) {
    rejected.push({ link, event, reasons });
  } else {
    approved.push({ link, event });
  }
}

let updated = 0;
if (apply && approved.length) {
  for (const { link, event } of approved) {
    const { error: updateError } = await supabase
      .from("ibiza_events")
      .update({
        event_url: link.source_url,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", event.id)
      .neq("status", "Cancelled")
      .is("source_missing_since", null)
      .is("fourvenues_event_id", null);

    if (updateError) throw updateError;
    updated += 1;
  }
}

console.log(JSON.stringify({
  apply,
  source_types: sourceTypes,
  min_confidence: minConfidence,
  links_checked: links?.length || 0,
  approved_for_apply: approved.length,
  rejected_by_guard: rejected.length,
  public_rows_updated: updated,
  approved_samples: approved.map(({ link, event }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    current_event_url: event.event_url,
    source_url: link.source_url,
    source_type: link.source_type,
  })),
  rejected_samples: rejected.slice(0, 20).map(({ link, event, reasons }) => ({
    date: event?.date || null,
    venue: event?.venue || null,
    event_name: event?.event_name || null,
    current_event_url: event?.event_url || null,
    source_url: link.source_url,
    source_type: link.source_type,
    reasons,
  })),
}, null, 2));
