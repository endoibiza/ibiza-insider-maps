import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type FourvenuesEvent = {
  _id?: string;
  name?: string;
  slug?: string;
  description?: string;
  display_date?: string;
  start_date?: string;
  end_date?: string;
  organization_id?: string;
  image_url?: string;
  flyer?: string;
  location?: {
    name?: string;
    address?: string;
    full_address?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  event_group?: unknown;
  event_groups?: unknown;
  ticket_rates?: unknown;
  list_rates?: unknown;
  preregister?: unknown;
  is_preregistered?: boolean;
  iframe?: {
    tag_url?: string;
    script_url?: string;
  };
  currency?: string;
  url?: string;
  checkout_url?: string;
  active?: boolean;
  visible?: boolean;
  artists?: unknown;
};

type SyncRequest = {
  start_date?: string;
  end_date?: string;
  organization_id?: string;
  lookback_days?: number;
  horizon_days?: number;
  limit?: number;
  dry_run?: boolean;
  include_records?: boolean;
  include_vip_availability?: boolean;
  booking_quantity?: number;
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const getApiBaseUrl = () =>
  (Deno.env.get("FOURVENUES_API_BASE_URL") || "https://channels-service.fourvenues.com").replace(/\/$/, "");

const requireSyncToken = (req: Request) => {
  const expectedToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
  if (!expectedToken) throw new Error("SYNC_ADMIN_TOKEN or ADMIN_API_KEY is not configured");

  const actualToken = req.headers.get("x-sync-admin-token") || req.headers.get("x-sync-secret");
  if (actualToken !== expectedToken) throw new Error("Unauthorized sync request");
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toDateOnly = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};

const toTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
};

const arrayValue = (value: unknown) => (Array.isArray(value) ? value : []);

const objectValue = (value: unknown) => (value && typeof value === "object" ? value as Record<string, unknown> : null);

const dataArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  const record = objectValue(value);
  return Array.isArray(record?.data) ? record.data : [];
};

const hasData = (value: unknown) => dataArray(value).length > 0 || arrayValue(value).length > 0;

const isActivePreregister = (value: unknown) => Boolean(objectValue(value)?.is_active === true);

const collectNumericValues = (value: unknown, keyPattern: RegExp, output: number[] = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumericValues(item, keyPattern, output));
    return output;
  }

  const record = objectValue(value);
  if (!record) return output;

  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === "number" && keyPattern.test(key) && nested >= 0) output.push(nested);
    if (nested && typeof nested === "object") collectNumericValues(nested, keyPattern, output);
  }

  return output;
};

const lowestNumber = (value: unknown, keyPattern: RegExp) => {
  const values = collectNumericValues(value, keyPattern);
  return values.length ? Math.min(...values) : null;
};

const artistNames = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((artist) => {
      if (typeof artist === "string") return artist;
      if (!artist || typeof artist !== "object") return "";

      const record = artist as Record<string, unknown>;
      return String(record.name ?? record.artist_name ?? record.title ?? "").trim();
    })
    .filter(Boolean);
};

const KNOWN_VENUE_NAMES: Record<string, string> = {
  "eden ibiza": "Eden Ibiza",
  "club chinois": "Chinois",
  "chinois ibiza": "Chinois",
  chinois: "Chinois",
};

const normalizeVenueName = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return KNOWN_VENUE_NAMES[normalized.toLowerCase()] ?? normalized;
};

const hashPayload = async (payload: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const fetchFourvenuesJson = async (path: string, params: Record<string, string>) => {
  const url = new URL(`${getApiBaseUrl()}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { "X-Api-Key": getRequiredEnv("FOURVENUES_API_KEY") },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fourvenues ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
};

const fetchBookingAvailability = async (eventId: string, quantity: number) => {
  const params = { event_id: eventId, quantity: String(quantity) };
  const [availability, zones] = await Promise.all([
    fetchFourvenuesJson("/bookings/availability/", params),
    fetchFourvenuesJson("/bookings/zones/", { event_id: eventId }),
  ]);

  return { availability, zones };
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const requestDateBoundary = (value: string | undefined, fallback: Date, boundary: "start" | "end") => {
  if (!value) return fallback.toISOString();
  if (isDateOnly(value)) return `${value}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
  return new Date(value).toISOString();
};

const parseRequest = async (req: Request): Promise<Required<Pick<SyncRequest, "start_date" | "end_date" | "limit" | "dry_run">> & SyncRequest> => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncRequest) : {};
  const now = new Date();
  const start = requestDateBoundary(body.start_date, addDays(now, -(body.lookback_days ?? 7)), "start");
  const end = requestDateBoundary(body.end_date, addDays(now, body.horizon_days ?? 180), "end");

  return {
    ...body,
    start_date: start,
    end_date: end,
    limit: Math.min(Math.max(body.limit ?? 50, 1), 100),
    dry_run: body.dry_run ?? false,
  };
};

