export type SourceKind = "spotlight" | "venue" | "municipal" | "platform" | "signal" | "news";
export type SourceUrlType =
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

export type EventSource = {
  key: string;
  label: string;
  kind: SourceKind;
  url: string;
  sourceLabel: string;
  defaultType: string;
  defaultVenue?: string;
};

export type NormalizedCandidate = {
  source_key: string;
  external_id: string;
  dedupe_key: string;
  event_name: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  event_series: string | null;
  type: string | null;
  status: string;
  lineup_details: string;
  event_url: string | null;
  original_source_url: string | null;
  source_label: string;
  source_url_type: SourceUrlType;
  canonical_source_url: string | null;
  maintenance_flags: string[];
  residents_pass: string | null;
  confidence: number;
  raw_candidate: Record<string, unknown>;
};

export type ExistingEvent = {
  id: string;
  notion_page_id: string;
  event_name: string;
  date: string | null;
  venue: string | null;
  event_series: string | null;
  lineup_details?: string | null;
  event_url?: string | null;
  source?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  fourvenues_event_id?: string | null;
};

export const DEFAULT_EVENT_SOURCES: EventSource[] = [
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

const ROOM_LABEL_PATTERN = /\b(?:Theatre|Club|Garden|Terrace|Main Room|The Bunker|Wild Comet|Room|Stage)\s*:\s*/gi;
const VERIFY_NOISE_PATTERN = /\s*\((?:verified|updated)\s+[^)]*\)/gi;
const AGENT_NOISE_PATTERN = /\b(?:agent run|run id|verified on|last verified)\s*[:#-]?\s*[\w:-]+/gi;

export const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const stripHtml = (value: string) =>
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

const decodeHtml = (value: string) =>
  stripHtml(value)
    .replace(/&euro;/g, "EUR")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

export const truncate = (value: string, length: number) => (value.length > length ? `${value.slice(0, length).trim()}...` : value);

export const sanitizeLineupDetails = (value: string | null | undefined, fallback: string) => {
  const cleaned = stripHtml(value || "")
    .replace(ROOM_LABEL_PATTERN, "")
    .replace(VERIFY_NOISE_PATTERN, "")
    .replace(AGENT_NOISE_PATTERN, "");
  return truncate(normalizeWhitespace(cleaned || fallback), 750);
};

export const dateOnlyFrom = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.match(/^\d{4}-\d{2}-\d{2}$/) ? value : null;
  return parsed.toISOString().slice(0, 10);
};

export const timeFrom = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(parsed);
};

export const stableHash = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeKeyPart = (value: string | null | undefined) =>
  normalizeWhitespace(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const buildDedupeKey = (candidate: Pick<NormalizedCandidate, "event_date" | "venue" | "event_series" | "event_name">) =>
  [candidate.event_date || "date-tbc", normalizeKeyPart(candidate.venue), normalizeKeyPart(candidate.event_series), normalizeKeyPart(candidate.event_name)]
    .filter(Boolean)
    .join("|");

export const buildAgentNotionPageId = (candidate: Pick<NormalizedCandidate, "source_key" | "external_id">) =>
  `agent:${candidate.source_key}:${candidate.external_id}`;

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

const TICKETING_DOMAINS = [
  "ra.co",
  "shotgun.live",
  "eventbrite.",
  "skiddle.com",
  "dice.fm",
  "ticketing",
  "tickets",
  "bacantix.com",
  "reservaentradas.com",
];

export const classifySourceUrl = (url: string | null | undefined, source?: Pick<EventSource, "kind"> | null): SourceUrlType => {
  if (!url) return "unknown";
  const normalized = url.toLowerCase();
  if (normalized.includes("channels-service.fourvenues.com")) return "fourvenues_channel";
  if (normalized.includes("fourvenues.com") || normalized.includes("fourvenues.site")) return "fourvenues_public";
  if (normalized.includes("ibiza-spotlight.com")) return "ibiza_spotlight";
  if (MUNICIPAL_DOMAINS.some((domain) => normalized.includes(domain))) return "municipal";
  if (TICKETING_DOMAINS.some((domain) => normalized.includes(domain))) return "ticketing_platform";
  if (normalized.includes("instagram.com") || normalized.includes("facebook.com") || normalized.includes("x.com") || normalized.includes("twitter.com")) {
    return "social";
  }
  if (OFFICIAL_VENUE_DOMAINS.some((domain) => normalized.includes(domain))) return "official_venue";
  if (source?.kind === "venue") return "official_venue";
  if (source?.kind === "municipal") return "municipal";
  if (source?.kind === "platform") return "ticketing_platform";
  if (source?.kind === "spotlight") return "ibiza_spotlight";
  return "unknown";
};

const isGenericEventUrl = (url: string | null | undefined) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /\/(events|calendar|agenda)\/?$/i.test(parsed.pathname) || /ibiza-spotlight\.com$/i.test(parsed.hostname) && /\/(night\/events|events)\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
};

