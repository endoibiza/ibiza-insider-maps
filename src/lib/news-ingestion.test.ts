import { describe, expect, it } from "vitest";
import {
  canonicalAreaKeys,
  calculateCurationScore,
  classifyCandidate,
  extractFeedCandidates,
  isDirectSourceUrl,
  normalizePublicSourceLabel,
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
  it("emits stable canonical area keys for official and legacy municipality labels", () => {
    expect(canonicalAreaKeys(["Ibiza Town", "Sant Antoni de Portmany", "Formentera"])).toEqual([
      "eivissa",
      "sant-antoni-de-portmany",
      "formentera",
    ]);
    expect(canonicalAreaKeys(["Santa Eulària", "San José", "Sant Joan"])).toEqual([
      "santa-eularia-des-riu",
      "sant-josep-de-sa-talaia",
      "sant-joan-de-labritja",
    ]);
  });

  it("normalizes technical feed names to public publisher labels", () => {
    expect(normalizePublicSourceLabel("Diario de Ibiza RSS")).toBe("Diario de Ibiza");
    expect(normalizePublicSourceLabel("Periódico de Ibiza y Formentera — Pitiusas")).toBe(
      "Periódico de Ibiza y Formentera",
    );
    expect(normalizePublicSourceLabel("La Voz de Ibiza RSS")).toBe("La Voz de Ibiza");
  });

  it("uses Radio Illa's Formentera source scope when an article has no stronger area", () => {
    const raw: RawNewsCandidate = {
      source_key: "radio-illa-actualitat-rss",
      source_name: "Ràdio Illa Formentera",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.radioillaformentera.cat/category/actualitat/feed/",
      canonical_url: "https://www.radioillaformentera.cat/habitatge-emergencia-social/",
      headline: "L'habitatge ja és una emergència social",
      source_description: "Una entrevista sobre els problemes que afecten els residents de l'illa.",
      published_at: "2026-07-14T08:00:00.000Z",
      language: "ca",
      raw_metadata: {},
    };
    const source: NewsSourceConfig = {
      source_key: raw.source_key,
      source_name: raw.source_name,
      source_type: "rss",
      source_url: raw.source_url,
      default_language: "ca",
      default_area: ["Formentera"],
      source_scope: "local",
      publish_mode: "auto",
    };

    const classified = classifyCandidate(raw, source);
    expect(classified.area_keys).toEqual(["formentera"]);
    expect(classified.primary_area).toBe("Formentera");
    expect(classified.category).toBe("Infrastructure");
  });

  it("promotes a resolved signal candidate to the resolved source publish mode", () => {
    const raw: RawNewsCandidate = {
      source_key: "radio-illa-actualitat-rss",
      source_name: "Ràdio Illa Formentera",
      source_type: "rss",
      publish_mode: "signal_only",
      source_url: "https://www.radioillaformentera.cat/category/actualitat/feed/",
      canonical_url: "https://www.radioillaformentera.cat/conclou-la-recerca/",
      headline: "Conclou la recerca al sud de Formentera",
      source_description: "La recerca va finalitzar després de tres dies.",
      published_at: "2026-07-14T08:00:00.000Z",
      language: "ca",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, {
      source_key: raw.source_key,
      source_name: raw.source_name,
      source_type: "rss",
      source_url: raw.source_url,
      default_language: "ca",
      default_area: ["Formentera"],
      source_scope: "local",
      publish_mode: "auto",
    });

    expect(classified.publish_mode).toBe("auto");
  });

  it("does not infer Formentera from a publisher name in an Ibiza-only description", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/12/platges-comte-vertido.html",
      headline: "Prohibido bañarse en una playa de Sant Josep por un vertido",
      source_description: "La alerta fue comunicada a Periódico de Ibiza y Formentera.",
      published_at: "2026-07-12T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    expect(classifyCandidate(raw, { ...rssSource, source_key: raw.source_key, source_name: raw.source_name }).area_keys)
      .toEqual(["sant-josep-de-sa-talaia"]);
  });

  it("does not infer Formentera from a patron reference when the headline names Sant Miquel", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/aldia/2026/07/09/sant-miquel-procesion.html",
      headline: "Sant Miquel recibirá la imagen peregrina de Santa Maria de les Neus",
      source_description: "La patrona de Ibiza y Formentera llegará en una solemne procesión.",
      published_at: "2026-07-09T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    expect(classifyCandidate(raw, { ...rssSource, source_key: raw.source_key, source_name: raw.source_name }).area_keys)
      .toEqual(["sant-joan-de-labritja"]);
  });

  it("keeps Formentera on a genuine multi-island heat alert", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-ibiza-atom",
      source_name: "Periódico de Ibiza y Formentera",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas/ibiza.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/10/alerta-calor.html",
      headline: "Sant Joan, Sant Antoni and Formentera remain under a heat alert",
      source_description: "AEMET recorded high temperatures across the islands.",
      published_at: "2026-07-10T08:00:00.000Z",
      language: "en",
      raw_metadata: {},
    };

    expect(classifyCandidate(raw, { ...rssSource, source_key: raw.source_key, source_name: raw.source_name }).area_keys)
      .toEqual(["sant-antoni-de-portmany", "sant-joan-de-labritja", "formentera"]);
  });

  it("classifies missing-person searches as Public Safety rather than Weather Alert", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/ibiza/2026/07/10/alerta-desaparicion-nina-ibiza-132315632.html",
      headline: "Alerta por la desaparición de una niña en Ibiza: intensa búsqueda con perros y drones de madrugada",
      source_description: "Bomberos de Ibiza localizaron a la niña tras activar una búsqueda en Santa Eulària.",
      published_at: "2026-07-10T06:30:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    expect(classifyCandidate(raw, rssSource).category).toBe("Public Safety");
  });

  it("rejects conflicting people counts between source headline and source description", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/ibiza/2026/07/10/interceptadas-siete-migrantes-nueva-patera-formentera-132314844.html",
      headline: "Interceptadas 14 personas migrantes en una nueva patera en Formentera",
      source_description: "La Guardia Civil interceptó siete personas de origen norteafricano en es Caló.",
      published_at: "2026-07-10T06:20:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);
    expect(shouldPublishCandidate(classified, "2026-07-10")).toEqual({
      publishable: false,
      reason: "conflicting quantities in source evidence",
    });
  });

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

    expect(classified.area).toContain("Santa Eulària des Riu");
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

  it("does not publish broad Valencia society stories that mention the Jesús station", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/sociedad/2026/07/03/3-julio-veinte-anos-accidente-132076085.html",
      headline: "July 3: twenty years since the accident that shocked Valencia and left an open wound",
      source_description:
        "On July 3, 2006, Valencia suffered a railway tragedy at the entrance curve to the Jesús station.",
      published_at: "2026-07-03T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.area).toEqual(["Island-Wide"]);
    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-07-03")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("does not treat San Jose, California as Sant Josep / San José, Ibiza", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url:
        "https://www.diariodeibiza.es/internacional/2026/06/29/muerto-herido-grave-tiroteo-fan-zone-retransmision-partidos-mundial-san-jose-california-131920085.html",
      headline: "One Dead, One Seriously Injured in Shooting at 2026 World Cup Fan Zone in California",
      source_description:
        "A shooting at a popular entertainment venue in San Jose, California, resulted in one death and one serious injury.",
      published_at: "2026-06-29T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.area).toEqual(["Island-Wide"]);
    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-29")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("does not count publisher boilerplate as Ibiza-local evidence", () => {
    const raw: RawNewsCandidate = {
      source_key: "lavoz-general-rss",
      source_name: "La Voz de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://lavozdeibiza.com/feed/",
      canonical_url:
        "https://lavozdeibiza.com/sociedad/hallazgo-macabro-en-california-encuentran-117-perros-muertos-en-un-refugio-sin-sacrificio",
      headline: "Hallazgo macabro en California: encuentran 117 perros muertos en un refugio sin sacrificio",
      source_description:
        "La investigación comenzó tras varias denuncias. La entrada Hallazgo macabro en California se publicó primero en La Voz De Ibiza.",
      published_at: "2026-06-29T08:00:00.000Z",
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
      source_scope: "general",
    });

    expect(classified.ibiza_maps_relevant).toBe(false);
    expect(shouldPublishCandidate(classified, "2026-06-29")).toEqual({
      publishable: false,
      reason: "missing Ibiza-local relevance signal",
    });
  });

  it("allows ambiguous English municipality names only with explicit Ibiza context", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/ibiza/2026/06/29/taxis-san-antonio-ibiza-131920001.html",
      headline: "Taxi service changes in San Antonio, Ibiza this summer",
      source_description: "The changes affect visitors and residents in Ibiza.",
      published_at: "2026-06-29T08:00:00.000Z",
      language: "en",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.area).toContain("Sant Antoni de Portmany");
    expect(classified.ibiza_maps_relevant).toBe(true);
    expect(shouldPublishCandidate(classified, "2026-06-29")).toEqual({ publishable: true });
  });

  it("allows Jesús only when the article has explicit Ibiza context", () => {
    const raw: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/ibiza/2026/07/03/obras-jesus-santa-eularia-132000001.html",
      headline: "New works begin in Jesús, Ibiza",
      source_description: "The Santa Eulària des Riu council announced works affecting residents in Jesús.",
      published_at: "2026-07-03T08:00:00.000Z",
      language: "en",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, rssSource);

    expect(classified.area).toContain("Santa Eulària des Riu");
    expect(classified.ibiza_maps_relevant).toBe(true);
    expect(shouldPublishCandidate(classified, "2026-07-03")).toEqual({ publishable: true });
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

    expect(classified.area).toEqual(["Sant Antoni de Portmany"]);
  });

  it("keeps Formentera as a first-class area when the article is Formentera-specific", () => {
    const raw: RawNewsCandidate = {
      source_key: "periodico-pitiusas-atom",
      source_name: "Periódico de Ibiza y Formentera — Pitiusas",
      source_type: "atom",
      publish_mode: "auto",
      source_url: "https://www.periodicodeibiza.es/pitiusas.rss",
      canonical_url: "https://www.periodicodeibiza.es/pitiusas/formentera/2026/06/28/formentera-vehiculos-ibiza.html",
      headline: "Formentera revisa autorizaciones para vehículos de Ibiza",
      source_description: "El Consell de Formentera revisa permisos de larga duración para vehículos procedentes de Ibiza.",
      published_at: "2026-06-28T08:00:00.000Z",
      language: "es",
      raw_metadata: {},
    };

    const classified = classifyCandidate(raw, {
      source_key: "periodico-pitiusas-atom",
      source_name: "Periódico de Ibiza y Formentera — Pitiusas",
      source_type: "atom",
      source_url: "https://www.periodicodeibiza.es/pitiusas.rss",
      default_language: "es",
      publish_mode: "auto",
      source_scope: "local",
    });

    expect(classified.area).toContain("Formentera");
    expect(classified.primary_area).toBe("Formentera");
  });

  it("ranks high-impact local infrastructure above routine weather pages", () => {
    const infrastructure: RawNewsCandidate = {
      source_key: "diario-general-rss",
      source_name: "Diario de Ibiza RSS",
      source_type: "rss",
      publish_mode: "auto",
      source_url: "https://www.diariodeibiza.es/rss/",
      canonical_url: "https://www.diariodeibiza.es/ibiza/2026/06/28/ibiza-vivienda-transporte-123.html",
      headline: "Ibiza approves new housing and transport measures",
      source_description: "The council decision affects housing, public transport, and residents across the island.",
      published_at: "2026-06-28T08:00:00.000Z",
      language: "en",
      raw_metadata: {},
    };
    const weather: RawNewsCandidate = {
      ...infrastructure,
      canonical_url: "https://www.diariodeibiza.es/tiempo/2026/06/28/tiempo-sant-antoni-prevision.html",
      headline: "Weather in Sant Antoni de Portmany: forecast for today",
      source_description: "A routine weather forecast for the municipality.",
    };

    const highImpactScore = calculateCurationScore(infrastructure, "Infrastructure", ["Island-Wide"], "Notable");
    const routineWeatherScore = calculateCurationScore(weather, "Other", ["San Antonio"], "Minor");

    expect(highImpactScore).toBeGreaterThan(routineWeatherScore);
  });
});
