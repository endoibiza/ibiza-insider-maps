import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CloudSun,
  Clock,
  Droplets,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Waves,
  Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherSkeleton } from "@/components/ui/skeleton-loaders";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_EVENTS, getSafeErrorType, track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  alertSeverityClasses,
  beachStatusClasses,
  formatMadridDate,
  formatMadridTime,
  formatNumber,
  formatTemperature,
  formatWind,
  PublicWeatherAlert,
  PublicWeatherReport,
  reportIsStale,
  sourceHealthSummary,
  sourceStatusClasses,
  statusLabel,
  WeatherPayload,
} from "@/lib/weather";

interface WeatherWidgetProps {
  autoLoad?: boolean;
}

type QueryError = { message: string };
type QueryResponse<T> = Promise<{ data: T[] | null; error: QueryError | null }>;
type QueryBuilder<T> = {
  select: (columns: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryResponse<T>;
};
type PublicReadClient = {
  from: <T>(table: string) => QueryBuilder<T>;
};

const asArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const weatherSelect =
  "id,report_date,title,headline,summary,current_conditions,hourly_forecast,daily_forecast,marine_summary,beach_conditions,alerts_summary,source_status,source_disagreements,attribution,stale_flags,sources_checked,generated_at,last_successful_source_at,updated_at";

const fetchWeatherPayload = async (): Promise<WeatherPayload> => {
  const client = supabase as unknown as PublicReadClient;

  const reportRequest = client
    .from<PublicWeatherReport>("ibiza_weather_public_current")
    .select(weatherSelect)
    .order("report_date", { ascending: false })
    .limit(1);

  const alertsRequest = client
    .from<PublicWeatherAlert>("ibiza_weather_alerts_public")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(12);

  const [reportResponse, alertsResponse] = await Promise.all([reportRequest, alertsRequest]);
  if (reportResponse.error) throw new Error(reportResponse.error.message);

  const report = reportResponse.data?.[0] ?? null;
  const alerts = asArray(alertsResponse.error ? [] : alertsResponse.data).filter(
    (alert) => !report || alert.report_date === report.report_date,
  );

  return {
    report: report
      ? {
          ...report,
          hourly_forecast: asArray(report.hourly_forecast),
          daily_forecast: asArray(report.daily_forecast),
          beach_conditions: asArray(report.beach_conditions),
          alerts_summary: asArray(report.alerts_summary),
          source_status: asArray(report.source_status),
          source_disagreements: asArray(report.source_disagreements),
          attribution: asArray(report.attribution),
          stale_flags: asArray(report.stale_flags),
          sources_checked: asArray(report.sources_checked),
        }
      : null,
    alerts,
  };
};

const Metric = ({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  detail?: string;
}) => (
  <div className="border bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</span>
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div className="text-2xl font-semibold text-foreground">{value}</div>
    {detail && <div className="mt-1 text-sm text-muted-foreground">{detail}</div>}
  </div>
);

const WeatherWidget = ({ autoLoad = true }: WeatherWidgetProps) => {
  const { toast } = useToast();
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["ibiza-weather-public"],
    queryFn: fetchWeatherPayload,
    staleTime: 1000 * 60 * 5,
    enabled: autoLoad,
  });

  const report = data?.report ?? null;
  const current = report?.current_conditions ?? {};
  const marine = report?.marine_summary ?? {};
  const daily = report?.daily_forecast ?? [];
  const hourly = report?.hourly_forecast?.slice(0, 12) ?? [];
  const alerts = data?.alerts?.length ? data.alerts : report?.alerts_summary ?? [];
  const sourceHealth = useMemo(() => sourceHealthSummary(report?.source_status ?? []), [report?.source_status]);
  const stale = reportIsStale(report);

  useEffect(() => {
    if (!error) return;
    track(ANALYTICS_EVENTS.weatherLoadFailed, {
      source: "weather_widget",
      error_type: getSafeErrorType(error),
    });
  }, [error]);

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      toast({
        title: "Weather Error",
        description: result.error instanceof Error ? result.error.message : "Unable to load source-backed weather",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading source-backed Ibiza weather...</p>
        </div>
        <WeatherSkeleton />
      </div>
    );
  }

  if (!report) {
    return (
      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            Weather report not published yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-amber-900">
          <p>
            The new Supabase-backed weather system is ready for stored reports. Once the scheduled collector publishes its
            first run, today&apos;s weather, sea state, beach guidance, and source timestamps will appear here.
          </p>
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Check again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {(stale || report.stale_flags.length > 0) && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            {stale
              ? "Today's weather report has not published yet; showing the most recent source-backed report."
              : "Some weather sources are incomplete today; the report continues with available verified sources."}
          </div>
        </div>
      )}

      <section className="border bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                {formatMadridDate(report.report_date, { weekday: "long", year: "numeric" })}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Updated {formatMadridTime(report.last_successful_source_at || report.generated_at)}
              </span>
            </div>
            <h2 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">{report.headline}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{report.summary}</p>
          </div>
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isFetching} className="md:self-start">
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Thermometer}
          label="Now"
          value={formatTemperature(current.temperature_c)}
          detail={current.apparent_temperature_c ? `Feels like ${formatTemperature(current.apparent_temperature_c)}` : current.condition || ""}
        />
        <Metric
          icon={Wind}
          label="Wind"
          value={formatWind(current.wind_speed_kmh, current.wind_direction_label)}
          detail={current.wind_gust_kmh ? `Gusts near ${Math.round(current.wind_gust_kmh)} km/h` : "Gusts updating"}
        />
        <Metric
          icon={Umbrella}
          label="Rain"
          value={formatNumber(daily[0]?.precipitation_probability_pct, "%", 0)}
          detail={daily[0]?.precipitation_mm ? `${formatNumber(daily[0].precipitation_mm, " mm", 1)} possible today` : "Daily rain window"}
        />
        <Metric
          icon={Waves}
          label="Sea"
          value={formatNumber(marine.wave_height_m, " m", 1)}
          detail={
            marine.sea_surface_temperature_c
              ? `Sea ${formatNumber(marine.sea_surface_temperature_c, " C", 0)}`
              : `${marine.wave_direction_label || "Wave"} direction`
          }
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Official Alerts</h3>
          </div>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <article key={`${alert.source_key || "alert"}-${alert.title}-${alert.onset_at || ""}`} className={cn("border p-4", alertSeverityClasses(alert.severity))}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-current text-current">
                      {alert.official ? "Official AEMET" : "Model concern"}
                    </Badge>
                    <span className="text-xs uppercase tracking-normal">{alert.severity || "Weather alert"}</span>
                  </div>
                  <h4 className="font-semibold">{alert.title}</h4>
                  {"summary" in alert && alert.summary && <p className="mt-2 text-sm leading-6">{alert.summary}</p>}
                  <div className="mt-3 text-xs">
                    {[alert.onset_at, alert.expires_at].filter(Boolean).length > 0
                      ? `${alert.onset_at ? formatMadridTime(alert.onset_at) : "Now"} - ${alert.expires_at ? formatMadridTime(alert.expires_at) : "until updated"}`
                      : alert.zone || "Ibiza and Formentera"}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No official Ibiza or Formentera weather alert is stored for this report. AEMET official alerts will appear here as soon
              as the AEMET API key is configured and an alert exists.
            </p>
          )}
        </div>

        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Today&apos;s Light</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border bg-slate-50 p-4">
              <Sunrise className="mb-3 h-5 w-5 text-amber-600" />
              <div className="text-xs uppercase tracking-normal text-muted-foreground">Sunrise</div>
              <div className="mt-1 text-xl font-semibold">{formatMadridTime(daily[0]?.sunrise_at)}</div>
            </div>
            <div className="border bg-slate-50 p-4">
              <Sunset className="mb-3 h-5 w-5 text-orange-600" />
              <div className="text-xs uppercase tracking-normal text-muted-foreground">Sunset</div>
              <div className="mt-1 text-xl font-semibold">{formatMadridTime(daily[0]?.sunset_at)}</div>
            </div>
          </div>
          <div className="mt-4 border bg-slate-50 p-4 text-sm text-muted-foreground">
            UV index {formatNumber(daily[0]?.uv_index, "", 1)}. Use local beach flags and lifeguard advice before swimming.
          </div>
        </div>
      </section>

      <section className="border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Next 12 Hours</h3>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {hourly.map((hour) => (
            <div key={hour.forecast_time || hour.time} className="min-w-32 border bg-slate-50 p-3 text-sm">
              <div className="font-semibold">{formatMadridTime(hour.forecast_time)}</div>
              <div className="mt-2 text-xl font-semibold">{formatTemperature(hour.temperature_c)}</div>
              <div className="mt-1 text-muted-foreground">{hour.condition || "Forecast"}</div>
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <Droplets className="h-3 w-3" />
                {formatNumber(hour.precipitation_probability_pct, "%", 0)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Waves className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Beach And Coast Conditions</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {report.beach_conditions.map((condition) => (
            <article key={condition.coast} className="border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">{condition.coast}</h4>
                <Badge variant="outline" className={cn("uppercase tracking-normal", beachStatusClasses(condition.status))}>
                  {condition.status}
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground">{condition.headline}</p>
              <p className="mt-2 text-sm text-muted-foreground">{condition.beaches}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {condition.reasons.map((reason) => (
                  <span key={reason} className="border bg-slate-50 px-2 py-1">
                    {reason}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">6-Day Forecast</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {daily.slice(0, 6).map((day) => (
            <article key={day.date} className="border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{formatMadridDate(day.date)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{day.condition || "Forecast"}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">
                    {formatTemperature(day.temp_max_c)} / {formatTemperature(day.temp_min_c)}
                  </div>
                  <div className="text-muted-foreground">{formatNumber(day.precipitation_probability_pct, "%", 0)} rain</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {formatWind(day.wind_speed_kmh, day.wind_direction_label)}; UV {formatNumber(day.uv_index, "", 1)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Source Evidence</h3>
          </div>
          <div className="text-sm text-muted-foreground">
            {sourceHealth.updated}/{sourceHealth.total} sources updated
            {sourceHealth.blocked > 0 ? `, ${sourceHealth.blocked} awaiting key` : ""}
            {sourceHealth.failed > 0 ? `, ${sourceHealth.failed} with issues` : ""}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {report.source_status.map((status) => (
            <div key={status.source_key} className="border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{status.label}</div>
                <Badge variant="outline" className={cn("uppercase tracking-normal", sourceStatusClasses(status.status))}>
                  {statusLabel(status.status)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Last checked {formatMadridTime(status.fetched_at)}
                {status.message ? ` - ${status.message}` : ""}
              </div>
              {status.attribution_url && (
                <a
                  href={status.attribution_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track(ANALYTICS_EVENTS.externalLinkClicked, { source: "weather_source", category: status.source_key })}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {status.attribution}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default WeatherWidget;
