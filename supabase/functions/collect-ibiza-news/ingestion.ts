export type NewsSourceType = "rss" | "atom" | "sitemap" | "html" | "ical" | "signal";
export type NewsPublishMode = "auto" | "review" | "signal_only";

export interface NewsSourceConfig {
  id?: string;
  source_key: string;
  source_name: string;
  source_type: NewsSourceType;
  source_url: string;
  homepage_url?: string | null;
  default_category?: string | null;
  default_area?: string[] | null;
  default_language?: string | null;
  publish_mode?: NewsPublishMode | null;
}

export interface RawNewsCandidate {
  source_key: string;
  source_name: string;
  source_type: NewsSourceType;
  publish_mode: NewsPublishMode;
  source_url: string;
  canonical_url: string | null;
  headline: string;
  source_description: string | null;
  published_at: string | null;
  language: string;
  raw_metadata: Record<string, unknown>;
}

export interface ClassifiedNewsCandidate extends RawNewsCandidate {
  summary_seed: string;
  category: string;
  area: string[];
  significance: string;
  digest_section: "island_wide" | "santa_eularia" | "new_businesses" | "weekly_crime";
  santa_eularia: boolean;
  ibiza_maps_relevant: boolean;
  dedupe_key: string;
  evidence_hash_seed: string;
}

const DIRECT_URL_BLOCKLIST = new Set([
  "rss",
  "feed",
  "xml",
  "sitemap.xml",
  "sitemap",
  "news",
  "noticias",
  "actualidad",
  "magazine",
  "ibiza",
  "pitiusas",
  "home",
  "inicio",
]);

const CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ["Weather Alert", /\b(aemet|weather|storm|rain|wind|alerta|aviso|meteo|temporal|calor|heat)\b/i],
  ["Transport", /\b(airport|aeropuerto|flight|ferry|bus|taxi|traffic|transport|road|carretera|port|puerto|parking)\b/i],
  ["Public Safety", /\b(emergency|112|fire|incendio|bomberos|police|policia|polic[ií]a|guardia civil|rescue|rescat|safety|seguridad|socorrista)\b/i],
  ["Crime", /\b(arrest|detenido|detenida|robbery|theft|drug|droga|crime|delito|court|tribunal|prison|violencia|agresi[oó]n)\b/i],
  ["Government", /\b(council|consell|govern|ayuntamiento|ajuntament|plen[oa]|mayor|alcald|councillor|municipal)\b/i],
  ["Infrastructure", /\b(works|obras|roadworks|water|agua|sewer|electric|power|construction|vivienda|housing)\b/i],
  ["Environment", /\b(environment|medio ambiente|sea|mar|beach|playa|posidonia|waste|residuos|climate|biodiversity)\b/i],
  ["Business", /\b(opening|opens|abierto|apertura|restaurant|restaurante|hotel|business|negocio|empresa|comercio|venue|kebab|food|gastronom)\b/i],
  ["Tourism", /\b(tourism|turismo|tourist|visitor|hotel|season|temporada|cruise|travel|qu[eé] hacer|places|lugares)\b/i],
  ["Culture", /\b(culture|cultura|music|musica|festival|concert|cine|theatre|teatro|exhibition|exposici[oó]n|misa|artesanal|tradici[oó]n|producto local)\b/i],
  ["Health", /\b(health|salud|hospital|clinic|sanidad|medical|doctor|patient)\b/i],
  ["Community", /\b(school|colegio|famil|community|vecin|solidar|association|asociaci[oó]n)\b/i],
];

