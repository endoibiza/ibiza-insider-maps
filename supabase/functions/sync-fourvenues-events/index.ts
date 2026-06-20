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
};

type SyncRequest = {
  start_date?: string;
  end_date?: string;
  organization_id?: string;
  lookback_days?: number;
  horizon_days?: number;
  limit?: number;
  dry_run?: boolean;
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

const hashPayload = async (payload: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const parseRequest = async (req: Request): Promise<Required<Pick<SyncRequest, "start_date" | "end_date" | "limit" | "dry_run">> & SyncRequest> => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncRequest) : {};
  const now = new Date();
  const start = body.start_date ? new Date(body.start_date) : addDays(now, -(body.lookback_days ?? 7));
  const end = body.end_date ? new Date(body.end_date) : addDays(now, body.horizon_days ?? 180);

  return {
    ...body,
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    limit: Math.min(Math.max(body.limit ?? 50, 1), 100),
    dry_run: body.dry_run ?? false,
  };
};

const buildIbizaEventRow = (event: FourvenuesEvent) => {
  const location = event.location ?? {};
  const ticketRates = arrayValue(event.ticket_rates);
  const listRates = arrayValue(event.list_rates);
  const eventGroups = Array.isArray(event.event_groups)
    ? event.event_groups
    : event.event_group
      ? [event.event_group]
      : [];

  return {
    notion_page_id: `fourvenues:${event._id}`,
    event_name: event.name ?? "Untitled event",
    date: event.start_date ? toDateOnly(event.start_date) : null,
    start_time: toTime(event.start_date),
    end_time: toTime(event.end_date),
    venue: location.name ?? null,
    event_series: event.slug ?? null,
    type: "Fourvenues",
    lineup_details: event.description ?? null,
    status: event.active === false || event.visible === false ? "Hidden" : "Published",
    event_url: event.checkout_url ?? event.url ?? null,
    source: "Fourvenues",
    notes: null,
    fourvenues_event_id: event._id,
    fourvenues_organization_id: event.organization_id ?? null,
    fourvenues_slug: event.slug ?? null,
    fourvenues_currency: event.currency ?? null,
    display_date: event.display_date ?? null,
    end_date: event.end_date ?? null,
    location_name: location.name ?? null,
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
    let offset = 0;
    let keepFetching = true;

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

        if (syncRequest.dry_run) continue;

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

        const { error: upsertError } = await supabase
          .from("ibiza_events")
          .upsert(buildIbizaEventRow(event), { onConflict: "notion_page_id" });

        if (upsertError) throw upsertError;
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
        dry_run: syncRequest.dry_run,
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
