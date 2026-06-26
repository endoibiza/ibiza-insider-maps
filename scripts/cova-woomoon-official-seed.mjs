const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const SOURCE_URL = "https://www.woomoonibiza.com/";
const sourceRows = [
  ["2026-06-26", "Woomoon at Cova Santa", "Damian Lazarus, JAMIIE, Landikhan, Omer Tayar, Temple Haze", "https://www.woomoonibiza.com/events/woomoon-260626"],
  ["2026-07-03", "Woomoon at Cova Santa", "Bora Uzer, Trikk, Argia, Tanika, Rimaye", "https://www.woomoonibiza.com/events/woomoon-030726"],
  ["2026-07-10", "Woomoon at Cova Santa", "Viken Arman, Yulia Niko, Hardt Antoine, Moons Voyager", "https://www.woomoonibiza.com/events/woomoon-100726"],
  ["2026-07-17", "Woomoon at Cova Santa", "RY X, Argia, Julia Sandstorm, Omer Tayar, Bohem Live", "https://www.woomoonibiza.com/events/woomoon-170726"],
  ["2026-07-24", "Woomoon at Cova Santa", "Deer Jade, Lost Miracle, Chambord, ETNA, Clint Lee", "https://www.woomoonibiza.com/events/woomoon-240726"],
  ["2026-07-31", "Woomoon at Cova Santa", "RY X, Laolu, Landikhan, Isadora, Meera, IZHY", "https://www.woomoonibiza.com/events/woomoon-310726"],
  ["2026-08-07", "Woomoon at Cova Santa", "Jan Blomqvist, Oliver Koletzki, Elisa Elisa, Share", "https://www.woomoonibiza.com/events/woomoon-070826"],
  ["2026-08-12", "Woomoon Special 10th Anniversary at Cova Santa", "Sven Väth, André Hommen, Valentín Huedo, Bohem Live, Isadora, Tanika", "https://www.woomoonibiza.com/events/woomoon-special-10th-anniversary-120826"],
  ["2026-08-14", "Woomoon at Cova Santa", "Bora Uzer, Samm, Malive, Emjie, Medusa Odyssey", "https://www.woomoonibiza.com/events/woomoon-140826"],
  ["2026-08-21", "Woomoon at Cova Santa", "Bora Uzer, Emanuel Satie, Nandu, Acid Trainer, ETNA", "https://www.woomoonibiza.com/events/woomoon-210826"],
  ["2026-08-28", "Woomoon at Cova Santa", "Avangart Tabldot, Parallele, Sam Shure, Bohem", "https://www.woomoonibiza.com/events/woomoon-280826"],
  ["2026-09-04", "Woomoon at Cova Santa", "Kölsch, Viken Arman, Kiriku, Aigua, Tanika", "https://www.woomoonibiza.com/events/woomoon-040926"],
  ["2026-09-11", "Woomoon at Cova Santa", "Deer Jade, Henrik Schwarz, Fiona Kraft, Temple Haze", "https://www.woomoonibiza.com/events/woomoon-110926"],
  ["2026-09-18", "Woomoon at Cova Santa", "Rampue, Oliver, Frida, Landikhan", "https://www.woomoonibiza.com/events/woomoon-180926"],
  ["2026-09-25", "Woomoon at Cova Santa", "Bora Uzer, Argia, Meloko, Valentín Huedo, Bohem Live", "https://www.woomoonibiza.com/events/woomoon-250926"],
  ["2026-10-02", "Woomoon Closing at Cova Santa", "Jan Blomqvist, Christian Loeffler, Deer Jade, Super Flu, Cris 44, Igor Marijuan, Isadora, Rayco Santos", "https://www.woomoonibiza.com/events/woomoon-closing-021026"],
];

