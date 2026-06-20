import { describe, expect, it } from "vitest";
import {
  EventRecord,
  getEventCtaUrl,
  getEventDescription,
  getEventImage,
  hasAvailableRates,
  isFourvenuesEvent,
} from "./events";

const event = (overrides: Partial<EventRecord>): EventRecord =>
  ({
    lineup_details: null,
    notes: null,
    event_series: null,
    type: null,
    image_url: null,
    event_url: null,
    checkout_url: null,
    iframe_tag_url: null,
    iframe_script_url: null,
    ticket_rates: [],
    list_rates: [],
    preregister: null,
    ...overrides,
  }) as EventRecord;

describe("event helpers", () => {
  it("prefers event detail copy over fallback metadata", () => {
    expect(
      getEventDescription(
        event({
          lineup_details: "Lineup copy",
          notes: "Internal notes",
          event_series: "Series",
          type: "Club Night",
        }),
      ),
    ).toBe("Lineup copy");
  });

  it("prefers Fourvenues checkout URLs over fallback event URLs", () => {
    const record = event({
      image_url: "https://images.example/source.jpg",
      checkout_url: "https://checkout.example/event",
      iframe_tag_url: "https://iframe.example/tag",
      event_url: "https://venue.example/event",
    });

    expect(getEventImage(record)).toBe("https://images.example/source.jpg");
    expect(getEventCtaUrl(record)).toBe("https://checkout.example/event");
  });

  it("detects ticket, list, and preregister booking options", () => {
    expect(hasAvailableRates(event({ ticket_rates: [{ _id: "ticket" }] }))).toBe(true);
    expect(hasAvailableRates(event({ list_rates: [{ _id: "list" }] }))).toBe(true);
    expect(hasAvailableRates(event({ preregister: { enabled: true } }))).toBe(true);
    expect(hasAvailableRates(event({}))).toBe(false);
  });

  it("detects Fourvenues rows by source key or event id", () => {
    expect(isFourvenuesEvent(event({ notion_page_id: "fourvenues:evt_123" }))).toBe(true);
    expect(isFourvenuesEvent(event({ fourvenues_event_id: "evt_123" }))).toBe(true);
    expect(isFourvenuesEvent(event({ notion_page_id: "notion-page-id" }))).toBe(false);
  });
});
