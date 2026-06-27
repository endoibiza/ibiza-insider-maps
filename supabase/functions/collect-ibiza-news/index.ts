import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  buildDigestSections,
  buildDigestSummary,
  canonicalizeUrl,
  classifyCandidate,
  ClassifiedNewsCandidate,
  extractCandidates,
  NewsSourceConfig,
  normalizeWhitespace,
  sha256,
  shouldPublishCandidate,
  stripHtml,
  targetDateInMadrid,
} from "./ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type CollectRequest = {
  source_keys?: string[];
  target_date?: string;
  run_type?: "daily" | "manual" | "backfill" | "source_audit";
  dry_run?: boolean;
  publish?: boolean;
  use_ai?: boolean;
  max_ai_summaries?: number;
  limit_per_source?: number;
};

type DatabaseSource = {
  id: string;
  source_key: string;
  label: string;
  source_type: NewsSourceConfig["source_type"] | "api";
  source_url: string;
  source_domain: string;
  language: string;
  priority: number;
  enabled: boolean;
  publish_mode: NewsSourceConfig["publish_mode"];
  raw_metadata: Record<string, unknown> | null;
};

type SupabaseClient = ReturnType<typeof createClient>;

const CORE_SOURCE_KEYS = new Set(["diario-general-rss", "periodico-pitiusas-atom", "periodico-ibiza-atom", "lavoz-ibiza-rss", "lavoz-general-rss"]);
const MUNICIPAL_AREA_LABELS: Record<string, string> = {
  "Santa Eularia": "Santa Eulària",
  "Santa Eulària": "Santa Eulària",
  Eivissa: "Ibiza Town",
  "Sant Antoni": "San Antonio",
  "Sant Josep": "San José",
  "Sant Joan": "Sant Joan",
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const requireSyncToken = (req: Request) => {
  const expectedToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
  if (!expectedToken) throw new Error("SYNC_ADMIN_TOKEN or ADMIN_API_KEY is not configured");

  const actualToken = req.headers.get("x-sync-admin-token") || req.headers.get("x-sync-secret");
  if (actualToken !== expectedToken) throw new Error("Unauthorized sync request");
};

const parseRequest = async (req: Request): Promise<Required<CollectRequest>> => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as CollectRequest) : {};
  const dryRun = body.dry_run ?? !body.publish;

  return {
    source_keys: body.source_keys ?? [],
    target_date: body.target_date ?? targetDateInMadrid(),
    run_type: body.run_type ?? "manual",
    dry_run: dryRun,
    publish: body.publish ?? false,
    use_ai: body.use_ai ?? true,
    max_ai_summaries: Math.max(0, Math.min(body.max_ai_summaries ?? 8, 20)),
    limit_per_source: Math.max(1, Math.min(body.limit_per_source ?? 25, 60)),
  };
};

const toSourceConfig = (source: DatabaseSource): NewsSourceConfig | null => {
  if (source.source_type === "api") return null;
  const municipality = source.raw_metadata?.municipality as string | undefined;

  return {
    id: source.id,
    source_key: source.source_key,
    source_name: source.label,
    source_type: source.source_type,
    source_url: source.source_url,
    homepage_url: `https://${source.source_domain}`,
    default_language: source.language,
    publish_mode: source.publish_mode,
    default_category: (source.raw_metadata?.default_category as string | undefined) ?? null,
    default_area: municipality ? [MUNICIPAL_AREA_LABELS[municipality] || municipality] : null,
  };
};

const fetchUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Ibiza Maps News Collector/1.0 (+https://ibiza-maps.com/news)",
        Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html,text/calendar,*/*;q=0.7",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      status: response.status,
      finalUrl: response.url,
      text,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const sourceDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const summarizeWithAi = async (candidate: ClassifiedNewsCandidate, evidenceHash: string, enabled: boolean) => {
  const fallbackHeadline = normalizeWhitespace(candidate.headline);
  const fallbackSummary = normalizeWhitespace(candidate.summary_seed || candidate.headline);

  if (!enabled) {
    return {
      headline: fallbackHeadline,
      summary: fallbackSummary,
      model: null as string | null,
      hash: null as string | null,
    };
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return {
      headline: fallbackHeadline,
      summary: fallbackSummary,
      model: null as string | null,
      hash: null as string | null,
    };
  }

  const model = "google/gemini-2.5-flash";
  const prompt = {
    task: "Translate and summarize verified Ibiza news metadata into English. Use only the provided fields. Do not add facts, quotes, URLs, names, dates, or claims that are not present.",
    source: candidate.source_name,
    source_url: candidate.canonical_url,
    source_date: candidate.published_at,
    original_title: candidate.headline,
    original_description: candidate.source_description,
    output: {
      headline: "English headline, max 120 characters",
      summary: "English summary, one or two sentences, max 80 words",
    },
  };

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You rewrite verified source metadata for a public local-news digest. Return strict JSON only." },
          { role: "user", content: JSON.stringify(prompt) },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn("AI summary skipped", response.status, await response.text());
      return { headline: fallbackHeadline, summary: fallbackSummary, model: null, hash: null };
    }

    const data = await response.json();
    const content = String(data.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(content) as { headline?: string; summary?: string };
    const headline = normalizeWhitespace(parsed.headline || fallbackHeadline).slice(0, 180);
    const summary = normalizeWhitespace(parsed.summary || fallbackSummary).slice(0, 700);

    return {
      headline,
      summary,
      model,
      hash: await sha256(`${evidenceHash}|${headline}|${summary}`),
    };
  } catch (error) {
    console.warn("AI summary fallback", error);
    return { headline: fallbackHeadline, summary: fallbackSummary, model: null, hash: null };
  }
};

const getExistingStory = async (supabase: SupabaseClient, sourceKey: string, canonicalUrl: string) => {
  const { data, error } = await supabase
    .from("ibiza_news_stories")
    .select("id,status,evidence_hash,summary,headline")
    .eq("source_key", sourceKey)
    .eq("canonical_url", canonicalUrl)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; status: string; evidence_hash: string; summary: string; headline: string } | null;
};

const findSemanticDuplicate = async (supabase: SupabaseClient, candidate: ClassifiedNewsCandidate) => {
  const storyDate = candidate.published_at?.slice(0, 10);
  if (!storyDate) return null;

  const { data, error } = await supabase
    .from("ibiza_news_stories")
    .select("id,headline,status")
    .eq("dedupe_key", candidate.dedupe_key)
    .eq("story_date", storyDate)
    .in("status", ["staged", "published"])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; headline: string; status: string } | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let runId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    requireSyncToken(req);
    const request = await parseRequest(req);
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const mode = request.publish && !request.dry_run ? "publish" : request.dry_run ? "dry_run" : "shadow";

    const { data: run, error: runError } = await supabase
      .from("news_ingestion_runs")
      .insert({
        run_type: request.run_type,
        mode,
        target_date: request.target_date,
        source_keys: request.source_keys,
        metadata: {
          requested_publish: request.publish,
          use_ai: request.use_ai,
          max_ai_summaries: request.max_ai_summaries,
          limit_per_source: request.limit_per_source,
        },
      })
      .select("id")
      .single();

    if (runError) throw runError;
    runId = run.id;

    let sourceQuery = supabase
      .from("news_sources")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (request.source_keys.length > 0) {
      sourceQuery = sourceQuery.in("source_key", request.source_keys);
    }

    const { data: sourceRows, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;

    const sources = (sourceRows as DatabaseSource[]).map(toSourceConfig).filter((source): source is NewsSourceConfig => Boolean(source));
    const selectedCoreCount = sources.filter((source) => CORE_SOURCE_KEYS.has(source.source_key)).length;

    let successfulCoreSources = 0;
    let snapshotsInserted = 0;
    let candidatesSeen = 0;
    let storiesStaged = 0;
    let storiesPublished = 0;
    let duplicatesSeen = 0;
    let aiSummariesUsed = 0;
    const publishedStories: Array<{ id: string; headline: string; summary: string; digest_section: string; source_url: string }> = [];
    const skippedSources: Array<Record<string, unknown>> = [];
    const sourceFailures: Array<Record<string, unknown>> = [];
    const sourcesChecked: string[] = [];

    for (const source of sources) {
      if (source.source_type === "signal") {
        skippedSources.push({ source_key: source.source_key, reason: "signal source is not canonical evidence" });
        continue;
      }

      try {
        const fetched = await fetchUrl(source.source_url);
        const contentHash = await sha256(fetched.text);
        const snapshotExcerpt = stripHtml(fetched.text).slice(0, 1200);

        const { data: snapshot, error: snapshotError } = await supabase
          .from("news_source_snapshots")
          .insert({
            run_id: runId,
            source_key: source.source_key,
            source_type: source.source_type,
            source_url: source.source_url,
            final_url: fetched.finalUrl,
            status_code: fetched.status,
            content_hash: contentHash,
            excerpt: snapshotExcerpt,
            raw_metadata: {
              content_type: fetched.contentType,
              bytes: fetched.text.length,
            },
          })
          .select("id")
          .single();

        if (snapshotError) throw snapshotError;
        snapshotsInserted += 1;
        sourcesChecked.push(source.source_url);

        if (fetched.status >= 400) {
          sourceFailures.push({ source_key: source.source_key, status: fetched.status, url: source.source_url });
          continue;
        }

        if (CORE_SOURCE_KEYS.has(source.source_key)) successfulCoreSources += 1;

        const rawCandidates = extractCandidates(fetched.text, source).slice(0, request.limit_per_source);
        candidatesSeen += rawCandidates.length;

        for (const rawCandidate of rawCandidates) {
          const canonicalUrl = canonicalizeUrl(rawCandidate.canonical_url);
          if (!canonicalUrl) {
            skippedSources.push({ source_key: source.source_key, headline: rawCandidate.headline, reason: "missing canonical URL" });
            continue;
          }

          const classified = classifyCandidate({ ...rawCandidate, canonical_url: canonicalUrl }, source);
          const evidenceHash = await sha256(classified.evidence_hash_seed);
          const publishDecision = shouldPublishCandidate(classified, request.target_date);
          const existingStory = await getExistingStory(supabase, classified.source_key, canonicalUrl);

          if (existingStory && request.dry_run) {
            duplicatesSeen += 1;
            continue;
          }

          const duplicate = existingStory ? null : await findSemanticDuplicate(supabase, classified);
          const isDuplicate = Boolean(duplicate);
          if (isDuplicate) duplicatesSeen += 1;

          if (!publishDecision.publishable) {
            skippedSources.push({
              source_key: source.source_key,
              headline: classified.headline,
              url: canonicalUrl,
              reason: publishDecision.reason,
            });
          }

          const nextStatus = existingStory?.status === "published"
            ? "published"
            : isDuplicate
              ? "duplicate"
              : publishDecision.publishable && request.publish && !request.dry_run
                ? "published"
                : publishDecision.publishable
                  ? "staged"
                  : "skipped";

          const canUseAi = Boolean(
              publishDecision.publishable &&
              !request.dry_run &&
              request.use_ai &&
              aiSummariesUsed < request.max_ai_summaries &&
              (!existingStory || existingStory.evidence_hash !== evidenceHash),
          );
          const summary = await summarizeWithAi(classified, evidenceHash, canUseAi);
          if (summary.model) aiSummariesUsed += 1;

          const storyPayload = {
            source_key: classified.source_key,
            snapshot_id: snapshot.id,
            evidence_hash: evidenceHash,
            canonical_url: canonicalUrl,
            source_url: canonicalUrl,
            source_label: classified.source_name,
            source_domain: sourceDomain(canonicalUrl),
            original_headline: classified.headline,
            headline: summary.headline,
            summary: summary.summary,
            original_language: classified.language,
            published_at: classified.published_at,
            story_date: classified.published_at?.slice(0, 10) || request.target_date,
            category: classified.category,
            area: classified.area,
            significance: classified.significance,
            status: nextStatus,
            digest_section: classified.digest_section,
            santa_eularia: classified.santa_eularia,
            ibiza_maps_relevant: classified.ibiza_maps_relevant,
            dedupe_key: classified.dedupe_key,
            duplicate_of: duplicate?.id ?? null,
            ai_summary_model: summary.model,
            ai_summary_hash: summary.hash,
            raw_metadata: {
              ...classified.raw_metadata,
              source_description: classified.source_description,
              source_publish_mode: classified.publish_mode,
              publish_decision: publishDecision,
              dry_run: request.dry_run,
            },
          };

          let storyRow: { id: string; status: string; headline: string; summary: string; digest_section: string; source_url: string } | null = null;

          if (existingStory) {
            const { data: updated, error: updateError } = await supabase
              .from("ibiza_news_stories")
              .update(storyPayload)
              .eq("id", existingStory.id)
              .select("id,status,headline,summary,digest_section,source_url")
              .single();

            if (updateError) throw updateError;
            storyRow = updated;
          } else {
            const { data: inserted, error: insertError } = await supabase
              .from("ibiza_news_stories")
              .insert(storyPayload)
              .select("id,status,headline,summary,digest_section,source_url")
              .single();

            if (insertError) throw insertError;
            storyRow = inserted;
          }

          if (storyRow?.status === "published" && publishDecision.publishable) {
            if (publishDecision.publishable && !request.dry_run) storiesPublished += 1;
            publishedStories.push(storyRow);
          } else if (storyRow?.status === "staged") {
            storiesStaged += 1;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceFailures.push({ source_key: source.source_key, url: source.source_url, error: message });
      }
    }

    if (selectedCoreCount > 0 && successfulCoreSources === 0) {
      throw new Error("All selected core news sources failed or were unavailable.");
    }

    const digestSections = buildDigestSections(publishedStories, request.target_date);
    const digestSummary = buildDigestSummary(publishedStories, request.target_date, sourcesChecked);
    const digestStatus = request.publish && !request.dry_run ? "published" : "draft";

    if (!(request.dry_run && publishedStories.length === 0)) {
      const existingDigestQuery = await supabase
        .from("ibiza_news_daily_digests")
        .select("id,status")
        .eq("digest_date", request.target_date)
        .maybeSingle();

      if (existingDigestQuery.error) throw existingDigestQuery.error;
      const existingDigest = existingDigestQuery.data as { id: string; status: string } | null;

      if (!(request.dry_run && existingDigest?.status === "published")) {
        const digestPayload = {
          digest_date: request.target_date,
          status: digestStatus,
          title: `Ibiza News Report — ${request.target_date}`,
          summary: digestSummary,
          sections: digestSections,
          story_ids: publishedStories.map((story) => story.id),
          source_keys: sources.map((source) => source.source_key),
          sources_checked: sourcesChecked,
          skipped_sources: skippedSources.slice(0, 100),
          counts: {
            sources_seen: sources.length,
            snapshots_inserted: snapshotsInserted,
            candidates_seen: candidatesSeen,
            stories_staged: storiesStaged,
            stories_published: storiesPublished,
            duplicates_seen: duplicatesSeen,
            source_failures: sourceFailures.length,
            ai_summaries_used: aiSummariesUsed,
          },
        };

        if (existingDigest) {
          const { error: digestUpdateError } = await supabase
            .from("ibiza_news_daily_digests")
            .update(digestPayload)
            .eq("id", existingDigest.id);
          if (digestUpdateError) throw digestUpdateError;
        } else {
          const { error: digestInsertError } = await supabase
            .from("ibiza_news_daily_digests")
            .insert(digestPayload);
          if (digestInsertError) throw digestInsertError;
        }
      }
    }

    const counts = {
      sources_seen: sources.length,
      snapshots_inserted: snapshotsInserted,
      candidates_seen: candidatesSeen,
      stories_staged: storiesStaged,
      stories_published: storiesPublished,
      duplicates_seen: duplicatesSeen,
      skipped: skippedSources.length,
      failed_sources: sourceFailures.length,
      ai_summaries_used: aiSummariesUsed,
    };

    const { error: finishError } = await supabase
      .from("news_ingestion_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        sources_seen: sources.length,
        snapshots_inserted: snapshotsInserted,
        candidates_seen: candidatesSeen,
        stories_staged: storiesStaged,
        stories_published: storiesPublished,
        duplicates_seen: duplicatesSeen,
        skipped_sources: skippedSources.slice(0, 100),
        source_failures: sourceFailures,
        source_keys: sources.map((source) => source.source_key),
        metadata: {
          requested_publish: request.publish,
          use_ai: request.use_ai,
          dry_run: request.dry_run,
          digest_status: digestStatus,
          ai_summaries_used: aiSummariesUsed,
        },
      })
      .eq("id", runId);

    if (finishError) throw finishError;

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        target_date: request.target_date,
        mode,
        counts,
        skipped_sources: skippedSources.slice(0, 25),
        source_failures: sourceFailures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("collect-ibiza-news failed", message);

    if (runId && supabase) {
      await supabase
        .from("news_ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", runId);
    }

    return new Response(JSON.stringify({ ok: false, error: message, run_id: runId }), {
      status: message.includes("Unauthorized") ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
