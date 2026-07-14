export type SignalCategory =
  | "local_breaking_news"
  | "government_municipal"
  | "weather_alert_chatter"
  | "events_lineup_changes"
  | "transport_public_safety"
  | "tourism_community"
  | "source_hint";

export type SourceResolutionStatus =
  | "unresolved"
  | "official_resolved"
  | "owner_resolved"
  | "publisher_original"
  | "review_required"
  | "conflict";

export type ResolutionSignal = {
  id: string;
  title: string;
  summary: string;
  category: SignalCategory;
  source_url: string;
  source_domain: string;
  source_timestamp: string | null;
  source_kind: string;
  source_score: number;
  verification_status: string;
  duplicate_of?: string | null;
  raw_metadata?: Record<string, unknown> | null;
  source_key: string;
  source_label: string;
  canonical_eligible: boolean;
  allow_publisher_original: boolean;
  require_local_signal: boolean;
  require_primary_resolution: boolean;
  public_link_policy: "primary_only" | "publisher_allowed" | "never";
  content_deny_patterns?: string[];
};

export type PrimaryEvidenceCandidate = {
  id: string;
  title: string;
  summary: string;
  category: SignalCategory;
  source_url: string;
  source_domain: string;
  source_timestamp: string | null;
  source_kind: "official_source" | "official_account" | "owner_source";
  source_key: string;
  source_label: string;
  raw_metadata?: Record<string, unknown> | null;
};

export type EventEvidenceCandidate = {
  id: string;
  event_name: string;
  event_date: string | null;
  venue: string | null;
  source_url: string;
  source_label: string;
  source_kind: "owner_source" | "official_source";
};

export type ResolutionDecision = {
  signalItemId: string;
  targetType: "news_review" | "event_review" | "manual_review";
  linkStatus: "confirmed" | "suggested" | "rejected";
  resolutionStatus: SourceResolutionStatus;
  confidence: number;
  canonicalUrl: string | null;
  canonicalLabel: string | null;
  canonicalDomain: string | null;
  canonicalKind: "official_source" | "owner_source" | "publisher_original" | null;
  matchedEvidenceId: string | null;
  reason: string;
  incidentFingerprint: string;
};

const STOP_WORDS = new Set([
  "a", "al", "and", "at", "de", "del", "el", "els", "en", "for", "from", "in", "la", "las", "les",
  "los", "of", "on", "per", "por", "que", "sa", "ses", "the", "to", "un", "una", "with", "y",
  "ibiza", "eivissa", "formentera", "pitiusas", "balears", "balearic",
]);

const MUNICIPALITY_RULES: Array<[string, RegExp]> = [
  ["eivissa", /\b(eivissa|ibiza town|vila)\b/i],
  ["santa-eularia-des-riu", /\b(santa eul[aà]ria(?: des riu)?|santa eulalia|es canar|cala llonga|jes[uú]s)\b/i],
  ["sant-antoni-de-portmany", /\b(sant antoni(?: de portmany)?|san antonio|cal[oó] des moro|cala salada)\b/i],
  ["sant-josep-de-sa-talaia", /\b(sant josep(?: de sa talaia)?|san jos[eé].*ibiza|cala de bou|cala tarida|cala vedella|es cubells|platja d'en bossa)\b/i],
  ["sant-joan-de-labritja", /\b(sant joan(?: de labritja)?|san juan.*ibiza|portinatx|sant miquel|cala sant vicent)\b/i],
  ["formentera", /\b(formentera|la savina|sant francesc|es pujols|el pilar de la mola)\b/i],
];

const EVENT_PATTERN = /\b(event|evento|agenda|festival|concert|concierto|party|fiesta|lineup|cartel|tickets?|entradas?|residency|opening party|closing party|show|actuaci[oó]n|exhibition|exposici[oó]n)\b/i;
const OPENING_OR_ANNOUNCEMENT_PATTERN = /\b(opening|opens?|inaugura|apertura|announces?|anuncia|launches?|presenta|programme|programa|schedule|horario)\b/i;

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const domainForUrl = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const tokens = (value: string) => new Set(
  normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
);

const intersectionSize = (left: Set<string>, right: Set<string>) => {
  let matches = 0;
  for (const value of left) if (right.has(value)) matches += 1;
  return matches;
};

const jaccard = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
};

const overlapCoefficient = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) return 0;
  return intersectionSize(left, right) / Math.min(left.size, right.size);
};

