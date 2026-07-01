import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-admin-token, x-sync-secret",
};

const IBIZA = {
  latitude: 38.9067,
  longitude: 1.4206,
  timezone: "Europe/Madrid",
};

type CollectWeatherRequest = {
  source_keys?: string[];
  target_date?: string;
  run_type?: "daily" | "manual" | "alert_refresh" | "backfill" | "source_audit";
  dry_run?: boolean;
  publish?: boolean;
  forecast_days?: number;
};

type WeatherSourceRow = {
  source_key: string;
  label: string;
  source_type: "official_api" | "model_api" | "marine_api" | "astronomy_api";
  source_url: string;
  source_domain: string;
  priority: number;
  enabled: boolean;
  attribution: string;
  attribution_url: string | null;
  raw_metadata: Record<string, unknown> | null;
};

type SourceStatus = {
  source_key: string;
  label: string;
  status: "success" | "failed" | "skipped" | "blocked";
  fetched_at: string;
  source_url: string;
  attribution: string;
  attribution_url: string | null;
  message?: string;
};

type ForecastPoint = {
  run_id: string;
  snapshot_id?: string | null;
  source_key: string;
  report_date: string;
  point_type: "current" | "hourly" | "daily" | "marine_hourly" | "marine_daily" | "astronomy";
  location_key?: string;
  forecast_time?: string | null;
  forecast_date?: string | null;
  temperature_c?: number | null;
  apparent_temperature_c?: number | null;
  temp_min_c?: number | null;
  temp_max_c?: number | null;
  precipitation_probability_pct?: number | null;
  precipitation_mm?: number | null;
  weather_code?: number | null;
  cloud_cover_pct?: number | null;
  wind_speed_kmh?: number | null;
  wind_gust_kmh?: number | null;
  wind_direction_deg?: number | null;
  uv_index?: number | null;
  wave_height_m?: number | null;
  wave_period_s?: number | null;
  wave_direction_deg?: number | null;
  sea_surface_temperature_c?: number | null;
  sunrise_at?: string | null;
  sunset_at?: string | null;
  source_observed_at?: string | null;
  raw_metadata?: Record<string, unknown>;
};

type WeatherAlert = {
  run_id: string;
  snapshot_id?: string | null;
  source_key: string;
  report_date: string;
  alert_uid: string;
  title: string;
  summary?: string | null;
  event?: string | null;
  zone?: string | null;
  severity?: string | null;
  certainty?: string | null;
  urgency?: string | null;
  effective_at?: string | null;
  onset_at?: string | null;
  expires_at?: string | null;
  source_url?: string | null;
  official: boolean;
  raw_metadata?: Record<string, unknown>;
};

type ReportParts = {
  current?: Record<string, unknown>;
  hourly: Record<string, unknown>[];
  daily: Record<string, unknown>[];
  marine?: Record<string, unknown>;
  astronomy?: Record<string, unknown>;
  alerts: WeatherAlert[];
};

type JellyfishSignal = {
  status: "unavailable" | "low" | "watch" | "elevated";
  confidence: "low" | "medium";
  headline: string;
  explanation: string;
  reasons: string[];
  cautions: string[];
  source: string;
  medusas_url: string;
  generated_at: string;
};

type BeachProfile = {
  id?: string | null;
  canonical_beach_id?: string | null;
  beach_key: string;
  beach_name: string;
  coast: "North coast" | "East coast" | "South coast" | "West coast";
  municipality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  wind_exposure_degrees: number[];
  swell_exposure_degrees: number[];
  shelter_level: number;
  swim_suitability: number;
  family_suitability: number;
  sunset_value: number;
  sunrise_value: number;
  activity_tags: string[];
  wind_speed_limit_kt?: number | null;
  rain_suitability_score?: number | null;
  walking_score?: number | null;
  snorkeling_score?: number | null;
  facilities?: string | null;
  access_difficulty?: string | null;
  beach_type?: string | null;
  water_clarity?: string | null;
  jellyfish_trap_bay?: boolean;
  lifeguard_caveat?: string;
};

type BeachRecommendation = {
  run_id: string;
  report_date: string;
  beach_profile_id?: string | null;
  canonical_beach_id?: string | null;
  beach_key: string;
  beach_name: string;
  coast: string;
  time_window: "best_now" | "best_swim" | "best_family" | "best_sunset" | "best_afternoon" | "good_alternative" | "avoid_exposed";
  rank: number;
  score: number;
  status: "great" | "good" | "caution" | "avoid";
  decision: string;
  reasons: string[];
  cautions: string[];
  source_timestamps: Record<string, string | null>;
  municipality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_tags?: string[];
  lifeguard_caveat?: string;
  generated_at: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const requireSyncToken = async (req: Request, supabase: SupabaseClient) => {
  const actualToken = req.headers.get("x-sync-admin-token") || req.headers.get("x-sync-secret");
  if (!actualToken) throw new Error("Unauthorized sync request");

  const expectedToken = Deno.env.get("SYNC_ADMIN_TOKEN") || Deno.env.get("ADMIN_API_KEY");
  if (expectedToken && actualToken === expectedToken) return;

  const actualHash = await sha256(actualToken);
  const { data, error } = await supabase
    .from("x_signal_runtime_config")
    .select("config_key,config_value")
    .in("config_key", ["weather_sync_admin_token_sha256", "sync_admin_token_sha256"]);

  if (error) throw new Error("Unauthorized sync request");
  if ((data || []).some((row: { config_value: string }) => row.config_value === actualHash)) return;

  throw new Error("Unauthorized sync request");
};

const targetDateInMadrid = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: IBIZA.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const parseRequest = async (req: Request): Promise<Required<CollectWeatherRequest>> => {
  const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as CollectWeatherRequest) : {};
  const dryRun = body.dry_run ?? !body.publish;

  return {
    source_keys: body.source_keys ?? [],
    target_date: body.target_date ?? targetDateInMadrid(),
    run_type: body.run_type ?? "manual",
    dry_run: dryRun,
    publish: body.publish ?? false,
    forecast_days: Math.max(1, Math.min(body.forecast_days ?? 7, 7)),
  };
};

const round = (value: unknown, digits = 1) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const factor = 10 ** digits;
  return Math.round(numberValue * factor) / factor;
};

const intValue = (value: unknown) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.round(numberValue);
};

const finiteNumberValue = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const arrayValue = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const isoOrNull = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const madridOffsetMinutes = (date: Date) => {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: IBIZA.timezone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;

  const match = part?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 60;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
};

const madridLocalToIso = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(value)) return isoOrNull(value);

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):?(\d{2})?)?/);
  if (!match) return isoOrNull(value);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 12);
  const minute = Number(match[5] || 0);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = madridOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offset * 60_000).toISOString();
};

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const stripTags = (text: string) => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const tryParseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const decoderForContentType = (contentType: string) => {
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim();
  try {
    return new TextDecoder(charset || "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
};

const fetchText = async (url: string, accept = "application/json,*/*;q=0.8") => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": "Ibiza Maps Weather Collector/1.0 (+https://ibiza-maps.com/weather)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";

    return {
      status: response.status,
      finalUrl: response.url,
      text: decoderForContentType(contentType).decode(bytes),
      contentType,
      bytes,
      retryAfter: response.headers.get("retry-after"),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null | undefined) => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
};

const fetchAemetText = async (url: string, accept = "application/json,*/*;q=0.8") => {
  let latest = await fetchText(url, accept);

  for (let attempt = 1; attempt <= 3 && (latest.status === 429 || latest.status >= 500); attempt += 1) {
    const retryAfterMs = parseRetryAfterMs(latest.retryAfter);
    await sleep(retryAfterMs ?? attempt * 2500);
    latest = await fetchText(url, accept);
  }

  return latest;
};

const insertSnapshot = async (
  supabase: SupabaseClient,
  runId: string,
  source: WeatherSourceRow,
  snapshot: {
    fetch_status: SourceStatus["status"];
    status_code?: number | null;
    final_url?: string | null;
    text?: string;
    payload?: unknown;
    message?: string;
  },
) => {
  const text = snapshot.text ?? JSON.stringify(snapshot.payload ?? {});
  const payload = snapshot.payload ?? tryParseJson(text) ?? { text_excerpt: stripTags(text).slice(0, 4000) };
  const contentHash = text ? await sha256(text) : null;

  const { data, error } = await supabase
    .from("weather_source_snapshots")
    .insert({
      run_id: runId,
      source_key: source.source_key,
      source_url: source.source_url,
      final_url: snapshot.final_url ?? source.source_url,
      fetch_status: snapshot.fetch_status,
      status_code: snapshot.status_code ?? null,
      content_hash: contentHash,
      excerpt: stripTags(text).slice(0, 1200),
      payload,
      raw_metadata: {
        content_type: typeof payload === "object" && payload ? "structured" : "text",
        bytes: text.length,
        message: snapshot.message,
      },
    })
    .select("id,fetched_at")
    .single();

  if (error) throw error;
  return data as { id: string; fetched_at: string };
};

const sourceStatus = (
  source: WeatherSourceRow,
  status: SourceStatus["status"],
  fetchedAt: string,
  message?: string,
): SourceStatus => ({
  source_key: source.source_key,
  label: source.label,
  status,
  fetched_at: fetchedAt,
  source_url: source.source_url,
  attribution: source.attribution,
  attribution_url: source.attribution_url,
  ...(message ? { message } : {}),
});

const buildOpenMeteoForecastUrl = (sourceUrl: string, forecastDays: number) => {
  const url = new URL(sourceUrl);
  url.searchParams.set("latitude", String(IBIZA.latitude));
  url.searchParams.set("longitude", String(IBIZA.longitude));
  url.searchParams.set("timezone", IBIZA.timezone);
  url.searchParams.set("forecast_days", String(forecastDays));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
  );
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "uv_index",
    ].join(","),
  );
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "uv_index_max",
      "sunrise",
      "sunset",
    ].join(","),
  );
  return url.toString();
};

const buildOpenMeteoMarineUrl = (sourceUrl: string, forecastDays: number) => {
  const url = new URL(sourceUrl);
  url.searchParams.set("latitude", String(IBIZA.latitude));
  url.searchParams.set("longitude", String(IBIZA.longitude));
  url.searchParams.set("timezone", IBIZA.timezone);
  url.searchParams.set("forecast_days", String(forecastDays));
  url.searchParams.set(
    "hourly",
    ["wave_height", "wave_direction", "wave_period", "wind_wave_height", "swell_wave_height", "sea_surface_temperature"].join(","),
  );
  url.searchParams.set(
    "daily",
    ["wave_height_max", "wave_direction_dominant", "wave_period_max", "wind_wave_height_max", "swell_wave_height_max"].join(","),
  );
  return url.toString();
};

const buildSunriseUrl = (sourceUrl: string, targetDate: string) => {
  const url = new URL(sourceUrl);
  url.searchParams.set("lat", String(IBIZA.latitude));
  url.searchParams.set("lng", String(IBIZA.longitude));
  url.searchParams.set("date", targetDate);
  url.searchParams.set("formatted", "0");
  url.searchParams.set("tzid", IBIZA.timezone);
  return url.toString();
};

const windDirectionLabel = (degrees: unknown) => {
  const value = intValue(degrees);
  if (value === null) return "variable";
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(value / 45) % 8];
};

