const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const VENUE_PATTERN = process.env.VENUE_PATTERN || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const isSlugLikeEventSeries = (value) =>
  Boolean(
    value &&
      /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(value.trim()) &&
      (/\d{2}-\d{2}-\d{4}/.test(value) || /\d{4}/.test(value) || value.includes("-week-")),
  );

const matchesVenue = (row) => {
  if (!VENUE_PATTERN) return true;
  const re = new RegExp(VENUE_PATTERN, "i");
  return re.test(row.venue || "") || re.test(row.event_name || "");
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

const params = new URLSearchParams({
  select: "id,event_name,slug,venue,notion_page_id,event_series,status,source_missing_since",
  notion_page_id: "like.fourvenues:%",
  event_series: "not.is.null",
  source_missing_since: "is.null",
  status: "neq.Cancelled",
  limit: "1000",
});

const rows = await request(`ibiza_events?${params.toString()}`);

const targets = rows.filter((row) => matchesVenue(row) && isSlugLikeEventSeries(row.event_series));

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      venue_pattern: VENUE_PATTERN || null,
      rows_checked: rows.length,
      rows_targeted: targets.length,
      targets: targets.map((row) => ({
        id: row.id,
        event_name: row.event_name,
        venue: row.venue,
        slug: row.slug,
        old_event_series: row.event_series,
      })),
    },
    null,
    2,
  ),
);

if (!APPLY || targets.length === 0) {
  process.exit(0);
}

for (const row of targets) {
  await request(`ibiza_events?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ event_series: null }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_fourvenues_detail_cleanup",
    status: "success",
    records_upserted: targets.length,
    metadata: {
      repair: "Cleared slug-like event_series from Fourvenues-owned public rows so legacy detail pages do not render machine slugs.",
      records_processed: rows.length,
      venue_pattern: VENUE_PATTERN || null,
      protected_fields: ["mikes_pick", "featured_on_party_calendar", "residents_pass", "slug", "event_url", "lineup_details"],
    },
  }),
});

console.log(`Cleared slug-like event_series on ${targets.length} Fourvenues rows.`);