const dateDistanceDays = (left: string | null, right: string | null) => {
  if (!left || !right) return null;
  const leftValue = Date.parse(left);
  const rightValue = Date.parse(right);
  if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) return null;
  return Math.abs(leftValue - rightValue) / 86_400_000;
};

const meaningfulQuantities = (value: string) => {
  const numberWords: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
    eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
    uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
    once: "11", doce: "12", trece: "13", catorce: "14", quince: "15", dieciseis: "16", diecisiete: "17", dieciocho: "18", diecinueve: "19", veinte: "20",
  };
  const normalizedWords = normalize(value).replace(/\b[a-z]+\b/g, (word) => numberWords[word] || word);
  const cleaned = normalizedWords
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ");
  return new Set(
    (cleaned.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [])
      .map((number) => Number(number.replace(",", ".")))
      .filter((number) => Number.isFinite(number) && !(number >= 1900 && number <= 2100)),
  );
};

export const hasEvidenceQuantityConflict = (left: string, right: string) => {
  const leftValues = meaningfulQuantities(left);
  const rightValues = meaningfulQuantities(right);
  if (leftValues.size === 0 || rightValues.size === 0) return false;
  return [...leftValues].every((value) => !rightValues.has(value));
};

const municipalityKeys = (value: string) => MUNICIPALITY_RULES
  .filter(([, pattern]) => pattern.test(value))
  .map(([key]) => key);

const hasIbizaLocalSignal = (value: string) =>
  municipalityKeys(value).length > 0 || /\b(ibiza|eivissa|formentera|pitiusas|pitiuses)\b/i.test(value);

const categoryFamily = (category: SignalCategory) => {
  if (category === "events_lineup_changes" || category === "tourism_community") return "community";
  if (category === "local_breaking_news" || category === "transport_public_safety") return "incident";
  return category;
};

export const buildIncidentFingerprint = (signal: Pick<ResolutionSignal, "title" | "summary" | "category" | "source_timestamp">) => {
  const combined = `${signal.title} ${signal.summary}`;
  const municipality = municipalityKeys(combined).sort().join(",") || "ibiza-wide";
  const day = signal.source_timestamp?.slice(0, 10) || "unknown-date";
  const coreTokens = [...tokens(combined)].sort().slice(0, 12).join("-");
  return `${categoryFamily(signal.category)}|${day}|${municipality}|${coreTokens}`;
};

export const scoreIncidentSimilarity = (
  left: Pick<ResolutionSignal, "title" | "summary" | "category" | "source_timestamp">,
  right: Pick<ResolutionSignal, "title" | "summary" | "category" | "source_timestamp">,
) => {
  if (categoryFamily(left.category) !== categoryFamily(right.category)) return 0;
  const distance = dateDistanceDays(left.source_timestamp, right.source_timestamp);
  if (distance !== null && distance > 2.5) return 0;

  const leftMunicipalities = new Set(municipalityKeys(`${left.title} ${left.summary}`));
  const rightMunicipalities = new Set(municipalityKeys(`${right.title} ${right.summary}`));
  if (
    leftMunicipalities.size > 0 &&
    rightMunicipalities.size > 0 &&
    intersectionSize(leftMunicipalities, rightMunicipalities) === 0
  ) return 0;

  let score = Math.round(jaccard(tokens(`${left.title} ${left.summary}`), tokens(`${right.title} ${right.summary}`)) * 70);
  if (intersectionSize(leftMunicipalities, rightMunicipalities) > 0) score += 20;
  if (distance === null || distance <= 1.5) score += 10;
  return Math.min(100, score);
};

export const isEventSignal = (signal: Pick<ResolutionSignal, "title" | "summary" | "category">) => {
  if (signal.category === "events_lineup_changes") return true;
  return EVENT_PATTERN.test(`${signal.title} ${signal.summary}`);
};

export const requiresPrimaryEvidence = (signal: Pick<ResolutionSignal, "title" | "summary" | "category" | "require_primary_resolution">) => {
  if (signal.require_primary_resolution) return true;
  if (["government_municipal", "weather_alert_chatter", "events_lineup_changes"].includes(signal.category)) return true;
  if (signal.category === "tourism_community") return true;
  return OPENING_OR_ANNOUNCEMENT_PATTERN.test(`${signal.title} ${signal.summary}`);
};