const weatherCodeLabel = (code: unknown) => {
  const value = intValue(code);
  if (value === null) return "conditions updating";
  if (value === 0) return "clear";
  if ([1, 2].includes(value)) return "mostly clear";
  if (value === 3) return "cloudy";
  if ([45, 48].includes(value)) return "fog";
  if ([51, 53, 55, 56, 57].includes(value)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "snow";
  if ([95, 96, 99].includes(value)) return "thunderstorms";
  return "mixed conditions";
};

const normalizeOpenMeteoForecast = (
  payload: Record<string, unknown>,
  source: WeatherSourceRow,
  runId: string,
  snapshotId: string,
  reportDate: string,
) => {
  const points: ForecastPoint[] = [];
  const current = (payload.current ?? {}) as Record<string, unknown>;
  const currentTime = madridLocalToIso(current.time);

  points.push({
    run_id: runId,
    snapshot_id: snapshotId,
    source_key: source.source_key,
    report_date: reportDate,
    point_type: "current",
    forecast_time: currentTime,
    forecast_date: typeof current.time === "string" ? current.time.slice(0, 10) : reportDate,
    temperature_c: round(current.temperature_2m),
    apparent_temperature_c: round(current.apparent_temperature),
    precipitation_mm: round(current.precipitation),
    weather_code: intValue(current.weather_code),
    cloud_cover_pct: intValue(current.cloud_cover),
    wind_speed_kmh: round(current.wind_speed_10m),
    wind_gust_kmh: round(current.wind_gusts_10m),
    wind_direction_deg: intValue(current.wind_direction_10m),
    source_observed_at: currentTime,
    raw_metadata: { source_label: source.label },
  });

  const hourly = (payload.hourly ?? {}) as Record<string, unknown[]>;
  const hourlyTimes = arrayValue<string>(hourly.time).slice(0, 48);
  hourlyTimes.forEach((time, index) => {
    points.push({
      run_id: runId,
      snapshot_id: snapshotId,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "hourly",
      forecast_time: madridLocalToIso(time),
      forecast_date: time.slice(0, 10),
      temperature_c: round(hourly.temperature_2m?.[index]),
      apparent_temperature_c: round(hourly.apparent_temperature?.[index]),
      precipitation_probability_pct: intValue(hourly.precipitation_probability?.[index]),
      precipitation_mm: round(hourly.precipitation?.[index]),
      weather_code: intValue(hourly.weather_code?.[index]),
      cloud_cover_pct: intValue(hourly.cloud_cover?.[index]),
      wind_speed_kmh: round(hourly.wind_speed_10m?.[index]),
      wind_gust_kmh: round(hourly.wind_gusts_10m?.[index]),
      wind_direction_deg: intValue(hourly.wind_direction_10m?.[index]),
      uv_index: round(hourly.uv_index?.[index]),
      raw_metadata: { source_label: source.label },
    });
  });

  const daily = (payload.daily ?? {}) as Record<string, unknown[]>;
  const dailyDates = arrayValue<string>(daily.time);
  dailyDates.forEach((date, index) => {
    points.push({
      run_id: runId,
      snapshot_id: snapshotId,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "daily",
      forecast_date: date,
      forecast_time: madridLocalToIso(`${date}T12:00`),
      temp_min_c: round(daily.temperature_2m_min?.[index]),
      temp_max_c: round(daily.temperature_2m_max?.[index]),
      precipitation_probability_pct: intValue(daily.precipitation_probability_max?.[index]),
      precipitation_mm: round(daily.precipitation_sum?.[index]),
      weather_code: intValue(daily.weather_code?.[index]),
      wind_speed_kmh: round(daily.wind_speed_10m_max?.[index]),
      wind_gust_kmh: round(daily.wind_gusts_10m_max?.[index]),
      wind_direction_deg: intValue(daily.wind_direction_10m_dominant?.[index]),
      uv_index: round(daily.uv_index_max?.[index]),
      sunrise_at: madridLocalToIso(daily.sunrise?.[index]),
      sunset_at: madridLocalToIso(daily.sunset?.[index]),
      raw_metadata: { source_label: source.label },
    });
  });

  const reportCurrent = {
    source_key: source.source_key,
    source_label: source.label,
    updated_at: currentTime,
    temperature_c: round(current.temperature_2m),
    apparent_temperature_c: round(current.apparent_temperature),
    precipitation_mm: round(current.precipitation),
    weather_code: intValue(current.weather_code),
    condition: weatherCodeLabel(current.weather_code),
    cloud_cover_pct: intValue(current.cloud_cover),
    wind_speed_kmh: round(current.wind_speed_10m),
    wind_gust_kmh: round(current.wind_gusts_10m),
    wind_direction_deg: intValue(current.wind_direction_10m),
    wind_direction_label: windDirectionLabel(current.wind_direction_10m),
  };

  const reportHourly = hourlyTimes.slice(0, 24).map((time, index) => ({
    time,
    forecast_time: madridLocalToIso(time),
    temperature_c: round(hourly.temperature_2m?.[index]),
    apparent_temperature_c: round(hourly.apparent_temperature?.[index]),
    precipitation_probability_pct: intValue(hourly.precipitation_probability?.[index]),
    precipitation_mm: round(hourly.precipitation?.[index]),
    weather_code: intValue(hourly.weather_code?.[index]),
    condition: weatherCodeLabel(hourly.weather_code?.[index]),
    wind_speed_kmh: round(hourly.wind_speed_10m?.[index]),
    wind_gust_kmh: round(hourly.wind_gusts_10m?.[index]),
    wind_direction_deg: intValue(hourly.wind_direction_10m?.[index]),
    wind_direction_label: windDirectionLabel(hourly.wind_direction_10m?.[index]),
    uv_index: round(hourly.uv_index?.[index]),
  }));

  const reportDaily = dailyDates.map((date, index) => ({
    date,
    temp_min_c: round(daily.temperature_2m_min?.[index]),
    temp_max_c: round(daily.temperature_2m_max?.[index]),
    precipitation_probability_pct: intValue(daily.precipitation_probability_max?.[index]),
    precipitation_mm: round(daily.precipitation_sum?.[index]),
    weather_code: intValue(daily.weather_code?.[index]),
    condition: weatherCodeLabel(daily.weather_code?.[index]),
    wind_speed_kmh: round(daily.wind_speed_10m_max?.[index]),
    wind_gust_kmh: round(daily.wind_gusts_10m_max?.[index]),
    wind_direction_deg: intValue(daily.wind_direction_10m_dominant?.[index]),
    wind_direction_label: windDirectionLabel(daily.wind_direction_10m_dominant?.[index]),
    uv_index: round(daily.uv_index_max?.[index]),
    sunrise_at: madridLocalToIso(daily.sunrise?.[index]),
    sunset_at: madridLocalToIso(daily.sunset?.[index]),
  }));

  return { points, current: reportCurrent, hourly: reportHourly, daily: reportDaily };
};

const normalizeOpenMeteoMarine = (
  payload: Record<string, unknown>,
  source: WeatherSourceRow,
  runId: string,
  snapshotId: string,
  reportDate: string,
) => {
  const points: ForecastPoint[] = [];
  const hourly = (payload.hourly ?? {}) as Record<string, unknown[]>;
  const hourlyTimes = arrayValue<string>(hourly.time).slice(0, 48);

  hourlyTimes.forEach((time, index) => {
    points.push({
      run_id: runId,
      snapshot_id: snapshotId,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "marine_hourly",
      forecast_time: madridLocalToIso(time),
      forecast_date: time.slice(0, 10),
      wave_height_m: round(hourly.wave_height?.[index]),
      wave_period_s: round(hourly.wave_period?.[index]),
      wave_direction_deg: intValue(hourly.wave_direction?.[index]),
      sea_surface_temperature_c: round(hourly.sea_surface_temperature?.[index]),
      raw_metadata: {
        source_label: source.label,
        wind_wave_height_m: round(hourly.wind_wave_height?.[index]),
        swell_wave_height_m: round(hourly.swell_wave_height?.[index]),
      },
    });
  });

  const daily = (payload.daily ?? {}) as Record<string, unknown[]>;
  const dailyDates = arrayValue<string>(daily.time);
  dailyDates.forEach((date, index) => {
    points.push({
      run_id: runId,
      snapshot_id: snapshotId,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "marine_daily",
      forecast_date: date,
      forecast_time: madridLocalToIso(`${date}T12:00`),
      wave_height_m: round(daily.wave_height_max?.[index]),
      wave_period_s: round(daily.wave_period_max?.[index]),
      wave_direction_deg: intValue(daily.wave_direction_dominant?.[index]),
      raw_metadata: {
        source_label: source.label,
        wind_wave_height_max_m: round(daily.wind_wave_height_max?.[index]),
        swell_wave_height_max_m: round(daily.swell_wave_height_max?.[index]),
      },
    });
  });

  const todayIndex = Math.max(0, dailyDates.indexOf(reportDate));
  const firstSeaTemp = round(hourly.sea_surface_temperature?.[0]);
  const marine = {
    source_key: source.source_key,
    source_label: source.label,
    updated_at: hourlyTimes[0] ? madridLocalToIso(hourlyTimes[0]) : new Date().toISOString(),
    wave_height_m: round(daily.wave_height_max?.[todayIndex] ?? hourly.wave_height?.[0]),
    wave_period_s: round(daily.wave_period_max?.[todayIndex] ?? hourly.wave_period?.[0]),
    wave_direction_deg: intValue(daily.wave_direction_dominant?.[todayIndex] ?? hourly.wave_direction?.[0]),
    wave_direction_label: windDirectionLabel(daily.wave_direction_dominant?.[todayIndex] ?? hourly.wave_direction?.[0]),
    sea_surface_temperature_c: firstSeaTemp,
  };

  return { points, marine };
};

const compassToDegrees = (value: unknown) => {
  if (typeof value !== "string") return intValue(value);
  const normalized = value.trim().toUpperCase();
  const map: Record<string, number> = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    SO: 225,
    W: 270,
    O: 270,
    NW: 315,
    NO: 315,
  };
  return map[normalized] ?? null;
};

const aemetValueFromArray = (items: unknown, preferredKey = "value") => {
  const values = arrayValue<Record<string, unknown>>(items)
    .map((item) => item[preferredKey])
    .filter((value) => value !== "" && value !== undefined && value !== null);
  return values[0] ?? null;
};

const normalizeAemetDaily = (
  payload: unknown,
  source: WeatherSourceRow,
  runId: string,
  snapshotId: string,
  reportDate: string,
) => {
  const first = Array.isArray(payload) ? (payload[0] as Record<string, unknown>) : (payload as Record<string, unknown>);
  const prediccion = (first?.prediccion ?? {}) as Record<string, unknown>;
  const days = arrayValue<Record<string, unknown>>(prediccion.dia);
  const points: ForecastPoint[] = [];

  days.forEach((day) => {
    const date = typeof day.fecha === "string" ? day.fecha.slice(0, 10) : reportDate;
    const temperature = (day.temperatura ?? {}) as Record<string, unknown>;
    const wind = arrayValue<Record<string, unknown>>(day.viento)[0] ?? {};
    points.push({
      run_id: runId,
      snapshot_id: snapshotId,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "daily",
      forecast_date: date,
      forecast_time: madridLocalToIso(`${date}T12:00`),
      temp_min_c: round(temperature.minima),
      temp_max_c: round(temperature.maxima),
      precipitation_probability_pct: intValue(aemetValueFromArray(day.probPrecipitacion)),
      weather_code: intValue(aemetValueFromArray(day.estadoCielo)),
      wind_speed_kmh: round(wind.velocidad),
      wind_direction_deg: compassToDegrees(wind.direccion),
      uv_index: round(day.uvMax),
      source_observed_at: madridLocalToIso(first?.elaborado),
      raw_metadata: {
        source_label: source.label,
        source_name: first?.nombre,
        source_province: first?.provincia,
      },
    });
  });

  return { points };
};

