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

const sourceUrl =
  "https://www.insomniafm.com/cocorico-and-galactica-reveal-full-season-lineup-for-eden-ibiza-residency/";

const cleanLineups = [
  ["2026-06-30", "OnlyNumbers, Samuel Moriero b2b Daisy, William Luck"],
  ["2026-07-07", "Dyen, Vendex, Negitiv b2b Gianna Di Bernardo, Ankkh"],
  ["2026-07-14", "Reinier Zonneveld (live), Cera Khin, Mattia Trani, V111"],
  ["2026-07-21", "Winson, Klofama, Daisy, Sanem"],
  ["2026-07-28", "Clara Cuvé, Nikolina, Kander, Lucia Gea"],
  ["2026-08-04", "Holy Priest, Kistenbrügger b2b Karamustan, Ankkh, Sizing"],
  ["2026-08-11", "6EJOU b2b SNTS, Vieze Asbak, Byorn, Daisy, Sizing"],
  ["2026-08-18", "Natte Visstick, Luca Agnelli, Anxhela, Marie Vaunt, Sanem"],
  ["2026-08-25", "Angerfist, Charlie Sparks, Parfait, Badtrip b2b Biondo"],
  ["2026-09-01", "Andres Campo, Fumi, T78 vs Mattia Trani, Annie"],
  ["2026-09-15", "999999999, Alignment, Angerfist, Charlie Sparks"],
].map(([date, lineup_details]) => ({ date, lineup_details }));

const shouldUpdate = (current, next) => {
  const value = String(current || "").trim();
  if (!value) return true;
  if (/line-?\s*up\s+tba|artists?\s+tba|coming soon|more info soon/i.test(value)) return true;
  if (/galactica is impacting ibiza|the frequency takes over the island|get ready for real madness/i.test(value)) return true;
  return value !== next;
};

const plan = [];

for (const sourceRow of cleanLineups) {
  const params = new URLSearchParams({
    select: "id,event_name,date,venue,lineup_details,status,source_missing_since,notion_page_id,fourvenues_event_id",
    venue: "eq.Eden Ibiza",
    date: `eq.${sourceRow.date}`,
    event_name: "ilike.*GALACTICA*",
    source_missing_since: "is.null",
  });
  const rows = await request(`ibiza_events?${params.toString()}`);
  const candidates = (rows || []).filter((row) => !/^hidden$/i.test(String(row.status || "")));

  if (candidates.length !== 1) {
    plan.push({
      date: sourceRow.date,
      action: "skip",
      reason: `expected 1 visible Eden Galactica row, found ${candidates.length}`,
      candidates: candidates.map((row) => ({
        event_name: row.event_name,
        status: row.status,
        lineup_details: row.lineup_details,
      })),
    });
    continue;
  }

  const event = candidates[0];
  const needsUpdate = shouldUpdate(event.lineup_details, sourceRow.lineup_details);
  plan.push({
    date: sourceRow.date,
    event_id: event.id,
    event_name: event.event_name,
    current_lineup_details: event.lineup_details,
    proposed_lineup_details: sourceRow.lineup_details,
    action: needsUpdate ? "update" : "keep",
  });
}

const updates = plan.filter((item) => item.action === "update");

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      source_url: sourceUrl,
      checked_dates: cleanLineups.length,
      rows_to_update: updates.length,
      skipped: plan.filter((item) => item.action === "skip").length,
      update_preview: updates.map((item) => ({
        date: item.date,
        event_name: item.event_name,
        proposed_lineup_details: item.proposed_lineup_details,
      })),
      skipped_preview: plan.filter((item) => item.action === "skip"),
    },
    null,
    2,
  ),
);

if (!APPLY || updates.length === 0) {
  process.exit(0);
}

for (const update of updates) {
  await request(`ibiza_events?id=eq.${update.event_id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      lineup_details: update.proposed_lineup_details,
      status: "Confirmed",
      source: "Eden Ibiza, Fourvenues, ClubTickets, INSOMNIAFM",
    }),
  });
}

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "ibiza_events_eden_galactica_lineup_cleanup",
    records_upserted: updates.length,
    metadata: {
      status: "success",
      source_url: sourceUrl,
      checked_dates: cleanLineups.length,
      protected_fields: [
        "ibiza_events.slug",
        "ibiza_events.mikes_pick",
        "ibiza_events.featured_on_party_calendar",
        "ibiza_events.residents_pass",
        "event_booking_options",
      ],
    },
  }),
});

console.log(`Updated ${updates.length} Eden Galactica public lineups.`);
