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

const hasUrlDateMismatch = (dateValue, urlValue) => {
  const eventDate = String(dateValue || "");
  const urlDates = extractDateTokensFromUrl(urlValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !urlDates.length) return false;
  return !urlDates.includes(eventDate);
};

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const isGenericVenueCalendarUrl = (value) =>
  /(?:ibizarocks\.com\/events\/?$|\/(?:events|calendar|agenda)\/?$)/i.test(normalizeWhitespace(value));

const currentEventUrlNeedsRepair = (repair, event) => {
  if (repair.currentUrlPolicy === "generic_or_missing") {
    return !normalizeWhitespace(event.event_url) || isGenericVenueCalendarUrl(event.event_url);
  }

  return hasUrlDateMismatch(event.date, event.event_url);
};

const qualityGateFor = (repair) =>
  repair.currentUrlPolicy === "generic_or_missing"
    ? "official_recurring_series_url_repair"
    : "exact_date_mismatch_public_url_repair";

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

const exactRepairs = [
  {
    label: "Bresh at Amnesia official season page for 4 Jul 2026",
    date: "2026-07-04",
    venue: "Amnesia Ibiza",
    eventNamePattern: "%Bresh%",
    replacementUrl: "https://www.amnesia.es/en/party-info/bresh",
    sourceType: "official_venue",
    confidence: 0.86,
    evidence: [
      "Official Amnesia Bresh page covers the 2026 Saturday residency.",
      "Previous public URL carried a 2025 date token despite being attached to the 2026-07-04 row.",
    ],
  },
  {
    label: "Sonorama Ibiza 2026 official site for Day 1",
    date: "2026-10-02",
    venue: "Other",
    eventNamePattern: "%Sonorama%",
    replacementUrl: "https://sonoramariberaibiza.es/",
    sourceType: "official_venue",
    confidence: 0.9,
    evidence: [
      "Official Sonorama Ribera Ibiza site states Cala de Bou, Ibiza, 2 and 3 October 2026.",
      "Previous public URL was a news article whose publication date created a false event URL date mismatch.",
    ],
  },
  {
    label: "Sonorama Ibiza 2026 official site for Day 2",
    date: "2026-10-03",
    venue: "Other",
    eventNamePattern: "%Sonorama%",
    replacementUrl: "https://sonoramariberaibiza.es/",
    sourceType: "official_venue",
    confidence: 0.9,
    evidence: [
      "Official Sonorama Ribera Ibiza site states Cala de Bou, Ibiza, 2 and 3 October 2026.",
      "Previous public URL was a news article whose publication date created a false event URL date mismatch.",
    ],
  },
  {
    label: "Nothing New at Ibiza Rocks official recurring series page",
    date: null,
    venue: "Ibiza Rocks",
    eventNamePattern: "%Nothing New%",
    replacementUrl: "https://www.ibizarocks.com/events/nothing-new/",
    sourceType: "official_venue",
    confidence: 0.88,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Ibiza Rocks Nothing New page covers the Monday May-September 2026 pool party.",
      "Rows currently point at the generic Ibiza Rocks events calendar rather than the official series page.",
    ],
  },
  {
    label: "Ibiza Anthems at Ibiza Rocks official recurring series page",
    date: null,
    venue: "Ibiza Rocks",
    eventNamePattern: "%Ibiza Anthems%",
    replacementUrl: "https://www.ibizarocks.com/events/ibiza-anthems/",
    sourceType: "official_venue",
    confidence: 0.88,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Ibiza Rocks Ibiza Anthems page covers the Saturday May-September 2026 pool party.",
      "Rows currently point at the generic Ibiza Rocks events calendar rather than the official series page.",
    ],
  },
  {
    label: "R&B Affair at Ibiza Rocks official recurring series page",
    date: null,
    venue: "Ibiza Rocks",
    eventNamePattern: "%R&B Affair%",
    replacementUrl: "https://www.ibizarocks.com/events/rnb-affair/",
    sourceType: "official_venue",
    confidence: 0.88,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Ibiza Rocks R&B Affair page covers the Sunday May-September 2026 pool party.",
      "Rows currently point at the generic Ibiza Rocks events calendar rather than the official series page.",
    ],
  },
  {
    label: "Pantheøn at Cova Santa official recurring series page",
    date: null,
    venue: "Cova Santa",
    eventNamePattern: "%Pantheøn%",
    replacementUrl: "https://covasanta.com/en/parties/pantheon",
    sourceType: "official_venue",
    confidence: 0.88,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Cova Santa Pantheøn page covers the Sunday residency and describes the 2026 concept.",
      "Rows currently have no public event URL.",
    ],
  },
  {
    label: "RUMORS at Cova Santa official recurring series page",
    date: null,
    venue: "Cova Santa",
    eventNamePattern: "%RUMORS%",
    replacementUrl: "https://covasanta.com/en/parties/rumors",
    sourceType: "official_venue",
    confidence: 0.88,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Cova Santa Rumors page covers the Guy Gerber & Friends residency.",
      "Rows currently have no public event URL.",
    ],
  },
  {
    label: "Cocoricò presents GALACTICA at Eden official recurring series page",
    date: null,
    venue: "Eden Ibiza",
    eventNamePattern: "%GALACTICA%",
    replacementUrl: "https://www.edenibiza.com/galactica/",
    sourceType: "official_venue",
    confidence: 0.86,
    currentUrlPolicy: "generic_or_missing",
    evidence: [
      "Official Eden navigation exposes a Galactica series page for the 2026 season.",
      "Rows currently have no public event URL; date-by-date lineup verification remains a separate fallback-source packet.",
    ],
  },
  {
    label: "Markus Schulz at Eden official recurring series page",
    date: null,
    venue: "Eden Ibiza",
    eventNamePattern: "%Markus Schulz%",
    replacementUrl: "https://www.edenibiza.com/markus-schulz/",
    sourceType: "official_venue",
    confidence: 0.86,
    currentUrlPolicy: "generic_or_missing",
    endDate: "2026-09-17",
    evidence: [
      "Official Eden navigation exposes a Markus Schulz series page for the 2026 season.",
      "Only rows through 2026-09-17 are included because the remaining local row needs date review against published sources.",
    ],
  },
];

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";
const todayMadrid = todayInMadrid();