const normalizeAemetHourly = (
  payload: unknown,
  source: WeatherSourceRow,
  runId: string,
  snapshotId: string,
  reportDate: string,
) => {
  const first = Array.isArray(payload) ? (payload[0] as Record<string, unknown>) : (payload as Record<string, unknown>);
  const prediccion = (first?.prediccion ?? {}) as Record<string, unknown>;
  const days = arrayValue<Record<string, unknown>>(prediccion.dia);
  const points: ForecastPoint[] = [];

  days.forEach((day) => {
    const date = typeof day.fecha === "string" ? day.fecha.slice(0, 10) : reportDate;
    const temperatures = arrayValue<Record<string, unknown>>(day.temperatura);
    const rain = arrayValue<Record<string, unknown>>(day.precipitacion);
    const rainProbability = arrayValue<Record<string, unknown>>(day.probPrecipitacion);
    const sky = arrayValue<Record<string, unknown>>(day.estadoCielo);
    const windAndGust = arrayValue<Record<string, unknown>>(day.vientoAndRachaMax);
    const maxLength = Math.max(temperatures.length, rain.length, rainProbability.length, sky.length);

    for (let index = 0; index < maxLength; index += 1) {
      const period = String(temperatures[index]?.periodo ?? rainProbability[index]?.periodo ?? sky[index]?.periodo ?? "").padStart(2, "0");
      if (!period || period === "00") continue;
      const wind = windAndGust.find((item) => item.periodo === period) ?? {};
      points.push({
        run_id: runId,
        snapshot_id: snapshotId,
        source_key: source.source_key,
        report_date: reportDate,
        point_type: "hourly",
        forecast_date: date,
        forecast_time: madridLocalToIso(`${date}T${period}:00`),
        temperature_c: round(temperatures[index]?.value),
        precipitation_mm: round(rain[index]?.value),
        precipitation_probability_pct: intValue(rainProbability[index]?.value),
        weather_code: intValue(sky[index]?.value),
        wind_speed_kmh: round(wind.velocidad),
        wind_direction_deg: compassToDegrees(wind.direccion),
        source_observed_at: madridLocalToIso(first?.elaborado),
        raw_metadata: { source_label: source.label },
      });
    }
  });

  return { points };
};

const parseCapAlerts = (text: string, source: WeatherSourceRow, runId: string, snapshotId: string, reportDate: string): WeatherAlert[] => {
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const alerts = Array.from(doc.getElementsByTagName("alert"));
    return alerts
      .map((alert, index) => {
        const get = (tag: string) => alert.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
        const info = alert.getElementsByTagName("info")[0] ?? alert;
        const getInfo = (tag: string) => info.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
        const area = info.getElementsByTagName("area")[0] ?? info;
        const zone = area.getElementsByTagName("areaDesc")[0]?.textContent?.trim() || "Ibiza and Formentera";
        const combined = `${zone} ${getInfo("headline")} ${getInfo("description")} ${getInfo("event")}`;

        if (!/ibiza|eivissa|formentera|pitius/i.test(combined)) return null;

        return {
          run_id: runId,
          snapshot_id: snapshotId,
          source_key: source.source_key,
          report_date: reportDate,
          alert_uid: get("identifier") || `${source.source_key}-${reportDate}-${index}`,
          title: getInfo("headline") || getInfo("event") || "AEMET official weather alert",
          summary: getInfo("description") || null,
          event: getInfo("event") || null,
          zone,
          severity: (getInfo("severity") || "unknown").toLowerCase(),
          certainty: getInfo("certainty") || null,
          urgency: getInfo("urgency") || null,
          effective_at: isoOrNull(getInfo("effective")),
          onset_at: isoOrNull(getInfo("onset")),
          expires_at: isoOrNull(getInfo("expires")),
          source_url: source.source_url,
          official: true,
          raw_metadata: {
            sender: get("sender"),
            sent: isoOrNull(get("sent")),
            attribution: source.attribution,
          },
        };
      })
      .filter((item): item is WeatherAlert => Boolean(item));
  } catch (error) {
    console.warn("CAP parse failed", error);
    return [];
  }
};

const extractTarTextFiles = (bytes: Uint8Array) => {
  const files: Array<{ name: string; text: string }> = [];
  const headerSize = 512;
  let offset = 0;

  while (offset + headerSize <= bytes.length) {
    const header = bytes.slice(offset, offset + headerSize);
    const name = new TextDecoder("utf-8").decode(header.slice(0, 100)).replace(/\0/g, "").trim();
    if (!name) break;

    const sizeText = new TextDecoder("utf-8").decode(header.slice(124, 136)).replace(/\0/g, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const dataStart = offset + headerSize;
    const dataEnd = dataStart + size;
    if (!Number.isFinite(size) || dataEnd > bytes.length) break;

    const data = bytes.slice(dataStart, dataEnd);
    if (name.toLowerCase().endsWith(".xml")) {
      files.push({ name, text: new TextDecoder("utf-8").decode(data) });
    }

    offset = dataStart + Math.ceil(size / headerSize) * headerSize;
  }

  return files;
};

const fetchAemetOpenData = async (source: WeatherSourceRow) => {
  const apiKey = Deno.env.get("AEMET_API_KEY") || Deno.env.get("AEMET_OPENDATA_API_KEY");
  if (!apiKey) {
    return {
      blocked: true,
      message: "AEMET_API_KEY is not configured",
    };
  }

  const metadataUrl = new URL(source.source_url);
  metadataUrl.searchParams.set("api_key", apiKey);
  const metadata = await fetchAemetText(metadataUrl.toString(), "application/json,*/*;q=0.8");
  const metadataPayload = tryParseJson(metadata.text);
  const dataUrl = metadataPayload?.datos as string | undefined;

  if (metadata.status >= 400) {
    return {
      blocked: false,
      status: metadata.status,
      finalUrl: source.source_url,
      text: metadata.text,
      payload: metadataPayload ?? { text_excerpt: metadata.text.slice(0, 4000) },
      message: `AEMET metadata request returned ${metadata.status}`,
    };
  }

  if (!dataUrl) {
    return {
      blocked: false,
      status: metadata.status,
      finalUrl: source.source_url,
      text: metadata.text,
      payload: metadataPayload ?? { text_excerpt: metadata.text.slice(0, 4000) },
      message: "AEMET metadata response did not include a data URL",
    };
  }

  await sleep(1200);
  const dataResponse = await fetchAemetText(dataUrl, "application/json,application/xml,text/xml,text/plain,*/*;q=0.8");
  const parsedData = tryParseJson(dataResponse.text);
  const capFiles = source.source_key === "aemet-alerts-balears" ? extractTarTextFiles(dataResponse.bytes) : [];

  return {
    blocked: false,
    status: dataResponse.status,
    finalUrl: dataResponse.finalUrl,
    text: capFiles.length ? capFiles.map((file) => file.text).join("\n\n") : dataResponse.text,
    payload: parsedData ?? (capFiles.length ? { cap_files: capFiles } : { text: dataResponse.text.slice(0, 150_000) }),
    message: dataResponse.status >= 400 ? `AEMET data request returned ${dataResponse.status}` : undefined,
  };
};

const fetchAndNormalizeSource = async (
  supabase: SupabaseClient,
  source: WeatherSourceRow,
  runId: string,
  reportDate: string,
  forecastDays: number,
): Promise<{
  status: SourceStatus;
  points: ForecastPoint[];
  alerts: WeatherAlert[];
  report: Partial<ReportParts>;
}> => {
  const fetchedAt = new Date().toISOString();

  if (["ecmwf-open-data-ifs", "dwd-icon-eu-open-data", "cams-dust-air-quality"].includes(source.source_key)) {
    const message = "Free/open data source registered; GRIB/Zarr preprocessing is required before automated ingestion.";
    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: "skipped",
      payload: {
        reason: "preprocessor_required",
        message,
        no_scraping: true,
        paid_api_required: false,
        source_url: source.source_url,
        next_step: "Add a GitHub Actions preprocessor that converts open model files into compact JSON for the Edge Function.",
      },
      message,
    });

    return {
      status: sourceStatus(source, "skipped", snapshot.fetched_at, message),
      points: [],
      alerts: [],
      report: {},
    };
  }

  if (source.source_key === "ibiza-jellyfish-derived-risk") {
    const message = "Derived after weather merge from wind, sea temperature, seasonality, and beach exposure; not a Medusas Ibiza feed.";
    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: "skipped",
      payload: {
        reason: "derived_signal",
        message,
        medusas_url: "https://medusasibiza.es/",
        no_scraping: true,
        live_sightings: false,
      },
      message,
    });

    return {
      status: sourceStatus(source, "skipped", snapshot.fetched_at, message),
      points: [],
      alerts: [],
      report: {},
    };
  }

  if (source.source_key.startsWith("aemet-")) {
    const aemet = await fetchAemetOpenData(source);
    if (aemet.blocked) {
      const snapshot = await insertSnapshot(supabase, runId, source, {
        fetch_status: "blocked",
        payload: { reason: aemet.message },
        message: aemet.message,
      });
      return {
        status: sourceStatus(source, "blocked", snapshot.fetched_at, aemet.message),
        points: [],
        alerts: [],
        report: {},
      };
    }

    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: aemet.status && aemet.status >= 400 ? "failed" : "success",
      status_code: aemet.status,
      final_url: aemet.finalUrl,
      text: aemet.text,
      payload: aemet.payload,
      message: aemet.message,
    });

    if (aemet.status && aemet.status >= 400) {
      return {
        status: sourceStatus(source, "failed", snapshot.fetched_at, aemet.message),
        points: [],
        alerts: [],
        report: {},
      };
    }

    if (source.source_key === "aemet-daily-ibiza") {
      const normalized = normalizeAemetDaily(aemet.payload, source, runId, snapshot.id, reportDate);
      return {
        status: sourceStatus(source, "success", snapshot.fetched_at),
        points: normalized.points,
        alerts: [],
        report: {},
      };
    }

    if (source.source_key === "aemet-hourly-ibiza") {
      const normalized = normalizeAemetHourly(aemet.payload, source, runId, snapshot.id, reportDate);
      return {
        status: sourceStatus(source, "success", snapshot.fetched_at),
        points: normalized.points,
        alerts: [],
        report: {},
      };
    }

    if (source.source_key === "aemet-alerts-balears") {
      const capFiles = typeof aemet.payload === "object" && aemet.payload && "cap_files" in aemet.payload
        ? arrayValue<{ name: string; text: string }>((aemet.payload as { cap_files?: unknown }).cap_files)
        : [];
      const alertDocuments = capFiles.length
        ? capFiles.map((file) => file.text)
        : [typeof aemet.payload === "object" && aemet.payload && "text" in aemet.payload ? String((aemet.payload as { text: string }).text) : aemet.text || ""];
      const alerts = alertDocuments.flatMap((text) => parseCapAlerts(text, source, runId, snapshot.id, reportDate));
      return {
        status: sourceStatus(source, "success", snapshot.fetched_at, alerts.length ? undefined : "No Ibiza or Formentera official alerts found"),
        points: [],
        alerts,
        report: { alerts },
      };
    }

    return {
      status: sourceStatus(source, "success", snapshot.fetched_at),
      points: [],
      alerts: [],
      report: {},
    };
  }

  if (source.source_key === "open-meteo-forecast") {
    const url = buildOpenMeteoForecastUrl(source.source_url, forecastDays);
    const fetched = await fetchText(url);
    const payload = tryParseJson(fetched.text) as Record<string, unknown> | null;
    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: fetched.status >= 400 || !payload ? "failed" : "success",
      status_code: fetched.status,
      final_url: source.source_url,
      text: fetched.text,
      payload: payload ?? { text_excerpt: fetched.text.slice(0, 4000) },
      message: fetched.status >= 400 ? `Open-Meteo forecast returned ${fetched.status}` : undefined,
    });

    if (fetched.status >= 400 || !payload) {
      return {
        status: sourceStatus(source, "failed", snapshot.fetched_at, `Open-Meteo forecast returned ${fetched.status}`),
        points: [],
        alerts: [],
        report: {},
      };
    }

    const normalized = normalizeOpenMeteoForecast(payload, source, runId, snapshot.id, reportDate);
    return {
      status: sourceStatus(source, "success", snapshot.fetched_at),
      points: normalized.points,
      alerts: [],
      report: {
        current: normalized.current,
        hourly: normalized.hourly,
        daily: normalized.daily,
      },
    };
  }

  if (source.source_key === "open-meteo-marine") {
    const url = buildOpenMeteoMarineUrl(source.source_url, forecastDays);
    const fetched = await fetchText(url);
    const payload = tryParseJson(fetched.text) as Record<string, unknown> | null;
    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: fetched.status >= 400 || !payload ? "failed" : "success",
      status_code: fetched.status,
      final_url: source.source_url,
      text: fetched.text,
      payload: payload ?? { text_excerpt: fetched.text.slice(0, 4000) },
      message: fetched.status >= 400 ? `Open-Meteo marine returned ${fetched.status}` : undefined,
    });

    if (fetched.status >= 400 || !payload) {
      return {
        status: sourceStatus(source, "failed", snapshot.fetched_at, `Open-Meteo marine returned ${fetched.status}`),
        points: [],
        alerts: [],
        report: {},
      };
    }

    const normalized = normalizeOpenMeteoMarine(payload, source, runId, snapshot.id, reportDate);
    return {
      status: sourceStatus(source, "success", snapshot.fetched_at),
      points: normalized.points,
      alerts: [],
      report: { marine: normalized.marine },
    };
  }

  if (source.source_key === "sunrise-sunset-ibiza") {
    const url = buildSunriseUrl(source.source_url, reportDate);
    const fetched = await fetchText(url);
    const payload = tryParseJson(fetched.text) as Record<string, unknown> | null;
    const snapshot = await insertSnapshot(supabase, runId, source, {
      fetch_status: fetched.status >= 400 || !payload ? "failed" : "success",
      status_code: fetched.status,
      final_url: source.source_url,
      text: fetched.text,
      payload: payload ?? { text_excerpt: fetched.text.slice(0, 4000) },
      message: fetched.status >= 400 ? `Sunrise-Sunset returned ${fetched.status}` : undefined,
    });

    const results = (payload?.results ?? {}) as Record<string, unknown>;
    const sunrise = isoOrNull(results.sunrise);
    const sunset = isoOrNull(results.sunset);
    const point: ForecastPoint = {
      run_id: runId,
      snapshot_id: snapshot.id,
      source_key: source.source_key,
      report_date: reportDate,
      point_type: "astronomy",
      forecast_date: reportDate,
      sunrise_at: sunrise,
      sunset_at: sunset,
      raw_metadata: { source_label: source.label },
    };

    return {
      status: sourceStatus(source, fetched.status >= 400 || !payload ? "failed" : "success", snapshot.fetched_at),
      points: sunrise || sunset ? [point] : [],
      alerts: [],
      report: { astronomy: { source_key: source.source_key, source_label: source.label, sunrise_at: sunrise, sunset_at: sunset } },
    };
  }

  return {
    status: sourceStatus(source, "skipped", fetchedAt, "No weather adapter configured for this source"),
    points: [],
    alerts: [],
    report: {},
  };
};