const request = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${text}`);
  }
  return body;
};

const isWeak = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  return !text || text.includes("tba") || text.includes("line-up") || text.includes("lineup") || text === "woomoon at cova santa.";
};

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const plan = [];

for (const [date, eventName, lineup, officialUrl] of sourceRows) {
  const params = new URLSearchParams({
    select: "id,event_name,date,venue,lineup_details,event_url,slug,mikes_pick,featured_on_party_calendar,residents_pass",
    venue: "eq.Cova Santa",
    date: `eq.${date}`,
    event_name: "ilike.*woomoon*",
    source_missing_since: "is.null",
  });
  const matches = await request(`ibiza_events?${params.toString()}`);
  if (matches.length > 1) {
    plan.push({ date, eventName, officialUrl, action: "skip", reason: `expected 0 or 1 matching WooMooN row, found ${matches.length}`, matches });
    continue;
  }

  if (matches.length === 0) {
    plan.push({
      date,
      event_name: eventName,
      slug: `${slugify(eventName)}-cova-santa-${date}`,
      current_lineup: null,
      proposed_lineup: lineup,
      officialUrl,
      lineupNeedsUpdate: true,
      action: "insert_official_event_and_booking_options",
    });
    continue;
  }

  const event = matches[0];
  const lineupNeedsUpdate = isWeak(event.lineup_details) || event.lineup_details !== lineup;
  plan.push({
    date,
    id: event.id,
    event_name: event.event_name,
    slug: event.slug,
    current_lineup: event.lineup_details,
    proposed_lineup: lineup,
    officialUrl,
    lineupNeedsUpdate,
    action: lineupNeedsUpdate ? "update_lineup_and_booking_options" : "booking_options_only",
  });
}

console.log(JSON.stringify({ apply: APPLY, source: SOURCE_URL, rows: plan.length, plan }, null, 2));

if (!APPLY) process.exit(0);

let updated = 0;
let inserted = 0;
let optionsUpserted = 0;

for (const item of plan) {
  if (item.action === "skip") continue;

  let eventId = item.id;

  if (!eventId && item.action === "insert_official_event_and_booking_options") {
    const insertedRows = await request("ibiza_events?on_conflict=notion_page_id", {
      method: "POST",
      body: JSON.stringify({
        notion_page_id: `official:woomoon:${item.date}`,
        event_name: item.event_name,
        date: item.date,
        start_time: "19:00",
        end_time: "04:00",
        venue: "Cova Santa",
        event_series: "Woomoon",
        type: "Club Night",
        lineup_details: item.proposed_lineup,
        event_url: item.officialUrl,
        source: "Official Venue",
        status: "Confirmed",
        slug: item.slug,
        residents_pass: null,
        mikes_pick: false,
        featured_on_party_calendar: false,
        source_missing_since: null,
        last_synced_at: new Date().toISOString(),
      }),
    });
    eventId = insertedRows?.[0]?.id;
    if (!eventId) throw new Error(`Insert did not return an id for ${item.date} ${item.event_name}`);
    inserted += 1;
  }

  if (!eventId) throw new Error(`No event id available for ${item.date} ${item.event_name}`);

  if (eventId && item.id && item.lineupNeedsUpdate) {
    await request(`ibiza_events?id=eq.${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({
        lineup_details: item.proposed_lineup,
        last_synced_at: new Date().toISOString(),
      }),
    });
    updated += 1;
  }

  const options = [
    {
      ibiza_event_id: eventId,
      kind: "tickets",
      provider: "official_venue",
      url: item.officialUrl,
      label: "Tickets",
      priority: 10,
      source_url: SOURCE_URL,
      verified_at: new Date().toISOString(),
      active: true,
      confidence: 0.96,
    },
    {
      ibiza_event_id: eventId,
      kind: "official_event_page",
      provider: "official_venue",
      url: item.officialUrl,
      label: "Official Info",
      priority: 20,
      source_url: SOURCE_URL,
      verified_at: new Date().toISOString(),
      active: true,
      confidence: 0.96,
    },
  ];

  await request("event_booking_options?on_conflict=ibiza_event_id,kind,provider,url", {
    method: "POST",
    body: JSON.stringify(options),
  });
  optionsUpserted += options.length;
}

await request("sync_log", {
  method: "POST",
  body: JSON.stringify({
    table_name: "ibiza_events_cova_woomoon_official_seed",
    records_upserted: updated + inserted,
  }),
});

console.log(JSON.stringify({ apply: APPLY, inserted, updated, optionsUpserted }, null, 2));