export const buildMaintenanceFlags = (candidate: Pick<NormalizedCandidate, "event_url" | "lineup_details">) => {
  const flags: string[] = [];
  if (!candidate.event_url) flags.push("missing_event_url");
  if (!candidate.lineup_details || !candidate.lineup_details.trim()) flags.push("missing_lineup_details");
  if (isGenericEventUrl(candidate.event_url)) flags.push("generic_event_url");
  return flags;
};

const enrichCandidateSourceMetadata = <T extends Omit<NormalizedCandidate, "source_url_type" | "canonical_source_url" | "maintenance_flags">>(
  candidate: T,
  source: EventSource,
): NormalizedCandidate => {
  const sourceUrlType = classifySourceUrl(candidate.event_url, source);
  const maintenanceFlags = buildMaintenanceFlags(candidate);
  return {
    ...candidate,
    source_url_type: sourceUrlType,
    canonical_source_url: maintenanceFlags.includes("generic_event_url") ? null : candidate.event_url,
    maintenance_flags: maintenanceFlags,
  };
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
  const graph = getJsonLdObjects(object["@graph"]);
  return [...own, ...graph];
};

const isEventInWindow = (date: string | null, startDate?: string | null, endDate?: string | null) => {
  if (!date) return true;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

export const extractJsonLdCandidates = (
  html: string,
  source: EventSource,
  windowStart?: string | null,
  windowEnd?: string | null,
): NormalizedCandidate[] => {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const candidates: NormalizedCandidate[] = [];

  for (const match of scripts) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      for (const event of getJsonLdObjects(parsed)) {
        const name = getJsonText(event.name);
        if (!name) continue;

        const startDate = getJsonText(event.startDate);
        const endDate = getJsonText(event.endDate);
        const eventDate = dateOnlyFrom(startDate);
        if (!isEventInWindow(eventDate, windowStart, windowEnd)) continue;

        const location = event.location && typeof event.location === "object" ? (event.location as Record<string, unknown>) : null;
        const venue = getJsonName(location ?? event.location) || source.defaultVenue || null;
        const description = getJsonText(event.description);
        const performers = getJsonNames(event.performer);
        const eventUrl = absoluteUrl(getJsonUrl(event.url), source);
        const lineupDetails = sanitizeLineupDetails(performers.length ? performers.join(", ") : description, `${name}${venue ? ` at ${venue}` : ""}`);
        const rawCandidate = { ...event, source_url: source.url };
        const externalSeed = `${eventUrl}|${name}|${eventDate ?? ""}|${venue ?? ""}`;

        const candidate = enrichCandidateSourceMetadata({
          source_key: source.key,
          external_id: stableHash(externalSeed),
          dedupe_key: "",
          event_name: truncate(stripHtml(name), 180),
          event_date: eventDate,
          start_time: timeFrom(startDate),
          end_time: timeFrom(endDate),
          venue: venue ? truncate(stripHtml(venue), 160) : null,
          event_series: null,
          type: source.defaultType,
          status: "Confirmed",
          lineup_details: lineupDetails,
          event_url: eventUrl,
          original_source_url: source.url === eventUrl ? null : source.url,
          source_label: source.sourceLabel,
          residents_pass: null,
          confidence: eventDate ? 0.82 : 0.62,
          raw_candidate: rawCandidate,
        }, source);
        candidate.dedupe_key = buildDedupeKey(candidate);
        candidates.push(candidate);
      }
    } catch {
      continue;
    }
  }

  if (source.key === "pacha-events") {
    candidates.push(...extractPachaInitialEventsCandidates(html, source, windowStart, windowEnd));
  }

  if (source.key === "spotlight-party-calendar") {
    candidates.push(...extractSpotlightPartyCalendarCandidates(html, source, windowStart, windowEnd));
  }

  return candidates;
};

const decodeEmbeddedJsonText = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&");