const approved = [];
const rejected = [];

for (const repair of exactRepairs) {
  let query = supabase
    .from("ibiza_events")
    .select("id,notion_page_id,event_name,date,venue,event_url,lineup_details,status,source_missing_since,fourvenues_event_id")
    .eq("venue", repair.venue)
    .ilike("event_name", repair.eventNamePattern)
    .gte("date", todayMadrid)
    .neq("status", "Cancelled")
    .is("source_missing_since", null);

  if (repair.date) query = query.eq("date", repair.date);
  if (repair.startDate) query = query.gte("date", repair.startDate);
  if (repair.endDate) query = query.lte("date", repair.endDate);

  const { data: events, error } = await query;

  if (error) throw error;

  for (const event of events || []) {
    const reasons = [];
    if (event.fourvenues_event_id || String(event.notion_page_id || "").startsWith("fourvenues:")) reasons.push("fourvenues_owned_row");
    if (repair.date && event.date !== repair.date) reasons.push("date_mismatch");
    if (!currentEventUrlNeedsRepair(repair, event)) reasons.push("current_event_url_not_repairable");
    if (!isValidUrl(repair.replacementUrl)) reasons.push("invalid_replacement_url");
    if (hasUrlDateMismatch(event.date, repair.replacementUrl)) reasons.push("replacement_url_date_mismatch");

    if (reasons.length) {
      rejected.push({ repair, event, reasons });
    } else {
      approved.push({ repair, event });
    }
  }

  if (!events?.length) {
    rejected.push({ repair, event: null, reasons: ["no_matching_event"] });
  }
}

let rowsUpdated = 0;
let sourceLinksUpserted = 0;

if (apply) {
  for (const { repair, event } of approved) {
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("ibiza_events")
      .update({
        event_url: repair.replacementUrl,
        last_synced_at: now,
      })
      .eq("id", event.id)
      .neq("status", "Cancelled")
      .is("source_missing_since", null)
      .is("fourvenues_event_id", null);

    if (updateError) throw updateError;
    rowsUpdated += 1;

    const { error: linkError } = await supabase
      .from("event_source_links")
      .upsert(
        {
          event_id: event.id,
          source_url: repair.replacementUrl,
          source_type: repair.sourceType,
          source_key: "exact-public-url-repair",
          source_label: repair.label,
          canonical_for_updates: true,
          monetizable: false,
          confidence: repair.confidence,
          last_checked_at: now,
          status: "active",
          raw_metadata: {
            repaired_from: event.event_url,
            repaired_at: now,
            evidence: repair.evidence,
            quality_gate: qualityGateFor(repair),
          },
        },
        { onConflict: "event_id,source_url" },
      );

    if (linkError) throw linkError;
    sourceLinksUpserted += 1;
  }
}

console.log(JSON.stringify({
  apply,
  today_madrid: todayMadrid,
  repairs_checked: exactRepairs.length,
  approved_for_apply: approved.length,
  rejected_by_guard: rejected.length,
  public_rows_updated: rowsUpdated,
  source_links_upserted: sourceLinksUpserted,
  approved_samples: approved.map(({ repair, event }) => ({
    date: event.date,
    venue: event.venue,
    event_name: event.event_name,
    current_event_url: event.event_url,
    replacement_url: repair.replacementUrl,
    label: repair.label,
  })),
  rejected_samples: rejected.map(({ repair, event, reasons }) => ({
    date: event?.date || repair.date,
    venue: event?.venue || repair.venue,
    event_name: event?.event_name || repair.eventNamePattern,
    current_event_url: event?.event_url || null,
    replacement_url: repair.replacementUrl,
    label: repair.label,
    reasons,
  })),
}, null, 2));
