import type { Tables } from "@/integrations/supabase/types";

export type EventRecord = Tables<"ibiza_events">;

export type CommercialEventFields = Partial<{
  has_vip_tables: boolean | null;
  vip_booking_url: string | null;
  public_cta_label: string | null;
  booking_options: PublicBookingOption[] | null;
}>;

export type EventCtaKind = "tickets" | "guest_list" | "vip_tables" | "preregister" | "official_event_page" | "more_info";

export type EventCta = {
  kind: EventCtaKind;
  label: string;
  url: string;
};

export type PublicBookingOption = EventCta & {
  id?: string;
  ibiza_event_id?: string;
  provider?: string;
  priority?: number;
  verified_at?: string;
};

export type PublicEventRecord = EventRecord & CommercialEventFields;

export const formatEventDate = (date: string | null, startTime?: string | null, timezone = "Europe/Madrid") => {
  if (!date) return "Date TBC";

  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00`));

  return startTime ? `${dateLabel}, ${startTime}` : dateLabel;
};

export const formatEventDateTime = (date: string | null, startTime?: string | null, timezone = "Europe/Madrid") => {
  if (!date) return "Date TBC";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(startTime ? `${date}T${startTime}` : `${date}T12:00:00`));
};

const arrayValue = (value: unknown) => (Array.isArray(value) ? value : []);

const hasRows = (value: unknown) => arrayValue(value).length > 0;

const isActivePreregister = (value: unknown) =>
  Boolean(value && typeof value === "object" && (value as { is_active?: unknown }).is_active === true);

export const isSlugLikeEventSeries = (value?: string | null) =>
  Boolean(
    value &&
      /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(value.trim()) &&
      (/\d{2}-\d{2}-\d{4}/.test(value) || /\d{4}/.test(value) || value.includes("-week-")),
  );

export const getEventDescription = (event: Pick<EventRecord, "lineup_details" | "notes" | "event_series" | "type">) => {
  if (event.lineup_details) return event.lineup_details;
  if (event.notes) return event.notes;
  if (event.event_series && !isSlugLikeEventSeries(event.event_series)) return event.event_series;
  return event.type || "";
};

export const getEventCardDescription = (event: Pick<EventRecord, "lineup_details" | "notes" | "event_series" | "type">) => {
  const description = getEventDescription(event);
  return isSlugLikeEventSeries(description) ? event.type || "" : description;
};

export const getEventImage = (event: Pick<EventRecord, "image_url">) => event.image_url || "";

export const getEventCtaUrl = (event: Pick<EventRecord, "checkout_url" | "iframe_tag_url" | "iframe_script_url" | "event_url">) =>
  event.checkout_url || event.iframe_tag_url || event.iframe_script_url || event.event_url || "";

export const hasTicketRates = (event: Pick<EventRecord, "ticket_rates">) => hasRows(event.ticket_rates);

export const hasListRates = (event: Pick<EventRecord, "list_rates">) => hasRows(event.list_rates);

export const hasVipTables = (event: CommercialEventFields) => Boolean(event.has_vip_tables);

export const hasAvailableRates = (event: Pick<EventRecord, "ticket_rates" | "list_rates" | "preregister"> & CommercialEventFields) =>
  hasTicketRates(event) ||
  hasListRates(event) ||
  hasVipTables(event) ||
  isActivePreregister(event.preregister) ||
  Boolean(event.booking_options?.some((option) => ["tickets", "guest_list", "vip_tables", "preregister"].includes(option.kind)));

export const getCommercialOptionLabels = (
  event: Pick<EventRecord, "ticket_rates" | "list_rates" | "preregister"> & CommercialEventFields,
) => {
  const optionLabels = (event.booking_options ?? [])
    .filter((option) => ["tickets", "guest_list", "vip_tables", "preregister"].includes(option.kind))
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    .map((option) => option.label);
  if (optionLabels.length > 0) return [...new Set(optionLabels)];

  const labels: string[] = [];
  if (hasTicketRates(event)) labels.push("Tickets");
  if (hasListRates(event)) labels.push("Guest List");
  if (hasVipTables(event)) labels.push("VIP / Tables");
  if (isActivePreregister(event.preregister)) labels.push("Preregister");
  return labels;
};

export const getEventCtas = (
  event: Pick<EventRecord, "checkout_url" | "iframe_tag_url" | "iframe_script_url" | "event_url" | "ticket_rates" | "list_rates" | "preregister"> &
    CommercialEventFields,
): EventCta[] => {
  const fallbackUrl = getEventCtaUrl(event);
  const vipUrl = event.vip_booking_url || fallbackUrl;
  const ctas: EventCta[] = [];
  const addCta = (cta: EventCta | null) => {
    if (!cta || !cta.url) return;
    if (ctas.some((existing) => existing.url === cta.url)) return;
    ctas.push(cta);
  };

  (event.booking_options ?? [])
    .filter((option) => option.url)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    .forEach((option) => addCta({ kind: option.kind, label: option.label, url: option.url }));

  if (ctas.length > 0) return ctas;

  addCta(hasTicketRates(event) && fallbackUrl ? { kind: "tickets", label: "Tickets", url: fallbackUrl } : null);
  addCta(hasListRates(event) && fallbackUrl ? { kind: "guest_list", label: "Guest List", url: fallbackUrl } : null);
  addCta(hasVipTables(event) && vipUrl ? { kind: "vip_tables", label: "VIP / Tables", url: vipUrl } : null);
  addCta(fallbackUrl && ctas.length === 0 ? { kind: "more_info", label: "More Info", url: fallbackUrl } : null);

  return ctas;
};

export const getEventCta = (
  event: Pick<EventRecord, "checkout_url" | "iframe_tag_url" | "iframe_script_url" | "event_url" | "ticket_rates" | "list_rates" | "preregister"> &
    CommercialEventFields,
) => getEventCtas(event)[0] ?? null;

export const isFourvenuesEvent = (event: Pick<EventRecord, "notion_page_id" | "fourvenues_event_id">) =>
  Boolean(event.fourvenues_event_id || event.notion_page_id?.startsWith("fourvenues:"));
