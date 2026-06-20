import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type FourvenuesOrganization = {
  _id?: string;
  name?: string;
  slug?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  hosts?: FourvenuesOrganization[];
  anfitrions?: FourvenuesOrganization[];
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
  if (actualToken !== expectedToken) {
    throw new Error("Unauthorized sync request");
  }
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

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth`, {
      headers: {
        "X-Api-Key": getRequiredEnv("FOURVENUES_API_KEY"),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fourvenues auth failed: ${response.status} ${body}`);
    }

    const payload = await response.json();
    const channel = payload?.data?.channel as FourvenuesOrganization | undefined;

    if (!payload?.success || !channel?._id || !channel.name) {
      throw new Error("Fourvenues auth response did not include a valid channel");
    }

    const hostMap = new Map<string, FourvenuesOrganization>();
    for (const host of [...(channel.hosts ?? []), ...(channel.anfitrions ?? [])]) {
      if (host?._id) hostMap.set(host._id, host);
    }

    const rows = [
      {
        fourvenues_id: channel._id,
        name: channel.name,
        slug: channel.slug ?? null,
        organization_type: "channel",
        currency: channel.currency ?? null,
        locale: channel.locale ?? null,
        timezone: channel.timezone ?? "Europe/Madrid",
        raw_metadata: channel,
        last_synced_at: new Date().toISOString(),
      },
      ...Array.from(hostMap.values()).map((host) => ({
        fourvenues_id: host._id,
        name: host.name ?? host._id,
        slug: host.slug ?? null,
        organization_type: "host",
        currency: host.currency ?? channel.currency ?? null,
        locale: host.locale ?? channel.locale ?? null,
        timezone: host.timezone ?? channel.timezone ?? "Europe/Madrid",
        raw_metadata: host,
        last_synced_at: new Date().toISOString(),
      })),
    ];

    const { error: upsertError } = await supabase
      .from("fourvenues_organizations")
      .upsert(rows, { onConflict: "fourvenues_id" });

    if (upsertError) throw upsertError;

    await supabase.from("sync_log").insert({
      table_name: "fourvenues_organizations",
      records_upserted: rows.length,
    });

    return new Response(
      JSON.stringify({ success: true, channel_id: channel._id, organizations_upserted: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-fourvenues-auth failed:", error);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
