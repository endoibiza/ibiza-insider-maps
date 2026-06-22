import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const stripHtml = (value) =>
  normalizeWhitespace(
    decodeHtmlEntities(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );

const sanitizeLineup = (value, fallback = "") => {
  const cleaned = stripHtml(value)
    .replace(/\b(?:Theatre|Club|Garden|Terrace|Main Room|The Bunker|Wild Comet|Room|Stage)(?:\s*\([^)]+\))?\s*:\s*/gi, "")
    .replace(/\bSpecial\s+Guests?\s*:\s*/gi, "")
    .replace(/\s*,?\s*\+\s*(?:TBA|TBC)\b\.?/gi, "")
    .replace(/\s*\((?:verified|updated)\s+[^)]*\)/gi, "")
    .replace(/\b(?:agent run|run id|verified on|last verified)\s*[:#-]?\s*[\w:-]+/gi, "");
  return normalizeWhitespace(cleaned || fallback).slice(0, 750);
};

const weakLineupPattern =
  /(?:^|\b)(tba|tbc|artists?\s*tba|line\s*-?\s*up\s*tba|lineup\s*tba|to be announced|lineup not yet posted)(?:\b|$)/i;
const genericLineupPattern =
  /(?:\b(?:resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s+(?:artists|names|acts|djs)?\s*(?:tba|soon)?|and\s+more)\b|&\s*more|\+\s*(?:tba|tbc)\b)/i;
const timeOnlyLineupPattern =
  /^(?:\d{1,2}|00|30)(?:\s*\([^)]+\)\s*\/\s*\d{1,2}:\d{2}\s*\([^)]+\))?$/i;
const truncatedLineupPattern = /(?:\.{3}|…)\s*$/;
const eventListingLineupPattern =
  /\bon\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2},?\s+\d{1,2}:\d{2}\b/i;
const eventDescriptionLineupPattern =
  /\b(?:live at|at)\s+\[?[^\]]+\]?\s+ibiza\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+20\d{2})?/i;
const isWeakLineup = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized || weakLineupPattern.test(normalized) || /\b(agent run|run id|verified on|last verified)\b/i.test(normalized);
};
const isGenericLineupProposal = (value) => {
  const normalized = normalizeWhitespace(value);
  return !normalized ||
    genericLineupPattern.test(normalized) ||
    timeOnlyLineupPattern.test(normalized) ||
    truncatedLineupPattern.test(normalized) ||
    eventListingLineupPattern.test(normalized) ||
    eventDescriptionLineupPattern.test(normalized);
};

const textLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

