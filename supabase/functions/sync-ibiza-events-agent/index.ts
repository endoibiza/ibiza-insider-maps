import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  buildEventSourceLink,
  buildIbizaEventInsert,
  buildSafeExistingEventPatch,
  DEFAULT_EVENT_SOURCES,
  EventSource,
  ExistingEvent,
  extractJsonLdCandidates,
  findExistingEventMatch,
  normalizeWhitespace,
  reviewStatusForCandidate,
  stripHtml,
  truncate,
} from "./ingestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

type SyncRequest = {
  source_keys?: string[];
  start_date?: string;
  end_date?: string;
  run_type?: "daily" | "sunday_full_season" | "biweekly_reverify" | "manual" | "backfill";
  dry_run?: boolean;
  write_events?: boolean;
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
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncRequest) : {};
  const today = new Date();
  const startDate = body.start_date ?? toDateOnly(today);
  const endDate = body.end_date ?? toDateOnly(addDays(today, body.run_type === "sunday_full_season" ? 180 : 7));
  const selectedKeys = new Set(body.source_keys ?? DEFAULT_EVENT_SOURCES.slice(0, 5).map((source) => source.key));
  const sources = DEFAULT_EVENT_SOURCES.filter((source) => selectedKeys.has(source.key));

  return {
    runType: body.run_type ?? "manual",
    dryRun: body.dry_run ?? false,
    writeEvents: body.write_events ?? false,
    mode: body.write_events ? "write" : "shadow",
    startDate,
    endDate,
    sources,
  };
};

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const eachDate = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end && dates.length < 31) {
    dates.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const fetchSource = async (source: EventSource, startDate: string, endDate: string) => {
  if (source.key === "spotlight-party-calendar") {
    const pages = await Promise.all(
      eachDate(startDate, endDate).map(async (date) => {
        const url = `https://www.ibiza-spotlight.com/night/events/${date.replaceAll("-", "/")}`;
        const { text } = await fetchUrl(url);
        return `<!-- source-url:${url} -->\n${text}`;
      }),
    );

    return {
      response: { status: 200 },
      text: pages.join("\n<!-- spotlight-date-page -->\n"),
    };
  }

  return fetchUrl(source.url);
};

const fetchUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Ibiza Maps Events Agent/1.0 (+https://ibiza-maps.com)",
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

const selectExistingEventsForDate = async (supabase: ReturnType<typeof createClient>, date: string | null) => {
  if (!date) return [];
  const { data, error } = await supabase
    .from("ibiza_events")
    .select("id,notion_page_id,event_name,date,venue,event_series,lineup_details,event_url,source,start_time,end_time,fourvenues_event_id")
    .eq("date", date)
    .limit(100);

  if (error) throw error;
  return (data ?? []) as ExistingEvent[];
};

const upsertEventSourceLink = async (
  supabase: ReturnType<typeof createClient>,
  link: ReturnType<typeof buildEventSourceLink>,
) => {
  if (!link) return;
  const onConflict = link.event_id ? "event_id,source_url" : "candidate_id,source_url";
  const { error } = await supabase
    .from("event_source_links")
    .upsert(link, { onConflict });

  if (error) throw error;
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
  let snapshotsInserted = 0;
  let candidatesSeen = 0;
  let candidatesInserted = 0;
  let existingMatches = 0;
  let eventsInserted = 0;
  let eventsUpdated = 0;
  const sourceFailures: Array<{ source_key: string; url: string; error: string }> = [];

  try {
    const syncRequest = await parseRequest(req);

    if (!syncRequest.sources.length) {
      throw new Error("No matching event sources were requested");
    }

    if (!syncRequest.dryRun) {
      const { data: run, error: runError } = await supabase
        .from("event_ingestion_runs")
        .insert({
          run_type: syncRequest.runType,
          mode: syncRequest.mode,
          status: "running",
          source_keys: syncRequest.sources.map((source) => source.key),
          window_start: syncRequest.startDate,
          window_end: syncRequest.endDate,
          started_at: startedAt,
          metadata: { write_events: syncRequest.writeEvents },
        })
        .select("id")
        .single();

      if (runError) throw runError;
      runId = run.id;
    }

    for (const source of syncRequest.sources) {
      try {
        const { response, text } = await fetchSource(source, syncRequest.startDate, syncRequest.endDate);
        const contentHash = await sha256(text);
        const excerpt = truncate(stripHtml(text), 12000);
        const candidates = extractJsonLdCandidates(text, source, syncRequest.startDate, syncRequest.endDate);
        candidatesSeen += candidates.length;

        let snapshotId: string | null = null;
        if (!syncRequest.dryRun && runId) {
          const { data: snapshot, error: snapshotError } = await supabase
            .from("event_source_snapshots")
            .insert({
              run_id: runId,
              source_key: source.key,
              source_kind: source.kind,
              source_url: source.url,
              status_code: response.status,
              content_hash: contentHash,
              excerpt,
              raw_metadata: {
                label: source.label,
                candidate_count: candidates.length,
                content_length: text.length,
              },
            })
            .select("id")
            .single();

          if (snapshotError) throw snapshotError;
          snapshotId = snapshot.id;
          snapshotsInserted += 1;
        }

        for (const candidate of candidates) {
          const existingEvents = await selectExistingEventsForDate(supabase, candidate.event_date);
          const existingEvent = findExistingEventMatch(candidate, existingEvents);
          const reviewStatus = reviewStatusForCandidate(candidate, existingEvent);
          if (existingEvent) existingMatches += 1;

          let candidateId: string | null = null;
          if (!syncRequest.dryRun && runId) {
            const { data: staged, error: candidateError } = await supabase
              .from("event_candidates")
              .upsert({
                run_id: runId,
                snapshot_id: snapshotId,
                source_key: candidate.source_key,
                external_id: candidate.external_id,
                dedupe_key: candidate.dedupe_key,
                event_name: candidate.event_name,
                event_date: candidate.event_date,
                start_time: candidate.start_time,
                end_time: candidate.end_time,
                venue: candidate.venue,
                event_series: candidate.event_series,
                type: candidate.type,
                status: candidate.status,
                lineup_details: candidate.lineup_details,
                event_url: candidate.event_url,
                original_source_url: candidate.original_source_url,
                source_label: candidate.source_label,
                source_url_type: candidate.source_url_type,
                canonical_source_url: candidate.canonical_source_url,
                maintenance_flags: candidate.maintenance_flags,
                residents_pass: candidate.residents_pass,
                confidence: candidate.confidence,
                review_status: reviewStatus,
                existing_event_id: existingEvent?.id ?? null,
                raw_candidate: candidate.raw_candidate,
              }, { onConflict: "run_id,source_key,external_id" })
              .select("id")
              .single();

            if (candidateError) throw candidateError;
            candidateId = staged.id;
            candidatesInserted += 1;

            if (!(existingEvent?.event_url && existingEvent.event_url === candidate.canonical_source_url)) {
              await upsertEventSourceLink(
                supabase,
                buildEventSourceLink(candidate, existingEvent?.id ?? null, candidateId, snapshotId),
              );
            }
          }

          if (!syncRequest.writeEvents || syncRequest.dryRun) continue;

          let mergedCandidate = false;
          if (existingEvent) {
            const patch = buildSafeExistingEventPatch(candidate, existingEvent);
            if (Object.keys(patch).length > 0) {
              const { error: updateError } = await supabase
                .from("ibiza_events")
                .update(patch)
                .eq("id", existingEvent.id);

              if (updateError) throw updateError;
              eventsUpdated += 1;
              mergedCandidate = true;
            }
          } else if (reviewStatus === "auto_safe") {
            const { data: insertedEvent, error: insertError } = await supabase
              .from("ibiza_events")
              .insert(buildIbizaEventInsert(candidate))
              .select("id")
              .single();

            if (insertError) throw insertError;
            eventsInserted += 1;
            mergedCandidate = true;

            await upsertEventSourceLink(
              supabase,
              buildEventSourceLink(candidate, insertedEvent.id, candidateId, snapshotId),
            );
          }

          if (candidateId && mergedCandidate) {
            await supabase
              .from("event_candidates")
              .update({ review_status: "merged" })
              .eq("id", candidateId);
          }
        }
      } catch (error) {
        const message = sourceErrorMessage(error);
        sourceFailures.push({ source_key: source.key, url: source.url, error: message });
        console.error(`Event source failed: ${source.key}`, error);
      }
    }

    if (!syncRequest.dryRun && runId) {
      await supabase
        .from("event_ingestion_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          sources_seen: syncRequest.sources.length,
          snapshots_inserted: snapshotsInserted,
          candidates_seen: candidatesSeen,
          candidates_inserted: candidatesInserted,
          existing_matches: existingMatches,
          events_inserted: eventsInserted,
          events_updated: eventsUpdated,
          source_failures: sourceFailures,
        })
        .eq("id", runId);

      await supabase.from("sync_log").insert({
        table_name: "event_candidates",
        last_synced_at: new Date().toISOString(),
        records_upserted: candidatesInserted,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        mode: syncRequest.mode,
        dry_run: syncRequest.dryRun,
        write_events: syncRequest.writeEvents,
        sources_seen: syncRequest.sources.length,
        snapshots_inserted: snapshotsInserted,
        candidates_seen: candidatesSeen,
        candidates_inserted: candidatesInserted,
        existing_matches: existingMatches,
        events_inserted: eventsInserted,
        events_updated: eventsUpdated,
        source_failures: sourceFailures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = normalizeWhitespace(error instanceof Error ? error.message : "Unknown error");
    console.error("sync-ibiza-events-agent failed:", error);

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
