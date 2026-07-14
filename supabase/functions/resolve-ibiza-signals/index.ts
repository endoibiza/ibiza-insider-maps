import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  EventEvidenceCandidate,
  PrimaryEvidenceCandidate,
  ResolutionDecision,
  ResolutionSignal,
  resolveSignal,
  SignalCategory,
} from "./resolution.ts";
import { targetDateInMadrid } from "../collect-ibiza-news/ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type ResolveRequest = {
  target_date?: string;
  dry_run?: boolean;
  source_keys?: string[];
  limit?: number;
};

type SignalItemRow = {
  id: string;
  digest_date: string;
  title: string;
  summary: string;
  category: SignalCategory;
  source_url: string;
  source_domain: string;
  source_timestamp: string | null;
  source_kind: string;
  source_score: number;
  verification_status: string;
  duplicate_of: string | null;
  raw_metadata: Record<string, unknown> | null;
  source_key: string;
};

type SourceRow = {
  source_key: string;
  label: string;
  canonical_eligible: boolean;
  allow_publisher_original: boolean;
  require_local_signal: boolean;
  require_primary_resolution: boolean;
  public_link_policy: "primary_only" | "publisher_allowed" | "never";
  content_deny_patterns: string[];
  raw_metadata: Record<string, unknown> | null;
};

// Supabase Edge Functions do not have generated database types in this repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const constantTimeEqual = (actual: string | null | undefined, expected: string | null | undefined) => {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < actualBytes.length; index += 1) diff |= actualBytes[index] ^ expectedBytes[index];
  return diff === 0;
};

