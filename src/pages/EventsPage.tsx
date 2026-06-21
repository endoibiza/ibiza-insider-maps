import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";
import {
  EventRecord,
  formatEventDate,
  getEventCtaUrl,
  getEventDescription,
  getEventImage,
  hasAvailableRates,
  isFourvenuesEvent,
} from "@/lib/events";

const eventSelect = `
  id,
  notion_page_id,
  event_name,
  slug,
  date,
  start_time,
  end_date,
  venue,
  type,
  lineup_details,
  event_series,
  notes,
  event_url,
  source,
  status,
  residents_pass,
  featured_on_party_calendar,
  image_url,
  fourvenues_event_id,
  fourvenues_organization_id,
  checkout_url,
  iframe_tag_url,
  iframe_script_url,
  ticket_rates,
  list_rates,
  preregister,
  source_missing_since
`;

const EventsPage = () => {
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("ibiza_events")
        .select(eventSelect)
        .gte("date", new Date().toISOString().slice(0, 10))
        .is("source_missing_since", null)
        .neq("status", "Cancelled")
        .order("featured_on_party_calendar", { ascending: false })
        .order("date", { ascending: true })
        .limit(60);

      if (fetchError) throw fetchError;
      return (data as EventRecord[]).filter((event) => {
        const status = event.status?.toLowerCase();
        return status !== "hidden" && status !== "cancelled" && !event.source_missing_since;
      });
    },
  });

  const trackEventCta = (event: EventRecord, location: string) => {
    track(ANALYTICS_EVENTS.eventOutboundClicked, {
      source: "events_page",
      location,
      event_slug: event.slug,
      event_source: event.source,
      organization_id: event.fourvenues_organization_id,
      has_rates: hasAvailableRates(event),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Ibiza Events | Ibiza Maps"
        description="Upcoming Ibiza club nights, venue events, guest lists, and island happenings synced from approved partners."
      />

      <main className="container-safe py-10 md:py-14">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Events</p>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Ibiza Events</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Approved venue events, party listings, and guest-list options from Ibiza Maps partner feeds.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/map">Explore maps</Link>
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-80 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
            Events are not available right now. Please try again shortly.
          </div>
        )}

        {!isLoading && !error && events.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center">
            <CalendarDays className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No upcoming events yet</h2>
            <p className="mt-2 text-muted-foreground">
              Upcoming Ibiza events will appear here as they are approved and refreshed.
            </p>
          </div>
        )}

        {!isLoading && !error && events.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const image = getEventImage(event);
              const ctaUrl = getEventCtaUrl(event);
              const description = getEventDescription(event);

              return (
                <Card key={event.id} className="overflow-hidden border-border/70">
                  {image && (
                    <Link to={`/events/${event.slug}`} className="block aspect-[16/10] overflow-hidden bg-muted">
                      <img
                        src={image}
                        alt={event.event_name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                    </Link>
                  )}
                  <CardContent className="flex min-h-72 flex-col p-5">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatEventDate(event.date, event.start_time)}
                      </Badge>
                      {hasAvailableRates(event) && (
                        <Badge variant="outline" className="gap-1">
                          <Ticket className="h-3 w-3" />
                          Booking options
                        </Badge>
                      )}
                    </div>

                    <Link to={`/events/${event.slug}`} className="group">
                      <h2 className="text-xl font-semibold leading-tight group-hover:text-primary">{event.event_name}</h2>
                    </Link>

                    {event.venue && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="truncate">{event.venue}</span>
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.type && <Badge variant="outline">{event.type}</Badge>}
                      {event.residents_pass && <Badge variant="outline">Residents pass</Badge>}
                      {isFourvenuesEvent(event) && <Badge variant="outline">Fourvenues</Badge>}
                    </div>

                    {description && (
                      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{description}</p>
                    )}

                    <div className="mt-auto flex gap-2 pt-5">
                      <Button asChild className="flex-1">
                        <Link to={`/events/${event.slug}`}>Details</Link>
                      </Button>
                      {ctaUrl && (
                        <Button asChild variant="outline" onClick={() => trackEventCta(event, "event_card")}>
                          <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default EventsPage;
