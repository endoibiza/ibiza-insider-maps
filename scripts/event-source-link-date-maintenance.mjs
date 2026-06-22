import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

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

const dateMismatchFor = (dateValue, urlValue) => {
  const eventDate = String(dateValue || "");
  const urlDates = extractDateTokensFromUrl(urlValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !urlDates.length) return null;
  if (urlDates.includes(eventDate)) return null;
  return urlDates;
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

const fetchAll = async (supabase, table, select, build = (query) => query, pageSize = 1000) => {
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

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const startDate = process.env.START_DATE || todayInMadrid();
const endDate = process.env.END_DATE || "2026-12-31";

const events = await fetchAll(
  supabase,
  "ibiza_events",
  "id,notion_page_id,event_name,date,venue,status,source_missing_since,fourvenues_event_id",
  (query) =>
    query
      .gte("date", startDate)
      .lte("date", endDate)
      .neq("status", "Cancelled")
      .is("source_missing_since", null),
);

const visibleEvents = events.filter(
  (event) => !event.fourvenues_event_id && !String(event.notion_page_id || "").startsWith("fourvenues:"),
);
const eventById = new Map(visibleEvents.map((event) => [event.id, event]));

const links = await fetchAll(
  supabase,
  "event_source_links",
  "id,event_id,source_url,source_type,source_label,canonical_for_updates,status,confidence,raw_metadata",
  (query) => query.not("event_id", "is", null).in("status", ["active", "needs_review"]).order("updated_at", { ascending: false }),
);

const mismatches = links
  .map((link) => {
    const event = eventById.get(link.event_id);
    const mismatchedDates = dateMismatchFor(event?.date, link.source_url);
    return event && mismatchedDates ? { link, event, mismatchedDates } : null;
  })
  .filter(Boolean);

const needsUpdate = mismatches.filter(
  ({ link }) => link.status !== "needs_review" || link.canonical_for_updates,
);

let updated = 0;
if (apply) {
  for (const { link, event, mismatchedDates } of needsUpdate) {
    const rawMetadata = {
      ...(link.raw_metadata || {}),
      date_mismatch_review: {
        detected_at: new Date().toISOString(),
        event_date: event.date,
        url_date_tokens: mismatchedDates,
        action: "demoted_from_canonical_updates",
        reason: "Source URL contains a date token that does not match the Supabase event date.",
      },
    };

    const { error } = await supabase
      .from("event_source_links")
      .update({
        status: "needs_review",
        canonical_for_updates: false,
        raw_metadata: rawMetadata,
      })
      .eq("id", link.id);

    if (error) throw error;
    updated += 1;
  }
}

console.log(JSON.stringify({
  apply,
  start_date: startDate,
  end_date: endDate,
  visible_events_checked: visibleEvents.length,
  source_links_checked: links.length,
  date_mismatched_source_links: mismatches.length,
  source_links_needing_review_update: needsUpdate.length,
  source_links_updated: updated,
  samples: mismatches.slice(0, 30).map(({ link, event, mismatchedDates }) => ({
    event_date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    source_type: link.source_type,
    current_status: link.status,
    canonical_for_updates: link.canonical_for_updates,
    url_date_tokens: mismatchedDates,
    source_url: link.source_url,
  })),
}, null, 2));
