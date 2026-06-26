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
  select: "id,event_name,date,venue,event_url,status,source_missing_since",
  venue: "eq.Cova Santa",
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
  const url = String(row.event_url || "");
  const reasons = [];

  if (status === "hidden" || status === "cancelled") reasons.push("not_visible");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))) reasons.push("missing_date");
  if (!/^https:\/\/web\.fourvenues\.com\/cova-santa\/events\/[^?#\s]+/i.test(url)) {
    reasons.push("not_cova_date_specific_fourvenues_event_url");
  }

  if (reasons.length) {
    skipped.push({
      date: row.date,
      event_name: row.event_name,
      event_url: row.event_url,
      reasons,
    });
    continue;
  }

  approved.push({
    ibiza_event_id: row.id,
    event_name: row.event_name,
    date: row.date,
    kind: "tickets",
    provider: "fourvenues",
    label: "Tickets",
    url,
    priority: 10,
    source_url: "https://www.covasanta.com/en/events",
    verified_at: new Date().toISOString(),
    active: true,
    confidence: 0.88,
    metadata: {
      generated_from: "cova-ticket-options-seed",
      venue: "Cova Santa",
      evidence: "Cova Santa official events page links users to date-specific web.fourvenues.com/cova-santa/events pages from its ticket flow.",
      note: "This classifies existing Cova date-specific public Fourvenues event URLs as ticket options. It does not change lineups or fabricate ticket-rate inventory.",
    },
  });
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
      scanned_cova_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      existing_ticket_options_same_url: approved.length - toInsertOrUpdate.length,
      rows_to_insert_or_update: toInsertOrUpdate.length,
      skipped: skipped.length,
      skipped_preview: skipped.slice(0, 20),
      update_preview: toInsertOrUpdate.slice(0, 30).map((option) => ({
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
    table_name: "event_booking_options_cova_ticket_seed",
    records_upserted: toInsertOrUpdate.length,
    metadata: {
      status: "success",
      scanned_cova_rows: rows?.length ?? 0,
      approved_ticket_options: approved.length,
      skipped,
    },
  }),
});

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      inserted_or_updated: toInsertOrUpdate.length,
    },
    null,
    2,
  ),
);
