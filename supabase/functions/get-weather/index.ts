import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatTemp = (tempC: unknown) => {
  if (typeof tempC !== "number" || !Number.isFinite(tempC)) return null;
  const tempF = Math.round((tempC * 9) / 5 + 32);
  return `${Math.round(tempC)}°C / ${tempF}°F`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    try {
      await req.text();
    } catch (_) {
      // Drain body for compatibility with older callers.
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase runtime is not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: report, error } = await supabase
      .from("ibiza_weather_public_current")
      .select(
        "report_date, headline, summary, current_conditions, marine_summary, alerts_summary, source_status, generated_at, last_successful_source_at",
      )
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!report) {
      return new Response(
        JSON.stringify({
          weather: null,
          report: null,
          timestamp: new Date().toISOString(),
          source: "supabase-public-weather",
          retired_ai_gateway: true,
          message: "No stored Ibiza weather report is available yet.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const current = (report.current_conditions ?? {}) as Record<string, unknown>;
    const marine = (report.marine_summary ?? {}) as Record<string, unknown>;
    const alerts = (report.alerts_summary ?? {}) as Record<string, unknown>;
    const temp = formatTemp(current.temperature_c ?? current.high_temp_c ?? current.high_c);
    const generatedAt = report.generated_at ? new Date(report.generated_at).toLocaleString("en-GB", { timeZone: "Europe/Madrid" }) : "unknown";
    const officialAlertText =
      alerts.has_official_alerts === true
        ? "Official AEMET alert information is available in the stored report."
        : "No official AEMET alerts are currently stored for Ibiza or Formentera.";

    const details = [
      temp ? `<li><strong>Temperature:</strong> ${escapeHtml(temp)}</li>` : "",
      current.wind_kmh || current.wind_speed_kmh ? `<li><strong>Wind:</strong> ${escapeHtml(current.wind_kmh ?? current.wind_speed_kmh)} km/h</li>` : "",
      marine.wave_height_m ? `<li><strong>Waves:</strong> ${escapeHtml(marine.wave_height_m)} m</li>` : "",
      `<li><strong>Official alerts:</strong> ${escapeHtml(officialAlertText)}</li>`,
      `<li><strong>Updated:</strong> ${escapeHtml(generatedAt)} Europe/Madrid</li>`,
    ].filter(Boolean);

    const weather = `
      <section>
        <h2>${escapeHtml(report.headline || "Ibiza Weather")}</h2>
        ${report.summary ? `<p>${escapeHtml(report.summary)}</p>` : ""}
        <ul>${details.join("")}</ul>
        <p><small>Source-backed report from Ibiza Maps Supabase weather views. The legacy Lovable AI weather generator has been retired.</small></p>
      </section>
    `.trim();

    return new Response(
      JSON.stringify({
        weather,
        report,
        timestamp: new Date().toISOString(),
        source: "supabase-public-weather",
        retired_ai_gateway: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in get-weather compatibility function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
