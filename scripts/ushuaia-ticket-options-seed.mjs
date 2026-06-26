const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const LIMIT = Math.min(Math.max(Number(process.env.LIMIT || 140), 1), 220);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const request = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
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
    .replace(/[’'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

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

const clubticketsSeries = [
  {
    slug: "calvin-harris",
    patterns: [/calvin harris/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/calvin-harris",
  },
  {
    slug: "ants",
    patterns: [/\bants\b/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/ants",
  },
  {
    slug: "swedish-house-mafia",
    patterns: [/swedish house mafia/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/swedish-house-mafia",
  },
  {
    slug: "f-me-im-famous",
    patterns: [/f\*?\s*me im famous/, /f\*?\s*me i'm famous/, /david guetta/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/f-me-im-famous",
  },
  {
    slug: "ozuna",
    patterns: [/\bozuna\b/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/ozuna",
  },
  {
    slug: "tomorrowland-and-dimitri-vegas-like-mike",
    patterns: [/tomorrowland/, /dimitri vegas/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/tomorrowland-and-dimitri-vegas-like-mike",
  },
  {
    slug: "martin-garrix",
    patterns: [/martin garrix/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/martin-garrix",
  },
  {
    slug: "elrow",
    patterns: [/\belrow\b/],
    sourceEvidence: "https://www.clubtickets.com/clubbing/ushuaia-ibiza/elrow",
  },
];

const findSeries = (event) => {
  const haystack = normalize(`${event.event_name} ${event.lineup_details || ""}`);
  return clubticketsSeries.find((series) => series.patterns.some((pattern) => pattern.test(haystack)));
};

const params = new URLSearchParams({
  select:
    "id,event_name,date,venue,lineup_details,event_url,status,source_missing_since,fourvenues_event_id",
  venue: "eq.Ushuaïa Ibiza",
  date: `gte.${todayMadrid()}`,
  source_missing_since: "is.null",
  order: "date.asc",
  limit: String(LIMIT),
});

const rows = await request(`ibiza_events?${params.toString()}`);

const approved = [];
const missingUrlRepairs = [];
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
      event_url: row.event_url,
      reasons,
    });
    continue;
  }

  const url = `https://www.clubtickets.com/clubbing/ushuaia-ibiza/${series.slug}/${row.date}`;
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
      generated_from: "ushuaia-ticket-options-seed",
      venue: "Ushuaïa Ibiza",
      evidence: series.sourceEvidence,
      note: "Clubtickets public pages identify these Ushuaïa Ibiza 2026 series as official ticketing pages. Date-specific URL pattern is series/date.",
    },
  });

  if (!row.event_url) {
    missingUrlRepairs.push({
      id: row.id,
      event_url: url,
      source: row.source || "ClubTickets",
    });
  }
}

const existingParams = new URLSearchParams({
  select: "ibiza_event_id,kind,provider,url",
  ibiza_event_id: approved.length ? `in.(${approved.map((row) => row.ibiza_event_id).join(",")})` : "in.(00000000-0000-0000-0000-000000000000)",
  kind: "eq.tickets",
  active: "eq.true",
});

const existing = approved.length ? await request(`event_booking_options?${existingParams.toString()}`) : [];
const existingByEventAndUrl = new Set((existing || []).map((option) => `${option.ibiza_event_id}:${option.url}`));
const toInsertOrUpdate = approved.filter((option) => !existingByEventAndUrl.has(`${option.ibiza_event_id}:${option.url}`));

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      scanned_ushuaia_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      existing_ticket_options_same_url: approved.length - toInsertOrUpdate.length,
      rows_to_insert_or_update: toInsertOrUpdate.length,
      missing_event_url_repairs: missingUrlRepairs.length,
      skipped: skipped.length,
      skipped_preview: skipped.slice(0, 20),
      update_preview: toInsertOrUpdate.slice(0, 30).map((option) => ({
        date: option.date,
        event_name: option.event_name,
        url: option.url,
      })),
      missing_url_repair_preview: missingUrlRepairs.slice(0, 20),
    },
    null,
    2,
  ),
);

if (!APPLY || (toInsertOrUpdate.length === 0 && missingUrlRepairs.length === 0)) {
  process.exit(0);
}

if (toInsertOrUpdate.length > 0) {
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
}

for (const repair of missingUrlRepairs) {
  await request(`ibiza_events?id=eq.${repair.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      event_url: repair.event_url,
      source: repair.source.includes("ClubTickets") ? repair.source : `${repair.source}, ClubTickets`,
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_ushuaia_ticket_seed",
    records_upserted: toInsertOrUpdate.length,
    metadata: {
      status: "success",
      scanned_ushuaia_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      missing_event_url_repairs: missingUrlRepairs.length,
      skipped,
    },
  }),
});

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      inserted_or_updated: toInsertOrUpdate.length,
      missing_event_urls_repaired: missingUrlRepairs.length,
    },
    null,
    2,
  ),
);