const maxDailyRainChance = (daily: Record<string, unknown>[]) => intValue(daily[0]?.precipitation_probability_pct) ?? 0;

const buildBeachConditions = (
  current: Record<string, unknown>,
  marine: Record<string, unknown> | undefined,
  alerts: WeatherAlert[],
  daily: Record<string, unknown>[],
) => {
  const windDirection = intValue(current.wind_direction_deg);
  const gust = round(current.wind_gust_kmh) ?? round(current.wind_speed_kmh) ?? 0;
  const waveHeight = round(marine?.wave_height_m) ?? 0;
  const rainChance = maxDailyRainChance(daily);
  const uv = round(daily[0]?.uv_index) ?? round(current.uv_index) ?? 0;
  const officialAlert = alerts.some((alert) => alert.official);

  const coasts = [
    { coast: "North coast", beaches: "Portinatx, Cala Xarraca, Benirras", onshore: [315, 0, 45] },
    { coast: "East coast", beaches: "Santa Eularia, Es Canar, Cala Llonga", onshore: [45, 90, 135] },
    { coast: "South coast", beaches: "Playa d'en Bossa, Ses Salines, Es Cavallet", onshore: [135, 180, 225] },
    { coast: "West coast", beaches: "San Antonio, Cala Comte, Cala Bassa", onshore: [225, 270, 315] },
  ];

  return coasts.map((coast) => {
    const onshore = windDirection === null ? false : coast.onshore.some((target) => Math.abs(((windDirection - target + 540) % 360) - 180) <= 35);
    const reasons: string[] = [];
    let score = 0;

    if (officialAlert) {
      score += 3;
      reasons.push("official weather alert active");
    }
    if (waveHeight >= 1.5 && onshore) {
      score += 3;
      reasons.push("onshore swell on this coast");
    } else if (waveHeight >= 1.1) {
      score += 2;
      reasons.push("moderate waves around exposed beaches");
    }
    if (gust >= 45) {
      score += 3;
      reasons.push("strong gusts");
    } else if (gust >= 32) {
      score += 1;
      reasons.push("breezy periods");
    }
    if (rainChance >= 60) {
      score += 2;
      reasons.push("rain window likely");
    }
    if (uv >= 8) reasons.push("high UV");

    const status = score >= 5 ? "rough" : score >= 2 ? "caution" : "good";
    const headline = status === "good"
      ? "Best for an easy swim based on today's wind and wave signal"
      : status === "caution"
        ? "Choose sheltered coves and check posted lifeguard guidance"
        : "Avoid exposed water and follow official advice";

    return {
      coast: coast.coast,
      beaches: coast.beaches,
      status,
      headline,
      reasons: reasons.length ? reasons : ["settled source-backed conditions"],
      wind_direction_label: windDirectionLabel(windDirection),
      wind_gust_kmh: gust,
      wave_height_m: waveHeight,
      rain_chance_pct: rainChance,
      uv_index: uv,
    };
  });
};

const buildHeadline = (current: Record<string, unknown>, marine: Record<string, unknown> | undefined, alerts: WeatherAlert[], daily: Record<string, unknown>[]) => {
  if (alerts.some((alert) => alert.official)) return "Official weather alert active for Ibiza and Formentera";
  const rainChance = maxDailyRainChance(daily);
  const gust = round(current.wind_gust_kmh) ?? 0;
  const waveHeight = round(marine?.wave_height_m) ?? 0;
  if (rainChance >= 60) return "Rain risk is the main thing to watch today";
  if (gust >= 40 || waveHeight >= 1.4) return "Breezy Ibiza weather with choppier exposed coasts";
  if ((round(daily[0]?.uv_index) ?? 0) >= 8) return "Strong sun today with high UV on the beaches";
  return "Source-backed Ibiza beach weather for today";
};

const buildSummary = (current: Record<string, unknown>, marine: Record<string, unknown> | undefined, daily: Record<string, unknown>[]) => {
  const temp = round(current.temperature_c);
  const feels = round(current.apparent_temperature_c);
  const condition = String(current.condition || "conditions updating");
  const wind = round(current.wind_speed_kmh);
  const gust = round(current.wind_gust_kmh);
  const windLabel = String(current.wind_direction_label || "variable");
  const rainChance = maxDailyRainChance(daily);
  const wave = round(marine?.wave_height_m);
  const sea = round(marine?.sea_surface_temperature_c);

  const weatherLine = temp !== null
    ? `${condition}, ${temp} C${feels !== null ? ` feels like ${feels} C` : ""}`
    : `${condition}`;
  const windLine = wind !== null
    ? `${windLabel} wind around ${wind} km/h${gust !== null ? `, gusting near ${gust} km/h` : ""}`
    : "wind data updating";
  const seaLine = wave !== null
    ? `waves near ${wave} m${sea !== null ? ` and sea temperature around ${sea} C` : ""}`
    : "marine data updating";

  return `${weatherLine}. ${windLine}. ${rainChance}% rain chance for today; ${seaLine}.`;
};

const buildDisagreements = (points: ForecastPoint[]) => {
  const todayDaily = points.filter((point) => point.point_type === "daily" && point.forecast_date === point.report_date);
  const tempMaxValues = todayDaily
    .filter((point) => point.temp_max_c !== null && point.temp_max_c !== undefined)
    .map((point) => ({ source_key: point.source_key, value: Number(point.temp_max_c) }));
  const rainValues = todayDaily
    .filter((point) => point.precipitation_probability_pct !== null && point.precipitation_probability_pct !== undefined)
    .map((point) => ({ source_key: point.source_key, value: Number(point.precipitation_probability_pct) }));
  const disagreements: Array<Record<string, unknown>> = [];

  if (tempMaxValues.length > 1) {
    const values = tempMaxValues.map((item) => item.value);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread >= 3) disagreements.push({ metric: "max_temperature_c", spread, readings: tempMaxValues });
  }

  if (rainValues.length > 1) {
    const values = rainValues.map((item) => item.value);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread >= 30) disagreements.push({ metric: "rain_probability_pct", spread, readings: rainValues });
  }

  return disagreements;
};

const directionMatches = (degrees: number | null, targets: number[], tolerance = 35) => {
  if (degrees === null) return false;
  return targets.some((target) => Math.abs(((degrees - target + 540) % 360) - 180) <= tolerance);
};

const madridHour = (value?: string | null) => {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IBIZA.timezone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : null;
};

const timeRangeLabel = (items: Record<string, unknown>[]) => {
  const times = items
    .map((item) => madridHour(String(item.forecast_time || item.time || "")))
    .filter((hour): hour is number => typeof hour === "number");
  if (!times.length) return "today";
  const start = Math.min(...times);
  const end = Math.max(...times);
  if (start === end) return `${String(start).padStart(2, "0")}:00`;
  return `${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`;
};

