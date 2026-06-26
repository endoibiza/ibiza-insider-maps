const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  SUPABASE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

const VENUES = (process.env.VENUES ||
  "Chinois,Eden Ibiza,Cova Santa,Hï Ibiza,Ushuaïa Ibiza,UNVRS Ibiza,Pacha Ibiza,Amnesia Ibiza,Pikes Ibiza,528 Ibiza,Ibiza Rocks,Playa Soleil")
  .split(",")
  .map((venue) => venue.trim())
  .filter(Boolean);
const START_DATE = process.env.START_DATE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const LIMIT = Math.min(Math.max(Number(process.env.LIMIT || 1000), 1), 1000);

if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
  throw new Error("SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY or publishable key is required");
}

const headers = {
  apikey: env.SUPABASE_KEY,
  authorization: `Bearer ${env.SUPABASE_KEY}`,
  "content-type": "application/json",
};

const request = async (path) => {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : [];
};

const fetchPaged = async (path, pageSize = LIMIT) => {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await request(`${path}${separator}limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const visible = (event) => {
  const status = String(event.status || "").toLowerCase();
  return status !== "hidden" && status !== "cancelled" && !event.source_missing_since;
};

const betterKinds = new Set(["tickets", "official_event_page", "vip_tables", "guest_list", "preregister"]);
const fourvenuesUrlPattern = /https?:\/\/([^/]+\.)?fourvenues\.com\//i;
const iframePattern = /\/iframe\/|iframe=|web\.fourvenues\.com/i;

const output = {
  generated_at: new Date().toISOString(),
  start_date: START_DATE,
  venues: [],
  suspicious: {
    more_info_with_better_option: [],
    fourvenues_more_info_only: [],
    duplicate_url_multiple_kinds: [],
    duplicate_button_labels: [],
    ticketless_fourvenues_events: [],
    no_booking_options: [],
  },
};

for (const venue of VENUES) {
  const params = new URLSearchParams({
    select:
      "id,event_name,date,venue,slug,status,source_missing_since,fourvenues_event_id,fourvenues_organization_id",
    venue: `eq.${venue}`,
    date: `gte.${START_DATE}`,
    order: "date.asc",
  });
  const events = (await fetchPaged(`ibiza_events_public?${params.toString()}`)).filter(visible);
  const eventIds = events.map((event) => event.id);
  const options = [];

  for (let index = 0; index < eventIds.length; index += 100) {
    const ids = eventIds.slice(index, index + 100);
    if (ids.length === 0) continue;
    options.push(
      ...(await request(
        `event_booking_options_public?select=ibiza_event_id,kind,provider,label,url,priority&ibiza_event_id=in.(${ids.join(",")})&order=priority.asc`,
      )),
    );
  }

  const optionsByEvent = new Map();
  for (const option of options) {
    optionsByEvent.set(option.ibiza_event_id, [...(optionsByEvent.get(option.ibiza_event_id) || []), option]);
  }

  const countEventsByKind = (kind) => new Set(options.filter((option) => option.kind === kind).map((option) => option.ibiza_event_id)).size;
  const venueSummary = {
    venue,
    visible_events: events.length,
    fourvenues_events: events.filter((event) => event.fourvenues_event_id).length,
    tickets: countEventsByKind("tickets"),
    official_info: countEventsByKind("official_event_page"),
    vip_tables: countEventsByKind("vip_tables"),
    guest_list: countEventsByKind("guest_list"),
    preregister: countEventsByKind("preregister"),
    more_info: countEventsByKind("more_info"),
    no_options: events.filter((event) => !optionsByEvent.has(event.id)).length,
  };
  output.venues.push(venueSummary);

  for (const event of events) {
    const eventOptions = optionsByEvent.get(event.id) || [];
    const better = eventOptions.filter((option) => betterKinds.has(option.kind));
    const moreInfo = eventOptions.filter((option) => option.kind === "more_info");
    const byUrl = new Map();

    for (const option of eventOptions) {
      const key = String(option.url || "").replace(/\/$/, "");
      byUrl.set(key, [...(byUrl.get(key) || []), option]);
    }

    if (eventOptions.length === 0) {
      output.suspicious.no_booking_options.push({
        venue,
        date: event.date,
        event_name: event.event_name,
        slug: event.slug,
      });
    }

    if (event.fourvenues_event_id && !eventOptions.some((option) => option.kind === "tickets")) {
      output.suspicious.ticketless_fourvenues_events.push({
        venue,
        date: event.date,
        event_name: event.event_name,
        slug: event.slug,
        option_kinds: eventOptions.map((option) => `${option.kind}:${option.provider}`),
      });
    }

    for (const option of moreInfo) {
      const isFourvenuesInfo = fourvenuesUrlPattern.test(option.url || "") || iframePattern.test(option.url || "");
      if (better.length > 0 && isFourvenuesInfo) {
        output.suspicious.more_info_with_better_option.push({
          venue,
          date: event.date,
          event_name: event.event_name,
          slug: event.slug,
          more_info_url: option.url,
          better: better.map((candidate) => `${candidate.kind}:${candidate.provider}:${candidate.label}`),
        });
      } else if (isFourvenuesInfo) {
        output.suspicious.fourvenues_more_info_only.push({
          venue,
          date: event.date,
          event_name: event.event_name,
          slug: event.slug,
          more_info_url: option.url,
        });
      }
    }

    for (const [url, urlOptions] of byUrl.entries()) {
      const kinds = [...new Set(urlOptions.map((option) => option.kind))];
      if (url && kinds.length > 1) {
        output.suspicious.duplicate_url_multiple_kinds.push({
          venue,
          date: event.date,
          event_name: event.event_name,
          slug: event.slug,
          url,
          options: urlOptions.map((option) => `${option.kind}:${option.provider}:${option.label}`),
        });
      }
    }

    const byKindLabel = new Map();
    for (const option of eventOptions) {
      const key = `${option.kind}:${String(option.label || "").trim().toLowerCase()}`;
      byKindLabel.set(key, [...(byKindLabel.get(key) || []), option]);
    }
    for (const [kindLabel, labelOptions] of byKindLabel.entries()) {
      const urls = [...new Set(labelOptions.map((option) => option.url))];
      if (urls.length > 1) {
        output.suspicious.duplicate_button_labels.push({
          venue,
          date: event.date,
          event_name: event.event_name,
          slug: event.slug,
          kind_label: kindLabel,
          options: labelOptions.map((option) => `${option.kind}:${option.provider}:${option.label}:${option.url}`),
        });
      }
    }
  }
}

console.log(JSON.stringify(output, null, 2));