const stopLinePattern =
  /^(how to|buy|book|tickets?|tables?|guestlist|read more|find out|share|follow|instagram|spotify|apple music|youtube|privacy|terms|contact|faq|about|calendar|vip|hotel|events?|what'?s on|sign up|keep browsing|back to events)\b/i;

const labelledLineupPattern = /^(?:line\s*-?\s*up|lineup|artists?|djs?)$/i;
const roomLabelPattern =
  /^(?:theatre|club room|main room|terrace|garden|wild corner|the bunker|room|stage)(?:\s+(?:artcore|beatport(?:\s+live)?|all night long))?$/i;
const priceLinePattern = /(?:€|early access|entry before|before\s+\d{1,2}[:.]?\d{2}|standard ticket|vip ticket|vip experience|vip access|vip table|vip upgrade|balcony ticket|general admission|tickets?\s+from|drinks?\s+package|water\s+pack|discount|meet\s*&?\s*greet)/i;
const genericFillerLinePattern = /^(?:more artists? tba|more names? tba|special guests?|guest djs?|resident djs?|coming soon|line\s*up\s*coming soon|tba|to be announced)[.!…]*$/i;
const dateLinePattern =
  /^(?:(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?[,]?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2}$/i;

const dateTokensFor = (dateValue) => {
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return [];

  const weekdayLong = date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
  const weekdayShort = date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
  const monthLong = date.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long" });
  const monthShort = date.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" });
  const dayNumeric = String(Number(date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit" })));
  const day2 = date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit" });
  const year = date.toLocaleDateString("en-GB", { timeZone: "UTC", year: "numeric" });
  const month2 = date.toLocaleDateString("en-GB", { timeZone: "UTC", month: "2-digit" });

  return [
    `${weekdayLong}, ${monthShort} ${dayNumeric}, ${year}`,
    `${weekdayLong}, ${monthLong} ${dayNumeric}, ${year}`,
    `${weekdayShort} ${day2} ${monthShort}`,
    `${weekdayShort} ${dayNumeric} ${monthShort}`,
    `${monthShort} ${dayNumeric}, ${year}`,
    `${monthLong} ${dayNumeric}, ${year}`,
    `${day2}/${month2}/${year}`,
    `${day2}-${month2}-${year}`,
    `${dayNumeric}-${Number(month2)}-${year}`,
    `${month2}-${day2}-${year}`,
    `${Number(month2)}-${dayNumeric}-${year}`,
  ].map((token) => token.toLowerCase());
};

const isLikelyArtistLine = (line, target) => {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return false;
  if (stopLinePattern.test(normalized) || priceLinePattern.test(normalized)) return false;
  if (/^\d{1,2}[:.]\d{2}/.test(normalized) || /\b\d{1,2}:\d{2}\s*[–-]\s*(?:end|\d{1,2}:\d{2})\b/i.test(normalized)) return false;
  if (timeOnlyLineupPattern.test(normalized)) return false;
  if (roomLabelPattern.test(normalized) || genericFillerLinePattern.test(normalized)) return false;
  if (/\bbalearic islands\b/i.test(normalized)) return false;
  if (dateLinePattern.test(normalized)) return false;
  if (overlapScore(normalized, target.event_name) >= 0.75) return false;
  if (overlapScore(normalized, target.venue || "") >= 0.75) return false;
  return /[a-z]/i.test(normalized);
};

const extractLineupFromVisibleText = (target, text) => {
  const lines = textLines(text);
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/:$/, "");
    if (!labelledLineupPattern.test(line)) continue;

    const collected = [];
    for (const nextLine of lines.slice(index + 1, index + 8)) {
      if (stopLinePattern.test(nextLine)) break;
      if (/^\d{1,2}[:.]\d{2}/.test(nextLine)) continue;
      collected.push(nextLine);
      if (collected.join(", ").length > 500) break;
    }
    if (collected.length) candidates.push(collected.join(", "));
  }

  const dateTokens = dateTokensFor(target.date);
  if (dateTokens.length) {
    const hasTargetDate = (line) => {
      const normalized = normalizeWhitespace(line).toLowerCase();
      return dateTokens.some((token) => normalized.includes(token));
    };

    for (let index = 0; index < lines.length; index += 1) {
      if (!hasTargetDate(lines[index])) continue;
      const sameLine = lines[index].split(":").slice(1).join(":");
      if (sameLine && isLikelyArtistLine(sameLine, target)) candidates.push(sameLine);

      const collected = [];
      for (const nextLine of lines.slice(index + 1, index + 40)) {
        if (hasTargetDate(nextLine) && collected.length) break;
        if (dateLinePattern.test(nextLine) && collected.length) break;
        if (stopLinePattern.test(nextLine) || priceLinePattern.test(nextLine)) {
          if (collected.length) break;
          continue;
        }
        if (!isLikelyArtistLine(nextLine, target)) continue;
        collected.push(nextLine);
        if (collected.length >= 18 || collected.join(", ").length > 650) break;
      }
      if (collected.length) candidates.push(collected.join(", "));
    }
  }

  return candidates
    .map((candidate) => sanitizeLineup(candidate, ""))
    .find((candidate) =>
      candidate &&
      !isGenericLineupProposal(candidate) &&
      candidate !== normalizeWhitespace(target.lineup_details || "") &&
      overlapScore(candidate, target.event_name) < 0.75
    ) || "";
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

const extractProposedLineup = (target, html, visibleText) => {
  const matched = chooseEvent(target, extractJsonLdEvents(html));
  if (matched) {
    const artists = getJsonNames(matched.performer);
    const proposed = sanitizeLineup(artists.length ? artists.join(", ") : matched.description, "");
    if (proposed) {
      return {
        proposed,
        source_event_name: matched.name || null,
        source_event_url: matched.url || null,
        extraction_method: "json_ld",
      };
    }
  }

  const visibleProposal = extractLineupFromVisibleText(target, visibleText);
  return visibleProposal
    ? {
      proposed: visibleProposal,
      source_event_name: target.event_name,
      source_event_url: target.source_url || target.event_url || null,
      extraction_method: "visible_text_label",
    }
    : null;
};

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
const venuePattern = normalizeWhitespace(process.env.VENUE_PATTERN || "");
const venueRegex = venuePattern ? new RegExp(venuePattern, "i") : null;
const venueSearchTokens = venuePattern
  .split("|")
  .map((token) => normalizeWhitespace(token).replace(/[.*+?^${}()[\]\\]/g, ""))
  .filter((token) => token.length >= 2);
const sweepSourceTypes = ["official_venue", "fourvenues_public", "ibiza_spotlight", "ticketing_platform", "municipal"];

const { data: run, error: runError } = await supabase
  .from("event_ingestion_runs")
  .insert({
    run_type: process.env.RUN_TYPE || "manual",
    mode: "shadow",
    status: "running",
    source_keys: ["github-actions-browser-lineup-sweep"],
    window_start: startDate,
    window_end: endDate,
    metadata: { job: "browser_lineup_sweep", limit, venue_pattern: venuePattern || null },
  })
  .select("id")
  .single();

if (runError) throw runError;

let targetsSeen = 0;
let snapshotsInserted = 0;
let proposalsInserted = 0;
const proposalStatusCounts = {};
const sourceFailures = [];

try {
  let targetQuery = supabase
    .from("event_lineup_sweep_targets")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .in("source_type", sweepSourceTypes);

  if (venueSearchTokens.length) {
    targetQuery = targetQuery.or(
      venueSearchTokens
        .flatMap((token) => [`venue.ilike.%${token}%`, `event_name.ilike.%${token}%`])
        .join(","),
    );
  }

  const { data: rawTargets, error: targetError } = await targetQuery
    .order("priority", { ascending: false })
    .order("date", { ascending: true })
    .limit(limit);

  if (targetError) throw targetError;
  const viewTargets = venueRegex
    ? (rawTargets || []).filter((target) =>
      venueRegex.test(target.venue || "") || venueRegex.test(target.event_name || ""),
    )
    : rawTargets || [];

  const targetsByKey = new Map(viewTargets.map((target) => [`${target.event_id}|${target.source_url || target.event_url}`, target]));

  if (targetsByKey.size < limit) {
    let sourceLinkQuery = supabase
      .from("event_source_links")
      .select("id,event_id,source_url,source_type,canonical_for_updates,confidence,status")
      .in("source_type", sweepSourceTypes)
      .in("status", ["active", "needs_review"])
      .order("confidence", { ascending: false })
      .limit(2500);

    const { data: sourceLinks, error: sourceLinkError } = await sourceLinkQuery;
    if (sourceLinkError) throw sourceLinkError;

    const sourceEventIds = [...new Set((sourceLinks || []).map((link) => link.event_id).filter(Boolean))];
    const sourceEvents = [];
    for (let index = 0; index < sourceEventIds.length; index += 100) {
      const batch = sourceEventIds.slice(index, index + 100);
      const { data: events, error: eventsError } = await supabase
        .from("ibiza_events")
        .select("id,notion_page_id,event_name,date,venue,event_series,event_url,lineup_details,status,fourvenues_event_id,source_missing_since")
        .in("id", batch)
        .gte("date", startDate)
        .lte("date", endDate)
        .neq("status", "Cancelled")
        .is("source_missing_since", null);
      if (eventsError) throw eventsError;
      sourceEvents.push(...(events || []));
    }

    const eventById = new Map(sourceEvents.map((event) => [event.id, event]));
    for (const link of sourceLinks || []) {
      const event = eventById.get(link.event_id);
      if (!event) continue;
      if (event.fourvenues_event_id || String(event.notion_page_id || "").startsWith("fourvenues:")) continue;
      if (venueRegex && !venueRegex.test(event.venue || "") && !venueRegex.test(event.event_name || "")) continue;
      const key = `${event.id}|${link.source_url}`;
      if (targetsByKey.has(key)) continue;
      targetsByKey.set(key, {
        event_id: event.id,
        notion_page_id: event.notion_page_id,
        event_name: event.event_name,
        date: event.date,
        venue: event.venue,
        event_series: event.event_series,
        event_url: event.event_url,
        lineup_details: event.lineup_details,
        status: event.status,
        fourvenues_event_id: event.fourvenues_event_id,
        source_missing_since: event.source_missing_since,
        source_link_id: link.id,
        source_url: link.source_url,
        source_type: link.source_type,
        canonical_for_updates: link.canonical_for_updates,
        issue_type: "explicit_source_link_check",
        priority: 5,
      });
      if (targetsByKey.size >= limit) break;
    }
  }

  const targets = [...targetsByKey.values()].slice(0, limit);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: "Ibiza Maps Browser Lineup Sweep/1.0 (+https://ibiza-maps.com)" });

  for (const target of targets || []) {
    const sourceUrl = target.source_url || target.event_url;
    if (!sourceUrl) continue;
    targetsSeen += 1;

    try {
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const html = await page.content();
      const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
      const frameTexts = [];
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const frameText = await frame.locator("body").innerText({ timeout: 3000 }).catch(() => "");
        if (frameText) frameTexts.push(frameText);
      }
      const renderedText = [bodyText, ...frameTexts].filter(Boolean).join("\n\n--- iframe ---\n\n");
      const snapshotHash = await sha256(`${html}\n${renderedText}`);
      const { data: snapshot, error: snapshotError } = await supabase
        .from("event_source_snapshots")
        .insert({
          run_id: run.id,
          source_key: "github-actions-browser-lineup-sweep",
          source_kind: target.source_type === "municipal" ? "municipal" : target.source_type === "ibiza_spotlight" ? "spotlight" : "venue",
          source_url: sourceUrl,
          status_code: 200,
          content_hash: snapshotHash,
          excerpt: normalizeWhitespace(renderedText || stripHtml(html)).slice(0, 12000),
          raw_metadata: {
            event_id: target.event_id,
            event_name: target.event_name,
            source_type: target.source_type,
            renderer: "playwright",
            frame_count: frameTexts.length,
          },
        })
        .select("id")
        .single();

      if (snapshotError) throw snapshotError;
      snapshotsInserted += 1;

      if (target.source_link_id) {
        const { error: sourceLinkUpdateError } = await supabase
          .from("event_source_links")
          .update({
            last_checked_at: new Date().toISOString(),
          })
          .eq("id", target.source_link_id);

        if (sourceLinkUpdateError) throw sourceLinkUpdateError;
      }

      const extraction = extractProposedLineup(target, html, renderedText);
      if (!extraction) continue;

      const { proposed } = extraction;
      if (!proposed || isWeakLineup(proposed) || proposed === normalizeWhitespace(target.lineup_details || "")) continue;

      const confidence = Math.min(
        0.95,
        0.82 + (["official_venue", "ticketing_platform"].includes(target.source_type) ? 0.08 : 0.03),
      );
      const isGenericProposal = isGenericLineupProposal(proposed);
      const approvalStatus = isGenericProposal
        ? "rejected"
        : isWeakLineup(target.lineup_details) &&
        !isGenericProposal &&
        ["official_venue", "ibiza_spotlight"].includes(target.source_type) &&
        confidence >= 0.86
        ? "auto_safe"
        : "pending";
      const proposalHash = await sha256(`${target.event_id}|${sourceUrl}|${proposed}`);
      const { data: existingProposal, error: existingProposalError } = await supabase
        .from("event_lineup_review_queue")
        .select("id,approval_status")
        .eq("event_id", target.event_id)
        .eq("source_url", sourceUrl)
        .eq("proposal_hash", proposalHash)
        .maybeSingle();

      if (existingProposalError) throw existingProposalError;
      if (["applied", "rejected"].includes(existingProposal?.approval_status)) continue;

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
            source_event_name: extraction.source_event_name,
            source_event_url: extraction.source_event_url,
            extraction_method: extraction.extraction_method,
            quality_gate: isGenericProposal ? "rejected_generic_or_partial_lineup" : "passed_generic_lineup_check",
          },
        }, { onConflict: "event_id,source_url,proposal_hash" });

      if (proposalError) throw proposalError;
      proposalsInserted += 1;
      proposalStatusCounts[approvalStatus] = (proposalStatusCounts[approvalStatus] || 0) + 1;
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
      metadata: {
        job: "browser_lineup_sweep",
        proposals_inserted: proposalsInserted,
        proposal_status_counts: proposalStatusCounts,
        venue_pattern: venuePattern || null,
        events_inserted: 0,
        events_updated: 0,
      },
    })
    .eq("id", run.id);

  console.log(JSON.stringify({
    run_id: run.id,
    targets_seen: targetsSeen,
    snapshots_inserted: snapshotsInserted,
    proposals_inserted: proposalsInserted,
    proposal_status_counts: proposalStatusCounts,
    venue_pattern: venuePattern || null,
    source_failures: sourceFailures.length,
    events_inserted: 0,
    events_updated: 0,
  }, null, 2));
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
