import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bike,
  CalendarDays,
  CheckCircle2,
  CloudSun,
  Clock,
  Compass,
  Droplets,
  ExternalLink,
  Loader2,
  Mountain,
  RefreshCw,
  Sailboat,
  ShieldAlert,
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
  BeachRecommendation,
  beachStatusClasses,
  confidenceClasses,
  formatMadridDate,
  formatMadridTime,
  formatNumber,
  formatTemperature,
  formatWind,
  PublicWeatherAlert,
  PublicWeatherReport,
  recommendationStatusClasses,
  reportIsStale,
  sourceHealthSummary,
  sourceStatusClasses,
  statusLabel,
  WeatherPayload,
  WeatherSourceStatus,
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

type ActivityCondition = {
  label: string;
  icon: typeof Waves;
  status: "great" | "good" | "caution";
  detail: string;
};

const asArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const baseWeatherSelect =
  "id,report_date,title,headline,summary,current_conditions,hourly_forecast,daily_forecast,marine_summary,beach_conditions,alerts_summary,source_status,source_disagreements,attribution,stale_flags,sources_checked,generated_at,last_successful_source_at,updated_at";

const weatherSelect = baseWeatherSelect.replace("source_disagreements,", "source_disagreements,weather_intelligence,");

const fetchWeatherPayload = async (): Promise<WeatherPayload> => {
  const client = supabase as unknown as PublicReadClient;

  const buildReportRequest = (columns: string) =>
    client
      .from<PublicWeatherReport>("ibiza_weather_public_current")
      .select(columns)
      .order("report_date", { ascending: false })
      .limit(1);

  const reportRequest = buildReportRequest(weatherSelect);

  const alertsRequest = client
    .from<PublicWeatherAlert>("ibiza_weather_alerts_public")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(12);

  const recommendationsRequest = client
    .from<BeachRecommendation>("ibiza_beach_recommendations_public")
    .select("*")
    .order("report_date", { ascending: false })
    .order("time_window", { ascending: true })
    .order("rank", { ascending: true })
    .limit(32);

  const [initialReportResponse, alertsResponse, recommendationsResponse] = await Promise.all([
    reportRequest,
    alertsRequest,
    recommendationsRequest,
  ]);
  let reportResponse = initialReportResponse;
  if (reportResponse.error?.message?.includes("weather_intelligence")) {
    reportResponse = await buildReportRequest(baseWeatherSelect);
  }
  if (reportResponse.error) throw new Error(reportResponse.error.message);

  const report = reportResponse.data?.[0] ?? null;
  const alerts = asArray(alertsResponse.error ? [] : alertsResponse.data).filter(
    (alert) => !report || alert.report_date === report.report_date,
  );
  const beachRecommendations = asArray(recommendationsResponse.error ? [] : recommendationsResponse.data)
    .filter((recommendation) => !report || recommendation.report_date === report.report_date)
    .map((recommendation) => ({
      ...recommendation,
      reasons: asArray(recommendation.reasons),
      cautions: asArray(recommendation.cautions),
      activity_tags: asArray(recommendation.activity_tags),
    }));

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
    beachRecommendations,
  };
};

const numeric = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const activityStatusClasses = (status: ActivityCondition["status"]) => {
  if (status === "great") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "good") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
};

const hasAemetPending = (statuses: WeatherSourceStatus[]) =>
  statuses.some((status) => status.source_key.startsWith("aemet-") && status.status === "blocked");

const officialSourceUpdated = (statuses: WeatherSourceStatus[]) =>
  statuses.some((status) => status.source_key.startsWith("aemet-") && status.status === "success");

const latestStatusTime = (statuses: WeatherSourceStatus[]) => {
  const times = statuses.map((status) => new Date(status.fetched_at).getTime()).filter(Number.isFinite);
  if (!times.length) return "";
  return new Date(Math.max(...times)).toISOString();
};

