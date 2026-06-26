import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const requireServiceRole = (req: Request) => {
  const expected = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const actual = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (actual !== expected) throw new Error("Unauthorized");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireServiceRole(req);
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const target = body.target === "auth" ? "sync-fourvenues-auth" : "sync-fourvenues-events";
    const syncToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
    if (!syncToken) throw new Error("SYNC_ADMIN_TOKEN or ADMIN_API_KEY is not configured");

    const url = `${getRequiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/${target}`;
    const forwardBody = target === "sync-fourvenues-auth" ? {} : { ...body, target: undefined };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-admin-token": syncToken,
      },
      body: JSON.stringify(forwardBody),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