const AREA_KEYWORDS: Array<[string, RegExp]> = [
  ["Santa Eulària", /\b(santa eul[àa]ria|santa eularia|santa eulalia|es canar|es can[áa]|cala llonga|jes[uú]s|puig d'en valls)\b/i],
  ["Ibiza Town", /\b(eivissa|ibiza town|vila|dalt vila|platja d'en bossa|playa d'en bossa)\b/i],
  ["San Antonio", /\b(sant antoni|san antonio|portmany|west end|ses variades|cala de bou)\b/i],
  ["San José", /\b(sant josep|san jos[eé]|sant jordi|es cubells|cala vedella|cala tarida)\b/i],
  ["Sant Joan", /\b(sant joan|san juan|portinatx|sant miquel|san miguel)\b/i],
  ["Formentera", /\b(formentera)\b/i],
];

const LOCAL_SIGNAL_PATTERN =
  /\b(ibiza|eivissa|piti[uü]sas|formentera|santa eul[àa]ria|santa eularia|santa eulalia|sant antoni|san antonio|sant josep|san jos[eé]|sant joan|san juan|sant rafael|sant rafel|sant jordi|es canar|cala llonga|cala bou|jes[uú]s|dalt vila|playa d'en bossa|platja d'en bossa)\b/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function decodeHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

export function canonicalizeUrl(value: string | null | undefined, baseUrl?: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(decodeHtml(value).trim(), baseUrl);
    url.hash = "";

    for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      url.searchParams.delete(param);
    }

    const normalizedPath = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    url.pathname = normalizedPath || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function isDirectSourceUrl(value: string | null | undefined): boolean {
  const canonicalUrl = canonicalizeUrl(value);
  if (!canonicalUrl) return false;

  try {
    const url = new URL(canonicalUrl);
    if (!["http:", "https:"].includes(url.protocol)) return false;

    const segments = url.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    if (segments.length === 0) return false;
    if (segments.length === 1 && DIRECT_URL_BLOCKLIST.has(segments[0])) return false;
    if (segments.some((segment) => ["feed", "rss", "atom"].includes(segment))) return false;
    if (segments.at(-1)?.includes("sitemap")) return false;
    if (/\/(feed|rss|atom|xml)\/?$/.test(url.pathname)) return false;

    return true;
  } catch {
    return false;
  }
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getTag(block: string, tagName: string): string | null {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? stripHtml(match[1]) : null;
}

function getRawTag(block: string, tagName: string): string | null {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function getXmlBlocks(xml: string, tagName: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi"))).map((match) => match[0]);
}

function getAtomHref(entry: string): string | null {
  const links = Array.from(entry.matchAll(/<link\b([^>]+)>/gi));
  const alternate = links.find((match) => !/rel=["'](?:self|hub|next)["']/i.test(match[1]) || /rel=["']alternate["']/i.test(match[1]));
  const attrs = alternate?.[1] ?? links[0]?.[1];
  return attrs?.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? null;
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function trimSummary(value: string | null | undefined, fallback: string, maxLength = 420): string {
  const source = normalizeWhitespace(value || fallback);
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength - 1).trim()}...`;
}

function sourcePublishMode(source: NewsSourceConfig): NewsPublishMode {
  return source.publish_mode || "review";
}

export function extractFeedCandidates(xml: string, source: NewsSourceConfig): RawNewsCandidate[] {
  const base = source.source_url;
  const sourceType = source.source_type;
  const publishMode = sourcePublishMode(source);

  const items = sourceType === "atom" || /<feed\b/i.test(xml) ? getXmlBlocks(xml, "entry") : getXmlBlocks(xml, "item");

  return items
    .map((item) => {
      const atom = sourceType === "atom" || /<entry\b/i.test(item);
      const title = getTag(item, "title") || "";
      const rawDescription = getRawTag(item, "description") || getRawTag(item, "summary") || getRawTag(item, "content") || null;
      const link = atom ? getAtomHref(item) : getTag(item, "link") || getTag(item, "guid");
      const canonicalUrl = canonicalizeUrl(link, base);
      const publishedAt = parseDate(getTag(item, "pubDate") || getTag(item, "published") || getTag(item, "updated") || getTag(item, "dc:date"));

      return {
        source_key: source.source_key,
        source_name: source.source_name,
        source_type: source.source_type,
        publish_mode: publishMode,
        source_url: source.source_url,
        canonical_url: canonicalUrl,
        headline: normalizeWhitespace(title),
        source_description: rawDescription ? trimSummary(stripHtml(rawDescription), title) : null,
        published_at: publishedAt,
        language: source.default_language || "es",
        raw_metadata: {
          guid: getTag(item, "guid") || getTag(item, "id"),
          categories: Array.from(item.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)).map((match) => stripHtml(match[1])),
        },
      } satisfies RawNewsCandidate;
    })
    .filter((candidate) => candidate.headline && candidate.canonical_url);
}

export function extractSitemapCandidates(xml: string, source: NewsSourceConfig): RawNewsCandidate[] {
  return getXmlBlocks(xml, "url")
    .map((entry) => {
      const loc = canonicalizeUrl(getTag(entry, "loc"), source.source_url);
      const lastModified = parseDate(getTag(entry, "lastmod"));
      const slug = loc ? decodeURIComponent(new URL(loc).pathname.split("/").filter(Boolean).at(-1) || "") : "";
      const title = normalizeWhitespace(slug.replace(/\.(html|php)$/i, "").replace(/[-_]+/g, " "));

      return {
        source_key: source.source_key,
        source_name: source.source_name,
        source_type: source.source_type,
        publish_mode: sourcePublishMode(source),
        source_url: source.source_url,
        canonical_url: loc,
        headline: title,
        source_description: null,
        published_at: lastModified,
        language: source.default_language || "es",
        raw_metadata: { lastmod: lastModified },
      } satisfies RawNewsCandidate;
    })
    .filter((candidate) => candidate.headline.length > 12 && isDirectSourceUrl(candidate.canonical_url));
}

export function extractHtmlIndexCandidates(html: string, source: NewsSourceConfig): RawNewsCandidate[] {
  const baseUrl = source.source_url;
  const sourceHost = new URL(baseUrl).hostname.replace(/^www\./, "");
  const candidates = new Map<string, RawNewsCandidate>();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const canonicalUrl = canonicalizeUrl(match[1], baseUrl);
    if (!canonicalUrl || !isDirectSourceUrl(canonicalUrl)) continue;

    const host = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    if (host !== sourceHost) continue;

    const headline = stripHtml(match[2]);
    if (headline.length < 18 || headline.length > 220) continue;

    candidates.set(canonicalUrl, {
      source_key: source.source_key,
      source_name: source.source_name,
      source_type: source.source_type,
      publish_mode: sourcePublishMode(source),
      source_url: source.source_url,
      canonical_url: canonicalUrl,
      headline,
      source_description: null,
      published_at: null,
      language: source.default_language || "es",
      raw_metadata: { extracted_from: "html" },
    });
  }

  return Array.from(candidates.values()).slice(0, 30);
}

function unfoldIcal(value: string): string {
  return value.replace(/\r?\n[ \t]/g, "");
}

function icalField(block: string, fieldName: string): string | null {
  const match = block.match(new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, "im"));
  return match ? normalizeWhitespace(match[1].replace(/\\,/g, ",").replace(/\\n/g, " ")) : null;
}

function parseIcalDate(value: string | null): string | null {
  if (!value) return null;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!compact) return parseDate(value);
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = compact;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
}

export function extractIcalCandidates(ical: string, source: NewsSourceConfig): RawNewsCandidate[] {
  return unfoldIcal(ical)
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((eventBlock) => {
      const headline = icalField(eventBlock, "SUMMARY") || "";
      const url = canonicalizeUrl(icalField(eventBlock, "URL"), source.source_url);
      const description = icalField(eventBlock, "DESCRIPTION");

      return {
        source_key: source.source_key,
        source_name: source.source_name,
        source_type: source.source_type,
        publish_mode: sourcePublishMode(source),
        source_url: source.source_url,
        canonical_url: url,
        headline,
        source_description: description,
        published_at: parseIcalDate(icalField(eventBlock, "DTSTART")),
        language: source.default_language || "es",
        raw_metadata: {
          uid: icalField(eventBlock, "UID"),
          location: icalField(eventBlock, "LOCATION"),
        },
      } satisfies RawNewsCandidate;
    })
    .filter((candidate) => candidate.headline && candidate.canonical_url);
}

export function extractCandidates(content: string, source: NewsSourceConfig): RawNewsCandidate[] {
  if (source.source_type === "rss" || source.source_type === "atom") return extractFeedCandidates(content, source);
  if (source.source_type === "sitemap") return extractSitemapCandidates(content, source);
  if (source.source_type === "ical") return extractIcalCandidates(content, source);
  if (source.source_type === "html") return extractHtmlIndexCandidates(content, source);
  return [];
}

function classifyCategory(candidate: RawNewsCandidate): string {
  const haystack = `${candidate.headline} ${candidate.source_description ?? ""}`;
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return "Other";
}

function classifyArea(candidate: RawNewsCandidate, source: NewsSourceConfig): string[] {
  const haystack = `${candidate.headline} ${candidate.source_description ?? ""}`;
  const areas = AREA_KEYWORDS.filter(([, pattern]) => pattern.test(haystack)).map(([area]) => area);
  if (areas.length > 0) return Array.from(new Set(areas));

  const defaults = source.default_area?.filter(Boolean) || [];
  return defaults.length > 0 ? defaults : ["Island-Wide"];
}

function hasLocalIbizaSignal(candidate: RawNewsCandidate): boolean {
  const path = candidate.canonical_url ? new URL(candidate.canonical_url).pathname.replace(/[-_/]+/g, " ") : "";
  return LOCAL_SIGNAL_PATTERN.test(`${candidate.headline} ${candidate.source_description ?? ""} ${path}`);
}

function classifySignificance(candidate: RawNewsCandidate, category: string): string {
  const haystack = `${candidate.headline} ${candidate.source_description ?? ""}`;
  if (/\b(breaking|urgent|ultima hora|emergency|evacuat|fatal|death|storm alert)\b/i.test(haystack)) return "Breaking";
  if (["Government", "Public Safety", "Crime", "Transport", "Weather Alert", "Infrastructure"].includes(category)) return "Notable";
  return "Minor";
}

function digestSection(category: string, area: string[], headline: string): ClassifiedNewsCandidate["digest_section"] {
  if (/\b(opening|opens|apertura|new business|restaurant|hotel)\b/i.test(headline) || category === "Business") return "new_businesses";
  if (category === "Crime") return "weekly_crime";
  if (area.includes("Santa Eulària")) return "santa_eularia";
  return "island_wide";
}

export function classifyCandidate(candidate: RawNewsCandidate, source: NewsSourceConfig): ClassifiedNewsCandidate {
  const category = source.default_category || classifyCategory(candidate);
  const area = classifyArea(candidate, source);
  const significance = classifySignificance(candidate, category);
  const summarySeed = trimSummary(candidate.source_description, candidate.headline);
  const canonicalUrl = candidate.canonical_url || "";
  const normalizedHeadline = normalizeWhitespace(candidate.headline).toLowerCase();
  const localSignal = hasLocalIbizaSignal(candidate);

  return {
    ...candidate,
    summary_seed: summarySeed,
    category,
    area,
    significance,
    digest_section: digestSection(category, area, candidate.headline),
    santa_eularia: area.includes("Santa Eulària") || area.includes("Es Canar") || area.includes("Cala Llonga"),
    ibiza_maps_relevant: localSignal || category !== "Other" || area.some((value) => value !== "Island-Wide"),
    dedupe_key: stableHash(`${normalizedHeadline}|${candidate.published_at?.slice(0, 10) || ""}`),
    evidence_hash_seed: `${source.source_key}|${canonicalUrl}|${candidate.headline}|${candidate.source_description || ""}|${candidate.published_at || ""}`,
  };
}

export function targetDateInMadrid(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function dayNameInMadrid(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "long" }).format(new Date(`${date}T12:00:00+02:00`));
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isFreshForTarget(candidate: RawNewsCandidate, targetDate: string): boolean {
  if (!candidate.published_at) return false;
  const publishedDate = candidate.published_at.slice(0, 10);
  return publishedDate >= addDays(targetDate, -1) && publishedDate <= addDays(targetDate, 1);
}

export function shouldPublishCandidate(candidate: ClassifiedNewsCandidate, targetDate: string): { publishable: boolean; reason?: string } {
  if (candidate.publish_mode !== "auto") return { publishable: false, reason: `source mode is ${candidate.publish_mode}` };
  if (!isDirectSourceUrl(candidate.canonical_url)) return { publishable: false, reason: "missing direct source URL" };
  if (!candidate.ibiza_maps_relevant) return { publishable: false, reason: "missing Ibiza-local relevance signal" };
  if (!isFreshForTarget(candidate, targetDate)) return { publishable: false, reason: "not fresh for target date" };
  if (!candidate.headline || candidate.headline.length < 8) return { publishable: false, reason: "headline missing or too short" };
  return { publishable: true };
}

export function buildDigestSections(stories: Array<{ id: string; headline: string; summary: string; digest_section: string; source_url: string }>, targetDate: string) {
  const sections = {
    island_wide: stories.filter((story) => story.digest_section === "island_wide").map((story) => story.id),
    santa_eularia: stories.filter((story) => story.digest_section === "santa_eularia").map((story) => story.id),
    new_businesses: stories.filter((story) => story.digest_section === "new_businesses").map((story) => story.id),
    weekly_crime: dayNameInMadrid(targetDate) === "Sunday" ? stories.filter((story) => story.digest_section === "weekly_crime").map((story) => story.id) : [],
  };

  return sections;
}

export function buildDigestSummary(stories: Array<{ headline: string; summary: string; digest_section: string }>, targetDate: string, sourcesChecked: string[]): string {
  const dayName = dayNameInMadrid(targetDate);
  if (stories.length === 0) {
    return `Date verified: ${targetDate} = ${dayName}\n\nNone found today from verified direct-source stories. Sources checked: ${sourcesChecked.join(", ")}`;
  }

  const topStories = stories.slice(0, 8).map((story) => `- ${story.headline}: ${story.summary}`).join("\n");
  return `Date verified: ${targetDate} = ${dayName}\n\n${topStories}`;
}