const buildActivityConditions = (report: PublicWeatherReport | null, alerts: Array<PublicWeatherAlert | PublicWeatherReport["alerts_summary"][number]>): ActivityCondition[] => {
  const current = report?.current_conditions ?? {};
  const marine = report?.marine_summary ?? {};
  const today = report?.daily_forecast?.[0] ?? {};
  const beachStatuses = report?.beach_conditions?.map((condition) => condition.status) ?? [];
  const officialAlert = alerts.some((alert) => alert.official);
  const rainChance = numeric(today.precipitation_probability_pct) ?? 0;
  const gust = numeric(current.wind_gust_kmh) ?? numeric(current.wind_speed_kmh) ?? 0;
  const waveHeight = numeric(marine.wave_height_m) ?? 0;
  const uvIndex = numeric(today.uv_index) ?? 0;
  const bestBeach = beachStatuses.includes("good");

  return [
    {
      label: "Beach",
      icon: Waves,
      status: officialAlert || beachStatuses.includes("rough") ? "caution" : bestBeach ? "great" : "good",
      detail: officialAlert
        ? "Official alert active"
        : waveHeight >= 1.1
          ? "Choose sheltered coves"
          : "Calm sea window likely",
    },
    {
      label: "Swimming",
      icon: Droplets,
      status: officialAlert || waveHeight >= 1.4 ? "caution" : "great",
      detail: waveHeight >= 1.4 ? "Exposed water choppy" : `Sea ${formatNumber(marine.sea_surface_temperature_c, " C", 0)}`,
    },
    {
      label: "Sailing",
      icon: Sailboat,
      status: officialAlert || gust >= 40 ? "caution" : gust >= 25 ? "good" : "great",
      detail: gust >= 40 ? "Watch gusts" : `Gusts ${formatNumber(current.wind_gust_kmh, " km/h", 0)}`,
    },
    {
      label: "Hiking",
      icon: Mountain,
      status: rainChance >= 60 || uvIndex >= 8 ? "caution" : "good",
      detail: rainChance >= 60 ? "Rain window likely" : uvIndex >= 8 ? "High UV" : "Good walking window",
    },
    {
      label: "Cycling",
      icon: Bike,
      status: gust >= 35 || rainChance >= 60 ? "caution" : "good",
      detail: gust >= 35 ? "Wind exposed roads" : rainChance >= 60 ? "Rain risk" : "Decent riding conditions",
    },
    {
      label: "Sunset",
      icon: Sunset,
      status: officialAlert || rainChance >= 70 ? "caution" : "good",
      detail: officialAlert ? "Check alert timing" : rainChance >= 70 ? "Cloud or rain risk" : "Watch west coast light",
    },
  ];
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
      <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</span>
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
  const alerts = useMemo(
    () => (data?.alerts?.length ? data.alerts : report?.alerts_summary ?? []),
    [data?.alerts, report?.alerts_summary],
  );
  const sourceHealth = useMemo(() => sourceHealthSummary(report?.source_status ?? []), [report?.source_status]);
  const stale = reportIsStale(report);
  const aemetPending = hasAemetPending(report?.source_status ?? []);
  const aemetUpdated = officialSourceUpdated(report?.source_status ?? []);
  const activities = useMemo(() => buildActivityConditions(report, alerts), [alerts, report]);
  const latestSourceAt = latestStatusTime(report?.source_status ?? []);
  const officialAlerts = alerts.filter((alert) => alert.official);
  const modelAlerts = alerts.filter((alert) => !alert.official);
  const intelligence = report?.weather_intelligence ?? {};
  const officialStatus = intelligence.official_status;
  const modelConsensus = intelligence.model_consensus;
  const localWatchItems = intelligence.local_watch_items ?? [];
  const bestNow = (data?.beachRecommendations ?? []).filter((recommendation) => recommendation.time_window === "best_now").slice(0, 4);
  const bestAfternoon = (data?.beachRecommendations ?? []).filter((recommendation) => recommendation.time_window === "best_afternoon").slice(0, 4);
  const avoidExposed = (data?.beachRecommendations ?? []).filter((recommendation) => recommendation.time_window === "avoid_exposed").slice(0, 3);

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
            The Supabase weather system is ready for stored reports. Once the scheduled collector publishes, weather,
            sea state, beach guidance, and source timestamps will appear here.
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
    <div className="space-y-6 md:space-y-8">
      {(stale || report.stale_flags.length > 0) && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <div>
            {stale
              ? "Today's report has not published yet; showing the most recent source-backed report."
              : "Some sources are incomplete today; Ibiza Maps continues with available verified sources."}
            {aemetPending ? " Official AEMET data is pending the Supabase function secret." : ""}
          </div>
        </div>
      )}

      <section className="overflow-hidden border bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 md:p-7">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="border-primary/30 bg-white text-primary">
                Today in Ibiza
              </Badge>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {formatMadridDate(report.report_date, { weekday: "long", year: "numeric" })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Updated {formatMadridTime(report.last_successful_source_at || report.generated_at)}
              </span>
            </div>

            <h2 className="text-3xl font-bold leading-tight text-foreground md:text-4xl">{report.headline}</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              {intelligence.daily_decision_summary || report.summary}
            </p>
            {intelligence.daily_decision_summary && (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{report.summary}</p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-sky-200 bg-white text-sky-900">
                {formatWind(current.wind_speed_kmh, current.wind_direction_label)}
              </Badge>
              <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-900">
                Waves {formatNumber(marine.wave_height_m, " m", 1)}
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-white text-amber-900">
                UV {formatNumber(daily[0]?.uv_index, "", 1)}
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-900">
                {sourceHealth.updated}/{sourceHealth.total} sources updated
              </Badge>
            </div>
          </div>

          <div className="border-t bg-slate-950 p-5 text-white lg:border-l lg:border-t-0 md:p-7">
            <div className="mb-4 flex items-center gap-2">
              {officialAlerts.length > 0 ? <ShieldAlert className="h-5 w-5 text-amber-300" /> : <ShieldCheck className="h-5 w-5 text-emerald-300" />}
              <h3 className="text-lg font-semibold">Official Alert Status</h3>
            </div>

            {officialAlerts.length > 0 ? (
              <div className="space-y-3">
                {officialAlerts.map((alert) => (
                  <article key={`${alert.source_key || "aemet"}-${alert.title}-${alert.onset_at || ""}`} className="border border-amber-300/40 bg-amber-300/10 p-4">
                    <Badge variant="outline" className="border-amber-200 text-amber-100">
                      Official AEMET
                    </Badge>
                    <h4 className="mt-3 font-semibold">{alert.title}</h4>
                    {"summary" in alert && alert.summary && <p className="mt-2 text-sm leading-6 text-amber-50/90">{alert.summary}</p>}
                    <p className="mt-3 text-xs text-amber-50/80">
                      {alert.onset_at ? formatMadridTime(alert.onset_at) : "Now"} - {alert.expires_at ? formatMadridTime(alert.expires_at) : "until updated"}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="space-y-3 text-sm leading-6 text-slate-200">
                <p>No official AEMET alert is stored for this report.</p>
                <p>
                  {aemetUpdated
                    ? "AEMET official sources checked successfully."
                    : aemetPending
                      ? "AEMET is configured in the source registry but still needs the Supabase function secret before official alerts can appear."
                      : "Official alert source status is visible in Source Evidence below."}
                </p>
              </div>
            )}

            <Button type="button" variant="secondary" onClick={handleRefresh} disabled={isFetching} className="mt-5 w-full">
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh displayed report
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {activities.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={cn("border p-4 shadow-sm", activityStatusClasses(item.status))}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <Icon className="h-5 w-5" />
                <Badge variant="outline" className="border-current text-current">
                  {item.status}
                </Badge>
              </div>
              <h3 className="font-semibold">{item.label}</h3>
              <p className="mt-1 text-sm leading-5 opacity-85">{item.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Official AEMET And Confidence</h3>
            </div>
            <Badge variant="outline" className={cn("uppercase tracking-normal", confidenceClasses(intelligence.confidence_label))}>
              {intelligence.confidence_label || "updating"} confidence
            </Badge>
          </div>
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>{officialStatus?.message || "Official AEMET status is visible when the source check completes."}</p>
            {officialStatus?.last_checked_at && (
              <p>AEMET checked {formatMadridTime(officialStatus.last_checked_at)}.</p>
            )}
            <p>{modelConsensus?.summary || "Source agreement is assessed after each cloud collection run."}</p>
            {typeof intelligence.confidence_score === "number" && (
              <p>Decision confidence score: {Math.round(intelligence.confidence_score)}/100.</p>
            )}
          </div>
        </div>

        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Local Watch Items</h3>
          </div>
          {localWatchItems.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {localWatchItems.map((item) => (
                <article key={`${item.type}-${item.label}`} className="border bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="font-semibold">{item.label || "Weather signal"}</h4>
                    <Badge variant="outline" className={cn("border-current text-current", item.priority === "high" ? "text-red-700" : "text-amber-700")}>
                      {item.priority || "watch"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{item.detail || "Stored source-backed signal."}</p>
                  {item.source && <p className="mt-2 text-xs text-muted-foreground">Source: {item.source}</p>}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No special watch item was generated beyond the stored forecast. Check local flags before swimming.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Thermometer}
          label="Temperature"
          value={formatTemperature(current.temperature_c)}
          detail={current.apparent_temperature_c ? `Feels like ${formatTemperature(current.apparent_temperature_c)}` : current.condition || ""}
        />
        <Metric
          icon={Wind}
          label="Wind and gusts"
          value={formatWind(current.wind_speed_kmh, current.wind_direction_label)}
          detail={current.wind_gust_kmh ? `Gusts near ${Math.round(current.wind_gust_kmh)} km/h` : "Gusts updating"}
        />
        <Metric
          icon={Umbrella}
          label="Rain window"
          value={formatNumber(daily[0]?.precipitation_probability_pct, "%", 0)}
          detail={daily[0]?.precipitation_mm ? `${formatNumber(daily[0].precipitation_mm, " mm", 1)} possible today` : "Daily probability"}
        />
        <Metric
          icon={Waves}
          label="Sea state"
          value={formatNumber(marine.wave_height_m, " m", 1)}
          detail={
            marine.sea_surface_temperature_c
              ? `Sea ${formatNumber(marine.sea_surface_temperature_c, " C", 0)}`
              : `${marine.wave_direction_label || "Wave"} direction`
          }
        />
      </section>

      {(bestNow.length > 0 || bestAfternoon.length > 0) && (
        <section className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Beach Recommendation Engine</h3>
            </div>
            <p className="text-sm text-muted-foreground">Ranked by wind exposure, waves, shelter, UV, rain, and official alerts.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Best now</h4>
              <div className="grid gap-3">
                {bestNow.map((recommendation) => (
                  <article key={`now-${recommendation.id}`} className={cn("border p-4", recommendationStatusClasses(recommendation.status))}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h5 className="font-semibold">{recommendation.rank}. {recommendation.beach_name}</h5>
                        <p className="text-xs opacity-80">{recommendation.coast}</p>
                      </div>
                      <Badge variant="outline" className="border-current text-current">{recommendation.score}</Badge>
                    </div>
                    <p className="text-sm font-medium">{recommendation.decision}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {recommendation.reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="border border-current/30 bg-white/60 px-2 py-1">{reason}</span>
                      ))}
                    </div>
                    {recommendation.cautions.length > 0 && (
                      <p className="mt-3 text-xs opacity-85">{recommendation.cautions.slice(0, 2).join("; ")}</p>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-normal text-muted-foreground">Best afternoon / sunset</h4>
              <div className="grid gap-3">
                {bestAfternoon.map((recommendation) => (
                  <article key={`afternoon-${recommendation.id}`} className={cn("border p-4", recommendationStatusClasses(recommendation.status))}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h5 className="font-semibold">{recommendation.rank}. {recommendation.beach_name}</h5>
                        <p className="text-xs opacity-80">{recommendation.coast}</p>
                      </div>
                      <Badge variant="outline" className="border-current text-current">{recommendation.status}</Badge>
                    </div>
                    <p className="text-sm font-medium">{recommendation.decision}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {recommendation.reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="border border-current/30 bg-white/60 px-2 py-1">{reason}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
          {avoidExposed.length > 0 && (
            <div className="mt-5 border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-amber-900">More exposed today</h4>
              <div className="flex flex-wrap gap-2 text-sm text-amber-900">
                {avoidExposed.map((recommendation) => (
                  <span key={`avoid-${recommendation.id}`} className="border border-amber-300 bg-white/60 px-2 py-1">
                    {recommendation.beach_name}: {recommendation.cautions[0] || recommendation.decision}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Recommendations are guidance only. Always follow beach flags, lifeguards, and official alerts.
          </p>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Waves className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Beach & Coast Decision</h3>
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
        </div>

        <div className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Light, UV And Timing</h3>
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
          <div className="mt-4 border bg-slate-50 p-4 text-sm leading-6 text-muted-foreground">
            UV index {formatNumber(daily[0]?.uv_index, "", 1)}. Use local beach flags and lifeguard advice before swimming.
          </div>
        </div>
      </section>

      {modelAlerts.length > 0 && (
        <section className="border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Non-Official Weather Concerns</h3>
          </div>
          <div className="space-y-3">
            {modelAlerts.map((alert) => (
              <article key={`${alert.source_key || "model"}-${alert.title}-${alert.onset_at || ""}`} className={cn("border p-4", alertSeverityClasses(alert.severity))}>
                <Badge variant="outline" className="border-current text-current">
                  Model/free-source concern
                </Badge>
                <h4 className="mt-3 font-semibold">{alert.title}</h4>
                {"summary" in alert && alert.summary && <p className="mt-2 text-sm leading-6">{alert.summary}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

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
          <CalendarDays className="h-5 w-5 text-primary" />
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
            <Compass className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Source Evidence</h3>
          </div>
          <div className="text-sm text-muted-foreground">
            {sourceHealth.updated}/{sourceHealth.total} sources updated
            {sourceHealth.blocked > 0 ? `, ${sourceHealth.blocked} awaiting key` : ""}
            {sourceHealth.failed > 0 ? `, ${sourceHealth.failed} with issues` : ""}
            {latestSourceAt ? ` - latest check ${formatMadridTime(latestSourceAt)}` : ""}
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

        {report.source_disagreements.length > 0 && (
          <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Source disagreement detected
            </div>
            Ibiza Maps keeps separate source readings when sources disagree; the public summary uses the best available
            normalized report and keeps disagreement evidence here.
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
        Weather is refreshed by cloud automation. Public summaries show stored source-backed data, not live AI-generated claims.
      </div>
    </div>
  );
};

export default WeatherWidget;
