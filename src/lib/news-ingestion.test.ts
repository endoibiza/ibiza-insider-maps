import { describe, expect, it } from "vitest";
import {
  classifyCandidate,
  extractFeedCandidates,
  isDirectSourceUrl,
  shouldPublishCandidate,
  type NewsSourceConfig,
  type RawNewsCandidate,
} from "../../supabase/functions/collect-ibiza-news/ingestion";

const rssSource: NewsSourceConfig = {
  source_key: "diario-general-rss",
  source_name: "Diario de Ibiza RSS",
  source_type: "rss",
  source_url: "https://www.diariodeibiza.es/rss/",
  default_language: "es",
  publish_mode: "auto",
};

describe("Ibiza news ingestion helpers", () => {
  it("extracts direct RSS candidates without storing article bodies", () => {
    const candidates = extractFeedCandidates(
      `
      <rss><channel>
        <item>
          <title>Santa Eulària aprueba nuevas mejoras de transporte</title>
          <link>https://www.diariodeibiza.es/ibiza/2026/06/27/santa-eularia-transporte-123.html?utm_source=test</link>
          <pubDate>Sat, 27 Jun 2026 08:30:00 +0200</pubDate>
          <description><![CDATA[El ayuntamiento anuncia cambios para mejorar las conexiones.]]></description>
        </item>
      </channel></rss>
      `,
      rssSource,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonical_url).toBe("https://www.diariodeibiza.es/ibiza/2026/06/27/santa-eularia-transporte-123.html");
    expect(candidates[0].source_description).toContain("mejorar las conexiones");
  });

  it("classifies Santa Eulària transport stories and allows fresh direct-source publishing", () => {
    const [candidate] = extractFeedCandidates(
      `
      <rss><channel>
        <item>
          <title>Santa Eulària improves bus connections this summer</title>
          <link>https://www.diariodeibiza.es/ibiza/2026/06/27/santa-eularia-bus-456.html</link>
          <pubDate>Sat, 27 Jun 2026 08:30:00 +0200</pubDate>
          <description>New transport changes affect visitors and residents.</description>
        </item>
      </channel></rss>
      `,
      rssSource,
    );

    const classified = classifyCandidate(candidate, rssSource);

    expect(classified.area).toContain("Santa Eulària");
    expect(classified.category).toBe("Transport");
    expect(classified.digest_section).toBe("santa_eularia");
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({ publishable: true });
  });

  it("rejects homepage and feed URLs as public evidence", () => {
    expect(isDirectSourceUrl("https://www.diariodeibiza.es")).toBe(false);
    expect(isDirectSourceUrl("https://lavozdeibiza.com/feed/")).toBe(false);
    expect(isDirectSourceUrl("https://lavozdeibiza.com/ibiza/santa-eularia-opens-new-office/")).toBe(true);
  });

  it("does not publish candidates without a fresh direct source URL", () => {
    const raw: RawNewsCandidate = {
      source_key: "lavoz-general-rss",
      source_name: "La Voz de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://lavozdeibiza.com/feed/",
      canonical_url: "https://lavozdeibiza.com/",
      headline: "Ibiza government announces a new public safety plan",
      source_description: "The plan was announced by officials.",
      published_at: "2026-06-27T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, {
      source_key: "lavoz-general-rss",
      source_name: "La Voz de Ibiza RSS",
      source_type: "rss",
      source_url: "https://lavozdeibiza.com/feed/",
      default_language: "es",
      publish_mode: "auto",
    });

    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({
      publishable: false,
      reason: "missing direct source URL",
    });
  });

  it("does not publish non-local general-feed stories from Ibiza-branded domains", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/deportes/2026/06/26/noruega-francia-mundial-2026.html",
      headline: "Dembélé sella el liderato ante una Noruega que tiró la toalla antes del partido",
      source_description: "Resumen del partido internacional.",
      published_at: "2026-06-26T20:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("does not publish national government stories from general feeds without local signal", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/nacional/2026/06/27/gobierno-prorrogara-ayudas-anticrisis-combustibles-131870832.html",
      headline: "Government to extend anti-crisis aid for fuels and electrification, approve macroeconomic framework",
      source_description: "El Consejo de Ministros prevé prorrogar este lunes el decreto anticrisis para hacer frente a consecuencias internacionales.",
      published_at: "2026-06-27T10:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.category).toBe("Government");
    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("does not publish broad society safety stories from general feeds without local signal", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/sociedad/2026/06/27/zambullidas-causan-60-lesiones-medulares-131870945.html",
      headline: "Diving causes up to 60 spinal cord injuries annually in Spain",
      source_description: "Accidentes en el agua causan lesiones medulares traumáticas cada verano en España.",
      published_at: "2026-06-27T09:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.category).not.toBe("Other");
    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("does not publish obituary items from general feeds without local signal", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/esquelas/2026/06/27/nota-maria-jose-buforn-jimenez-131861557.html",
      headline: "Nota María José Buforn Jiménez",
      source_description: null,
      published_at: "2026-06-27T07:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({
      publishable: false,
      reason: "obituary notices are not public news",
    });
  });

  it("allows explicitly local source scopes even when the headline is generic", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera — Ibiza",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/ibiza/2026/06/27/2659999/nueva-formacion-profesional.html",
      headline: "Nueva jornada de formación profesional",
      source_description: "El programa se celebra esta semana con apoyo municipal.",
      published_at: "2026-06-27T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera — Ibiza",
      source_type: "atom",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      default_language: "es",
      publish_mode: "auto",
      source_scope: "local",
    });

    expect(classified.ibiza_maps_relevant).toBe(true);
    expect(shouldPublishCandidate(classified, "2026-06-27")).toEqual({ publishable: true });
  });

  it("does not infer Formentera area from source labels", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera — Ibiza",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/ibiza/2026/06/26/sant-antoni-socorristas.html",
      headline: "Socorristas de Sant Antoni alertan de riesgo en playas",
      source_description: "Los socorristas anuncian una huelga por incumplimiento del convenio.",
      published_at: "2026-06-26T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera — Ibiza",
      source_type: "atom",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      default_language: "es",
      publish_mode: "auto",
    });

    expect(classified.area).toEqual(["San Antonio"]);
  });
});
