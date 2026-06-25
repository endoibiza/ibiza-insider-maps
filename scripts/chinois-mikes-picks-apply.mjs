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

const picks = [
  ["2026-06-25", "Defected"],
  ["2026-06-27", "Claptone"],
  ["2026-06-28", "Saga"],
  ["2026-07-05", "Saga"],
  ["2026-07-06", "La Troya"],
  ["2026-07-09", "Defected"],
  ["2026-07-11", "Claptone"],
  ["2026-07-16", "Defected"],
  ["2026-07-18", "Claptone"],
  ["2026-07-26", "Saga"],
  ["2026-07-30", "Defected"],
  ["2026-08-06", "Defected"],
  ["2026-08-08", "Claptone"],
  ["2026-08-15", "Claptone"],
  ["2026-08-17", "La Troya"],
  ["2026-08-23", "Saga"],
  ["2026-08-27", "Defected"],
  ["2026-08-29", "Claptone"],
  ["2026-08-30", "Saga"],
  ["2026-09-10", "Defected"],
  ["2026-09-12", "Claptone"],
  ["2026-09-13", "Saga"],
  ["2026-09-19", "Claptone"],
  ["2026-09-20", "Saga"],
  ["2026-09-24", "Defected"],
  ["2026-09-27", "Saga"],
  ["2026-10-03", "Claptone"],
  ["2026-10-04", "Saga"],
  ["2026-10-05", "La Troya"],
  ["2026-10-08", "Defected"],
  ["2026-10-10", "Claptone"],
];

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
  select: "id,date,event_name,venue,lineup_details,mikes_pick,status,source_missing_since",
  venue: "eq.Chinois",
  date: "gte.2026-06-25",
  order: "date.asc",
  limit: "200",
});

const rows = await request(`ibiza_events?${params.toString()}`);

const matches = [];
const misses = [];

for (const [date, pattern] of picks) {
  const matcher = pattern.toLowerCase();
  const hit = rows.find(
    (row) =>
      row.date === date &&
      row.status !== "Cancelled" &&
      !row.source_missing_since &&
      (`${row.event_name} ${row.lineup_details ?? ""}`.toLowerCase().includes(matcher)),
  );
  if (hit) {
    matches.push(hit);
  } else {
    misses.push({ date, pattern });
  }
}

const alreadyPicked = matches.filter((row) => row.mikes_pick === true);
const toUpdate = matches.filter((row) => row.mikes_pick !== true);

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      requested_picks: picks.length,
      matched_rows: matches.length,
      missing_rows: misses,
      already_mikes_picks: alreadyPicked.length,
      rows_to_update: toUpdate.length,
      update_preview: toUpdate.map((row) => ({ id: row.id, date: row.date, event_name: row.event_name })),
    },
    null,
    2,
  ),
);

if (misses.length > 0) {
  throw new Error(`Refusing to apply because ${misses.length} requested picks did not match exactly.`);
}

if (!APPLY || toUpdate.length === 0) {
  process.exit(0);
}

for (const row of toUpdate) {
  await request(`ibiza_events?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ mikes_pick: true }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_chinois_mikes_picks",
    records_upserted: toUpdate.length,
    metadata: {
      status: "success",
      requested_picks: picks.length,
      matched_rows: matches.length,
      already_mikes_picks: alreadyPicked.length,
      protected_fields: ["lineup_details", "event_url", "slug", "featured_on_party_calendar", "residents_pass"],
    },
  }),
});

console.log(`Marked ${toUpdate.length} Chinois rows as Mike's Picks.`);