const extractJsonArrayAfterKey = (value: string, key: string): unknown[] => {
  const keyIndex = value.indexOf(key);
  if (keyIndex < 0) return [];
  const start = value.indexOf("[", keyIndex);
  if (start < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') inString = true;
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(value.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
};

const extractPachaInitialEventsCandidates = (
  html: string,
  source: EventSource,
  windowStart?: string | null,
  windowEnd?: string | null,
): NormalizedCandidate[] => {
  const decoded = decodeEmbeddedJsonText(html);
  const events = extractJsonArrayAfterKey(decoded, '"initialEvents":') as Record<string, unknown>[];

  return events.flatMap((event) => {
    const name = getJsonText(event.name);
    const eventDate = dateOnlyFrom(event.start_date);
    if (!name || !isEventInWindow(eventDate, windowStart, windowEnd)) return [];

    const location = event.location && typeof event.location === "object" ? (event.location as Record<string, unknown>) : null;
    const venue = getJsonName(location) || source.defaultVenue || null;
    const artists = getJsonNames(event.artists);
    const eventUrl = typeof event.slug === "string" ? `https://pacha.com/event/${event.slug}` : source.url;
    const lineupDetails = sanitizeLineupDetails(artists.length ? artists.join(", ") : getJsonText(event.description), `${name}${venue ? ` at ${venue}` : ""}`);
    const externalId = getJsonText(event.event_id) || stableHash(`${eventUrl}|${name}|${eventDate ?? ""}`);

    const candidate = enrichCandidateSourceMetadata({
      source_key: source.key,
      external_id: externalId,
      dedupe_key: "",
      event_name: truncate(stripHtml(name), 180),
      event_date: eventDate,
      start_time: timeFrom(event.start_date),
      end_time: timeFrom(event.end_date),
      venue,
      event_series: truncate(stripHtml(name), 180),
      type: source.defaultType,
      status: "Confirmed",
      lineup_details: lineupDetails,
      event_url: eventUrl,
      original_source_url: source.url,
      source_label: source.sourceLabel,
      residents_pass: "Pacha Group Pass",
      confidence: eventDate ? 0.9 : 0.65,
      raw_candidate: { ...event, source_url: source.url },
    }, source);
    candidate.dedupe_key = buildDedupeKey(candidate);
    return [candidate];
  });
};

const extractSpotlightPartyCalendarCandidates = (
  html: string,
  source: EventSource,
  windowStart?: string | null,
  windowEnd?: string | null,
): NormalizedCandidate[] => {
  const rows = html.match(/<div class="partyCal-row[\s\S]*?(?=<!-- PartyCal Row -->|<!-- spotlight-date-page -->|$)/g) ?? [];

  return rows.flatMap((row) => {
    const venueMatch = row.match(/<li class="partyCal-venue-logo">[\s\S]*?<img[^>]+alt="([^"]+)"[\s\S]*?<\/li>/i)
      ?? row.match(/<div class="partyCal-venue[^"]*">[\s\S]*?<span>\s*([^<]+)</i);
    const venue = venueMatch ? decodeHtml(venueMatch[1]) : source.defaultVenue ?? null;
    const cards = row.match(/<div class="card-ticket partyCal-ticket"[\s\S]*?(?=<\/div><!-- \/END of Card ticket -->)/g) ?? [];

    return cards.flatMap((card) => {
      const id = card.match(/data-eventid="([^"]+)"/i)?.[1] ?? null;
      const titleMatch = card.match(/<h3 class="h3"><a href="([^"]+)"[^>]*data-eventdate="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/i);
      if (!id || !titleMatch) return [];

      const eventUrl = absoluteUrl(titleMatch[1], source);
      const eventDate = dateOnlyFrom(titleMatch[2]);
      if (!isEventInWindow(eventDate, windowStart, windowEnd)) return [];

      const timeMatch = card.match(/<time>\s*([0-9]{1,2}:[0-9]{2})(?:\s*<span class="closing">\s*-\s*([0-9]{1,2}:[0-9]{2})<\/span>)?/i);
      const djs = [...card.matchAll(/<div class="partyDj">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>/gi)]
        .map((match) => decodeHtml(match[1]))
        .filter(Boolean);
      const name = decodeHtml(titleMatch[3]);
      const lineupDetails = sanitizeLineupDetails(djs.join(", "), `${name}${venue ? ` at ${venue}` : ""}`);

      const candidate = enrichCandidateSourceMetadata({
        source_key: source.key,
        external_id: id,
        dedupe_key: "",
        event_name: truncate(name, 180),
        event_date: eventDate,
        start_time: timeMatch?.[1] ?? null,
        end_time: timeMatch?.[2] ?? null,
        venue: venue ? truncate(venue, 160) : null,
        event_series: truncate(name, 180),
        type: source.defaultType,
        status: "Confirmed",
        lineup_details: lineupDetails,
        event_url: eventUrl,
        original_source_url: source.url,
        source_label: source.sourceLabel,
        residents_pass: null,
        confidence: eventDate ? 0.84 : 0.62,
        raw_candidate: { event_id: id, source_url: source.url },
      }, source);
      candidate.dedupe_key = buildDedupeKey(candidate);
      return [candidate];
    });
  });
};

