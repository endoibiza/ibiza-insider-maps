const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VENUE_PATTERN = process.env.VENUE_PATTERN || "chinois";
const HORIZON_DAYS = Math.min(Math.max(Number(process.env.HORIZON_DAYS || 180), 1), 220);
const LIMIT = Math.min(Math.max(Number(process.env.LIMIT || 100), 1), 100);
const INCLUDE_VIP_AVAILABILITY = process.env.INCLUDE_VIP_AVAILABILITY !== "false";
const REFRESH_AUTH = process.env.REFRESH_AUTH === "true";

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

const syncService = async (body) => {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/run-fourvenues-sync-service-role`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(`sync service failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

if (REFRESH_AUTH) {
  await syncService({ target: "auth" });
}

const organizations = await request(
  "fourvenues_organizations?select=fourvenues_id,name,slug,organization_type,currency,timezone,last_synced_at,raw_metadata&organization_type=eq.host&order=name.asc&limit=500",
);

const needle = normalize(VENUE_PATTERN);
const hosts = (organizations || []).filter((org) => normalize(`${org.name} ${org.slug}`).includes(needle));

const audits = [];
for (const host of hosts) {
  const payload = await syncService({
    target: "events",
    dry_run: true,
    include_records: true,
    include_vip_availability: INCLUDE_VIP_AVAILABILITY,
    horizon_days: HORIZON_DAYS,
    lookback_days: 0,
    limit: LIMIT,
    booking_quantity: 4,
    organization_id: host.fourvenues_id,
  });

  const records = payload.dry_run_records || [];
  const commercial = payload.dry_run_commercial_options || [];
  const venueNames = [...new Set(records.map((record) => record.venue || record.location_name).filter(Boolean))].sort();
  const dates = records.map((record) => record.date).filter(Boolean).sort();

  audits.push({
    host: {
      fourvenues_id: host.fourvenues_id,
      name: host.name,
      slug: host.slug,
      currency: host.currency,
      timezone: host.timezone,
      last_synced_at: host.last_synced_at,
    },
    response: {
      records_seen: payload.records_seen,
      records_with_ticket_rates: payload.records_with_ticket_rates,
      records_with_guest_list: payload.records_with_guest_list,
      records_with_vip_tables: payload.records_with_vip_tables,
      venue_names: venueNames,
      first_date: dates[0] || null,
      last_date: dates[dates.length - 1] || null,
    },
    sample_events: records.slice(0, 25).map((record, index) => ({
      date: record.date,
      event_name: record.event_name,
      venue: record.venue,
      lineup_details: record.lineup_details,
      event_url: record.event_url,
      checkout_url: record.checkout_url,
      iframe_tag_url: record.iframe_tag_url,
      has_ticket_rates: Boolean(commercial[index]?.has_ticket_rates),
      has_guest_list: Boolean(commercial[index]?.has_guest_list),
      has_vip_tables: Boolean(commercial[index]?.has_vip_tables),
    })),
  });
}

console.log(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      venue_pattern: VENUE_PATTERN,
      refreshed_auth: REFRESH_AUTH,
      horizon_days: HORIZON_DAYS,
      hosts_found: hosts.length,
      audits,
      recommendation:
        hosts.length === 0
          ? "No matching approved host is visible in Channel Manager auth yet."
          : "Use the host with complete event coverage and ticket-rate rows as primary. If no host has ticket-rate rows, ask Fourvenues/the venue which approved account owns ticket inventory for this channel.",
    },
    null,
    2,
  ),
);