const deriveJellyfishSignal = (
  current: Record<string, unknown>,
  marine: Record<string, unknown> | undefined,
  reportDate: string,
  profiles: BeachProfile[],
): JellyfishSignal => {
  const wind = round(current.wind_speed_kmh) ?? 0;
  const gust = round(current.wind_gust_kmh) ?? wind;
  const sea = round(marine?.sea_surface_temperature_c);
  const month = Number(reportDate.slice(5, 7));
  const warmSeason = month >= 5 && month <= 10;
  const peakSeason = month >= 6 && month <= 9;
  const trapBayCount = profiles.filter((profile) => profile.jellyfish_trap_bay).length;
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  if (!warmSeason) {
    reasons.push("Outside the main warm-water jellyfish season");
  } else {
    score += peakSeason ? 24 : 14;
    reasons.push(peakSeason ? "Peak warm-season jellyfish window" : "Warm-season jellyfish window");
  }

  if (sea !== null) {
    if (sea >= 26) {
      score += 22;
      reasons.push(`Warm sea near ${sea} C`);
    } else if (sea >= 23) {
      score += 12;
      reasons.push(`Sea temperature near ${sea} C`);
    } else {
      reasons.push(`Cooler sea near ${sea} C`);
    }
  } else {
    cautions.push("Sea temperature unavailable");
  }

  if (wind <= 8 && gust <= 18) {
    score += 18;
    reasons.push("Light wind can let surface patches linger");
  } else if (gust >= 35) {
    score -= 8;
    reasons.push("Breezier conditions may disperse surface patches");
  }

  if (trapBayCount > 0) {
    score += Math.min(14, trapBayCount * 2);
    reasons.push(`${trapBayCount} active beach profiles marked as potential trap bays`);
  }

  const status: JellyfishSignal["status"] = score >= 58 ? "elevated" : score >= 34 ? "watch" : "low";
  const headline = status === "elevated"
    ? "Jellyfish risk signal elevated"
    : status === "watch"
      ? "Jellyfish watch signal"
      : "Jellyfish signal low";

  return {
    status,
    confidence: sea === null ? "low" : "medium",
    headline,
    explanation: "Derived from Ibiza Maps wind, sea temperature, seasonality and beach exposure fields. This is not live sighting data.",
    reasons: reasons.slice(0, 5),
    cautions: [
      ...cautions,
      "Check Medusas Ibiza or local beach reports for community sightings before swimming.",
    ],
    source: "Ibiza Maps derived signal",
    medusas_url: "https://medusasibiza.es/",
    generated_at: new Date().toISOString(),
  };
};