export const scorePrimaryEvidence = (
  signal: Pick<ResolutionSignal, "title" | "summary" | "category" | "source_timestamp">,
  evidence: Pick<PrimaryEvidenceCandidate, "title" | "summary" | "category" | "source_timestamp">,
) => {
  const signalTitle = tokens(signal.title);
  const evidenceTitle = tokens(evidence.title);
  const signalAll = tokens(`${signal.title} ${signal.summary}`);
  const evidenceAll = tokens(`${evidence.title} ${evidence.summary}`);
  const signalMunicipalities = new Set(municipalityKeys(`${signal.title} ${signal.summary}`));
  const evidenceMunicipalities = new Set(municipalityKeys(`${evidence.title} ${evidence.summary}`));
  const dateDistance = dateDistanceDays(signal.source_timestamp, evidence.source_timestamp);

  let score = Math.round(
    jaccard(signalTitle, evidenceTitle) * 35 +
    overlapCoefficient(signalTitle, evidenceTitle) * 25 +
    jaccard(signalAll, evidenceAll) * 10,
  );
  if (categoryFamily(signal.category) === categoryFamily(evidence.category)) score += 10;
  if (signalMunicipalities.size > 0 && intersectionSize(signalMunicipalities, evidenceMunicipalities) > 0) score += 15;
  if (dateDistance !== null) {
    if (dateDistance <= 0.5) score += 15;
    else if (dateDistance <= 1.5) score += 10;
    else if (dateDistance <= 2.5) score += 5;
  }

  return {
    score: Math.min(100, score),
    conflict: hasEvidenceQuantityConflict(
      `${signal.title} ${signal.summary}`,
      `${evidence.title} ${evidence.summary}`,
    ),
  };
};

const scoreEventEvidence = (signal: ResolutionSignal, event: EventEvidenceCandidate) => {
  const signalTokens = tokens(`${signal.title} ${signal.summary}`);
  const eventTokens = tokens(`${event.event_name} ${event.venue || ""}`);
  const titleScore = Math.max(jaccard(signalTokens, eventTokens), overlapCoefficient(signalTokens, eventTokens));
  const distance = dateDistanceDays(signal.source_timestamp, event.event_date);
  let score = Math.round(titleScore * 80);
  if (distance !== null && distance <= 0.5) score += 20;
  else if (distance !== null && distance <= 2.5) score += 10;
  return Math.min(100, score);
};

const deniedBySourcePolicy = (signal: ResolutionSignal) => {
  const text = `${signal.title} ${signal.summary}`;
  return (signal.content_deny_patterns ?? []).some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(text);
    } catch {
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
  });
};

