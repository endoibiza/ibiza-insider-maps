import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type SourceKind = "spotlight" | "venue" | "municipal" | "platform" | "signal" | "news";
type SourceUrlType =
  | "official_venue"
  | "fourvenues_public"
  | "fourvenues_channel"
  | "ibiza_spotlight"
  | "municipal"
  | "ticketing_platform"
  | "aggregator"
  | "social"
  | "manual"
  | "unknown";

type EventSource = {
  key: string;
  label: string;
  kind: SourceKind;
  url: string;
  sourceLabel: string;
  defaultType: string;
  defaultVenue?: string;
};

type LineupCandidate = {
  source_key: string;
  external_id: string;
  event_name: string;
  event_date: string | null;
  venue: string | null;
  lineup_details: string;
  event_url: string | null;
  confidence: number;
};

const DEFAULT_EVENT_SOURCES: EventSource[] = [
  {
    key: "spotlight-party-calendar",
    label: "Ibiza Spotlight Party Calendar",
    kind: "spotlight",
    url: "https://www.ibiza-spotlight.com/night/events",
    sourceLabel: "Ibiza Spotlight",
    defaultType: "Club",
  },
  {
    key: "spotlight-events-calendar",
    label: "Ibiza Spotlight Events Calendar",
    kind: "spotlight",
    url: "https://www.ibiza-spotlight.com/events",
    sourceLabel: "Ibiza Spotlight",
    defaultType: "Local",
  },
  {
    key: "santa-eularia-agenda",
    label: "Santa Eularia Agenda",
    kind: "municipal",
    url: "https://visitsantaeulalia.com/en/agenda/",
    sourceLabel: "Club Website",
    defaultType: "Cultural",
  },
  {
    key: "eivissa-agenda",
    label: "Ajuntament d'Eivissa Agenda",
    kind: "municipal",
    url: "https://www.eivissa.es/portal/index.php/en/agenda",
    sourceLabel: "Club Website",
    defaultType: "Local",
  },
  {
    key: "sant-antoni-agenda",
    label: "Sant Antoni Agenda",
    kind: "municipal",
    url: "https://visit.santantoni.net/en/events/",
    sourceLabel: "Club Website",
    defaultType: "Local",
  },
  {
    key: "pacha-events",
    label: "Pacha Events",
    kind: "venue",
    url: "https://pacha.com/events",
    sourceLabel: "Club Website",
    defaultType: "Club",
    defaultVenue: "Pacha Ibiza",
  },
  {
    key: "hi-ibiza-events",
    label: "Hi Ibiza Events",
    kind: "venue",
    url: "https://www.hiibiza.com/events-calendar",
    sourceLabel: "Club Website",
    defaultType: "Club",
    defaultVenue: "Hï Ibiza",
  },
  {
    key: "ushuaia-events",
    label: "Ushuaia Ibiza Events",
    kind: "venue",
    url: "https://www.theushuaiaexperience.com/en/club/calendar",
    sourceLabel: "Club Website",
    defaultType: "Club",
    defaultVenue: "Ushuaïa Ibiza",
  },
];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const stripHtml = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );

const truncate = (value: string, length: number) => (value.length > length ? `${value.slice(0, length).trim()}...` : value);

const sanitizeLineupDetails = (value: string | null | undefined, fallback: string) => {
  const cleaned = stripHtml(value || "")
    .replace(/\b(?:Theatre|Club|Garden|Terrace|Main Room|The Bunker|Wild Comet|Room|Stage)\s*:\s*/gi, "")
    .replace(/\s*\((?:verified|updated)\s+[^)]*\)/gi, "")
    .replace(/\b(?:agent run|run id|verified on|last verified)\s*[:#-]?\s*[\w:-]+/gi, "");
  return truncate(normalizeWhitespace(cleaned || fallback), 750);
};

const stableHash = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const dateOnlyFrom = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.match(/^\d{4}-\d{2}-\d{2}$/) ? value : null;
  return parsed.toISOString().slice(0, 10);
};

const getJsonText = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
};

const getJsonName = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) return getJsonText((value as { name?: unknown }).name);
  return null;
};

const getJsonNames = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(getJsonName).filter(Boolean) as string[];
  const name = getJsonName(value);
  return name ? [name] : [];
};

