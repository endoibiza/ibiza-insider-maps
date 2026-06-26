const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === "true";
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAGE_SIZE || process.env.LIMIT || 500), 1), 1000);
const START_DATE = process.env.START_DATE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

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
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const classifyProvider = (url, source) => {
  const value = `${url || ""} ${source || ""}`.toLowerCase();
  if (/(dice\.fm|shotgun\.live|eventbrite\.|cm\.com|clubtickets\.com|ticketfairy\.com|skiddle\.com|ticketmaster\.|bacantix\.com|reservaentradas\.com)/.test(value)) {
    return "ticketing_platform";
  }
  if (/(edenibiza\.com|chinois\.com|covasanta\.com|hiibiza\.com|theushuaiaexperience\.com|unvrs\.com|pacha\.com|playasoleil\.com|amnesia\.es|dc10ibiza\.com|pikesibiza\.com|ibizarocks\.com|528ibiza\.com|akashaibiza\.com|lasdalias\.es)/.test(value)) {
    return "official_venue";
  }
  if (/ibiza-spotlight\.com|spotlight/.test(value)) return "ibiza_spotlight";
  return "manual";
};

const classifyKind = (url, provider) => {
  if (provider === "ticketing_platform") return "tickets";
  if (/ticket/i.test(url || "")) return "tickets";
  if (provider === "official_venue") return "official_event_page";
  return "more_info";
};

const labelForKind = (kind) => {
  if (kind === "tickets") return "Tickets";
  if (kind === "official_event_page") return "Official Info";
  return "More Info";
};

const priorityForKind = (kind) => {
  if (kind === "tickets") return 10;
  if (kind === "official_event_page") return 20;
  return 80;
};

const visible = (row) => {
  const status = String(row.status || "").toLowerCase();
  return status !== "hidden" && status !== "cancelled" && !row.source_missing_since;
};

const events = [];
for (let offset = 0; ; offset += PAGE_SIZE) {
  const page = await request(
    `ibiza_events?select=id,event_name,date,venue,event_url,source,status,source_missing_since&date=gte.${START_DATE}&event_url=not.is.null&order=date.asc&limit=${PAGE_SIZE}&offset=${offset}`,
  );
  events.push(...(page || []));
  if (!page || page.length < PAGE_SIZE) break;
}

const visibleEvents = events.filter((event) => visible(event) && event.event_url);
const eventIds = visibleEvents.map((event) => event.id);
const activeOptions = [];
for (let index = 0; index < eventIds.length; index += 100) {
  const ids = eventIds.slice(index, index + 100);
  if (ids.length === 0) continue;
  activeOptions.push(
    ...(await request(
      `event_booking_options?select=ibiza_event_id&active=eq.true&ibiza_event_id=in.(${ids.join(",")})`,
    )),
  );
}

const eventIdsWithOptions = new Set(activeOptions.map((option) => option.ibiza_event_id));
const targets = visibleEvents
  .filter((event) => !eventIdsWithOptions.has(event.id))
  .map((event) => {
    const provider = classifyProvider(event.event_url, event.source);
    const kind = classifyKind(event.event_url, provider);
    return {
      ibiza_event_id: event.id,
      kind,
      provider,
      label: labelForKind(kind),
      url: event.event_url,
      priority: priorityForKind(kind),
      source_url: event.event_url,
      verified_at: new Date().toISOString(),
      active: true,
      confidence: provider === "official_venue" || provider === "ticketing_platform" ? 0.82 : 0.62,
      metadata: {
        generated_from: "event-booking-options-backfill-visible-urls",
        repair_reason: "visible_event_had_event_url_but_no_active_booking_option",
      },
    };
  });

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      start_date: START_DATE,
      visible_events_with_event_url: visibleEvents.length,
      active_options_seen: activeOptions.length,
      targets_to_backfill: targets.length,
      target_preview: targets.slice(0, 50).map((target) => ({
        event_id: target.ibiza_event_id,
        kind: target.kind,
        provider: target.provider,
        label: target.label,
        url: target.url,
      })),
    },
    null,
    2,
  ),
);

if (!APPLY || targets.length === 0) {
  process.exit(0);
}

await request("event_booking_options?on_conflict=ibiza_event_id,kind,provider,url", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(targets),
});

await request("sync_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    table_name: "event_booking_options_backfill_visible_urls",
    records_upserted: targets.length,
    metadata: {
      status: "success",
      repair: "Backfilled active booking options for visible events with event_url and no active option.",
      start_date: START_DATE,
    },
  }),
});

console.log(`Backfilled ${targets.length} visible event URL booking options.`);
