import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  canonicalizeUrl,
  extractCandidates,
  NewsSourceConfig,
  normalizeWhitespace,
  RawNewsCandidate,
  sha256,
  stripHtml,
  targetDateInMadrid,
} from "../collect-ibiza-news/ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type SignalCategory =
  | "local_breaking_news"
  | "government_municipal"
  | "weather_alert_chatter"
  | "events_lineup_changes"
  | "transport_public_safety"
  | "tourism_community"
  | "source_hint";

type SignalSourceKind =
  | "official_account"
  | "official_source"
  | "verified_media"
  | "venue_promoter"
  | "community_unverified"
  | "duplicate_repost"
  | "manual_import"
  | "connector_output";

type SignalVerificationStatus = "supporting" | "needs_verification" | "source_backed" | "verified" | "rejected";

type SignalSource = {
  id: string;
  source_key: string;
  label: string;
  source_type: "x_api" | "xai_grok" | "rss" | "atom" | "sitemap" | "html" | "ical" | "api" | "manual_import" | "legacy_digest";
  source_url: string;
  source_domain: string;
  language: string;
  priority: number;
  enabled: boolean;
  requires_credentials: boolean;
  credential_name: string | null;
  publish_mode: "supporting_only" | "review_only" | "disabled";
  compliance_status: "verified" | "requires_credentials" | "disabled" | "blocked";
  signal_categories: SignalCategory[];
  raw_metadata: Record<string, unknown>;
};

type ManualSignalItem = {
  title: string;
  summary?: string;
  source_url: string;
  source_timestamp?: string;
  category?: SignalCategory;
  source_kind?: SignalSourceKind;
  language?: string;
  raw_metadata?: Record<string, unknown>;
};

type CollectRequest = {
  source_keys?: string[];
  target_date?: string;
  run_type?: "daily" | "manual" | "backfill" | "source_audit" | "manual_import";
  dry_run?: boolean;
  limit_per_source?: number;
  max_x_posts?: number;
  include_credential_requirements?: boolean;
  manual_items?: ManualSignalItem[];
};

type ParsedRequest = Required<Omit<CollectRequest, "manual_items">> & {
  manual_items: ManualSignalItem[];
  mode: "dry_run" | "collect";
  window_start: string;
  window_end: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

type NormalizedSignal = {
  category: SignalCategory;
  title: string;
  summary: string;
  source_url: string;
  source_domain: string;
  source_timestamp: string | null;
  source_kind: SignalSourceKind;
  source_score: number;
  verification_status: SignalVerificationStatus;
  language: string;
  dedupe_key: string;
  signal_key: string;
  raw_metadata: Record<string, unknown>;
};

const FEED_SOURCE_TYPES = new Set(["rss", "atom", "sitemap", "html", "ical"]);
const paidXSignalsAllowed = () => Deno.env.get("ALLOW_PAID_X_SIGNALS") === "true";

const CATEGORY_RULES: Array<[SignalCategory, RegExp]> = [
  ["weather_alert_chatter", /\b(aemet|weather|meteo|storm|rain|wind|alert|aviso|temporal|marine|maritime|calor|heat|yellow|orange|red warning)\b/i],
  ["events_lineup_changes", /\b(lineup|residency|opening party|closing party|tickets?|guest list|club|pacha|amnesia|ushuaia|h[iï] ibiza|dc[- ]?10|circoloco|eden|o beach|pikes|cova santa|defected|music on)\b/i],
  ["transport_public_safety", /\b(airport|aeropuerto|flight|ferry|balearia|port|puerto|bus|taxi|traffic|road|carretera|incident|accident|fire|incendio|police|policia|guardia civil|112|emergency|rescue)\b/i],
  ["government_municipal", /\b(consell|govern|ajuntament|ayuntamiento|municipal|council|mayor|alcald|pleno|public works|obras|housing|vivienda)\b/i],
  ["local_breaking_news", /\b(breaking|ultima hora|suceso|court|tribunal|arrest|detenido|investigation|crisis|closure|closed|reopens|major)\b/i],
  ["tourism_community", /\b(market|mercadillo|festival|culture|cultura|concert|community|vecin|tourism|turismo|restaurant|opening|beach|playa|sunset|food|local)\b/i],
];

const RELATIVE_DATE_PATTERN = /\b(today|tonight|tomorrow|this\s+(mon|tue|wed|thu|fri|sat|sun)|next\s+(week|month|mon|tue|wed|thu|fri|sat|sun)|in\s+\d+\s+(days?|weeks?))\b/i;

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

const parseRequest = async (req: Request): Promise<ParsedRequest> => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as CollectRequest) : {};
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const dryRun = body.dry_run ?? false;

  return {
    source_keys: body.source_keys ?? [],
    target_date: body.target_date ?? targetDateInMadrid(now),
    run_type: body.run_type ?? (body.manual_items?.length ? "manual_import" : "manual"),
    dry_run: dryRun,
    mode: dryRun ? "dry_run" : "collect",
    limit_per_source: Math.max(1, Math.min(body.limit_per_source ?? 20, 50)),
    max_x_posts: Math.max(0, Math.min(body.max_x_posts ?? 25, 100)),
    include_credential_requirements: body.include_credential_requirements ?? true,
    manual_items: body.manual_items ?? [],
    window_start: windowStart,
    window_end: windowEnd,
  };
};

const fetchUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Ibiza Maps Signal Collector/1.0 (+https://ibiza-maps.com)",
        Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html,text/calendar,application/json,*/*;q=0.7",
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

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const toNewsSourceConfig = (source: SignalSource): NewsSourceConfig | null => {
  if (!FEED_SOURCE_TYPES.has(source.source_type)) return null;

  return {
    id: source.id,
    source_key: source.source_key,
    source_name: source.label,
    source_type: source.source_type as NewsSourceConfig["source_type"],
    source_url: source.source_url,
    homepage_url: `https://${source.source_domain}`,
    default_language: source.language,
    publish_mode: "review",
  };
};

const sourceKindFor = (source: SignalSource, override?: SignalSourceKind): SignalSourceKind => {
  if (override) return override;
  const configuredKind = source.raw_metadata?.source_kind;
  if (typeof configuredKind === "string") return configuredKind as SignalSourceKind;
  if (source.source_type === "manual_import") return "manual_import";
  if (source.source_type === "x_api" || source.source_type === "xai_grok") return "connector_output";
  return "community_unverified";
};

const scoreForKind = (kind: SignalSourceKind, sourceType: SignalSource["source_type"]) => {
  const base: Record<SignalSourceKind, number> = {
    official_account: 92,
    official_source: 90,
    verified_media: 76,
    venue_promoter: 70,
    connector_output: 58,
    manual_import: 45,
    community_unverified: 35,
    duplicate_repost: 15,
  };

  const sourceTypeAdjustment = sourceType === "x_api" || sourceType === "xai_grok" ? -8 : 0;
  return Math.max(0, Math.min(100, base[kind] + sourceTypeAdjustment));
};

const classifyCategory = (source: SignalSource, title: string, summary: string): SignalCategory => {
  const configuredCategories = source.signal_categories ?? [];
  if (configuredCategories.length === 1) return configuredCategories[0];

  const text = `${source.label} ${title} ${summary}`;
  const matched = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
  if (matched) return matched[0];
  return configuredCategories[0] ?? "source_hint";
};

const targetTypeForCategory = (category: SignalCategory) => {
  if (category === "weather_alert_chatter") return "weather_review";
  if (category === "events_lineup_changes" || category === "tourism_community") return "event_review";
  return "news_review";
};

const inCollectionWindow = (publishedAt: string | null, windowStart: string, windowEnd: string) => {
  if (!publishedAt) return true;
  const value = Date.parse(publishedAt);
  if (Number.isNaN(value)) return true;
  return value >= Date.parse(windowStart) && value <= Date.parse(windowEnd);
};

const normalizeCandidateSignal = async (
  source: SignalSource,
  candidate: RawNewsCandidate,
  request: ParsedRequest,
): Promise<NormalizedSignal | null> => {
  const canonicalUrl = canonicalizeUrl(candidate.canonical_url, source.source_url);
  if (!canonicalUrl || !isHttpUrl(canonicalUrl)) return null;
  if (!inCollectionWindow(candidate.published_at, request.window_start, request.window_end)) return null;

  const title = normalizeWhitespace(candidate.headline).slice(0, 240);
  const summary = normalizeWhitespace(candidate.source_description || candidate.headline).slice(0, 700);
  if (!title) return null;

  const sourceKind = sourceKindFor(source);
  const relativeDateNeedsReview = RELATIVE_DATE_PATTERN.test(`${title} ${summary}`);
  const category = classifyCategory(source, title, summary);
  const dedupeKey = await sha256(`${category}|${canonicalUrl.toLowerCase()}`);
  const signalKey = await sha256(`${request.target_date}|${source.source_key}|${canonicalUrl.toLowerCase()}`);
  const sourceBacked = !["x_api", "xai_grok", "manual_import"].includes(source.source_type);

  return {
    category,
    title,
    summary,
    source_url: canonicalUrl,
    source_domain: sourceDomain(canonicalUrl) || source.source_domain,
    source_timestamp: candidate.published_at,
    source_kind: relativeDateNeedsReview ? "community_unverified" : sourceKind,
    source_score: relativeDateNeedsReview ? Math.min(scoreForKind(sourceKind, source.source_type), 45) : scoreForKind(sourceKind, source.source_type),
    verification_status: relativeDateNeedsReview ? "needs_verification" : sourceBacked ? "source_backed" : "needs_verification",
    language: candidate.language || source.language,
    dedupe_key: dedupeKey,
    signal_key: signalKey,
    raw_metadata: {
      ...candidate.raw_metadata,
      source_description: candidate.source_description,
      original_source_url: candidate.source_url,
      relative_date_review_required: relativeDateNeedsReview,
      publish_mode: source.publish_mode,
    },
  };
};

const normalizeManualSignal = async (
  source: SignalSource,
  item: ManualSignalItem,
  request: ParsedRequest,
): Promise<NormalizedSignal | null> => {
  const canonicalUrl = canonicalizeUrl(item.source_url);
  if (!canonicalUrl || !isHttpUrl(canonicalUrl)) return null;

  const title = normalizeWhitespace(item.title).slice(0, 240);
  const summary = normalizeWhitespace(item.summary || item.title).slice(0, 700);
  if (!title) return null;

  const relativeDateNeedsReview = RELATIVE_DATE_PATTERN.test(`${title} ${summary}`);
  const sourceKind = sourceKindFor(source, item.source_kind);
  const category = item.category ?? classifyCategory(source, title, summary);
  const dedupeKey = await sha256(`${category}|${canonicalUrl.toLowerCase()}`);
  const signalKey = await sha256(`${request.target_date}|manual|${canonicalUrl.toLowerCase()}|${title.toLowerCase()}`);

  return {
    category,
    title,
    summary,
    source_url: canonicalUrl,
    source_domain: sourceDomain(canonicalUrl),
    source_timestamp: item.source_timestamp ?? null,
    source_kind: relativeDateNeedsReview ? "community_unverified" : sourceKind,
    source_score: relativeDateNeedsReview ? 35 : scoreForKind(sourceKind, source.source_type),
    verification_status: "needs_verification",
    language: item.language || source.language,
    dedupe_key: dedupeKey,
    signal_key: signalKey,
    raw_metadata: {
      ...(item.raw_metadata ?? {}),
      manual_import: true,
      relative_date_review_required: relativeDateNeedsReview,
    },
  };
};

const fetchOfficialXApiCandidates = async (
  source: SignalSource,
  request: ParsedRequest,
): Promise<{ text: string; status: number; finalUrl: string; contentType: string; candidates: RawNewsCandidate[] }> => {
  const token = Deno.env.get(source.credential_name || "X_API_BEARER_TOKEN");
  if (!token) {
    throw new Error(`${source.credential_name || "X_API_BEARER_TOKEN"} is required for official X API collection`);
  }

  const listId = typeof source.raw_metadata?.x_list_id === "string" ? source.raw_metadata.x_list_id : null;
  if (!listId) {
    throw new Error("x_list_id is required in source raw_metadata for X list collection");
  }

  const url = new URL(`https://api.x.com/2/lists/${listId}/tweets`);
  url.searchParams.set("max_results", String(request.max_x_posts));
  url.searchParams.set("start_time", request.window_start);
  url.searchParams.set("end_time", request.window_end);
  url.searchParams.set("tweet.fields", "author_id,created_at,entities,lang,possibly_sensitive,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username,verified,verified_type");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Ibiza Maps Signal Collector/1.0 (+https://ibiza-maps.com)",
      Accept: "application/json",
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Official X API returned ${response.status}: ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text) as {
    data?: Array<{ id: string; text: string; created_at?: string; author_id?: string; lang?: string; entities?: { urls?: Array<{ expanded_url?: string; url?: string }> } }>;
    includes?: { users?: Array<{ id: string; username?: string; name?: string; verified?: boolean; verified_type?: string }> };
  };
  const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));

  const candidates = (payload.data ?? []).map((tweet) => {
    const user = tweet.author_id ? users.get(tweet.author_id) : null;
    const username = user?.username || "x";
    const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;
    const expandedUrl = tweet.entities?.urls?.find((entry) => entry.expanded_url && isHttpUrl(entry.expanded_url))?.expanded_url;
    const canonicalUrl = expandedUrl || tweetUrl;
    const authorLabel = user?.name || username;

    return {
      source_key: source.source_key,
      source_name: source.label,
      source_type: "signal",
      publish_mode: "signal_only",
      source_url: source.source_url,
      canonical_url: canonicalUrl,
      headline: normalizeWhitespace(tweet.text).slice(0, 240),
      source_description: normalizeWhitespace(tweet.text),
      published_at: tweet.created_at ?? null,
      language: tweet.lang || source.language,
      raw_metadata: {
        tweet_id: tweet.id,
        tweet_url: tweetUrl,
        author_id: tweet.author_id,
        author_username: username,
        author_label: authorLabel,
        author_verified: user?.verified ?? false,
        author_verified_type: user?.verified_type ?? null,
        expanded_url: expandedUrl ?? null,
        source_kind: user?.verified ? "official_account" : "community_unverified",
      },
    } satisfies RawNewsCandidate;
  });

  return {
    text,
    status: response.status,
    finalUrl: url.toString(),
    contentType: response.headers.get("content-type") || "application/json",
    candidates,
  };
};

const upsertSignal = async (
  supabase: SupabaseClient,
  source: SignalSource,
  signal: NormalizedSignal,
  runId: string,
  snapshotId: string | null,
  request: ParsedRequest,
) => {
  const { data: duplicate, error: duplicateError } = await supabase
    .from("x_daily_digest_items")
    .select("id,signal_key")
    .eq("digest_date", request.target_date)
    .eq("dedupe_key", signal.dedupe_key)
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw duplicateError;
  const duplicateOf = duplicate && duplicate.signal_key !== signal.signal_key ? duplicate.id : null;

  const payload = {
    digest_date: request.target_date,
    run_id: runId,
    snapshot_id: snapshotId,
    source_id: source.id,
    source_key: source.source_key,
    signal_key: signal.signal_key,
    dedupe_key: signal.dedupe_key,
    duplicate_of: duplicateOf,
    category: signal.category,
    title: signal.title,
    summary: signal.summary,
    source_url: signal.source_url,
    source_domain: signal.source_domain,
    source_timestamp: signal.source_timestamp,
    source_type: source.source_type,
    source_kind: duplicateOf ? "duplicate_repost" : signal.source_kind,
    source_score: duplicateOf ? Math.min(signal.source_score, 20) : signal.source_score,
    verification_status: duplicateOf ? "supporting" : signal.verification_status,
    privacy_status: "private",
    language: signal.language,
    raw_metadata: signal.raw_metadata,
  };

  const { data: item, error: itemError } = await supabase
    .from("x_daily_digest_items")
    .upsert(payload, { onConflict: "signal_key" })
    .select("id,duplicate_of")
    .single();

  if (itemError) throw itemError;

  const targetType = targetTypeForCategory(signal.category);
  const { error: linkError } = await supabase
    .from("x_signal_links")
    .upsert({
      signal_item_id: item.id,
      target_type: targetType,
      target_key: `${targetType}:${request.target_date}`,
      link_status: "suggested",
      verification_source_url: signal.verification_status === "source_backed" ? signal.source_url : null,
      confidence: duplicateOf ? 20 : signal.source_score,
      raw_metadata: {
        auto_suggested: true,
        category: signal.category,
      },
    }, { onConflict: "signal_item_id,target_type,target_key" });

  if (linkError) throw linkError;
  return { id: item.id as string, duplicate: Boolean(duplicateOf) };
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

    const credentialRequirements: Array<Record<string, unknown>> = [];
    if (request.include_credential_requirements) {
      const { data: credentialRows, error: credentialError } = await supabase
        .from("x_signal_sources")
        .select("source_key,label,source_type,credential_name,rate_limit_notes")
        .eq("requires_credentials", true)
        .eq("enabled", false)
        .order("priority", { ascending: true });

      if (credentialError) throw credentialError;
      credentialRequirements.push(...(credentialRows ?? []).map((source) => ({
        ...source,
        reason: "disabled until official credential and spend cap are approved",
      })));
    }

    const { data: run, error: runError } = await supabase
      .from("x_digest_runs")
      .insert({
        run_type: request.run_type,
        mode: request.mode,
        status: "running",
        target_date: request.target_date,
        window_start: request.window_start,
        window_end: request.window_end,
        source_keys: request.source_keys,
        credential_requirements: credentialRequirements,
        metadata: {
          dry_run: request.dry_run,
          limit_per_source: request.limit_per_source,
          max_x_posts: request.max_x_posts,
          manual_items: request.manual_items.length,
        },
      })
      .select("id")
      .single();

    if (runError) throw runError;
    runId = run.id;

    let sourceQuery = supabase
      .from("x_signal_sources")
      .select("*")
      .order("priority", { ascending: true });

    if (request.source_keys.length > 0) {
      sourceQuery = sourceQuery.in("source_key", request.source_keys);
    } else {
      sourceQuery = sourceQuery.eq("enabled", true);
    }

    const { data: sourceRows, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;

    const sources = (sourceRows ?? []) as SignalSource[];
    let snapshotsInserted = 0;
    let itemsSeen = 0;
    let itemsStored = 0;
    let duplicatesSeen = 0;
    const skippedSources: Array<Record<string, unknown>> = [];
    const sourceFailures: Array<Record<string, unknown>> = [];
    const costMetadata: Record<string, unknown> = {
      x_posts_requested: 0,
      x_api_enabled_sources: 0,
      xai_calls: 0,
    };

    for (const source of sources) {
      if (!source.enabled && !request.source_keys.includes(source.source_key)) {
        skippedSources.push({ source_key: source.source_key, reason: "source disabled" });
        continue;
      }

      if (source.requires_credentials && !Deno.env.get(source.credential_name || "")) {
        skippedSources.push({
          source_key: source.source_key,
          reason: "official credential missing",
          credential_name: source.credential_name,
        });
        continue;
      }

      if ((source.source_type === "x_api" || source.source_type === "xai_grok") && !paidXSignalsAllowed()) {
        skippedSources.push({
          source_key: source.source_key,
          reason: "paid X/xAI collection disabled by ALLOW_PAID_X_SIGNALS guard",
          credential_name: source.credential_name,
        });
        continue;
      }

      if (source.source_type === "xai_grok") {
        skippedSources.push({
          source_key: source.source_key,
          reason: "xAI/Grok collection is intentionally disabled until prompt, connector, and spend caps are approved",
          credential_name: source.credential_name,
        });
        continue;
      }

      if (source.source_type === "manual_import" || source.source_type === "legacy_digest") {
        skippedSources.push({ source_key: source.source_key, reason: "not fetched automatically" });
        continue;
      }

      try {
        let fetched: { status: number; finalUrl: string; text: string; contentType: string; candidates?: RawNewsCandidate[] };
        if (source.source_type === "x_api") {
          fetched = await fetchOfficialXApiCandidates(source, request);
          costMetadata.x_posts_requested = Number(costMetadata.x_posts_requested) + request.max_x_posts;
          costMetadata.x_api_enabled_sources = Number(costMetadata.x_api_enabled_sources) + 1;
        } else {
          const feedSource = toNewsSourceConfig(source);
          if (!feedSource) {
            skippedSources.push({ source_key: source.source_key, reason: `unsupported source_type ${source.source_type}` });
            continue;
          }
          fetched = await fetchUrl(source.source_url);
        }

        const contentHash = await sha256(fetched.text);
        const { data: snapshot, error: snapshotError } = await supabase
          .from("x_signal_snapshots")
          .insert({
            run_id: runId,
            source_id: source.id,
            source_key: source.source_key,
            source_type: source.source_type,
            source_url: source.source_url,
            final_url: fetched.finalUrl,
            status_code: fetched.status,
            content_hash: contentHash,
            excerpt: stripHtml(fetched.text).slice(0, 1500),
            raw_metadata: {
              content_type: fetched.contentType,
              bytes: fetched.text.length,
            },
          })
          .select("id")
          .single();

        if (snapshotError) throw snapshotError;
        snapshotsInserted += 1;

        if (fetched.status >= 400) {
          sourceFailures.push({ source_key: source.source_key, status: fetched.status, url: source.source_url });
          continue;
        }

        const feedSource = toNewsSourceConfig(source);
        const candidates = (fetched.candidates ?? (feedSource ? extractCandidates(fetched.text, feedSource) : [])).slice(0, request.limit_per_source);
        itemsSeen += candidates.length;

        for (const candidate of candidates) {
          const signal = await normalizeCandidateSignal(source, candidate, request);
          if (!signal) continue;

          const result = await upsertSignal(supabase, source, signal, runId, snapshot.id, request);
          itemsStored += 1;
          if (result.duplicate) duplicatesSeen += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceFailures.push({ source_key: source.source_key, url: source.source_url, error: message });
      }
    }

    if (request.manual_items.length > 0) {
      const { data: manualSource, error: manualSourceError } = await supabase
        .from("x_signal_sources")
        .select("*")
        .eq("source_key", "manual-signal-import")
        .maybeSingle();

      if (manualSourceError) throw manualSourceError;
      if (!manualSource) throw new Error("manual-signal-import source is not configured");

      const source = manualSource as SignalSource;
      const snapshotText = JSON.stringify(request.manual_items);
      const { data: snapshot, error: snapshotError } = await supabase
        .from("x_signal_snapshots")
        .insert({
          run_id: runId,
          source_id: source.id,
          source_key: source.source_key,
          source_type: source.source_type,
          source_url: source.source_url,
          final_url: source.source_url,
          status_code: 200,
          content_hash: await sha256(snapshotText),
          excerpt: snapshotText.slice(0, 1500),
          raw_metadata: {
            manual_items: request.manual_items.length,
          },
        })
        .select("id")
        .single();

      if (snapshotError) throw snapshotError;
      snapshotsInserted += 1;

      for (const item of request.manual_items) {
        itemsSeen += 1;
        const signal = await normalizeManualSignal(source, item, request);
        if (!signal) {
          skippedSources.push({ source_key: source.source_key, title: item.title, reason: "manual item missing valid title or source URL" });
          continue;
        }

        const result = await upsertSignal(supabase, source, signal, runId, snapshot.id, request);
        itemsStored += 1;
        if (result.duplicate) duplicatesSeen += 1;
      }
    }

    const { error: finishError } = await supabase
      .from("x_digest_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        sources_seen: sources.length,
        snapshots_inserted: snapshotsInserted,
        items_seen: itemsSeen,
        items_stored: itemsStored,
        duplicates_seen: duplicatesSeen,
        credential_requirements: credentialRequirements,
        skipped_sources: skippedSources.slice(0, 100),
        source_failures: sourceFailures,
        cost_metadata: costMetadata,
        source_keys: sources.map((source) => source.source_key),
      })
      .eq("id", runId);

    if (finishError) throw finishError;

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        target_date: request.target_date,
        mode: request.mode,
        counts: {
          sources_seen: sources.length,
          snapshots_inserted: snapshotsInserted,
          items_seen: itemsSeen,
          items_stored: itemsStored,
          duplicates_seen: duplicatesSeen,
          skipped_sources: skippedSources.length,
          source_failures: sourceFailures.length,
        },
        credential_requirements: credentialRequirements,
        skipped_sources: skippedSources.slice(0, 25),
        source_failures: sourceFailures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("collect-ibiza-signals failed", message);

    if (runId && supabase) {
      await supabase
        .from("x_digest_runs")
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