const buildIbizaEventRow = (event: FourvenuesEvent) => {
  const location = event.location ?? {};
  const venueName = normalizeVenueName(location.name);
  const ticketRates = arrayValue(event.ticket_rates);
  const listRates = arrayValue(event.list_rates);
  const eventGroups = Array.isArray(event.event_groups)
    ? event.event_groups
    : event.event_group
      ? [event.event_group]
      : [];
  const artists = artistNames(event.artists);
  const eventUrl = event.checkout_url ?? event.url ?? event.iframe?.tag_url ?? null;

  return {
    notion_page_id: `fourvenues:${event._id}`,
    event_name: event.name ?? "Untitled event",
    date: event.start_date ? toDateOnly(event.start_date) : null,
    start_time: toTime(event.start_date),
    end_time: toTime(event.end_date),
    venue: venueName,
    event_series: event.slug ?? null,
    type: "Club Night",
    lineup_details: artists.length ? artists.join(", ") : event.description ?? null,
    status: event.active === false || event.visible === false ? "Hidden" : "Published",
    event_url: eventUrl,
    source: "Fourvenues",
    notes: null,
    fourvenues_event_id: event._id,
    fourvenues_organization_id: event.organization_id ?? null,
    fourvenues_slug: event.slug ?? null,
    fourvenues_currency: event.currency ?? null,
    display_date: event.display_date ?? null,
    end_date: event.end_date ?? null,
    location_name: venueName,
    location_address: location.full_address ?? location.address ?? null,
    location_city: location.city ?? null,
    location_country: location.country ?? null,
    location_latitude: location.latitude ?? null,
    location_longitude: location.longitude ?? null,
    image_url: event.image_url ?? event.flyer ?? null,
    checkout_url: event.checkout_url ?? event.url ?? null,
    iframe_tag_url: event.iframe?.tag_url ?? null,
    iframe_script_url: event.iframe?.script_url ?? null,
    ticket_rates: ticketRates,
    list_rates: listRates,
    preregister: event.preregister ?? (typeof event.is_preregistered === "boolean" ? { is_preregistered: event.is_preregistered } : null),
    event_groups: eventGroups,
    raw_fourvenues_payload: event,
    source_missing_since: null,
    last_synced_at: new Date().toISOString(),
  };
};

