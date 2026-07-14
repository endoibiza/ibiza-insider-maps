import { describe, expect, it } from "vitest";
import {
  buildIncidentFingerprint,
  EventEvidenceCandidate,
  PrimaryEvidenceCandidate,
  ResolutionSignal,
  resolveSignal,
  scoreIncidentSimilarity,
  scorePrimaryEvidence,
} from "../../supabase/functions/resolve-ibiza-signals/resolution";

const signal = (overrides: Partial<ResolutionSignal> = {}): ResolutionSignal => ({
  id: "signal-1",
  title: "Police investigate a fire in Sant Josep de sa Talaia",
  summary: "The fire affected a business in Cala de Bou on Monday morning.",
  category: "transport_public_safety",
  source_url: "https://publisher.example/ibiza/fire-sant-josep",
  source_domain: "publisher.example",
  source_timestamp: "2026-07-14T08:00:00Z",
  source_kind: "verified_media",
  source_score: 76,
  verification_status: "source_backed",
  source_key: "publisher-rss",
  source_label: "Local Publisher",
  canonical_eligible: true,
  allow_publisher_original: true,
  require_local_signal: true,
  require_primary_resolution: false,
  public_link_policy: "publisher_allowed",
  content_deny_patterns: [],
  ...overrides,
});

const official = (overrides: Partial<PrimaryEvidenceCandidate> = {}): PrimaryEvidenceCandidate => ({
  id: "official-1",
  title: "Emergency services respond to a fire in Cala de Bou",
  summary: "Police and firefighters attended a business fire in Sant Josep de sa Talaia on Monday morning.",
  category: "transport_public_safety",
  source_url: "https://www.santjosep.org/noticia/incendi-cala-de-bou",
  source_domain: "santjosep.org",
  source_timestamp: "2026-07-14T08:30:00Z",
  source_kind: "official_source",
  source_key: "sant-josep-news",
  source_label: "Ajuntament de Sant Josep de sa Talaia",
  ...overrides,
});

