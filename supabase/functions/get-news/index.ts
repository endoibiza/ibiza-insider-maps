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

    const newsPrompt = `Today's date is ${dateStr}. ${await req.text() || ''}

Identify today's date to ensure all news items are current. Include any late-breaking stories from the previous evening if they remain top headlines.

Search, review, and cross-verify today's Ibiza news from these primary sources (highest priority):
	•	Diario de Ibiza — website: https://www.diariodeibiza.es — Twitter: @Diario_de_ibiza
	•	Periódico de Ibiza y Formentera — website: https://www.periodicodeibiza.es — Twitter: @periodicibiza
	•	Ibiza Spotlight — search within its News section for the latest Ibiza-related articles (locate if not directly linked)

Also review these supplementary sources:
	•	La Voz de Ibiza — https://lavozdeibiza.com/
	•	Cadena SER Ibiza — https://cadenaser.com/baleares/
	•	Ibiza Winter Residents Facebook Group (search within Facebook)
	•	Any other credible Ibiza-focused news outlet or publication

In addition to website content, search Twitter for @Diario_de_ibiza, @periodicibiza, and Ibiza Spotlight for breaking updates or exclusive news items.

Use deep, multi-source research to find the most important, relevant, and timely stories about Ibiza. Ensure accuracy by cross-referencing details when possible. Include key topics such as major events, government policies, infrastructure updates, public safety incidents, cultural highlights, weather alerts, and noteworthy local developments.

For each significant story, provide:
	1.	Headline — clear, concise, and attention-grabbing
	2.	Summary — 2–3 sentences covering the essential facts and context, highlighting why it matters
	3.	Source — publication name, link, and/or relevant tweet link

Do not limit the number of stories; include all that meet the significance criteria. Present the digest in a well-structured, scannable format for a quick yet comprehensive daily read. Format as clean HTML with headers, lists, and proper spacing. Use semantic HTML tags like <h2>, <h3>, <ul>, <strong>, <a>, etc. Use news-related emojis where appropriate (📰 🏛️ 🚨 🎉 etc.).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a professional news aggregator providing comprehensive daily news digests for Ibiza, Spain. Always use current data from official and credible sources." },
          { role: "user", content: newsPrompt }
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
    let newsDigest = data.choices?.[0]?.message?.content;

    if (!newsDigest) {
      throw new Error("No news data received from AI");
    }

    // Strip markdown code blocks if present
    newsDigest = newsDigest.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    return new Response(
      JSON.stringify({ news: newsDigest, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-news function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
