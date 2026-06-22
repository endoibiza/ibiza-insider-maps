import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const genericUrlPattern = /(?:ibiza-spotlight\.com\/(?:night\/events|events\/?$)|\/(?:events|calendar|agenda|events-and-tickets)\/?$)/i;

const canReplaceEventUrl = (value, dateValue) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || genericUrlPattern.test(normalized) || hasUrlDateMismatch(dateValue, normalized);
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

const hasUrlDateMismatch = (dateValue, urlValue) => {
  const eventDate = String(dateValue || "");
  const urlDates = extractDateTokensFromUrl(urlValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !urlDates.length) return false;
  return !urlDates.includes(eventDate);
};

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
  if (event?.date && event.date < todayMadrid) reasons.push("past_event");
  if (!canReplaceEventUrl(event?.event_url, event?.date)) reasons.push("event_url_not_missing_generic_or_date_mismatched");
  if (!isValidUrl(link.source_url)) reasons.push("invalid_source_url");
  if (!["official_venue", "fourvenues_public", "ticketing_platform"].includes(link.source_type)) reasons.push("unsupported_source_type");
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
  today_madrid: todayMadrid,
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