const getJsonUrl = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return getJsonUrl(value[0]);
  return null;
};

const absoluteUrl = (url: string | null, source: EventSource) => {
  if (!url) return source.url;
  try {
    return new URL(url, source.url).toString();
  } catch {
    return source.url;
  }
};

const getJsonLdObjects = (value: unknown): Record<string, unknown>[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(getJsonLdObjects);
  if (typeof value !== "object") return [];

  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const types = Array.isArray(type) ? type : [type];
  const own = types.some((item) => typeof item === "string" && (item === "Event" || item.endsWith("Event"))) ? [object] : [];
  return [...own, ...getJsonLdObjects(object["@graph"])];
};

const isEventInWindow = (date: string | null, startDate?: string | null, endDate?: string | null) => {
  if (!date) return true;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

const extractJsonLdCandidates = (
  html: string,
  source: EventSource,
  windowStart?: string | null,
  windowEnd?: string | null,
): LineupCandidate[] => {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const candidates: LineupCandidate[] = [];

  for (const match of scripts) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      for (const event of getJsonLdObjects(parsed)) {
        const name = getJsonText(event.name);
        if (!name) continue;

        const startDate = getJsonText(event.startDate);
        const eventDate = dateOnlyFrom(startDate);
        if (!isEventInWindow(eventDate, windowStart, windowEnd)) continue;

        const location = event.location && typeof event.location === "object" ? (event.location as Record<string, unknown>) : null;
        const venue = getJsonName(location ?? event.location) || source.defaultVenue || null;
        const performers = getJsonNames(event.performer);
        const eventUrl = absoluteUrl(getJsonUrl(event.url), source);
        const lineupDetails = sanitizeLineupDetails(
          performers.length ? performers.join(", ") : getJsonText(event.description),
          `${name}${venue ? ` at ${venue}` : ""}`,
        );

        candidates.push({
          source_key: source.key,
          external_id: stableHash(`${eventUrl}|${name}|${eventDate ?? ""}|${venue ?? ""}`),
          event_name: truncate(stripHtml(name), 180),
          event_date: eventDate,
          venue: venue ? truncate(stripHtml(venue), 160) : null,
          lineup_details: lineupDetails,
          event_url: eventUrl,
          confidence: eventDate ? 0.82 : 0.62,
        });
      }
    } catch {
      continue;
    }
  }

  return candidates;
};

const OFFICIAL_VENUE_DOMAINS = [
  "pacha.com",
  "hiibiza.com",
  "theushuaiaexperience.com",
  "unvrs.com",
  "amnesia.es",
  "dc10ibiza.com",
  "circolocoibiza.com",
  "covasanta.com",
  "ibizarocks.com",
  "pikesibiza.com",
  "528ibiza.com",
  "chinois.com",
  "akashaibiza.com",
  "lasdalias.es",
  "edenibiza.com",
  "liogroup.com",
  "bluemarlinibiza.com",
  "nikkibeach.com",
  "jockeyclubibiza.com",
  "ibiza.cafedelmar.com",
];

const MUNICIPAL_DOMAINS = [
  "visitsantaeulalia.com",
  "santaeulariadesriu.com",
  "eivissa.es",
  "santantoni.net",
  "visit.santantoni.net",
  "santjosep.org",
  "santjoandelabritja.com",
  "conselldeivissa.es",
  "caib.es",
  "illesbalears.travel",
];

const TICKETING_DOMAINS = ["ra.co", "shotgun.live", "eventbrite.", "skiddle.com", "dice.fm", "ticketing", "tickets", "bacantix.com", "reservaentradas.com"];