describe("primary-source resolution", () => {
  it("keeps Ibiza Spotlight private when no official event source is found", () => {
    const decision = resolveSignal(signal({
      source_key: "ibiza-spotlight-party-calendar",
      source_label: "Ibiza Spotlight",
      source_url: "https://www.ibiza-spotlight.com/night/events/example",
      source_domain: "ibiza-spotlight.com",
      title: "Example Ibiza opening party announced",
      summary: "Tickets and lineup announced for an Ibiza club opening party.",
      category: "events_lineup_changes",
      public_link_policy: "never",
      canonical_eligible: false,
      allow_publisher_original: false,
      require_primary_resolution: true,
    }), [], []);

    expect(decision.targetType).toBe("event_review");
    expect(decision.linkStatus).toBe("suggested");
    expect(decision.canonicalUrl).toBeNull();
    expect(decision.resolutionStatus).toBe("review_required");
  });

  it("routes a Spotlight event discovery to the official venue source", () => {
    const event: EventEvidenceCandidate = {
      id: "event-source-1",
      event_name: "Example Ibiza Opening Party",
      event_date: "2026-07-14",
      venue: "Example Ibiza Club",
      source_url: "https://exampleclub.com/events/opening-party",
      source_label: "Example Ibiza Club",
      source_kind: "owner_source",
    };
    const decision = resolveSignal(signal({
      source_key: "ibiza-spotlight-party-calendar",
      source_label: "Ibiza Spotlight",
      source_url: "https://www.ibiza-spotlight.com/night/events/example",
      source_domain: "ibiza-spotlight.com",
      title: "Example Ibiza Club opening party",
      summary: "The Example Ibiza Opening Party takes place on 14 July.",
      category: "events_lineup_changes",
      public_link_policy: "never",
      canonical_eligible: false,
      allow_publisher_original: false,
      require_primary_resolution: true,
    }), [], [event]);

    expect(decision.linkStatus).toBe("confirmed");
    expect(decision.canonicalUrl).toBe(event.source_url);
    expect(decision.canonicalKind).toBe("owner_source");
  });

  it("prefers a high-confidence official source over a publisher URL", () => {
    const closeOfficial = official({
      title: "Police investigate a fire at a business in Sant Josep de sa Talaia",
      summary: "The fire affected a business in Cala de Bou on Monday morning.",
    });
    const decision = resolveSignal(signal(), [closeOfficial], []);

    expect(decision.resolutionStatus).toBe("official_resolved");
    expect(decision.canonicalUrl).toBe(closeOfficial.source_url);
    expect(decision.confidence).toBeGreaterThanOrEqual(85);
  });

  it("allows trusted publisher-original incident reporting when no primary page exists", () => {
    const decision = resolveSignal(signal(), [], []);

    expect(decision.resolutionStatus).toBe("publisher_original");
    expect(decision.canonicalUrl).toBe("https://publisher.example/ibiza/fire-sant-josep");
  });

  it("does not treat a Radio Illa WordPress footer as an event", () => {
    const decision = resolveSignal(signal({
      source_key: "radio-illa-actualitat-rss",
      source_label: "Ràdio Illa Formentera",
      source_url: "https://www.radioillaformentera.cat/migrants-desapareguts/",
      source_domain: "radioillaformentera.cat",
      local_source_scope: true,
      title: "Conclou la recerca dels migrants desapareguts al sud de Formentera",
      summary: "La recerca va finalitzar sense èxit. La entrada Conclou la recerca se publicó primero en RadioIlla Notícies Formentera.",
      category: "transport_public_safety",
    }), [], []);

    expect(decision.targetType).toBe("news_review");
    expect(decision.resolutionStatus).toBe("publisher_original");
    expect(decision.canonicalUrl).toContain("radioillaformentera.cat");
  });

  it("holds a Catalan institutional launch until primary evidence is resolved", () => {
    const decision = resolveSignal(signal({
      source_key: "radio-illa-actualitat-rss",
      source_label: "Ràdio Illa Formentera",
      source_url: "https://www.radioillaformentera.cat/ieb-llanca-iniciativa/",
      source_domain: "radioillaformentera.cat",
      local_source_scope: true,
      title: "L'IEB llança una iniciativa per fomentar l'ús social del català",
      summary: "L'Institut d'Estudis Baleàrics presenta el nou projecte.",
      category: "local_breaking_news",
    }), [], []);

    expect(decision.linkStatus).toBe("suggested");
    expect(decision.resolutionStatus).toBe("review_required");
    expect(decision.canonicalUrl).toBeNull();
  });

  it("does not publish a government announcement without primary evidence", () => {
    const decision = resolveSignal(signal({
      title: "Council announces new housing programme in Eivissa",
      summary: "The municipal programme will open applications next month.",
      category: "government_municipal",
    }), [], []);

    expect(decision.linkStatus).toBe("suggested");
    expect(decision.resolutionStatus).toBe("review_required");
    expect(decision.canonicalUrl).toBeNull();
  });

  it("flags incompatible quantities instead of selecting the primary candidate", () => {
    const discovery = signal({
      title: "14 migrants intercepted near Formentera",
      summary: "Fourteen people were intercepted near Formentera.",
    });
    const evidence = official({
      title: "Seven migrants intercepted near Formentera",
      summary: "Seven people arrived near es Caló in Formentera.",
      source_timestamp: discovery.source_timestamp,
    });
    const score = scorePrimaryEvidence(discovery, evidence);
    expect(score.conflict).toBe(true);

    const decision = resolveSignal(discovery, [evidence], []);
    expect(decision.resolutionStatus).toBe("conflict");
    expect(decision.canonicalUrl).toBeNull();
  });

  it("rejects configured obituary and programme-feed patterns", () => {
    const decision = resolveSignal(signal({
      title: "Esquela de un vecino de Ibiza",
      summary: "Obituario publicado hoy.",
      content_deny_patterns: ["esquela", "obituario"],
    }), [], []);

    expect(decision.linkStatus).toBe("rejected");
    expect(decision.reason).toContain("deny pattern");
  });

  it("rejects Balearic-wide feed items without an Ibiza or Formentera signal", () => {
    const decision = resolveSignal(signal({
      source_key: "majorca-daily-bulletin-atom",
      title: "Palma council approves new transport rules",
      summary: "The changes apply to bus services across Mallorca.",
      source_url: "https://majorcadailybulletin.com/mallorca/palma/transport-rules.html",
      source_domain: "majorcadailybulletin.com",
    }), [], []);

    expect(decision.linkStatus).toBe("rejected");
    expect(decision.reason).toContain("locality");
  });
});

describe("incident matching", () => {
  it("creates a stable evidence fingerprint and recognizes differently worded reports", () => {
    const first = signal();
    const second = signal({
      title: "Firefighters tackle Cala de Bou business blaze",
      summary: "Emergency crews and police responded to a Monday morning fire at a Sant Josep business.",
      source_url: "https://other.example/cala-de-bou-fire",
    });

    expect(buildIncidentFingerprint(first)).toContain("sant-josep-de-sa-talaia");
    expect(scoreIncidentSimilarity(first, second)).toBeGreaterThanOrEqual(58);
  });
});
