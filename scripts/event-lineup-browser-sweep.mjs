import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const stripHtml = (value) =>
  normalizeWhitespace(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );

const sanitizeLineup = (value, fallback = "") => {
  const cleaned = stripHtml(value)
    .replace(/\b(?:Theatre|Club|Garden|Terrace|Main Room|The Bunker|Wild Comet|Room|Stage)\s*:\s*/gi, "")
    .replace(/\s*\((?:verified|updated)\s+[^)]*\)/gi, "")
    .replace(/\b(?:agent run|run id|verified on|last verified)\s*[:#-]?\s*[\w:-]+/gi, "");
  return normalizeWhitespace(cleaned || fallback).slice(0, 750);
};

const weakLineupPattern = /^(tba|tbc|lineup tba|to be announced|more tba|coming soon)$/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|lineup\s+coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more|&#038;\s*more)/i;
const isWeakLineup = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || weakLineupPattern.test(normalized) || /\b(agent run|run id|verified on|last verified)\b/i.test(normalized);
};
const isGenericLineupProposal = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || genericLineupPattern.test(normalized);
};

const normalizeKeyPart = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const tokenSet = (value) => new Set(normalizeKeyPart(value).split("-").filter((token) => token.length > 2));
const overlapScore = (left, right) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

const dateOnlyFrom = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null;
  return parsed.toISOString().slice(0, 10);
};

const getJsonName = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) return getJsonName(value.name);
  return null;
};

const getJsonNames = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(getJsonName).filter(Boolean);
  const name = getJsonName(value);
  return name ? [name] : [];
};

const getEventObjects = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(getEventObjects);
  if (typeof value !== "object") return [];
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  const own = types.some((type) => typeof type === "string" && (type === "Event" || type.endsWith("Event"))) ? [value] : [];
  return [...own, ...getEventObjects(value["@graph"])];
};

const extractJsonLdEvents = (html) => {
  const events = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      events.push(...getEventObjects(JSON.parse(match[1].trim())));
    } catch {
      // Ignore malformed structured data from source sites.
    }
  }
  return events;
};

const chooseEvent = (target, events) =>
  events
    .map((event) => {
      const eventDate = dateOnlyFrom(event.startDate);
      const venue = getJsonName(event.location) || target.venue || "";
      const title = String(event.name || "");
      return {
        event,
        score:
          (eventDate && target.date && eventDate === target.date ? 0.45 : 0) +
          overlapScore(title, target.event_name) * 0.4 +
          overlapScore(venue, target.venue || "") * 0.15,
      };
    })
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)[0]?.event ?? null;

const sha256 = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const today = new Date();
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
const toDateOnly = (date) => date.toISOString().slice(0, 10);

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const startDate = process.env.START_DATE || toDateOnly(today);
const endDate = process.env.END_DATE || toDateOnly(addDays(today, Number(process.env.WINDOW_DAYS || 14)));
const limit = Math.min(Math.max(Number(process.env.LIMIT || 40), 1), 200);

const { data: run, error: runError } = await supabase
  .from("event_ingestion_runs")
  .insert({
    run_type: process.env.RUN_TYPE || "manual",
    mode: "shadow",
    status: "running",
    source_keys: ["github-actions-browser-lineup-sweep"],
    window_start: startDate,
    window_end: endDate,
    metadata: { job: "browser_lineup_sweep", limit },
  })
  .select("id")
  .single();

if (runError) throw runError;

let targetsSeen = 0;
let snapshotsInserted = 0;
let proposalsInserted = 0;
const sourceFailures = [];

try {
  const { data: targets, error: targetError } = await supabase
    .from("event_lineup_sweep_targets")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .in("source_type", ["official_venue", "ibiza_spotlight", "ticketing_platform", "municipal"])
    .order("priority", { ascending: false })
    .order("date", { ascending: true })
    .limit(limit);

  if (targetError) throw targetError;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: "Ibiza Maps Browser Lineup Sweep/1.0 (+https://ibiza-maps.com)" });

  for (const target of targets || []) {
    const sourceUrl = target.source_url || target.event_url;
    if (!sourceUrl) continue;
    targetsSeen += 1;

    try {
      await page.goto(sourceUrl, { waitUntil: "networkidle", timeout: 45000 });
      const html = await page.content();
      const snapshotHash = await sha256(html);
      const { data: snapshot, error: snapshotError } = await supabase
        .from("event_source_snapshots")
        .insert({
          run_id: run.id,
          source_key: "github-actions-browser-lineup-sweep",
          source_kind: target.source_type === "municipal" ? "municipal" : target.source_type === "ibiza_spotlight" ? "spotlight" : "venue",
          source_url: sourceUrl,
          status_code: 200,
          content_hash: snapshotHash,
          excerpt: stripHtml(html).slice(0, 12000),
          raw_metadata: {
            event_id: target.event_id,
            event_name: target.event_name,
            source_type: target.source_type,
            renderer: "playwright",
          },
        })
        .select("id")
        .single();

      if (snapshotError) throw snapshotError;
      snapshotsInserted += 1;

      const matched = chooseEvent(target, extractJsonLdEvents(html));
      if (!matched) continue;

      const artists = getJsonNames(matched.performer);
      const proposed = sanitizeLineup(artists.length ? artists.join(", ") : matched.description, "");
      if (!proposed || isWeakLineup(proposed) || proposed === normalizeWhitespace(target.lineup_details || "")) continue;

      const confidence = Math.min(0.95, 0.82 + (target.source_type === "official_venue" ? 0.08 : 0.03));
      const approvalStatus = isWeakLineup(target.lineup_details) &&
        !isGenericLineupProposal(proposed) &&
        ["official_venue", "ibiza_spotlight"].includes(target.source_type) &&
        confidence >= 0.86
        ? "auto_safe"
        : "pending";
      const proposalHash = await sha256(`${target.event_id}|${sourceUrl}|${proposed}`);

      const { error: proposalError } = await supabase
        .from("event_lineup_review_queue")
        .upsert({
          event_id: target.event_id,
          run_id: run.id,
          source_link_id: target.source_link_id,
          snapshot_id: snapshot.id,
          source_url: sourceUrl,
          source_type: target.source_type,
          event_name: target.event_name,
          event_date: target.date,
          venue: target.venue,
          current_lineup_details: target.lineup_details,
          proposed_lineup_details: proposed,
          proposal_hash: proposalHash,
          lineup_confidence: confidence,
          approval_status: approvalStatus,
          raw_metadata: {
            renderer: "playwright",
            source_event_name: matched.name || null,
            source_event_url: matched.url || null,
          },
        }, { onConflict: "event_id,source_url,proposal_hash" });

      if (proposalError) throw proposalError;
      proposalsInserted += 1;
    } catch (error) {
      sourceFailures.push({
        event_id: target.event_id,
        source_url: sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await browser.close();

  await supabase
    .from("event_ingestion_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      sources_seen: targetsSeen,
      snapshots_inserted: snapshotsInserted,
      candidates_seen: proposalsInserted,
      candidates_inserted: proposalsInserted,
      source_failures: sourceFailures,
      metadata: { job: "browser_lineup_sweep", proposals_inserted: proposalsInserted },
    })
    .eq("id", run.id);

  console.log(JSON.stringify({ run_id: run.id, targets_seen: targetsSeen, snapshots_inserted: snapshotsInserted, proposals_inserted: proposalsInserted, source_failures: sourceFailures.length }, null, 2));
} catch (error) {
  await supabase
    .from("event_ingestion_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      source_failures: sourceFailures,
    })
    .eq("id", run.id);
  throw error;
}
