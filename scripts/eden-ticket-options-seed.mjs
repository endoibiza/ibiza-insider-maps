const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const LIMIT = Math.min(Math.max(Number(process.env.LIMIT || 120), 1), 200);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const request = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`´']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const clubticketsSeries = [
  {
    slug: "encasa",
    patterns: [/encasa/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/encasa",
  },
  {
    slug: "fire-in-the-club",
    patterns: [/fire in the club/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/fire-in-the-club",
  },
  {
    slug: "galactica",
    patterns: [/galactica/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/galactica",
  },
  {
    slug: "23-degrees",
    patterns: [/23 degrees/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/23-degrees",
  },
  {
    slug: "la-disturbia",
    patterns: [/la disturbia/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/la-disturbia",
  },
  {
    slug: "fuego",
    patterns: [/fuego/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/fuego",
  },
  {
    slug: "actin-bad",
    patterns: [/actin.?bad/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/actin-bad",
  },
  {
    slug: "garage-nation-eden",
    patterns: [/garage nation/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/garage-nation-eden",
  },
  {
    slug: "Markus-schulz",
    patterns: [/markus schulz/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/Markus-schulz",
  },
  {
    slug: "eden-nights",
    patterns: [/still x spades/, /\bdj ez\b/, /stack city/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/eden-ibiza/eden-nights",
  },
];

const findSeries = (event) => {
  const haystack = normalize(`${event.event_name} ${event.lineup_details || ""}`);
  return clubticketsSeries.find((series) => series.patterns.some((pattern) => pattern.test(haystack)));
};

const todayMadrid = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const params = new URLSearchParams({
  select:
    "id,notion_page_id,event_name,date,venue,lineup_details,status,source_missing_since,fourvenues_event_id",
  venue: "eq.Eden Ibiza",
  date: `gte.${todayMadrid()}`,
  source_missing_since: "is.null",
  order: "date.asc",
  limit: String(LIMIT),
});

const rows = await request(`ibiza_events?${params.toString()}`);

const approved = [];
const skipped = [];

for (const row of rows || []) {
  const status = String(row.status || "").toLowerCase();
  const reasons = [];
  if (status === "hidden" || status === "cancelled") reasons.push("not_visible");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))) reasons.push("missing_date");

  const series = findSeries(row);
  if (!series) reasons.push("no_verified_clubtickets_series_mapping");

  if (reasons.length) {
    skipped.push({
      date: row.date,
      event_name: row.event_name,
      reasons,
    });
    continue;
  }

  const url = `https://www.clubtickets.com/clubbing/eden-ibiza/${series.slug}/${row.date}`;
  approved.push({
    ibiza_event_id: row.id,
    event_name: row.event_name,
    date: row.date,
    kind: "tickets",
    provider: "ticketing_platform",
    label: "Tickets",
    url,
    priority: 10,
    source_url: series.sourceEvidence,
    verified_at: new Date().toISOString(),
    active: true,
    confidence: 0.9,
    metadata: {
      generated_from: "eden-ticket-options-seed",
      venue: "Eden Ibiza",
      evidence: series.sourceEvidence,
      note: "Clubtickets public pages identify these Eden Ibiza 2026 series as official ticketing pages. Date-specific URL pattern is series/date.",
    },
  });
}

const existingParams = new URLSearchParams({
  select: "ibiza_event_id,kind,provider,url",
  ibiza_event_id: `in.(${approved.map((row) => row.ibiza_event_id).join(",")})`,
  kind: "eq.tickets",
  active: "eq.true",
});

const existing = approved.length ? await request(`event_booking_options?${existingParams.toString()}`) : [];
const existingTicketByEvent = new Map((existing || []).map((option) => [option.ibiza_event_id, option]));
const toInsertOrUpdate = approved.filter((option) => existingTicketByEvent.get(option.ibiza_event_id)?.url !== option.url);

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      scanned_eden_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      existing_ticket_options_same_url: approved.length - toInsertOrUpdate.length,
      rows_to_insert_or_update: toInsertOrUpdate.length,
      skipped: skipped.length,
      skipped_preview: skipped.slice(0, 20),
      update_preview: toInsertOrUpdate.slice(0, 20).map((option) => ({
        date: option.date,
        event_name: option.event_name,
        url: option.url,
      })),
    },
    null,
    2,
  ),
);

if (!APPLY || toInsertOrUpdate.length === 0) {
  process.exit(0);
}

await request("event_booking_options?on_conflict=ibiza_event_id,kind,provider,url", {
  method: "POST",
  headers: {
    prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(
    toInsertOrUpdate.map(({ event_name, date, ...option }) => ({
      ...option,
      event_name: undefined,
      date: undefined,
    })),
  ),
});

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_eden_ticket_seed",
    records_upserted: toInsertOrUpdate.length,
    metadata: {
      status: "success",
      scanned_eden_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      skipped_count: skipped.length,
      protected_fields: ["ibiza_events.lineup_details", "ibiza_events.event_url", "ibiza_events.slug"],
    },
  }),
});

console.log(`Seeded ${toInsertOrUpdate.length} Eden ticket booking options.`);
