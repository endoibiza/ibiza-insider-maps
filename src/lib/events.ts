import type { Tables } from "@/integrations/supabase/types";

export type EventRecord = Tables<"ibiza_events">;

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

export const getEventDescription = (event: Pick<EventRecord, "lineup_details" | "notes" | "event_series" | "type">) =>
  event.lineup_details || event.notes || event.event_series || event.type || "";

export const getEventImage = (event: Pick<EventRecord, "image_url">) => event.image_url || "";

export const getEventCtaUrl = (event: Pick<EventRecord, "checkout_url" | "iframe_tag_url" | "iframe_script_url" | "event_url">) =>
  event.checkout_url || event.iframe_tag_url || event.iframe_script_url || event.event_url || "";

export const hasAvailableRates = (event: Pick<EventRecord, "ticket_rates" | "list_rates" | "preregister">) => {
  const ticketRates = Array.isArray(event.ticket_rates) ? event.ticket_rates : [];
  const listRates = Array.isArray(event.list_rates) ? event.list_rates : [];
  return ticketRates.length > 0 || listRates.length > 0 || Boolean(event.preregister);
};

export const isFourvenuesEvent = (event: Pick<EventRecord, "notion_page_id" | "fourvenues_event_id">) =>
  Boolean(event.fourvenues_event_id || event.notion_page_id?.startsWith("fourvenues:"));
