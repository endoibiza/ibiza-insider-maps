const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";

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

const duplicateSeries = [
  {
    key: "galactica",
    legacyPattern: /galactica/,
    fourvenuesPattern: /galactica/,
  },
  {
    key: "markus_schulz",
    legacyPattern: /markus schulz/,
    fourvenuesPattern: /markus schulz/,
  },
];

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
    "id,notion_page_id,event_name,date,slug,venue,source,event_url,status,source_missing_since,fourvenues_event_id,mikes_pick,featured_on_party_calendar,residents_pass",
  venue: "eq.Eden Ibiza",
  date: `gte.${todayMadrid()}`,
  source_missing_since: "is.null",
  status: "neq.Cancelled",
  order: "date.asc",
  limit: "200",
});

const rows = await request(`ibiza_events?${params.toString()}`);
const byDate = new Map();

for (const row of rows || []) {
  byDate.set(row.date, [...(byDate.get(row.date) || []), row]);
}

const targets = [];
const skipped = [];

for (const [date, dateRows] of byDate) {
  const fourvenuesRows = dateRows.filter((row) => row.fourvenues_event_id || String(row.notion_page_id || "").startsWith("fourvenues:"));
  const legacyRows = dateRows.filter((row) => !row.fourvenues_event_id && !String(row.notion_page_id || "").startsWith("fourvenues:"));

  for (const legacy of legacyRows) {
    const legacyText = normalize(`${legacy.event_name} ${legacy.event_url || ""} ${legacy.source || ""}`);
    const series = duplicateSeries.find((item) => item.legacyPattern.test(legacyText));

    if (!series) {
      skipped.push({ id: legacy.id, date, event_name: legacy.event_name, reason: "legacy_row_not_in_duplicate_series_allowlist" });
      continue;
    }

    const matchingFourvenues = fourvenuesRows.find((row) =>
      series.fourvenuesPattern.test(normalize(`${row.event_name} ${row.source || ""}`)),
    );

    if (!matchingFourvenues) {
      skipped.push({ id: legacy.id, date, event_name: legacy.event_name, reason: "no_matching_fourvenues_row_same_date" });
      continue;
    }

    if (legacy.mikes_pick || legacy.featured_on_party_calendar || legacy.residents_pass) {
      skipped.push({ id: legacy.id, date, event_name: legacy.event_name, reason: "protected_editorial_flag" });
      continue;
    }

    targets.push({
      legacy,
      replacement: matchingFourvenues,
      series: series.key,
    });
  }
}

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      rows_checked: rows?.length ?? 0,
      duplicate_targets: targets.length,
      targets: targets.map(({ legacy, replacement, series }) => ({
        series,
        date: legacy.date,
        hide: legacy.event_name,
        keep: replacement.event_name,
        legacy_slug: legacy.slug,
        replacement_slug: replacement.slug,
      })),
      skipped: skipped.length,
      skipped_preview: skipped.slice(0, 20),
    },
    null,
    2,
  ),
);

if (!APPLY || targets.length === 0) {
  process.exit(0);
}

const now = new Date().toISOString();

for (const { legacy, replacement, series } of targets) {
  await request(`ibiza_events?id=eq.${legacy.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      status: "Hidden",
      source_missing_since: now,
      notes: null,
    }),
  });

  await request("event_source_links?on_conflict=event_id,source_url", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      event_id: replacement.id,
      source_url: legacy.event_url,
      source_type: "official_venue",
      source_label: "Legacy official Eden source preserved before duplicate hide",
      source_key: `eden-duplicate-cleanup-${series}-${legacy.date}`,
      canonical_for_updates: false,
      confidence: 0.9,
      status: "active",
      raw_metadata: {
        generated_from: "eden-duplicate-cleanup",
        hidden_duplicate_event_id: legacy.id,
        replacement_event_id: replacement.id,
      },
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_eden_duplicate_cleanup",
    records_upserted: targets.length,
    metadata: {
      status: "success",
      repair: "Hid exact Eden legacy duplicates where same-date Fourvenues official rows now own the public event.",
      protected_fields: ["mikes_pick", "featured_on_party_calendar", "residents_pass", "slug"],
    },
  }),
});

console.log(`Hid ${targets.length} Eden legacy duplicate rows.`);
