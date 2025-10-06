import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const weatherPrompt = `Today's date is ${dateStr}. ${await req.text() || ''}

Identify today's date and pull the most current data from AEMET Balears (official - covering all of Ibiza island), AccuWeather, Windy, ECMWF, GFS, ICON, AROME, and any other credible high-quality sources. Cross-check details; if sources disagree, note who differs and how.

Begin with date, day of week, and a short headline if notable (e.g., "⚠️ strong Tramuntana gusts" or "☀️ perfect beach conditions island-wide"). Summarize overall conditions across Ibiza (clear, cloudy, rain, storms, fog). Give highs and lows in °C and °F for the island. Report wind direction and speed using plain terms (gentle/fresh/strong breeze) and ranges (e.g., 10–20 kt), gust potential, and named wind if relevant (Tramuntana being the most common named wind affecting Ibiza).

For waves/coastal conditions, note height range, swell direction/period, and any maritime warnings - specify which coasts are most affected (north coast beaches like Portinatx/Cala Xarraca, east coast including Santa Eulalia/Es Canar/Cala Llonga, south coast including Playa d'en Bossa/Ses Salines, west coast including San Antonio/Cala Comte/Cala Bassa). For rain, provide chance %, timing (morning/afternoon/evening/overnight), and intensity (light/moderate/heavy/violent); cite the source when models differ.

Include jellyfish information for Ibiza's coasts—likely species (Mediterranean jellyfish, Pelagia noctiluca, Aurelia aurita, etc.), risk areas by coast/beach, and swimmer guidance. List AEMET alerts with level (🟡/🟠/🔴), hazard type (thunderstorm, wind, coastal, rain, flood, high temperatures), warning zone (Ibiza y Formentera), and time range. Add a short extended outlook for the next 2–3 days noting trend shifts (colder, wind change, storm chances). Optionally include one-line model cross-reference if there are major GFS/ECMWF/ICON/AROME/AccuWeather differences.

Use concise language with specific times, bullets or short paragraphs, and weather icons (☀️ ⛅️ 🌧️ 🌬️ 🌊 ⚠️ 🌡️). Attach links for cited sources and timestamp your data pull. Prefer official/consensus figures when uncertain. Format as clean HTML with headers, lists, and proper spacing. Use semantic HTML tags like <h3>, <ul>, <strong>, etc.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a professional meteorologist providing detailed weather reports for Ibiza, Spain. Always use current data from official sources." },
          { role: "user", content: weatherPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let weatherReport = data.choices?.[0]?.message?.content;

    if (!weatherReport) {
      throw new Error("No weather data received from AI");
    }

    // Strip markdown code blocks if present
    weatherReport = weatherReport.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    return new Response(
      JSON.stringify({ weather: weatherReport, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-weather function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
