import { describe, expect, it } from "vitest";
import {
  EventRecord,
  getCommercialOptionLabels,
  getEventCardDescription,
  getEventCta,
  getEventCtas,
  getEventCtaUrl,
  getEventDescription,
  getEventImage,
  hasAvailableRates,
  isSlugLikeEventSeries,
  isFourvenuesEvent,
  normalizeVenueDisplayName,
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

  it("hides slug-like event series from card descriptions", () => {
    const record = event({
      event_series: "23-degrees-week-2-24-06-2026",
      type: "Club Night",
    });

    expect(isSlugLikeEventSeries(record.event_series)).toBe(true);
    expect(getEventDescription(record)).toBe("Club Night");
    expect(getEventCardDescription(record)).toBe("Club Night");
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
    expect(hasAvailableRates(event({ preregister: { is_active: true } }))).toBe(true);
    expect(hasAvailableRates(event({ preregister: { is_active: false } }))).toBe(false);
    expect(hasAvailableRates(event({}))).toBe(false);
  });

  it("labels CTA destinations by commercial option instead of generic URL presence", () => {
    expect(
      getEventCta(event({ ticket_rates: [{ _id: "ticket" }], iframe_tag_url: "https://iframe.example/event" })),
    ).toMatchObject({ kind: "tickets", label: "Tickets", url: "https://iframe.example/event" });

    expect(
      getEventCta(event({ list_rates: [{ _id: "list" }], iframe_tag_url: "https://iframe.example/event" })),
    ).toMatchObject({ kind: "guest_list", label: "Guest List", url: "https://iframe.example/event" });

    expect(
      getEventCta(event({ has_vip_tables: true, vip_booking_url: "https://vip.example/event", iframe_tag_url: "https://iframe.example/event" } as Partial<EventRecord>)),
    ).toMatchObject({ kind: "vip_tables", label: "VIP / Tables", url: "https://vip.example/event" });

    expect(getEventCta(event({ iframe_tag_url: "https://iframe.example/event" }))).toMatchObject({
      kind: "more_info",
      label: "More Info",
      url: "https://iframe.example/event",
    });
  });

  it("returns multiple CTA options when distinct commercial URLs are available", () => {
    const ctas = getEventCtas(
      event({
        ticket_rates: [{ _id: "ticket" }],
        has_vip_tables: true,
        checkout_url: "https://checkout.example/event",
        vip_booking_url: "https://vip.example/event",
      } as Partial<EventRecord>),
    );

    expect(ctas).toEqual([
      { kind: "tickets", label: "Tickets", url: "https://checkout.example/event" },
      { kind: "vip_tables", label: "VIP / Tables", url: "https://vip.example/event" },
    ]);
    expect(getCommercialOptionLabels(event({ ticket_rates: [{}], has_vip_tables: true } as Partial<EventRecord>))).toEqual([
      "Tickets",
      "VIP / Tables",
    ]);
  });

  it("uses public booking options before legacy event URL fallbacks", () => {
    const ctas = getEventCtas(
      event({
        event_url: "https://old.example/event",
        booking_options: [
          {
            kind: "vip_tables",
            label: "VIP / Tables",
            url: "https://vip.example/event",
            priority: 20,
          },
          {
            kind: "tickets",
            label: "Tickets",
            url: "https://tickets.example/event",
            priority: 10,
          },
          {
            kind: "official_event_page",
            label: "Official Info",
            url: "https://venue.example/event",
            priority: 60,
          },
        ],
      } as Partial<EventRecord>),
    );

    expect(ctas).toEqual([
      { kind: "tickets", label: "Tickets", url: "https://tickets.example/event" },
      { kind: "vip_tables", label: "VIP / Tables", url: "https://vip.example/event" },
      { kind: "official_event_page", label: "Official Info", url: "https://venue.example/event" },
    ]);
  });

  it("uses booking options for customer-facing commercial labels", () => {
    expect(
      getCommercialOptionLabels(
        event({
          booking_options: [
            {
              kind: "official_event_page",
              label: "Official Info",
              url: "https://venue.example/event",
              priority: 60,
            },
            {
              kind: "vip_tables",
              label: "VIP / Tables",
              url: "https://vip.example/event",
              priority: 20,
            },
          ],
        } as Partial<EventRecord>),
      ),
    ).toEqual(["VIP / Tables"]);
  });

  it("does not render duplicate CTA buttons when options share the same URL", () => {
    expect(
      getEventCtas(event({ ticket_rates: [{ _id: "ticket" }], has_vip_tables: true, iframe_tag_url: "https://iframe.example/event" } as Partial<EventRecord>)),
    ).toEqual([{ kind: "tickets", label: "Tickets", url: "https://iframe.example/event" }]);
  });

  it("detects Fourvenues rows by source key or event id", () => {
    expect(isFourvenuesEvent(event({ notion_page_id: "fourvenues:evt_123" }))).toBe(true);
    expect(isFourvenuesEvent(event({ fourvenues_event_id: "evt_123" }))).toBe(true);
    expect(isFourvenuesEvent(event({ notion_page_id: "notion-page-id" }))).toBe(false);
  });

  it("normalizes Chinois venue names to the official public name", () => {
    expect(normalizeVenueDisplayName("Club Chinois")).toBe("Chinois");
    expect(normalizeVenueDisplayName("Chinois Ibiza")).toBe("Chinois");
    expect(normalizeVenueDisplayName(" Chinois ")).toBe("Chinois");
    expect(normalizeVenueDisplayName("Eden Ibiza")).toBe("Eden Ibiza");
  });
});
