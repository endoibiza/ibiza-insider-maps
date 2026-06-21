import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const EventDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("ibiza_events")
        .select("*")
        .eq("slug", slug)
        .single();

      if (fetchError) throw fetchError;

      const event = data as EventRecord;
      const status = event.status?.toLowerCase();
      if (status === "hidden" || status === "cancelled" || event.source_missing_since) {
        throw new Error("Event is not published");
      }

      return event;
    },
  });

  const ctaUrl = event ? getEventCtaUrl(event) : "";
  const image = event ? getEventImage(event) : "";
  const description = event ? getEventDescription(event) : "";
  const pageTitle = event ? `${event.event_name} | Ibiza Maps` : "Event | Ibiza Maps";
  const pageDescription = description || event?.type || "Ibiza event details from Ibiza Maps.";

  const trackEventCta = () => {
    if (!event) return;
    track(ANALYTICS_EVENTS.eventOutboundClicked, {
      source: "event_detail_page",
      location: "primary_cta",
      event_slug: event.slug,
      event_source: event.source,
      organization_id: event.fourvenues_organization_id,
      has_rates: hasAvailableRates(event),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={pageTitle} description={pageDescription} />

      <main className="container-safe py-8 md:py-12">
        <Button asChild variant="ghost" className="mb-6 px-0">
          <Link to="/events">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Events
          </Link>
        </Button>

        {isLoading && <div className="h-[520px] animate-pulse rounded-lg bg-muted" />}

        {error && (
          <div className="rounded-lg border bg-card p-8 text-center">
            <h1 className="text-2xl font-semibold">Event not found</h1>
            <p className="mt-2 text-muted-foreground">This event may be unpublished or no longer available.</p>
            <Button asChild className="mt-5">
              <Link to="/events">View upcoming events</Link>
            </Button>
          </div>
        )}

        {event && (
          <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              {image && (
                <div className="mb-6 aspect-[16/9] overflow-hidden rounded-lg bg-muted">
                  <img src={image} alt={event.event_name} className="h-full w-full object-cover" />
                </div>
              )}

              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {formatEventDate(event.date, event.start_time)}
                </Badge>
                {event.type && <Badge variant="outline">{event.type}</Badge>}
                {event.residents_pass && <Badge variant="outline">Residents pass</Badge>}
                {isFourvenuesEvent(event) && <Badge variant="outline">Fourvenues</Badge>}
              </div>

              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{event.event_name}</h1>

              {event.venue && (
                <p className="mt-4 flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-5 w-5 shrink-0" />
                  <span>{event.venue}</span>
                </p>
              )}

              {description && (
                <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
                  {description.split("\n").map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              )}
            </div>

            <aside>
              <Card className="sticky top-6 border-border/70">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">When</p>
                    <p className="mt-1 font-semibold">
                      {formatEventDate(event.date, event.start_time)}
                    </p>
                    {event.end_date && (
                      <p className="text-sm text-muted-foreground">
                        Ends {new Date(event.end_date).toLocaleString("en-GB", { timeZone: "Europe/Madrid" })}
                      </p>
                    )}
                  </div>

                  {event.venue && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Where</p>
                      <p className="mt-1 font-semibold">{event.venue}</p>
                      {event.location_address && <p className="text-sm text-muted-foreground">{event.location_address}</p>}
                    </div>
                  )}

                  {hasAvailableRates(event) && (
                    <div className="rounded-lg bg-muted p-4">
                      <div className="flex items-center gap-2 font-medium">
                        <Ticket className="h-4 w-4" />
                        Booking options available
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ticket, list, or preregistration options are available through the event partner.
                      </p>
                    </div>
                  )}

                  {ctaUrl && (
                    <Button asChild className="w-full" size="lg" onClick={trackEventCta}>
                      <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
                        Open booking
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </aside>
          </article>
        )}
      </main>
    </div>
  );
};

export default EventDetailPage;