const classifySourceUrl = (url: string | null | undefined, source?: Pick<EventSource, "kind"> | null): SourceUrlType => {
  if (!url) return "unknown";
  const normalized = url.toLowerCase();
  if (normalized.includes("channels-service.fourvenues.com")) return "fourvenues_channel";
  if (normalized.includes("fourvenues.com") || normalized.includes("fourvenues.site")) return "fourvenues_public";
  if (normalized.includes("ibiza-spotlight.com")) return "ibiza_spotlight";
  if (MUNICIPAL_DOMAINS.some((domain) => normalized.includes(domain))) return "municipal";
  if (TICKETING_DOMAINS.some((domain) => normalized.includes(domain))) return "ticketing_platform";
  if (normalized.includes("instagram.com") || normalized.includes("facebook.com") || normalized.includes("x.com") || normalized.includes("twitter.com")) return "social";
  if (OFFICIAL_VENUE_DOMAINS.some((domain) => normalized.includes(domain))) return "official_venue";
  if (source?.kind === "venue") return "official_venue";
  if (source?.kind === "municipal") return "municipal";
  if (source?.kind === "platform") return "ticketing_platform";
  if (source?.kind === "spotlight") return "ibiza_spotlight";
  return "unknown";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type SweepRequest = {
  start_date?: string;
  end_date?: string;
  limit?: number;
  run_type?: "daily" | "sunday_full_season" | "biweekly_reverify" | "manual" | "backfill";
  write_events?: boolean;
  auto_apply?: boolean;
  source_types?: string[];
};

type SweepTarget = {
  event_id: string;
  notion_page_id: string;
  event_name: string;
  date: string | null;
  venue: string | null;
  event_series: string | null;
  event_url: string | null;
  lineup_details: string | null;
  source_link_id: string | null;
  source_url: string | null;
  source_type: string | null;
  issue_type: string | null;
  priority: number;
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

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const parseRequest = async (req: Request) => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SweepRequest) : {};
  const today = new Date();
  const runType = body.run_type ?? "manual";
  const startDate = body.start_date ?? toDateOnly(today);
  const endDate = body.end_date ?? toDateOnly(addDays(today, runType === "sunday_full_season" ? 180 : 14));
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 250);

  return {
    runType,
    startDate,
    endDate,
    limit,
    writeEvents: body.write_events ?? false,
    autoApply: body.auto_apply ?? false,
    sourceTypes: body.source_types ?? ["official_venue", "ibiza_spotlight", "ticketing_platform", "municipal"],
  };
};

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const fetchUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Ibiza Maps Lineup Sweep/1.0 (+https://ibiza-maps.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
};

const inferSourceKey = (url: string) => {
  const normalized = url.toLowerCase();
  if (normalized.includes("pacha.com")) return "pacha-events";
  if (normalized.includes("hiibiza.com")) return "hi-ibiza-events";
  if (normalized.includes("theushuaiaexperience.com")) return "ushuaia-events";
  if (normalized.includes("ibiza-spotlight.com/night")) return "spotlight-party-calendar";
  if (normalized.includes("ibiza-spotlight.com")) return "spotlight-events-calendar";
  if (normalized.includes("santaeularia") || normalized.includes("visitsantaeulalia")) return "santa-eularia-agenda";
  if (normalized.includes("eivissa.es")) return "eivissa-agenda";
  if (normalized.includes("santantoni")) return "sant-antoni-agenda";
  return "lineup-source";
};

const buildSourceForTarget = (target: SweepTarget, sourceUrl: string): EventSource => {
  const knownSource = DEFAULT_EVENT_SOURCES.find((source) => source.key === inferSourceKey(sourceUrl));
  if (knownSource) return { ...knownSource, url: sourceUrl, defaultVenue: target.venue ?? knownSource.defaultVenue };

  const sourceType = classifySourceUrl(sourceUrl);
  return {
    key: inferSourceKey(sourceUrl),
    label: `${target.venue || "Event"} lineup source`,
    kind: sourceType === "municipal" ? "municipal" : sourceType === "ibiza_spotlight" ? "spotlight" : "venue",
    url: sourceUrl,
    sourceLabel: sourceType === "ibiza_spotlight" ? "Ibiza Spotlight" : "Club Website",
    defaultType: "Club",
    defaultVenue: target.venue ?? undefined,
  };
};

const weakLineupPattern = /^(tba|tbc|lineup tba|to be announced|more tba|coming soon)$/i;
const internalNoisePattern = /\b(agent run|run id|verified on|last verified)\b/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|lineup\s+coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more|&#038;\s*more)/i;

export const isWeakLineupDetails = (value: string | null | undefined) => {
  const normalized = normalizeWhitespace(value || "");
  return !normalized || weakLineupPattern.test(normalized) || internalNoisePattern.test(normalized);
};

