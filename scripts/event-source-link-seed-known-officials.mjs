import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const apply = String(process.env.APPLY || "false").toLowerCase() === "true";

const officialSeeds = [
  {
    label: "Hï Ibiza CamelPhat Summer of Love 2026",
    venue: "Hï Ibiza",
    eventNamePattern: "%CamelPhat%",
    sourceUrl: "https://www.hiibiza.com/events/2026/camelphat",
    startDate: "2026-07-05",
    endDate: "2026-10-02",
    sourceType: "official_venue",
    sourceKey: "known-official-source-seed",
    monetizable: false,
    confidence: 0.92,
  },
  {
    label: "Club Chinois La Troya 31 Aug 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%La Troya%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/la-troya-31-08-2026-VPDF",
    startDate: "2026-08-31",
    endDate: "2026-08-31",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
  },
  {
    label: "Club Chinois La Troya 21 Sep 2026 public Fourvenues page",
    venue: "Club Chinois",
    eventNamePattern: "%La Troya%",
    sourceUrl: "https://site.fourvenues.com/en/chinois-ibiza/events/la-troya-21-09-2026-QF2Z",
    startDate: "2026-09-21",
    endDate: "2026-09-21",
    sourceType: "fourvenues_public",
    sourceKey: "known-fourvenues-public-source-seed",
    monetizable: false,
    confidence: 0.9,
  },
];

const summary = [];

for (const seed of officialSeeds) {
  const { data: events, error } = await supabase
    .from("ibiza_events")
    .select("id,event_name,date,venue,event_url,lineup_details,notion_page_id,fourvenues_event_id")
    .eq("venue", seed.venue)
    .ilike("event_name", seed.eventNamePattern)
    .gte("date", seed.startDate)
    .lte("date", seed.endDate)
    .neq("status", "Cancelled")
    .is("source_missing_since", null)
    .order("date", { ascending: true });

  if (error) throw error;

  const eligibleEvents = (events || []).filter(
    (event) => !event.fourvenues_event_id && !String(event.notion_page_id || "").startsWith("fourvenues:"),
  );

  let upserts = 0;
  if (apply && eligibleEvents.length) {
    const rows = eligibleEvents.map((event) => ({
      event_id: event.id,
      source_url: seed.sourceUrl,
      source_type: seed.sourceType || "official_venue",
      source_key: seed.sourceKey || "known-official-source-seed",
      source_label: seed.label,
      canonical_for_updates: true,
      monetizable: seed.monetizable || false,
      confidence: seed.confidence,
      last_checked_at: new Date().toISOString(),
      status: "active",
      raw_metadata: {
        seeded_from: "known_official_source_seed",
        seed_label: seed.label,
        event_name: event.event_name,
        event_date: event.date,
        existing_event_url: event.event_url,
      },
    }));

    const { error: upsertError } = await supabase
      .from("event_source_links")
      .upsert(rows, { onConflict: "event_id,source_url" });

    if (upsertError) throw upsertError;
    upserts = rows.length;
  }

  summary.push({
    label: seed.label,
    source_url: seed.sourceUrl,
    matched_events: eligibleEvents.length,
    upserted_source_links: upserts,
    sample_events: eligibleEvents.slice(0, 20).map((event) => ({
      date: event.date,
      venue: event.venue,
      event_name: event.event_name,
      current_event_url: event.event_url,
      current_lineup_details: event.lineup_details,
    })),
  });
}

console.log(JSON.stringify({ apply, seeds_checked: officialSeeds.length, summary }, null, 2));