const buildWeatherIntelligence = (
  current: Record<string, unknown>,
  marine: Record<string, unknown> | undefined,
  alerts: WeatherAlert[],
  daily: Record<string, unknown>[],
  hourly: Record<string, unknown>[],
  sourceStatuses: SourceStatus[],
  disagreements: Array<Record<string, unknown>>,
  staleFlags: Array<Record<string, unknown>>,
  jellyfishSignal: JellyfishSignal,
) => {
  const officialAlerts = alerts.filter((alert) => alert.official);
  const aemetStatuses = sourceStatuses.filter((status) => status.source_key.startsWith("aemet-"));
  const aemetChecked = aemetStatuses.some((status) => status.status === "success");
  const latestAemetCheck = aemetStatuses
    .map((status) => new Date(status.fetched_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  const rainHours = hourly.filter((hour) => (intValue(hour.precipitation_probability_pct) ?? 0) >= 50);
  const thunderHours = hourly.filter((hour) => [95, 96, 99].includes(intValue(hour.weather_code) ?? -1));
  const uv = round(daily[0]?.uv_index) ?? 0;
  const gust = round(current.wind_gust_kmh) ?? round(current.wind_speed_kmh) ?? 0;
  const windDirection = intValue(current.wind_direction_deg);
  const waveHeight = round(marine?.wave_height_m) ?? 0;
  const waveDirection = intValue(marine?.wave_direction_deg);

  const localWatchItems: Array<Record<string, unknown>> = [];
  if (officialAlerts.length > 0) {
    localWatchItems.push({
      type: "official_alert",
      priority: "high",
      label: "Official AEMET alert active",
      detail: officialAlerts[0].title,
      source: "AEMET OpenData",
    });
  }
  if (rainHours.length > 0) {
    localWatchItems.push({
      type: "rain_window",
      priority: "medium",
      label: "Rain window to watch",
      detail: `Model rain probability is elevated around ${timeRangeLabel(rainHours)}.`,
      source: "stored hourly forecast",
    });
  }
  if (thunderHours.length > 0) {
    localWatchItems.push({
      type: "thunder_risk",
      priority: "high",
      label: "Thunderstorm signal",
      detail: `Hourly forecast codes indicate possible thunderstorms around ${timeRangeLabel(thunderHours)}.`,
      source: "stored hourly forecast",
    });
  }
  if (gust >= 40) {
    localWatchItems.push({
      type: "wind_gusts",
      priority: "medium",
      label: "Gusty exposed spots",
      detail: `Gusts near ${gust} km/h can make exposed roads and beaches feel rougher.`,
      source: String(current.source_label || "stored weather source"),
    });
  }
  if (waveHeight >= 1.2) {
    localWatchItems.push({
      type: "sea_state",
      priority: waveHeight >= 1.6 ? "high" : "medium",
      label: "Exposed coast chop",
      detail: `Waves near ${waveHeight} m from ${windDirectionLabel(waveDirection)} can affect exposed coves.`,
      source: String(marine?.source_label || "stored marine source"),
    });
  }
  if (uv >= 8) {
    localWatchItems.push({
      type: "uv",
      priority: "medium",
      label: "High UV",
      detail: `UV index around ${uv}; plan shade and avoid the harshest midday sun.`,
      source: "stored daily forecast",
    });
  }
  if (jellyfishSignal.status === "watch" || jellyfishSignal.status === "elevated") {
    localWatchItems.push({
      type: "jellyfish_signal",
      priority: jellyfishSignal.status === "elevated" ? "medium" : "low",
      label: jellyfishSignal.headline,
      detail: jellyfishSignal.explanation,
      source: jellyfishSignal.source,
    });
  }

  const freeModelSources = sourceStatuses.filter((status) =>
    ["ecmwf-open-data-ifs", "dwd-icon-eu-open-data", "cams-dust-air-quality"].includes(status.source_key),
  );
  const sourceGaps = [
    ...freeModelSources
      .filter((status) => status.status !== "success")
      .map((status) => `${status.label}: ${status.message || "not automated yet"}`),
    "Fire-risk, fuel-moisture, beach-flag, and live jellyfish sighting feeds are not configured as compliant automated sources yet.",
  ];

  const confidenceDeductions = [
    aemetChecked ? 0 : 30,
    sourceStatuses.some((status) => status.status === "failed") ? 15 : 0,
    sourceStatuses.some((status) => status.status === "blocked") ? 10 : 0,
    disagreements.length ? 20 : 0,
    staleFlags.length ? 15 : 0,
    marine ? 0 : 10,
  ];
  const confidenceScore = Math.max(0, 100 - confidenceDeductions.reduce((sum, value) => sum + value, 0));
  const confidenceLabel = confidenceScore >= 80 ? "high" : confidenceScore >= 55 ? "medium" : "low";

  const mainConstraint = officialAlerts.length
    ? "official AEMET alert"
    : rainHours.length
      ? "rain window"
      : gust >= 40
        ? "gusts"
        : waveHeight >= 1.2
          ? "exposed coast chop"
          : uv >= 8
            ? "high UV"
            : "settled conditions";

  const dailyDecisionSummary = mainConstraint === "settled conditions"
    ? "AEMET and stored weather sources point to a usable Ibiza day; choose beaches by wind exposure, check posted lifeguard guidance, and keep source timestamps in view."
    : `Today's main decision factor is ${mainConstraint}. Ibiza Maps keeps official AEMET status separate from model/free-source signals and ranks beaches by exposure.`;

  return {
    official_status: {
      source: "AEMET OpenData",
      checked: aemetChecked,
      last_checked_at: latestAemetCheck ? new Date(latestAemetCheck).toISOString() : null,
      has_official_alert: officialAlerts.length > 0,
      alert_count: officialAlerts.length,
      alerts: officialAlerts.map((alert) => ({
        title: alert.title,
        severity: alert.severity,
        event: alert.event,
        zone: alert.zone,
        onset_at: alert.onset_at,
        expires_at: alert.expires_at,
      })),
      message: officialAlerts.length
        ? "Official AEMET alert stored for Ibiza/Formentera."
        : aemetChecked
          ? "AEMET official alert source checked; no Ibiza/Formentera alert is stored for this report."
          : "AEMET official status is not available for this report.",
    },
    model_consensus: {
      confidence_label: confidenceLabel,
      disagreement_count: disagreements.length,
      disagreements,
      summary: disagreements.length
        ? "Stored sources disagree on at least one key metric; visitor guidance is conservative."
        : "Stored sources do not show a major disagreement on today's key public metrics.",
      commercial_use_note: "Open-Meteo-derived values are treated as fallback/cross-check data until commercial terms are approved.",
      free_open_model_status: {
        ecmwf: sourceStatuses.find((status) => status.source_key === "ecmwf-open-data-ifs")?.status || "not_configured",
        icon_eu: sourceStatuses.find((status) => status.source_key === "dwd-icon-eu-open-data")?.status || "not_configured",
        cams: sourceStatuses.find((status) => status.source_key === "cams-dust-air-quality")?.status || "not_configured",
      },
    },
    local_watch_items: localWatchItems,
    jellyfish_signal: jellyfishSignal,
    source_gaps: sourceGaps,
    data_gaps: sourceGaps,
    daily_decision_summary: dailyDecisionSummary,
    confidence_score: confidenceScore,
    confidence_label: confidenceLabel,
    generated_at: new Date().toISOString(),
    inputs: {
      wind_direction_deg: windDirection,
      wind_direction_label: windDirectionLabel(windDirection),
      gust_kmh: gust,
      wave_height_m: waveHeight,
      wave_direction_label: windDirectionLabel(waveDirection),
      uv_index: uv,
      rain_window: rainHours.length ? timeRangeLabel(rainHours) : null,
    },
  };
};

const fallbackBeachProfiles: BeachProfile[] = [
  { beach_key: "portinatx", beach_name: "Portinatx", coast: "North coast", wind_exposure_degrees: [315, 0, 45], swell_exposure_degrees: [315, 0, 45], shelter_level: 3, swim_suitability: 4, family_suitability: 4, sunset_value: 2, sunrise_value: 3, activity_tags: ["swim", "family", "snorkel"] },
  { beach_key: "cala_xarraca", beach_name: "Cala Xarraca", coast: "North coast", wind_exposure_degrees: [315, 0, 45], swell_exposure_degrees: [315, 0, 45], shelter_level: 3, swim_suitability: 4, family_suitability: 2, sunset_value: 2, sunrise_value: 3, activity_tags: ["swim", "snorkel"] },
  { beach_key: "benirras", beach_name: "Benirras", coast: "North coast", wind_exposure_degrees: [315, 0, 45], swell_exposure_degrees: [315, 0, 45], shelter_level: 2, swim_suitability: 3, family_suitability: 3, sunset_value: 4, sunrise_value: 2, activity_tags: ["sunset", "swim"] },
  { beach_key: "aigues_blanques", beach_name: "Aigues Blanques", coast: "East coast", wind_exposure_degrees: [45, 90, 135], swell_exposure_degrees: [45, 90, 135], shelter_level: 2, swim_suitability: 3, family_suitability: 2, sunset_value: 1, sunrise_value: 5, activity_tags: ["sunrise", "swim"] },
  { beach_key: "cala_nova", beach_name: "Cala Nova", coast: "East coast", wind_exposure_degrees: [45, 90, 135], swell_exposure_degrees: [45, 90, 135], shelter_level: 2, swim_suitability: 3, family_suitability: 4, sunset_value: 1, sunrise_value: 4, activity_tags: ["swim", "family"] },
  { beach_key: "santa_eularia", beach_name: "Santa Eularia Beach", coast: "East coast", wind_exposure_degrees: [45, 90, 135], swell_exposure_degrees: [45, 90, 135], shelter_level: 4, swim_suitability: 4, family_suitability: 5, sunset_value: 1, sunrise_value: 3, activity_tags: ["swim", "family", "accessible"] },
  { beach_key: "cala_llonga", beach_name: "Cala Llonga", coast: "East coast", wind_exposure_degrees: [90, 135], swell_exposure_degrees: [90, 135], shelter_level: 4, swim_suitability: 4, family_suitability: 5, sunset_value: 1, sunrise_value: 3, activity_tags: ["swim", "family"] },
  { beach_key: "playa_den_bossa", beach_name: "Playa d'en Bossa", coast: "South coast", wind_exposure_degrees: [135, 180, 225], swell_exposure_degrees: [135, 180, 225], shelter_level: 2, swim_suitability: 3, family_suitability: 4, sunset_value: 1, sunrise_value: 2, activity_tags: ["swim", "family", "long_walk"] },
  { beach_key: "ses_salines", beach_name: "Ses Salines", coast: "South coast", wind_exposure_degrees: [135, 180, 225], swell_exposure_degrees: [135, 180, 225], shelter_level: 2, swim_suitability: 3, family_suitability: 3, sunset_value: 2, sunrise_value: 2, activity_tags: ["swim", "scene"] },
  { beach_key: "es_cavallet", beach_name: "Es Cavallet", coast: "South coast", wind_exposure_degrees: [135, 180, 225], swell_exposure_degrees: [135, 180, 225], shelter_level: 1, swim_suitability: 2, family_suitability: 2, sunset_value: 2, sunrise_value: 2, activity_tags: ["walk", "scene"] },
  { beach_key: "cala_jondal", beach_name: "Cala Jondal", coast: "South coast", wind_exposure_degrees: [135, 180, 225], swell_exposure_degrees: [135, 180, 225], shelter_level: 3, swim_suitability: 3, family_suitability: 2, sunset_value: 2, sunrise_value: 1, activity_tags: ["lunch", "swim"] },
  { beach_key: "cala_tarida", beach_name: "Cala Tarida", coast: "West coast", wind_exposure_degrees: [225, 270, 315], swell_exposure_degrees: [225, 270, 315], shelter_level: 3, swim_suitability: 4, family_suitability: 4, sunset_value: 5, sunrise_value: 1, activity_tags: ["sunset", "swim", "family"] },
  { beach_key: "cala_comte", beach_name: "Cala Comte", coast: "West coast", wind_exposure_degrees: [225, 270, 315], swell_exposure_degrees: [225, 270, 315], shelter_level: 2, swim_suitability: 3, family_suitability: 3, sunset_value: 5, sunrise_value: 1, activity_tags: ["sunset", "swim", "snorkel"] },
  { beach_key: "cala_bassa", beach_name: "Cala Bassa", coast: "West coast", wind_exposure_degrees: [225, 270, 315], swell_exposure_degrees: [225, 270, 315], shelter_level: 4, swim_suitability: 4, family_suitability: 4, sunset_value: 4, sunrise_value: 1, activity_tags: ["sunset", "swim", "family"] },
  { beach_key: "cala_salada", beach_name: "Cala Salada", coast: "West coast", wind_exposure_degrees: [225, 270, 315], swell_exposure_degrees: [225, 270, 315], shelter_level: 4, swim_suitability: 4, family_suitability: 3, sunset_value: 4, sunrise_value: 1, activity_tags: ["sunset", "swim", "snorkel"] },
  { beach_key: "san_antonio_bay", beach_name: "San Antonio Bay", coast: "West coast", wind_exposure_degrees: [225, 270, 315], swell_exposure_degrees: [225, 270, 315], shelter_level: 4, swim_suitability: 4, family_suitability: 5, sunset_value: 4, sunrise_value: 1, activity_tags: ["sunset", "family", "swim"] },
];

const DIRECTION_DEGREES: Record<string, number> = {
  N: 0,
  NNE: 23,
  NE: 45,
  ENE: 68,
  E: 90,
  ESE: 113,
  SE: 135,
  SSE: 158,
  S: 180,
  SSW: 203,
  SW: 225,
  WSW: 248,
  W: 270,
  WNW: 293,
  NW: 315,
  NNW: 338,
};

const cleanDirection = (value: unknown) =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/[^NESW]/g, "") : "";

const directionsToDegrees = (value: unknown, fallback: string[] = []) => {
  const directions = arrayValue<string>(value).map(cleanDirection).filter(Boolean);
  const source = directions.length ? directions : fallback;
  return source
    .map((direction) => DIRECTION_DEGREES[direction])
    .filter((degree): degree is number => Number.isFinite(degree));
};

const slugifyBeachKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

const scoreToFive = (value: unknown, fallback = 3) => {
  const numeric = finiteNumberValue(value);
  if (numeric == null) return fallback;
  if (numeric <= 5) return Math.max(1, Math.min(5, Math.round(numeric)));
  return Math.max(1, Math.min(5, Math.round(numeric / 2)));
};

const coastFromOrientation = (orientation: unknown, area: unknown): BeachProfile["coast"] => {
  const direction = cleanDirection(orientation);
  if (direction.startsWith("E")) return "East coast";
  if (direction.startsWith("W")) return "West coast";
  if (direction.startsWith("S")) return "South coast";
  if (direction.startsWith("N")) return "North coast";

  const text = `${typeof area === "string" ? area : ""}`.toLowerCase();
  if (/(sant antoni|san antonio|cala tarida|cala conta|comte|bassa|salada)/.test(text)) return "West coast";
  if (/(santa eularia|santa eulalia|es canar|figueral|aigua|agua|nova|llonga)/.test(text)) return "East coast";
  if (/(salines|bossa|cavallet|jondal|codolar|vedella|hort)/.test(text)) return "South coast";
  return "North coast";
};

const parseActivityTags = (row: Record<string, unknown>) => {
  const tags = new Set<string>();
  for (const value of arrayValue<string>(row.activities_arr)) tags.add(value.toLowerCase());
  for (const value of arrayValue<string>(row.facilities_arr)) tags.add(value.toLowerCase());
  for (const field of ["activities", "facilities", "beach_type", "vibe_tags"]) {
    const text = typeof row[field] === "string" ? String(row[field]).toLowerCase() : "";
    if (text.includes("swim") || text.includes("lifeguard")) tags.add("swim");
    if (text.includes("snork")) tags.add("snorkel");
    if (text.includes("family") || text.includes("children") || text.includes("lifeguard")) tags.add("family");
    if (text.includes("sunset")) tags.add("sunset");
    if (text.includes("walk") || text.includes("hike")) tags.add("walk");
    if (text.includes("kayak")) tags.add("kayak");
    if (text.includes("sup") || text.includes("paddle")) tags.add("sup");
    if (text.includes("restaurant") || text.includes("beach club")) tags.add("lunch");
    if (text.includes("accessible") || text.includes("disabled")) tags.add("accessible");
  }
  return Array.from(tags).slice(0, 12);
};

const lifeguardCaveatForBeach = (row: Record<string, unknown>) => {
  const facilities = `${typeof row.facilities === "string" ? row.facilities : ""} ${arrayValue<string>(row.facilities_arr).join(" ")}`.toLowerCase();
  if (facilities.includes("lifeguard")) {
    return "Lifeguards may be seasonal; check posted flags and local guidance before swimming.";
  }
  return "No automated lifeguard status is available; check posted flags and local guidance before swimming.";
};

const positiveNumberOrNull = (value: unknown) => {
  const parsed = finiteNumberValue(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

const beachCatalogRowToProfile = (row: Record<string, unknown>): BeachProfile | null => {
  const beachName = typeof row.place_name === "string" ? row.place_name.trim() : "";
  if (!beachName) return null;

  const exposedDirections = arrayValue<string>(row.exposed_to).map(cleanDirection).filter(Boolean);
  const swellDirections = arrayValue<string>(row.swell_sensitive_directions).map(cleanDirection).filter(Boolean);
  const shelteredDirections = arrayValue<string>(row.sheltered_from).map(cleanDirection).filter(Boolean);
  const orientation = cleanDirection(row.orientation);
  const coast = coastFromOrientation(orientation, row.area);
  const facilities = typeof row.facilities === "string" ? row.facilities : "";
  const activityTags = parseActivityTags(row);
  const familyScore = scoreToFive(row.family_score, facilities.toLowerCase().includes("lifeguard") ? 4 : 3);
  const snorkelingScore = scoreToFive(row.snorkeling_score, 3);
  const rainScore = scoreToFive(row.rain_suitability_score, 3);
  const shelterLevel = shelteredDirections.length >= 3 ? 4 : shelteredDirections.length >= 1 ? 3 : 2;
  const swimSuitability = Math.max(1, Math.min(5, Math.round((snorkelingScore + familyScore) / 2)));
  const sunsetValue = orientation.includes("W") || activityTags.includes("sunset") ? 5 : coast === "West coast" ? 4 : 1;
  const sunriseValue = orientation.includes("E") ? 5 : coast === "East coast" ? 4 : 1;

  return {
    canonical_beach_id: typeof row.id === "string" ? row.id : null,
    beach_key: typeof row.id === "string" ? row.id : slugifyBeachKey(beachName),
    beach_name: beachName,
    coast,
    municipality: typeof row.municipality === "string" ? row.municipality : null,
    latitude: finiteNumberValue(row.gps_latitude),
    longitude: finiteNumberValue(row.gps_longitude),
    wind_exposure_degrees: directionsToDegrees(exposedDirections, orientation ? [orientation] : []),
    swell_exposure_degrees: directionsToDegrees(swellDirections, exposedDirections),
    shelter_level: shelterLevel,
    swim_suitability: swimSuitability,
    family_suitability: familyScore,
    sunset_value: sunsetValue,
    sunrise_value: sunriseValue,
    activity_tags: activityTags,
    wind_speed_limit_kt: positiveNumberOrNull(row.wind_speed_limit_kt),
    rain_suitability_score: rainScore,
    walking_score: scoreToFive(row.walking_score, 3),
    snorkeling_score: snorkelingScore,
    facilities,
    access_difficulty: typeof row.access_difficulty === "string" ? row.access_difficulty : null,
    beach_type: typeof row.beach_type === "string" ? row.beach_type : null,
    water_clarity: typeof row.water_clarity === "string" ? row.water_clarity : null,
    jellyfish_trap_bay: Boolean(row.jellyfish_trap_bay),
    lifeguard_caveat: lifeguardCaveatForBeach(row),
  };
};

const fetchBeachProfiles = async (supabase: SupabaseClient): Promise<BeachProfile[]> => {
  const { data: beachRows, error: beachError } = await supabase
    .from("ibiza_beaches")
    .select("id,place_name,area,municipality,orientation,sheltered_from,exposed_to,swell_sensitive_directions,wind_speed_limit_kt,jellyfish_trap_bay,rain_suitability_score,family_score,walking_score,snorkeling_score,activities,activities_arr,facilities,facilities_arr,vibe_tags,beach_type,water_clarity,access_difficulty,gps_latitude,gps_longitude,is_active,status")
    .eq("is_active", true);

  if (!beachError && beachRows && beachRows.length > 0) {
    const profiles = (beachRows as Array<Record<string, unknown>>)
      .map(beachCatalogRowToProfile)
      .filter((profile): profile is BeachProfile => Boolean(profile));

    if (profiles.length > 0) {
      console.log(`Using ${profiles.length} canonical beach catalog profiles for weather recommendations`);
      return profiles;
    }
  }

  if (beachError) {
    console.warn("Canonical beach catalog unavailable; falling back to weather beach profiles", beachError.message);
  }

  const { data, error } = await supabase
    .from("ibiza_beach_profiles")
    .select("id,beach_key,beach_name,coast,municipality,wind_exposure_degrees,swell_exposure_degrees,shelter_level,swim_suitability,family_suitability,sunset_value,sunrise_value,activity_tags,lifeguard_caveat")
    .eq("enabled", true);

  if (error) {
    console.warn("Using fallback beach profiles", error.message);
    return fallbackBeachProfiles;
  }

  return ((data || []) as Array<Record<string, unknown>>).map((profile) => ({
    id: String(profile.id),
    beach_key: String(profile.beach_key),
    beach_name: String(profile.beach_name),
    coast: profile.coast as BeachProfile["coast"],
    municipality: typeof profile.municipality === "string" ? profile.municipality : null,
    wind_exposure_degrees: arrayValue<number>(profile.wind_exposure_degrees).map(Number).filter((value) => Number.isFinite(value)),
    swell_exposure_degrees: arrayValue<number>(profile.swell_exposure_degrees).map(Number).filter((value) => Number.isFinite(value)),
    shelter_level: intValue(profile.shelter_level) ?? 2,
    swim_suitability: intValue(profile.swim_suitability) ?? 3,
    family_suitability: intValue(profile.family_suitability) ?? 3,
    sunset_value: intValue(profile.sunset_value) ?? 1,
    sunrise_value: intValue(profile.sunrise_value) ?? 1,
    activity_tags: arrayValue<string>(profile.activity_tags),
    lifeguard_caveat: typeof profile.lifeguard_caveat === "string" ? profile.lifeguard_caveat : undefined,
  }));
};

const scoreBeachProfile = (
  profile: BeachProfile,
  current: Record<string, unknown>,
  marine: Record<string, unknown> | undefined,
  alerts: WeatherAlert[],
  daily: Record<string, unknown>[],
  timeWindow: BeachRecommendation["time_window"],
  jellyfishSignal?: JellyfishSignal,
) => {
  const windDirection = intValue(current.wind_direction_deg);
  const waveDirection = intValue(marine?.wave_direction_deg);
  const gust = round(current.wind_gust_kmh) ?? round(current.wind_speed_kmh) ?? 0;
  const waveHeight = round(marine?.wave_height_m) ?? 0;
  const rainChance = maxDailyRainChance(daily);
  const uv = round(daily[0]?.uv_index) ?? 0;
  const officialAlert = alerts.some((alert) => alert.official);
  const windExposed = directionMatches(windDirection, profile.wind_exposure_degrees);
  const swellExposed = directionMatches(waveDirection, profile.swell_exposure_degrees, 45);
  const gustKt = Math.round(gust * 0.539957);
  const windLabel = windDirectionLabel(windDirection);
  const waveLabel = windDirectionLabel(waveDirection);
  const reasons: string[] = [];
  const cautions: string[] = [];

  let score = 58 + profile.shelter_level * 4 + profile.swim_suitability * 3 + profile.family_suitability;
  if (timeWindow === "best_swim") score += profile.swim_suitability * 5 + (profile.snorkeling_score ?? 3) * 2;
  if (timeWindow === "best_family") score += profile.family_suitability * 6;
  if (timeWindow === "best_sunset") score += profile.sunset_value * 6;
  if (timeWindow === "best_afternoon") score += profile.sunset_value * 3;
  if (timeWindow === "good_alternative") score += profile.shelter_level * 2;

  if (officialAlert) {
    score -= 35;
    cautions.push("Official AEMET alert active");
  }
  if (windExposed && gust >= 25) {
    score -= gust >= 40 ? 22 : 12;
    cautions.push(`${windLabel} wind reaches this beach more directly`);
  } else if (gust < 25) {
    reasons.push(`Light ${windLabel} wind today`);
  } else if (profile.shelter_level >= 4) {
    reasons.push(`Sheltered profile for today's ${windLabel} wind`);
  }
  if (swellExposed && waveHeight >= 0.8) {
    score -= waveHeight >= 1.4 ? 24 : 12;
    cautions.push(`${waveLabel} wave direction can reach this coast`);
  } else if (waveHeight < 0.8) {
    reasons.push(`Low wave signal near ${waveHeight} m`);
  }
  if (profile.wind_speed_limit_kt != null && gustKt > profile.wind_speed_limit_kt) {
    score -= 10;
    cautions.push(`Gusts above this beach profile's comfort limit`);
  }
  if (rainChance >= 60) {
    score -= 16;
    cautions.push("Rain window likely");
  } else if ((profile.rain_suitability_score ?? 3) >= 4 && rainChance >= 25) {
    score += 4;
    reasons.push("Useful fallback if showers appear");
  }
  if (uv >= 8) {
    score -= 4;
    cautions.push(`High UV ${uv}; plan shade`);
  }
  if (jellyfishSignal && profile.jellyfish_trap_bay && (jellyfishSignal.status === "watch" || jellyfishSignal.status === "elevated")) {
    score -= jellyfishSignal.status === "elevated" ? 8 : 4;
    cautions.push(`${jellyfishSignal.headline}; this beach is marked as a possible trap bay`);
  }
  if (profile.shelter_level >= 4 && !reasons.some((reason) => /shelter/i.test(reason))) reasons.push("Sheltered cove profile");
  if (profile.activity_tags.includes("sunset") && (timeWindow === "best_afternoon" || timeWindow === "best_sunset")) reasons.push("Strong sunset fit");
  if (profile.family_suitability >= 4 && timeWindow === "best_family") reasons.push("Family-friendly catalog profile");
  if (profile.activity_tags.some((tag) => ["snorkel", "sup", "kayak", "swim"].includes(tag)) && timeWindow === "best_swim") reasons.push("Good water-activity fit");
  if (profile.facilities?.toLowerCase().includes("lifeguard") && (timeWindow === "best_family" || waveHeight >= 0.6 || gust >= 25)) reasons.push("Lifeguard listed in catalog");
  if (timeWindow === "best_family" && /difficult|hard|steep|cliff|walk/i.test(profile.access_difficulty || "")) {
    score -= 10;
    cautions.push("Access may be harder for families");
  }
  if (timeWindow === "best_swim" && (waveHeight >= 1.0 || gust >= 30)) {
    score -= 10;
    cautions.push("Water may be less comfortable for casual swimming");
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const status: BeachRecommendation["status"] = officialAlert && boundedScore < 45
    ? "avoid"
    : boundedScore >= 78
      ? "great"
      : boundedScore >= 62
        ? "good"
        : boundedScore >= 42
          ? "caution"
          : "avoid";
  const reasonMatching = (pattern: RegExp) => reasons.find((reason) => pattern.test(reason));
  const primaryReason = reasons[0] || "Source-backed conditions look balanced";
  const decisionReason = timeWindow === "best_family"
    ? reasonMatching(/family|lifeguard/i) || primaryReason
    : timeWindow === "best_sunset"
      ? reasonMatching(/sunset|shelter|wave/i) || primaryReason
      : timeWindow === "best_swim"
        ? reasonMatching(/water|wave|swim|snorkel/i) || primaryReason
        : timeWindow === "best_afternoon"
          ? reasonMatching(/shelter|wave|sunset/i) || primaryReason
          : timeWindow === "best_now"
            ? reasonMatching(/wave|shelter/i) || primaryReason
          : primaryReason;
  const decision = status === "great"
    ? timeWindow === "best_swim"
      ? `Best swim candidate: ${decisionReason}`
      : timeWindow === "best_family"
        ? `Best family pick: ${decisionReason}`
        : timeWindow === "best_sunset"
          ? `Best sunset pick: ${decisionReason}`
          : `Top pick today: ${decisionReason}`
    : status === "good"
      ? `Good option today: ${decisionReason}`
      : status === "caution"
        ? `Use caution: ${cautions[0] || "choose the most sheltered part of the beach"}`
        : `Avoid exposed water: ${cautions[0] || "conditions are not comfortable today"}`;

  return {
    score: boundedScore,
    status,
    decision,
    reasons: reasons.length ? reasons : ["Source-backed conditions look balanced"],
    cautions,
  };
};

const buildBeachRecommendations = (
  profiles: BeachProfile[],
  runId: string,
  reportDate: string,
  current: Record<string, unknown>,
  marine: Record<string, unknown> | undefined,
  alerts: WeatherAlert[],
  daily: Record<string, unknown>[],
  sourceStatuses: SourceStatus[],
  jellyfishSignal?: JellyfishSignal,
): BeachRecommendation[] => {
  const generatedAt = new Date().toISOString();
  const sourceTimestamps = Object.fromEntries(sourceStatuses.map((status) => [status.source_key, status.status === "success" ? status.fetched_at : null]));
  const recommendationWindows: BeachRecommendation["time_window"][] = [
    "best_now",
    "best_swim",
    "best_family",
    "best_sunset",
    "best_afternoon",
    "good_alternative",
    "avoid_exposed",
  ];
  const rows: BeachRecommendation[] = [];
  const selectedBeachUsage = new Map<string, number>();
  const windowLimits: Record<BeachRecommendation["time_window"], number> = {
    best_now: 6,
    best_swim: 4,
    best_family: 4,
    best_sunset: 4,
    best_afternoon: 4,
    good_alternative: 4,
    avoid_exposed: 5,
  };

  for (const window of recommendationWindows) {
    const scored = profiles
      .map((profile) => {
        const scoredProfile = scoreBeachProfile(profile, current, marine, alerts, daily, window, jellyfishSignal);
        const usage = selectedBeachUsage.get(profile.beach_key) ?? 0;
        const diversityPenalty = window === "avoid_exposed" ? 0 : usage * 9;
        return {
          profile,
          ...scoredProfile,
          adjustedScore: Math.max(0, scoredProfile.score - diversityPenalty),
        };
      })
      .sort((a, b) => (window === "avoid_exposed" ? a.adjustedScore - b.adjustedScore : b.adjustedScore - a.adjustedScore));

    const selected = window === "avoid_exposed"
      ? scored.filter((item) => item.status === "avoid" || item.status === "caution").slice(0, windowLimits[window])
      : scored
        .filter((item) => item.status !== "avoid")
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, windowLimits[window]);

    selected.forEach((item, index) => {
      if (window !== "avoid_exposed") {
        selectedBeachUsage.set(item.profile.beach_key, (selectedBeachUsage.get(item.profile.beach_key) ?? 0) + 1);
      }
      rows.push({
        run_id: runId,
        report_date: reportDate,
        beach_profile_id: item.profile.id ?? null,
        canonical_beach_id: item.profile.canonical_beach_id ?? null,
        beach_key: item.profile.beach_key,
        beach_name: item.profile.beach_name,
        coast: item.profile.coast,
        time_window: window,
        rank: index + 1,
        score: item.score,
        status: window === "avoid_exposed" && item.status !== "avoid" ? "caution" : item.status,
        decision: window === "avoid_exposed" ? "More exposed today; choose a calmer alternative" : item.decision,
        reasons: item.reasons,
        cautions: item.cautions,
        source_timestamps: sourceTimestamps,
        municipality: item.profile.municipality ?? null,
        latitude: item.profile.latitude ?? null,
        longitude: item.profile.longitude ?? null,
        activity_tags: item.profile.activity_tags,
        lifeguard_caveat: item.profile.lifeguard_caveat,
        generated_at: generatedAt,
      });
    });
  }

  return rows;
};

const uniqueAttribution = (statuses: SourceStatus[]) => {
  const seen = new Set<string>();
  return statuses
    .filter((status) => status.status === "success" || status.status === "blocked")
    .map((status) => ({
      source_key: status.source_key,
      label: status.label,
      attribution: status.attribution,
      attribution_url: status.attribution_url,
      status: status.status,
    }))
    .filter((item) => {
      const key = `${item.source_key}:${item.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const latestSuccessfulSourceAt = (statuses: SourceStatus[]) => {
  const times = statuses
    .filter((status) => status.status === "success")
    .map((status) => new Date(status.fetched_at).getTime())
    .filter(Number.isFinite);
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
};

const missingSchemaFeature = (error: unknown, feature: string) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return candidate.code === "42P01" || candidate.code === "42703" || text.includes(feature.toLowerCase());
};

const legacyBeachRecommendationSchemaIssue = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return candidate.code === "42703" || candidate.code === "23514" || text.includes("time_window") || text.includes("canonical_beach_id");
};

const toLegacyBeachRecommendation = (recommendation: BeachRecommendation) => {
  const {
    canonical_beach_id: _canonicalBeachId,
    municipality: _municipality,
    latitude: _latitude,
    longitude: _longitude,
    activity_tags: _activityTags,
    lifeguard_caveat: _lifeguardCaveat,
    ...legacyRecommendation
  } = recommendation;
  return legacyRecommendation;
};

const mergeReportParts = (parts: Partial<ReportParts>[]) => {
  const merged: ReportParts = { hourly: [], daily: [], alerts: [] };
  for (const part of parts) {
    if (part.current) merged.current = part.current;
    if (part.hourly?.length) merged.hourly = part.hourly;
    if (part.daily?.length) merged.daily = part.daily;
    if (part.marine) merged.marine = part.marine;
    if (part.astronomy) merged.astronomy = part.astronomy;
    if (part.alerts?.length) merged.alerts.push(...part.alerts);
  }

  if (merged.astronomy && merged.daily[0]) {
    merged.daily[0] = {
      ...merged.daily[0],
      sunrise_at: merged.daily[0].sunrise_at || merged.astronomy.sunrise_at,
      sunset_at: merged.daily[0].sunset_at || merged.astronomy.sunset_at,
    };
  }

  return merged;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let runId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    const request = await parseRequest(req);
    const mode = request.publish && !request.dry_run ? "publish" : request.dry_run ? "dry_run" : "shadow";

    supabase = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    await requireSyncToken(req, supabase);

    const { data: run, error: runError } = await supabase
      .from("weather_ingestion_runs")
      .insert({
        run_type: request.run_type,
        mode,
        target_date: request.target_date,
        source_keys: request.source_keys,
        metadata: {
          requested_publish: request.publish,
          forecast_days: request.forecast_days,
          runtime: "supabase-edge-function",
          use_ai: false,
        },
      })
      .select("id")
      .single();

    if (runError) throw runError;
    runId = run.id;

    let query = supabase
      .from("weather_sources")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (request.source_keys.length > 0) {
      query = query.in("source_key", request.source_keys);
    }

    const { data: sourceRows, error: sourceError } = await query;
    if (sourceError) throw sourceError;

    const sources = (sourceRows || []) as WeatherSourceRow[];
    const sourceStatuses: SourceStatus[] = [];
    const sourceFailures: Array<Record<string, unknown>> = [];
    const skippedSources: Array<Record<string, unknown>> = [];
    const reportParts: Partial<ReportParts>[] = [];
    let points: ForecastPoint[] = [];
    let alerts: WeatherAlert[] = [];

    for (const source of sources) {
      try {
        const result = await fetchAndNormalizeSource(supabase, source, runId, request.target_date, request.forecast_days);
        sourceStatuses.push(result.status);
        points = points.concat(result.points);
        alerts = alerts.concat(result.alerts);
        reportParts.push(result.report);

        if (result.status.status === "failed" || result.status.status === "blocked") {
          sourceFailures.push({
            source_key: source.source_key,
            status: result.status.status,
            message: result.status.message,
          });
        }
        if (result.status.status === "skipped") {
          skippedSources.push({ source_key: source.source_key, message: result.status.message });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sourceFailures.push({ source_key: source.source_key, error: message });
        sourceStatuses.push(sourceStatus(source, "failed", new Date().toISOString(), message));
      }
    }

    if (points.length > 0) {
      const { error: pointsError } = await supabase.from("ibiza_weather_forecast_points").insert(points);
      if (pointsError) throw pointsError;
    }

    if (alerts.length > 0) {
      const { error: alertsError } = await supabase.from("ibiza_weather_alerts").insert(alerts);
      if (alertsError) throw alertsError;
    }

    const merged = mergeReportParts(reportParts);
    const usableForecast = Boolean(merged.current || merged.daily.length > 0);
    const staleFlags: Array<Record<string, unknown>> = [];

    const aemetStatuses = sourceStatuses.filter((status) => status.source_key.startsWith("aemet-"));
    if (aemetStatuses.length > 0 && !aemetStatuses.some((status) => status.status === "success")) {
      const aemetMissingKey = aemetStatuses.some((status) => status.status === "blocked");
      staleFlags.push({
        source: "AEMET OpenData",
        status: aemetMissingKey ? "pending" : "degraded",
        message: aemetMissingKey
          ? "Official AEMET data requires AEMET_API_KEY"
          : "Official AEMET data is temporarily unavailable; Ibiza Maps is using fallback weather sources.",
      });
    }
    if (!usableForecast) {
      staleFlags.push({ source: "forecast", status: "missing", message: "No usable forecast data was collected" });
    }

    let reportId: string | null = null;
    let reportPreview: Record<string, unknown> | null = null;

    if (usableForecast) {
      const current = merged.current ?? {};
      const headline = buildHeadline(current, merged.marine, alerts, merged.daily);
      const summary = buildSummary(current, merged.marine, merged.daily);
      const beachConditions = buildBeachConditions(current, merged.marine, alerts, merged.daily);
      const disagreements = buildDisagreements(points);
      const beachProfiles = await fetchBeachProfiles(supabase);
      const jellyfishSignal = deriveJellyfishSignal(current, merged.marine, request.target_date, beachProfiles);
      const weatherIntelligence = buildWeatherIntelligence(
        current,
        merged.marine,
        alerts,
        merged.daily,
        merged.hourly,
        sourceStatuses,
        disagreements,
        staleFlags,
        jellyfishSignal,
      );
      const beachRecommendations = buildBeachRecommendations(
        beachProfiles,
        runId,
        request.target_date,
        current,
        merged.marine,
        alerts,
        merged.daily,
        sourceStatuses,
        jellyfishSignal,
      );
      const alertsSummary = alerts.map((alert) => ({
        title: alert.title,
        severity: alert.severity,
        event: alert.event,
        zone: alert.zone,
        onset_at: alert.onset_at,
        expires_at: alert.expires_at,
        official: alert.official,
        source_key: alert.source_key,
      }));

      const reportPayload = {
        run_id: runId,
        report_date: request.target_date,
        status: "published",
        title: `Ibiza Weather Report - ${request.target_date}`,
        headline,
        summary,
        current_conditions: current,
        hourly_forecast: merged.hourly,
        daily_forecast: merged.daily,
        marine_summary: merged.marine ?? {},
        beach_conditions: beachConditions,
        alerts_summary: alertsSummary,
        source_status: sourceStatuses,
        source_disagreements: disagreements,
        weather_intelligence: weatherIntelligence,
        attribution: uniqueAttribution(sourceStatuses),
        stale_flags: staleFlags,
        sources_checked: sourceStatuses.map((status) => status.source_key),
        generated_at: new Date().toISOString(),
        last_successful_source_at: latestSuccessfulSourceAt(sourceStatuses),
      };

      reportPreview = reportPayload;

      if (request.publish && !request.dry_run) {
        let reportResult = await supabase
          .from("ibiza_weather_daily_reports")
          .upsert(reportPayload, { onConflict: "report_date" })
          .select("id")
          .single();

        if (missingSchemaFeature(reportResult.error, "weather_intelligence")) {
          const { weather_intelligence: _weatherIntelligence, ...legacyReportPayload } = reportPayload;
          reportResult = await supabase
            .from("ibiza_weather_daily_reports")
            .upsert(legacyReportPayload, { onConflict: "report_date" })
            .select("id")
            .single();
        }

        if (reportResult.error) throw reportResult.error;
        reportId = reportResult.data.id;

        const { error: deleteRecommendationsError } = await supabase
          .from("ibiza_beach_recommendations")
          .delete()
          .eq("report_date", request.target_date);

        const recommendationsTableMissing = missingSchemaFeature(deleteRecommendationsError, "ibiza_beach_recommendations");
        if (deleteRecommendationsError && !recommendationsTableMissing) throw deleteRecommendationsError;

        if (!recommendationsTableMissing && beachRecommendations.length > 0) {
          let { error: recommendationsError } = await supabase
            .from("ibiza_beach_recommendations")
            .insert(beachRecommendations);

          if (recommendationsError && legacyBeachRecommendationSchemaIssue(recommendationsError)) {
            const legacyWindows = new Set(["best_now", "best_afternoon", "good_alternative", "avoid_exposed"]);
            const legacyRecommendations = beachRecommendations
              .filter((recommendation) => legacyWindows.has(recommendation.time_window))
              .map(toLegacyBeachRecommendation);

            const legacyResult = await supabase
              .from("ibiza_beach_recommendations")
              .insert(legacyRecommendations);

            recommendationsError = legacyResult.error;
          }

          if (recommendationsError && !missingSchemaFeature(recommendationsError, "ibiza_beach_recommendations")) {
            throw recommendationsError;
          }
        }
      }
    }

    const status = usableForecast || request.run_type === "source_audit" ? "completed" : "failed";
    const errorMessage = usableForecast ? null : "No usable weather forecast data was collected.";
    const counts = {
      sources_seen: sources.length,
      snapshots_inserted: sourceStatuses.filter((statusItem) => statusItem.status !== "skipped").length,
      forecast_points_inserted: points.length,
      alerts_inserted: alerts.length,
      failed_sources: sourceFailures.length,
      skipped_sources: skippedSources.length,
    };

    const { error: finishError } = await supabase
      .from("weather_ingestion_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        sources_seen: counts.sources_seen,
        snapshots_inserted: counts.snapshots_inserted,
        forecast_points_inserted: counts.forecast_points_inserted,
        alerts_inserted: counts.alerts_inserted,
        source_failures: sourceFailures,
        skipped_sources: skippedSources,
        stale_flags: staleFlags,
        source_keys: sources.map((source) => source.source_key),
        error_message: errorMessage,
        metadata: {
          requested_publish: request.publish,
          dry_run: request.dry_run,
          report_id: reportId,
          use_ai: false,
        },
      })
      .eq("id", runId);

    if (finishError) throw finishError;
    if (status === "failed") throw new Error(errorMessage || "Weather ingestion failed");

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        report_id: reportId,
        target_date: request.target_date,
        mode,
        counts,
        source_status: sourceStatuses,
        source_failures: sourceFailures,
        stale_flags: staleFlags,
        report_preview: request.dry_run || !request.publish ? reportPreview : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("collect-ibiza-weather failed", message);

    if (runId && supabase) {
      await supabase
        .from("weather_ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", runId);
    }

    return new Response(JSON.stringify({ ok: false, error: message, run_id: runId }), {
      status: message.includes("Unauthorized") ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