const buildCommercialOptionsRow = (
  event: FourvenuesEvent,
  ibizaEventId: string | null,
  bookingData?: { availability: unknown; zones: unknown } | null,
) => {
  const ticketRates = arrayValue(event.ticket_rates);
  const listRates = arrayValue(event.list_rates);
  const bookingAvailability = bookingData?.availability ?? null;
  const bookingZones = bookingData?.zones ?? null;

  return {
    fourvenues_event_id: event._id,
    ibiza_event_id: ibizaEventId,
    organization_id: event.organization_id ?? null,
    has_ticket_rates: ticketRates.length > 0,
    has_guest_list: listRates.length > 0,
    has_active_preregister: isActivePreregister(event.preregister),
    has_vip_tables: hasData(bookingAvailability) || hasData(bookingZones),
    lowest_ticket_price: lowestNumber(ticketRates, /price|amount|total/i),
    lowest_list_price: lowestNumber(listRates, /price|amount|total/i),
    lowest_vip_minimum_spend: lowestNumber([bookingAvailability, bookingZones], /minimum|spend|min/i),
    lowest_vip_deposit: lowestNumber([bookingAvailability, bookingZones], /deposit|fianza/i),
    currency: event.currency ?? null,
    ticket_rates: ticketRates,
    list_rates: listRates,
    preregister: event.preregister ?? (typeof event.is_preregistered === "boolean" ? { is_preregistered: event.is_preregistered } : null),
    booking_availability: bookingAvailability,
    booking_zones: bookingZones,
    fetched_at: new Date().toISOString(),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireSyncToken(req);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  let recordsSeen = 0;
  let recordsUpserted = 0;

  try {
    const syncRequest = await parseRequest(req);
    const seenExternalIds: string[] = [];
    const dryRunRecords: ReturnType<typeof buildIbizaEventRow>[] = [];
    const commercialSummaries: ReturnType<typeof buildCommercialOptionsRow>[] = [];
    let offset = 0;
    let keepFetching = true;
    let recordsWithTicketRates = 0;
    let recordsWithGuestList = 0;
    let recordsWithVipTables = 0;

    while (keepFetching) {
      const url = new URL(`${getApiBaseUrl()}/events`);
      url.searchParams.set("start_date", syncRequest.start_date);
      url.searchParams.set("end_date", syncRequest.end_date);
      url.searchParams.set("limit", String(syncRequest.limit));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("populate", "ticket-rates,list-rates,event-groups,preregister");
      if (syncRequest.organization_id) url.searchParams.set("organization_id", syncRequest.organization_id);

      const response = await fetch(url, {
        headers: { "X-Api-Key": getRequiredEnv("FOURVENUES_API_KEY") },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Fourvenues events failed: ${response.status} ${body}`);
      }

      const payload = await response.json();
      if (!payload?.success || !Array.isArray(payload.data)) {
        throw new Error("Fourvenues events response did not include a valid data array");
      }

      const events = payload.data as FourvenuesEvent[];
      recordsSeen += events.length;

      for (const event of events) {
        if (!event._id || !event.name || !event.start_date) continue;
        seenExternalIds.push(event._id);
        const bookingData = syncRequest.include_vip_availability
          ? await fetchBookingAvailability(event._id, Math.min(Math.max(syncRequest.booking_quantity ?? 4, 1), 20))
          : null;
        const commercialOptions = buildCommercialOptionsRow(event, null, bookingData);
        if (commercialOptions.has_ticket_rates) recordsWithTicketRates += 1;
        if (commercialOptions.has_guest_list) recordsWithGuestList += 1;
        if (commercialOptions.has_vip_tables) recordsWithVipTables += 1;

        if (syncRequest.dry_run) {
          if (syncRequest.include_records) dryRunRecords.push(buildIbizaEventRow(event));
          commercialSummaries.push(commercialOptions);
          continue;
        }

        const payloadHash = await hashPayload(event);
        await supabase
          .from("fourvenues_event_snapshots")
          .upsert({
            fourvenues_event_id: event._id,
            organization_id: event.organization_id ?? null,
            payload: event,
            payload_hash: payloadHash,
            fetched_at: new Date().toISOString(),
          }, { onConflict: "fourvenues_event_id" });

        const { data: upsertedEvent, error: upsertError } = await supabase
          .from("ibiza_events")
          .upsert(buildIbizaEventRow(event), { onConflict: "notion_page_id" })
          .select("id")
          .single();

        if (upsertError) throw upsertError;

        const { error: commercialError } = await supabase
          .from("fourvenues_event_commercial_options")
          .upsert(buildCommercialOptionsRow(event, upsertedEvent?.id ?? null, bookingData), { onConflict: "fourvenues_event_id" });

        if (commercialError) throw commercialError;

        if (upsertedEvent?.id) {
          const { error: bookingOptionsError } = await supabase.rpc("refresh_fourvenues_event_booking_options", {
            p_ibiza_event_id: upsertedEvent.id,
          });
          if (bookingOptionsError) throw bookingOptionsError;
        }

        recordsUpserted += 1;
      }

      offset += syncRequest.limit;
      keepFetching = events.length === syncRequest.limit;
    }

    let recordsSoftMissing = 0;
    if (!syncRequest.dry_run) {
      const { data: missingCount, error: missingError } = await supabase.rpc("mark_missing_fourvenues_ibiza_events", {
        seen_external_ids: seenExternalIds,
        window_start: toDateOnly(syncRequest.start_date),
        window_end: toDateOnly(syncRequest.end_date),
        target_organization_id: syncRequest.organization_id ?? null,
      });

      if (missingError) throw missingError;
      recordsSoftMissing = missingCount ?? 0;

      await supabase.from("sync_log").insert({
        table_name: "ibiza_events",
        records_upserted: recordsUpserted,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        records_seen: recordsSeen,
        records_upserted: recordsUpserted,
        records_soft_missing: recordsSoftMissing,
        records_with_ticket_rates: recordsWithTicketRates,
        records_with_guest_list: recordsWithGuestList,
        records_with_vip_tables: recordsWithVipTables,
        dry_run: syncRequest.dry_run,
        dry_run_records: syncRequest.dry_run && syncRequest.include_records ? dryRunRecords : undefined,
        dry_run_commercial_options: syncRequest.dry_run && syncRequest.include_records ? commercialSummaries : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-fourvenues-events failed:", error);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
