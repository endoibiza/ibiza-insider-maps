import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const normalizeWhitespace = (value) => decodeHtmlEntities(value).replace(/\s+/g, " ").trim();

const escapeMarkdown = (value) => normalizeWhitespace(value).replace(/\|/g, "\\|");

const countBy = (rows, fn) => {
  const counts = {};
  for (const row of rows) {
    const key = fn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

const table = (headers, rows) => {
  const out = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) out.push(`| ${row.map(escapeMarkdown).join(" | ")} |`);
  return out.join("\n");
};

const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
const limit = Math.min(Math.max(Number(process.env.LIMIT || 50), 1), 200);
const venuePattern = normalizeWhitespace(process.env.VENUE_PATTERN || "");
const statusFilter = normalizeWhitespace(process.env.APPROVAL_STATUS || "pending");
const sourceType = normalizeWhitespace(process.env.SOURCE_TYPE || "");
const sourceTypes = sourceType
  ? sourceType.split(",").map((item) => normalizeWhitespace(item)).filter(Boolean)
  : [];
const venueRegex = venuePattern ? new RegExp(venuePattern, "i") : null;

let query = supabase
  .from("event_lineup_review_queue")
  .select("id,event_id,event_name,event_date,venue,source_type,source_url,current_lineup_details,proposed_lineup_details,lineup_confidence,approval_status,raw_metadata,created_at")
  .order("created_at", { ascending: false })
  .limit(Math.min(1000, Math.max(limit * 10, 100)));

if (statusFilter && statusFilter !== "all") query = query.eq("approval_status", statusFilter);
if (sourceTypes.length === 1) query = query.eq("source_type", sourceTypes[0]);
if (sourceTypes.length > 1) query = query.in("source_type", sourceTypes);

const { data, error } = await query;
if (error) throw error;

const filtered = (data || [])
  .filter((proposal) => !venueRegex || venueRegex.test(proposal.venue || "") || venueRegex.test(proposal.event_name || ""))
  .slice(0, limit);

const statusCounts = countBy(filtered, (proposal) => proposal.approval_status);
const sourceCounts = countBy(filtered, (proposal) => proposal.source_type);
const venueCounts = countBy(filtered, (proposal) => proposal.venue);

const samples = filtered.map((proposal) => ({
  event_date: proposal.event_date,
  venue: proposal.venue,
  event_name: proposal.event_name,
  source_type: proposal.source_type,
  approval_status: proposal.approval_status,
  confidence: proposal.lineup_confidence,
  proposed_lineup_details: normalizeWhitespace(proposal.proposed_lineup_details),
  current_lineup_details: normalizeWhitespace(proposal.current_lineup_details),
  source_url: proposal.source_url,
  quality_gate: proposal.raw_metadata?.quality_gate || "",
  extraction_method: proposal.raw_metadata?.extraction_method || "",
}));

const markdown = [
  "# Event Lineup Proposal Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Venue filter: ${venuePattern || "all"}`,
  `Approval status: ${statusFilter || "all"}`,
  `Source type filter: ${sourceType || "all"}`,
  `Rows shown: ${samples.length}`,
  "",
  "## Status Counts",
  "",
  table(["Status", "Count"], Object.entries(statusCounts).map(([key, value]) => [key, String(value)])),
  "",
  "## Source Type Counts",
  "",
  table(["Source Type", "Count"], Object.entries(sourceCounts).map(([key, value]) => [key, String(value)])),
  "",
  "## Venue Counts",
  "",
  table(["Venue", "Count"], Object.entries(venueCounts).sort((a, b) => b[1] - a[1]).map(([key, value]) => [key, String(value)])),
  "",
  "## Samples",
  "",
  table(
    ["Date", "Venue", "Event", "Source Type", "Status", "Confidence", "Proposed Lineup", "Current Lineup", "Source URL", "Quality Gate", "Extraction"],
    samples.map((sample) => [
      sample.event_date,
      sample.venue,
      sample.event_name,
      sample.source_type,
      sample.approval_status,
      String(sample.confidence ?? ""),
      sample.proposed_lineup_details,
      sample.current_lineup_details,
      sample.source_url,
      sample.quality_gate,
      sample.extraction_method,
    ]),
  ),
  "",
].join("\n");

const outDir = path.resolve("reports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "event-lineup-proposal-report.md"), markdown);

console.log(JSON.stringify({
  venue_pattern: venuePattern || null,
  approval_status: statusFilter || null,
  source_type: sourceType || null,
  rows_shown: samples.length,
  status_counts: statusCounts,
  source_type_counts: sourceCounts,
  venue_counts: venueCounts,
  samples: samples.slice(0, 10),
}, null, 2));