const requireAdminAccess = (req: Request) => {
  const expectedToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const suppliedToken = req.headers.get("x-sync-admin-token") || req.headers.get("x-sync-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!constantTimeEqual(suppliedToken, expectedToken) && !constantTimeEqual(bearer, serviceRoleKey)) {
    throw new Error("Unauthorized sync request");
  }
};

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const sourceDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const parseRequest = async (req: Request) => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as ResolveRequest) : {};
  return {
    targetDate: body.target_date || targetDateInMadrid(),
    dryRun: body.dry_run ?? true,
    sourceKeys: body.source_keys ?? [],
    limit: Math.max(1, Math.min(body.limit ?? 300, 600)),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let runId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    requireAdminAccess(req);
    const request = await parseRequest(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase = createClient<any>(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: run, error: runError } = await supabase
      .from("news_resolution_runs")
      .insert({
        target_date: request.targetDate,
        mode: request.dryRun ? "dry_run" : "resolve",
        metadata: { source_keys: request.sourceKeys, limit: request.limit },
      })
      .select("id")
      .single();
    if (runError) throw runError;
    runId = run.id;

    const [{ data: sourceRows, error: sourceError }, { data: signalRows, error: signalError }] = await Promise.all([
      supabase
        .from("x_signal_sources")
        .select("source_key,label,canonical_eligible,allow_publisher_original,require_local_signal,require_primary_resolution,public_link_policy,content_deny_patterns,raw_metadata"),
      supabase
        .from("x_daily_digest_items")
        .select("id,digest_date,title,summary,category,source_url,source_domain,source_timestamp,source_kind,source_score,verification_status,duplicate_of,raw_metadata,source_key")
        .gte("digest_date", addDays(request.targetDate, -2))
        .lte("digest_date", addDays(request.targetDate, 2))
        .order("source_score", { ascending: false })
        .limit(request.limit),
    ]);
    if (sourceError) throw sourceError;
    if (signalError) throw signalError;

    const sources = new Map((sourceRows as SourceRow[] | null ?? []).map((source) => [source.source_key, source]));
    const allSignals = (signalRows as SignalItemRow[] | null ?? [])
      .map((item): ResolutionSignal | null => {
        const source = sources.get(item.source_key);
        if (!source) return null;
        return {
          ...item,
          source_label: source.label,
          canonical_eligible: source.canonical_eligible,
          allow_publisher_original: source.allow_publisher_original,
          require_local_signal: source.require_local_signal,
          local_source_scope: Boolean(source.raw_metadata?.municipality),
          require_primary_resolution: source.require_primary_resolution,
          public_link_policy: source.public_link_policy,
          content_deny_patterns: source.content_deny_patterns ?? [],
        };
      })
      .filter((signal): signal is ResolutionSignal => Boolean(signal));

    const selectedSignals = allSignals.filter((signal) =>
      (request.sourceKeys.length === 0 || request.sourceKeys.includes(signal.source_key)) &&
      (signal as ResolutionSignal & { digest_date: string }).digest_date === request.targetDate
    );

    const primaryCandidates: PrimaryEvidenceCandidate[] = allSignals
      .filter((signal) => ["official_source", "official_account", "owner_source"].includes(signal.source_kind))
      .map((signal) => ({
        id: signal.id,
        title: signal.title,
        summary: signal.summary,
        category: signal.category,
        source_url: signal.source_url,
        source_domain: signal.source_domain,
        source_timestamp: signal.source_timestamp,
        source_kind: signal.source_kind as PrimaryEvidenceCandidate["source_kind"],
        source_key: signal.source_key,
        source_label: signal.source_label,
        raw_metadata: signal.raw_metadata,
      }));

    const { data: eventRows, error: eventError } = await supabase
      .from("event_candidates")
      .select("id,event_name,event_date,venue,event_url,canonical_source_url,source_label,source_url_type,review_status")
      .gte("event_date", addDays(request.targetDate, -2))
      .lte("event_date", addDays(request.targetDate, 2))
      .in("review_status", ["pending", "auto_safe", "needs_review", "merged"])
      .limit(300);
    if (eventError) throw eventError;

    const candidateIds = (eventRows ?? []).map((event) => event.id as string);
    const { data: eventLinks, error: eventLinkError } = candidateIds.length > 0
      ? await supabase
        .from("event_source_links")
        .select("id,candidate_id,source_url,source_type,source_label,canonical_for_updates,status,confidence")
        .in("candidate_id", candidateIds)
        .eq("status", "active")
        .order("canonical_for_updates", { ascending: false })
        .order("confidence", { ascending: false })
      : { data: [], error: null };
    if (eventLinkError) throw eventLinkError;

    const linksByCandidate = new Map<string, typeof eventLinks>();
    for (const link of eventLinks ?? []) {
      const current = linksByCandidate.get(link.candidate_id as string) ?? [];
      current.push(link);
      linksByCandidate.set(link.candidate_id as string, current);
    }

    const eventCandidates: EventEvidenceCandidate[] = (eventRows ?? []).flatMap((event) => {
      const allowedSourceTypes = ["official_venue", "municipal", "fourvenues_public", "fourvenues_channel"];
      const link = (linksByCandidate.get(event.id as string) ?? []).find((candidateLink) =>
        allowedSourceTypes.includes(String(candidateLink.source_type))
      );
      const fallbackUrl = allowedSourceTypes.includes(String(event.source_url_type))
        ? String(event.canonical_source_url || event.event_url || "")
        : "";
      const sourceUrl = String(link?.source_url || fallbackUrl);
      if (!sourceUrl.startsWith("http")) return [];
      return [{
        id: String(link?.id || event.id),
        event_name: String(event.event_name || ""),
        event_date: event.event_date ? String(event.event_date) : null,
        venue: event.venue ? String(event.venue) : null,
        source_url: sourceUrl,
        source_label: String(link?.source_label || event.source_label || event.venue || sourceDomain(sourceUrl)),
        source_kind: String(link?.source_type || event.source_url_type).includes("municipal") ? "official_source" : "owner_source",
      } satisfies EventEvidenceCandidate];
    });

    const decisions = selectedSignals.map((signal) => resolveSignal(signal, primaryCandidates, eventCandidates));

    if (!request.dryRun) {
      for (const decision of decisions) {
        const targetKey = `${decision.targetType}:${request.targetDate}`;
        const { error: staleLinkError } = await supabase
          .from("x_signal_links")
          .update({
            link_status: "rejected",
            notes: "superseded by deterministic primary-source resolution",
          })
          .eq("signal_item_id", decision.signalItemId)
          .neq("target_type", decision.targetType)
          .neq("link_status", "applied");
        if (staleLinkError) throw staleLinkError;

        const { error: linkError } = await supabase
          .from("x_signal_links")
          .upsert({
            signal_item_id: decision.signalItemId,
            target_type: decision.targetType,
            target_key: targetKey,
            link_status: decision.linkStatus,
            verification_source_url: decision.canonicalUrl,
            confidence: decision.confidence,
            notes: decision.reason,
            raw_metadata: {
              resolver_version: 1,
              resolution_status: decision.resolutionStatus,
              canonical_label: decision.canonicalLabel,
              canonical_domain: decision.canonicalDomain,
              canonical_kind: decision.canonicalKind,
              matched_evidence_id: decision.matchedEvidenceId,
              incident_fingerprint: decision.incidentFingerprint,
              resolved_at: new Date().toISOString(),
            },
          }, { onConflict: "signal_item_id,target_type,target_key" });
        if (linkError) throw linkError;
      }
    }

    const counts = {
      signals_seen: selectedSignals.length,
      official_matches: decisions.filter((decision) => decision.resolutionStatus === "official_resolved" || decision.resolutionStatus === "owner_resolved").length,
      publisher_originals: decisions.filter((decision) => decision.resolutionStatus === "publisher_original").length,
      review_required: decisions.filter((decision) => decision.resolutionStatus === "review_required").length,
      event_candidates: decisions.filter((decision) => decision.targetType === "event_review").length,
      conflicts: decisions.filter((decision) => decision.resolutionStatus === "conflict").length,
    };

    const { error: finishError } = await supabase
      .from("news_resolution_runs")
      .update({
        ...counts,
        status: "completed",
        finished_at: new Date().toISOString(),
        decisions: decisions.slice(0, 300),
      })
      .eq("id", runId);
    if (finishError) throw finishError;

    return new Response(JSON.stringify({ run_id: runId, target_date: request.targetDate, dry_run: request.dryRun, counts, decisions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("resolve-ibiza-signals failed", error);
    if (supabase && runId) {
      await supabase.from("news_resolution_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized sync request" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