const isGenericLineupProposal = (value: string | null | undefined) => {
  const normalized = normalizeWhitespace(value || "");
  return !normalized || genericLineupPattern.test(normalized);
};

const normalizeKeyPart = (value: string | null | undefined) =>
  normalizeWhitespace(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const tokenSet = (value: string) => new Set(normalizeKeyPart(value).split("-").filter((token) => token.length > 2));

const overlapScore = (left: string, right: string) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

const chooseCandidateForTarget = (target: SweepTarget, candidates: ReturnType<typeof extractJsonLdCandidates>) => {
  return candidates
    .map((candidate) => ({
      candidate,
      score:
        (candidate.event_date && target.date && candidate.event_date === target.date ? 0.45 : 0) +
        overlapScore(candidate.event_name, target.event_name) * 0.4 +
        overlapScore(candidate.venue || "", target.venue || "") * 0.15,
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
};

const calculateConfidence = (sourceType: string, candidateConfidence: number, currentLineup: string | null | undefined) => {
  const sourceBonus = sourceType === "official_venue" ? 0.08 : sourceType === "ibiza_spotlight" ? 0.04 : 0;
  const weakBonus = isWeakLineupDetails(currentLineup) ? 0.04 : -0.08;
  return Math.min(0.99, Math.max(0.1, candidateConfidence + sourceBonus + weakBonus));
};

const approvalStatusForProposal = (
  sourceType: string,
  confidence: number,
  currentLineup: string | null | undefined,
  proposedLineup: string,
) => {
  if (
    isWeakLineupDetails(currentLineup) &&
    !isGenericLineupProposal(proposedLineup) &&
    ["official_venue", "ibiza_spotlight"].includes(sourceType) &&
    confidence >= 0.86
  ) {
    return "auto_safe";
  }
  return "pending";
};

const sourceErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown source failure";
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

  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  let targetsSeen = 0;
  let snapshotsInserted = 0;
  let proposalsInserted = 0;
  let proposalsAutoSafe = 0;
  let eventsUpdated = 0;
  const sourceFailures: Array<{ event_id: string; source_url: string; error: string }> = [];

  try {
    const sweepRequest = await parseRequest(req);
    const { data: run, error: runError } = await supabase
      .from("event_ingestion_runs")
      .insert({
        run_type: sweepRequest.runType,
        mode: sweepRequest.writeEvents && sweepRequest.autoApply ? "write" : "shadow",
        status: "running",
        source_keys: ["sweep-event-lineups"],
        window_start: sweepRequest.startDate,
        window_end: sweepRequest.endDate,
        started_at: startedAt,
        metadata: {
          job: "lineup_sweep",
          write_events: sweepRequest.writeEvents,
          auto_apply: sweepRequest.autoApply,
          source_types: sweepRequest.sourceTypes,
        },
      })
      .select("id")
      .single();

    if (runError) throw runError;
    runId = run.id;

    const { data: targets, error: targetsError } = await supabase
      .from("event_lineup_sweep_targets")
      .select("*")
      .gte("date", sweepRequest.startDate)
      .lte("date", sweepRequest.endDate)
      .order("priority", { ascending: false })
      .order("date", { ascending: true })
      .limit(sweepRequest.limit);

    if (targetsError) throw targetsError;

    for (const target of (targets ?? []) as SweepTarget[]) {
      const sourceUrl = target.source_url || target.event_url;
      const sourceType = target.source_type || classifySourceUrl(sourceUrl);
      if (!sourceUrl || !sweepRequest.sourceTypes.includes(sourceType)) continue;
      targetsSeen += 1;

      try {
        const { response, text } = await fetchUrl(sourceUrl);
        const source = buildSourceForTarget(target, sourceUrl);
        const snapshotHash = await sha256(text);
        const { data: snapshot, error: snapshotError } = await supabase
          .from("event_source_snapshots")
          .insert({
            run_id: runId,
            source_key: "sweep-event-lineups",
            source_kind: source.kind,
            source_url: sourceUrl,
            status_code: response.status,
            content_hash: snapshotHash,
            excerpt: truncate(stripHtml(text), 12000),
            raw_metadata: {
              event_id: target.event_id,
              event_name: target.event_name,
              source_type: sourceType,
              issue_type: target.issue_type,
            },
          })
          .select("id")
          .single();

        if (snapshotError) throw snapshotError;
        snapshotsInserted += 1;

        const candidates = extractJsonLdCandidates(text, source, sweepRequest.startDate, sweepRequest.endDate);
        const candidate = chooseCandidateForTarget(target, candidates);
        if (!candidate || isWeakLineupDetails(candidate.lineup_details)) continue;

        const proposedLineup = sanitizeLineupDetails(candidate.lineup_details, "");
        if (!proposedLineup || proposedLineup === normalizeWhitespace(target.lineup_details || "")) continue;

        const confidence = calculateConfidence(sourceType, candidate.confidence, target.lineup_details);
        const approvalStatus = approvalStatusForProposal(sourceType, confidence, target.lineup_details, proposedLineup);
        const proposalHash = await sha256(`${target.event_id}|${sourceUrl}|${proposedLineup}`);

        const { data: proposal, error: proposalError } = await supabase
          .from("event_lineup_review_queue")
          .upsert({
            event_id: target.event_id,
            run_id: runId,
            source_link_id: target.source_link_id,
            snapshot_id: snapshot.id,
            source_url: sourceUrl,
            source_type: sourceType,
            event_name: target.event_name,
            event_date: target.date,
            venue: target.venue,
            current_lineup_details: target.lineup_details,
            proposed_lineup_details: proposedLineup,
            proposal_hash: proposalHash,
            lineup_confidence: confidence,
            approval_status: approvalStatus,
            raw_metadata: {
              candidate_external_id: candidate.external_id,
              candidate_event_name: candidate.event_name,
              candidate_event_url: candidate.event_url,
              candidate_source_key: candidate.source_key,
              issue_type: target.issue_type,
            },
          }, { onConflict: "event_id,source_url,proposal_hash" })
          .select("id,approval_status")
          .single();

        if (proposalError) throw proposalError;
        proposalsInserted += 1;
        if (proposal.approval_status === "auto_safe") proposalsAutoSafe += 1;

        if (sweepRequest.writeEvents && sweepRequest.autoApply && proposal.approval_status === "auto_safe") {
          const { error: updateError } = await supabase
            .from("ibiza_events")
            .update({
              lineup_details: proposedLineup,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", target.event_id)
            .is("fourvenues_event_id", null)
            .not("notion_page_id", "like", "fourvenues:%");

          if (updateError) throw updateError;
          eventsUpdated += 1;

          await supabase
            .from("event_lineup_review_queue")
            .update({
              approval_status: "applied",
              applied_at: new Date().toISOString(),
            })
            .eq("id", proposal.id);
        }
      } catch (error) {
        sourceFailures.push({
          event_id: target.event_id,
          source_url: sourceUrl,
          error: sourceErrorMessage(error),
        });
      }
    }

    await supabase
      .from("event_ingestion_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        sources_seen: targetsSeen,
        snapshots_inserted: snapshotsInserted,
        candidates_seen: proposalsInserted,
        candidates_inserted: proposalsInserted,
        events_updated: eventsUpdated,
        source_failures: sourceFailures,
        metadata: {
          job: "lineup_sweep",
          write_events: sweepRequest.writeEvents,
          auto_apply: sweepRequest.autoApply,
          proposals_auto_safe: proposalsAutoSafe,
          source_types: sweepRequest.sourceTypes,
        },
      })
      .eq("id", runId);

    await supabase.from("sync_log").insert({
      table_name: "event_lineup_review_queue",
      last_synced_at: new Date().toISOString(),
      records_upserted: proposalsInserted,
    });

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        mode: sweepRequest.writeEvents && sweepRequest.autoApply ? "write" : "shadow",
        targets_seen: targetsSeen,
        snapshots_inserted: snapshotsInserted,
        proposals_inserted: proposalsInserted,
        proposals_auto_safe: proposalsAutoSafe,
        events_updated: eventsUpdated,
        source_failures: sourceFailures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = normalizeWhitespace(error instanceof Error ? error.message : "Unknown error");
    console.error("sweep-event-lineups failed:", error);

    if (runId) {
      await supabase
        .from("event_ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
          source_failures: sourceFailures,
        })
        .eq("id", runId);
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