export const resolveSignal = (
  signal: ResolutionSignal,
  primaryCandidates: PrimaryEvidenceCandidate[],
  eventCandidates: EventEvidenceCandidate[],
): ResolutionDecision => {
  const incidentFingerprint = buildIncidentFingerprint(signal);
  const base = {
    signalItemId: signal.id,
    incidentFingerprint,
  };

  if (signal.duplicate_of || signal.source_kind === "duplicate_repost" || signal.verification_status === "rejected") {
    return {
      ...base,
      targetType: "manual_review",
      linkStatus: "rejected",
      resolutionStatus: "unresolved",
      confidence: 0,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: null,
      reason: "duplicate or rejected discovery signal",
    };
  }

  if (
    signal.require_local_signal &&
    !["official_source", "official_account", "owner_source"].includes(signal.source_kind) &&
    !hasIbizaLocalSignal(`${signal.title} ${signal.summary}`)
  ) {
    return {
      ...base,
      targetType: "manual_review",
      linkStatus: "rejected",
      resolutionStatus: "unresolved",
      confidence: 0,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: null,
      reason: "missing explicit Ibiza/Formentera locality signal",
    };
  }

  if (deniedBySourcePolicy(signal)) {
    return {
      ...base,
      targetType: "manual_review",
      linkStatus: "rejected",
      resolutionStatus: "unresolved",
      confidence: 0,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: null,
      reason: "source content deny pattern matched",
    };
  }

  const eventSignal = isEventSignal(signal);
  if (eventSignal) {
    const rankedEvents = eventCandidates
      .map((candidate) => ({ candidate, score: scoreEventEvidence(signal, candidate) }))
      .sort((left, right) => right.score - left.score);
    const best = rankedEvents[0];
    if (best && best.score >= 85) {
      return {
        ...base,
        targetType: "event_review",
        linkStatus: "confirmed",
        resolutionStatus: "owner_resolved",
        confidence: best.score,
        canonicalUrl: best.candidate.source_url,
        canonicalLabel: best.candidate.source_label,
        canonicalDomain: domainForUrl(best.candidate.source_url),
        canonicalKind: best.candidate.source_kind,
        matchedEvidenceId: best.candidate.id,
        reason: "matched an official event or owner source",
      };
    }
    return {
      ...base,
      targetType: "event_review",
      linkStatus: "suggested",
      resolutionStatus: "review_required",
      confidence: best?.score ?? 0,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: best?.candidate.id ?? null,
      reason: "event discovery requires an official venue or organizer source",
    };
  }

  if (["official_source", "official_account", "owner_source"].includes(signal.source_kind)) {
    return {
      ...base,
      targetType: "news_review",
      linkStatus: "confirmed",
      resolutionStatus: signal.source_kind === "owner_source" ? "owner_resolved" : "official_resolved",
      confidence: Math.max(90, signal.source_score),
      canonicalUrl: signal.source_url,
      canonicalLabel: signal.source_label,
      canonicalDomain: signal.source_domain,
      canonicalKind: signal.source_kind === "owner_source" ? "owner_source" : "official_source",
      matchedEvidenceId: signal.id,
      reason: "signal is already backed by an official or owner source",
    };
  }

  const ranked = primaryCandidates
    .map((candidate) => ({ candidate, ...scorePrimaryEvidence(signal, candidate) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];

  if (best && best.score >= 65 && best.conflict) {
    return {
      ...base,
      targetType: "manual_review",
      linkStatus: "suggested",
      resolutionStatus: "conflict",
      confidence: best.score,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: best.candidate.id,
      reason: "candidate primary source conflicts on quantities",
    };
  }

  if (best && best.score >= 85) {
    return {
      ...base,
      targetType: "news_review",
      linkStatus: "confirmed",
      resolutionStatus: "official_resolved",
      confidence: best.score,
      canonicalUrl: best.candidate.source_url,
      canonicalLabel: best.candidate.source_label,
      canonicalDomain: best.candidate.source_domain,
      canonicalKind: "official_source",
      matchedEvidenceId: best.candidate.id,
      reason: "matched a compatible official source",
    };
  }

  if (best && best.score >= 65) {
    return {
      ...base,
      targetType: "manual_review",
      linkStatus: "suggested",
      resolutionStatus: "review_required",
      confidence: best.score,
      canonicalUrl: null,
      canonicalLabel: null,
      canonicalDomain: null,
      canonicalKind: null,
      matchedEvidenceId: best.candidate.id,
      reason: "possible primary-source match requires review",
    };
  }

  if (
    signal.canonical_eligible &&
    signal.allow_publisher_original &&
    signal.public_link_policy === "publisher_allowed" &&
    !requiresPrimaryEvidence(signal)
  ) {
    return {
      ...base,
      targetType: "news_review",
      linkStatus: "confirmed",
      resolutionStatus: "publisher_original",
      confidence: Math.max(65, signal.source_score),
      canonicalUrl: signal.source_url,
      canonicalLabel: signal.source_label,
      canonicalDomain: signal.source_domain,
      canonicalKind: "publisher_original",
      matchedEvidenceId: signal.id,
      reason: "trusted publisher-original local reporting",
    };
  }

  return {
    ...base,
    targetType: requiresPrimaryEvidence(signal) ? "news_review" : "manual_review",
    linkStatus: "suggested",
    resolutionStatus: "review_required",
    confidence: best?.score ?? signal.source_score,
    canonicalUrl: null,
    canonicalLabel: null,
    canonicalDomain: null,
    canonicalKind: null,
    matchedEvidenceId: best?.candidate.id ?? null,
    reason: signal.public_link_policy === "never"
      ? "discovery-only source cannot be exposed publicly"
      : "no verified canonical source was resolved",
  };
};
