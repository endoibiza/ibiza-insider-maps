import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderCompatibilityHtml = (
  stories: Array<Record<string, unknown>>,
  digest?: Record<string, unknown> | null,
) => {
  const title = digest?.title ? String(digest.title) : "Ibiza News";
  const items = stories
    .slice(0, 12)
    .map((story) => {
      const headline = escapeHtml(String(story.headline || "Untitled story"));
      const summary = escapeHtml(String(story.summary || ""));
      const sourceUrl = String(story.source_url || "");
      const sourceLink = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Read source</a>`
        : "";
      return `<article><h3>${headline}</h3><p>${summary}</p>${sourceLink}</article>`;
    })
    .join("");

  return `<section><h2>${escapeHtml(title)}</h2>${items || "<p>No verified source-backed stories are published yet.</p>"}</section>`;
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase environment is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 30), 60);

    const [{ data: digests, error: digestError }, { data: stories, error: storiesError }] =
      await Promise.all([
        supabase
          .from("ibiza_news_daily_digests_public")
          .select("*")
          .order("digest_date", { ascending: false })
          .limit(1),
        supabase
          .from("ibiza_news_public")
          .select(
            "id,notion_page_id,headline,summary,category,area,source_url,date,created_at,updated_at,significance,ibiza_maps_relevant,santa_eularia,source_label,source_domain,digest_section,published_at,legacy_source,display_language,translation_status,primary_area,curation_score,source_resolution_status,evidence_type,corroborating_source_count",
          )
          .order("date", { ascending: false })
          .order("curation_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

    if (digestError) throw digestError;
    if (storiesError) throw storiesError;

    const digest = digests?.[0] ?? null;
    const publicStories = stories ?? [];

    return new Response(
      JSON.stringify({
        digest,
        stories: publicStories,
        news: renderCompatibilityHtml(publicStories, digest),
        timestamp: new Date().toISOString(),
        source: "supabase-public-news",
        retired_ai_gateway: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in get-news compatibility function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
