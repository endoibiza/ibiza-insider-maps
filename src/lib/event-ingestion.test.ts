import { describe, expect, it } from "vitest";
import {
  buildAgentNotionPageId,
  buildDedupeKey,
  buildIbizaEventInsert,
  buildSafeExistingEventPatch,
  DEFAULT_EVENT_SOURCES,
  extractJsonLdCandidates,
  findExistingEventMatch,
  sanitizeLineupDetails,
} from "../../supabase/functions/sync-ibiza-events-agent/ingestion";

const source = DEFAULT_EVENT_SOURCES[0];

describe("event ingestion helpers", () => {
  it("extracts normalized candidates from JSON-LD events", () => {
    const html = `
      <html>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": "Circoloco Opening Party",
            "startDate": "2026-06-22T23:30:00+02:00",
            "endDate": "2026-06-23T06:00:00+02:00",
            "description": "Terrace: Artist One, Artist Two (verified 2026-06-21)",
            "url": "https://example.com/events/circoloco-opening",
            "location": { "name": "Circoloco at DC10" }
          }
        </script>
      </html>
    `;

    const [candidate] = extractJsonLdCandidates(html, source, "2026-06-21", "2026-06-30");

    expect(candidate.event_name).toBe("Circoloco Opening Party");
    expect(candidate.event_date).toBe("2026-06-22");
    expect(candidate.start_time).toBe("23:30");
    expect(candidate.venue).toBe("Circoloco at DC10");
    expect(candidate.lineup_details).toBe("Artist One, Artist Two");
    expect(candidate.event_url).toBe("https://example.com/events/circoloco-opening");
    expect(candidate.original_source_url).toBe(source.url);
    expect(candidate.dedupe_key).toContain("2026-06-22");
  });

  it("keeps public lineup details free of room labels and verification metadata", () => {
    expect(
      sanitizeLineupDetails(
        "Theatre: DJ A, DJ B (updated 21 Jun) agent run: abc123",
        "Fallback details",
      ),
    ).toBe("DJ A, DJ B");
  });

  it("matches existing events by date and title overlap before creating duplicates", () => {
    const [candidate] = extractJsonLdCandidates(
      `
        <script type="application/ld+json">
          {"@type":"Event","name":"Pyramid at Amnesia","startDate":"2026-07-01","location":{"name":"Amnesia"}}
        </script>
      `,
      source,
      "2026-07-01",
      "2026-07-02",
    );

    const match = findExistingEventMatch(candidate, [
      {
        id: "existing-id",
        notion_page_id: "notion-page-id",
        event_name: "Pyramid Amnesia Ibiza",
        date: "2026-07-01",
        venue: "Amnesia",
        event_series: null,
      },
    ]);

    expect(match?.id).toBe("existing-id");
  });

  it("builds stable agent ids and does not include protected editorial fields in inserts", () => {
    const candidate = {
      source_key: "spotlight-party-calendar",
      external_id: "abc123",
      dedupe_key: buildDedupeKey({
        event_date: "2026-06-22",
        venue: "Pacha",
        event_series: "Music On",
        event_name: "Music On",
      }),
      event_name: "Music On",
      event_date: "2026-06-22",
      start_time: "23:59",
      end_time: null,
      venue: "Pacha",
      event_series: "Music On",
      type: "Club",
      status: "Confirmed",
      lineup_details: "Marco Carola",
      event_url: "https://example.com/music-on",
      original_source_url: source.url,
      source_label: "Ibiza Spotlight",
      residents_pass: null,
      confidence: 0.9,
      raw_candidate: {},
    };

    expect(buildAgentNotionPageId(candidate)).toBe("agent:spotlight-party-calendar:abc123");

    const insert = buildIbizaEventInsert(candidate);
    expect(insert.notion_page_id).toBe("agent:spotlight-party-calendar:abc123");
    expect(insert).not.toHaveProperty("mikes_pick");
    expect(insert).not.toHaveProperty("featured_on_party_calendar");
    expect(insert).not.toHaveProperty("fourvenues_event_id");
    expect(insert).not.toHaveProperty("ticket_rates");
  });

  it("never patches Fourvenues-owned rows from scraped candidates", () => {
    const candidate = {
      source_key: "spotlight-party-calendar",
      external_id: "abc123",
      dedupe_key: "key",
      event_name: "Music On",
      event_date: "2026-06-22",
      start_time: "23:59",
      end_time: null,
      venue: "Pacha",
      event_series: "Music On",
      type: "Club",
      status: "Confirmed",
      lineup_details: "Marco Carola",
      event_url: "https://example.com/music-on",
      original_source_url: source.url,
      source_label: "Ibiza Spotlight",
      residents_pass: null,
      confidence: 0.9,
      raw_candidate: {},
    };

    expect(
      buildSafeExistingEventPatch(candidate, {
        id: "fourvenues-row",
        notion_page_id: "fourvenues:evt_123",
        fourvenues_event_id: "evt_123",
        event_name: "Music On",
        date: "2026-06-22",
        venue: "Pacha",
        event_series: "Music On",
      }),
    ).toEqual({});
  });
});