const tokenSet = (value: string) =>
  new Set(
    normalizeKeyPart(value)
      .split("-")
      .filter((token) => token.length > 2),
  );

const overlapScore = (left: string, right: string) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

export const findExistingEventMatch = (candidate: NormalizedCandidate, existingEvents: ExistingEvent[]) => {
  if (!candidate.event_date) return null;

  return (
    existingEvents.find((event) => {
      if (event.date !== candidate.event_date) return false;
      const sameVenue = normalizeKeyPart(event.venue) && normalizeKeyPart(event.venue) === normalizeKeyPart(candidate.venue);
      const sameSeries =
        normalizeKeyPart(event.event_series) &&
        normalizeKeyPart(event.event_series) === normalizeKeyPart(candidate.event_series);
      if (sameVenue && sameSeries) return true;
      if (normalizeKeyPart(event.event_name) === normalizeKeyPart(candidate.event_name)) return true;
      const titleOverlap = overlapScore(event.event_name, candidate.event_name);
      if (sameVenue && titleOverlap >= 0.3) return true;
      return titleOverlap >= 0.65;
    }) ?? null
  );
};

export const reviewStatusForCandidate = (candidate: NormalizedCandidate, existingEvent: ExistingEvent | null) => {
  if (existingEvent) return "duplicate";
  return candidate.confidence >= 0.8 && Boolean(candidate.event_date) ? "auto_safe" : "needs_review";
};

export const buildIbizaEventInsert = (candidate: NormalizedCandidate) => ({
  notion_page_id: buildAgentNotionPageId(candidate),
  event_name: candidate.event_name,
  date: candidate.event_date,
  start_time: candidate.start_time,
  end_time: candidate.end_time,
  venue: candidate.venue,
  event_series: candidate.event_series,
  type: candidate.type,
  lineup_details: candidate.lineup_details,
  status: candidate.status,
  event_url: candidate.event_url,
  source: candidate.source_label,
  notes: candidate.original_source_url ? `Original source: ${candidate.original_source_url}` : null,
  residents_pass: candidate.residents_pass,
  last_synced_at: new Date().toISOString(),
});

export const buildEventSourceLink = (
  candidate: NormalizedCandidate,
  eventId: string | null,
  candidateId: string | null,
  snapshotId: string | null,
) => {
  const sourceUrl = candidate.canonical_source_url || candidate.event_url || candidate.original_source_url;
  if (!sourceUrl) return null;

  return {
    event_id: eventId,
    candidate_id: candidateId,
    snapshot_id: snapshotId,
    source_url: sourceUrl,
    source_type: candidate.source_url_type,
    source_key: candidate.source_key,
    source_label: candidate.source_label,
    canonical_for_updates: Boolean(candidate.canonical_source_url),
    monetizable: candidate.source_url_type === "fourvenues_public" || candidate.source_url_type === "fourvenues_channel",
    confidence: candidate.confidence,
    last_checked_at: new Date().toISOString(),
    status: candidate.maintenance_flags.length ? "needs_review" : "active",
    raw_metadata: {
      external_id: candidate.external_id,
      event_url: candidate.event_url,
      original_source_url: candidate.original_source_url,
      maintenance_flags: candidate.maintenance_flags,
    },
  };
};

export const buildSafeExistingEventPatch = (candidate: NormalizedCandidate, existing: ExistingEvent) => {
  if (existing.fourvenues_event_id || existing.notion_page_id.startsWith("fourvenues:")) return {};

  const patch: Record<string, string | null> = {};
  if (!existing.lineup_details && candidate.lineup_details) patch.lineup_details = candidate.lineup_details;
  if (!existing.event_url && candidate.event_url) patch.event_url = candidate.event_url;
  if (!existing.source && candidate.source_label) patch.source = candidate.source_label;
  if (!existing.start_time && candidate.start_time) patch.start_time = candidate.start_time;
  if (!existing.end_time && candidate.end_time) patch.end_time = candidate.end_time;
  if (Object.keys(patch).length > 0) patch.last_synced_at = new Date().toISOString();
  return patch;
};
