export interface WeatherSourceStatus {
  source_key: string;
  label: string;
  status: "success" | "failed" | "skipped" | "blocked";
  fetched_at: string;
  source_url: string;
  attribution: string;
  attribution_url?: string | null;
  message?: string;
}

export interface WeatherAttribution {
  source_key: string;
  label: string;
  attribution: string;
  attribution_url?: string | null;
  status: string;
}

export interface WeatherCurrentConditions {
  source_key?: string;
  source_label?: string;
  updated_at?: string | null;
  temperature_c?: number | null;
  apparent_temperature_c?: number | null;
  precipitation_mm?: number | null;
  weather_code?: number | null;
  condition?: string | null;
  cloud_cover_pct?: number | null;
  wind_speed_kmh?: number | null;
  wind_gust_kmh?: number | null;
  wind_direction_deg?: number | null;
  wind_direction_label?: string | null;
}

export interface WeatherHourlyForecast {
  time?: string;
  forecast_time?: string | null;
  temperature_c?: number | null;
  apparent_temperature_c?: number | null;
  precipitation_probability_pct?: number | null;
  precipitation_mm?: number | null;
  weather_code?: number | null;
  condition?: string | null;
  wind_speed_kmh?: number | null;
  wind_gust_kmh?: number | null;
  wind_direction_deg?: number | null;
  wind_direction_label?: string | null;
  uv_index?: number | null;
}

export interface WeatherDailyForecast {
  date: string;
  temp_min_c?: number | null;
  temp_max_c?: number | null;
  precipitation_probability_pct?: number | null;
  precipitation_mm?: number | null;
  weather_code?: number | null;
  condition?: string | null;
  wind_speed_kmh?: number | null;
  wind_gust_kmh?: number | null;
  wind_direction_deg?: number | null;
  wind_direction_label?: string | null;
  uv_index?: number | null;
  sunrise_at?: string | null;
  sunset_at?: string | null;
}

export interface WeatherMarineSummary {
  source_key?: string;
  source_label?: string;
  updated_at?: string | null;
  wave_height_m?: number | null;
  wave_period_s?: number | null;
  wave_direction_deg?: number | null;
  wave_direction_label?: string | null;
  sea_surface_temperature_c?: number | null;
}

export interface BeachCondition {
  coast: string;
  beaches: string;
  status: "good" | "caution" | "rough";
  headline: string;
  reasons: string[];
  wind_direction_label?: string;
  wind_gust_kmh?: number | null;
  wave_height_m?: number | null;
  rain_chance_pct?: number | null;
  uv_index?: number | null;
}

export interface WeatherAlertSummary {
  title: string;
  severity?: string | null;
  event?: string | null;
  zone?: string | null;
  onset_at?: string | null;
  expires_at?: string | null;
  official?: boolean;
  source_key?: string;
}

export interface PublicWeatherAlert extends WeatherAlertSummary {
  id: string;
  report_date: string;
  alert_uid: string;
  summary?: string | null;
  certainty?: string | null;
  urgency?: string | null;
  effective_at?: string | null;
  source_url?: string | null;
  source_label?: string | null;
  source_domain?: string | null;
  attribution?: string | null;
  attribution_url?: string | null;
}

export interface WeatherIntelligence {
  official_status?: {
    source?: string;
    checked?: boolean;
    last_checked_at?: string | null;
    has_official_alert?: boolean;
    alert_count?: number;
    message?: string;
    alerts?: Array<Record<string, unknown>>;
  };
  model_consensus?: {
    confidence_label?: "high" | "medium" | "low" | string;
    disagreement_count?: number;
    summary?: string;
    commercial_use_note?: string;
    disagreements?: Array<Record<string, unknown>>;
  };
  local_watch_items?: Array<{
    type?: string;
    priority?: "high" | "medium" | "low" | string;
    label?: string;
    detail?: string;
    source?: string;
  }>;
  data_gaps?: string[];
  daily_decision_summary?: string;
  confidence_score?: number;
  confidence_label?: "high" | "medium" | "low" | string;
  generated_at?: string;
  inputs?: Record<string, unknown>;
}

export interface BeachRecommendation {
  id: string;
  report_date: string;
  beach_key: string;
  beach_name: string;
  coast: string;
  municipality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_tags?: string[] | null;
  time_window: "best_now" | "best_afternoon" | "good_alternative" | "avoid_exposed";
  rank: number;
  score: number;
  status: "great" | "good" | "caution" | "avoid";
  decision: string;
  reasons: string[];
  cautions: string[];
  source_timestamps?: Record<string, string | null>;
  generated_at: string;
  lifeguard_caveat?: string | null;
}

export interface PublicWeatherReport {
  id: string;
  report_date: string;
  title: string;
  headline: string;
  summary: string;
  current_conditions: WeatherCurrentConditions;
  hourly_forecast: WeatherHourlyForecast[];
  daily_forecast: WeatherDailyForecast[];
  marine_summary: WeatherMarineSummary;
  beach_conditions: BeachCondition[];
  alerts_summary: WeatherAlertSummary[];
  source_status: WeatherSourceStatus[];
  source_disagreements: Array<Record<string, unknown>>;
  weather_intelligence?: WeatherIntelligence;
  attribution: WeatherAttribution[];
  stale_flags: Array<Record<string, unknown>>;
  sources_checked: string[];
  generated_at: string;
  last_successful_source_at?: string | null;
  updated_at: string;
}

export interface WeatherPayload {
  report: PublicWeatherReport | null;
  alerts: PublicWeatherAlert[];
  beachRecommendations: BeachRecommendation[];
}

export const todayMadrid = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const formatMadridDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00+02:00`));
};

export const formatMadridTime = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const formatNumber = (value?: number | null, suffix = "", digits = 0) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "Updating";
  return `${value.toFixed(digits)}${suffix}`;
};

export const formatTemperature = (value?: number | null) => formatNumber(value, " C", 0);

export const formatWind = (speed?: number | null, direction?: string | null) => {
  if (typeof speed !== "number") return "Wind updating";
  return `${direction || "Variable"} ${Math.round(speed)} km/h`;
};

export const reportIsStale = (report: PublicWeatherReport | null) => {
  if (!report) return true;
  return report.report_date !== todayMadrid();
};

export const statusLabel = (status: WeatherSourceStatus["status"]) => {
  if (status === "success") return "Updated";
  if (status === "blocked") return "Needs key";
  if (status === "skipped") return "Skipped";
  return "Issue";
};

export const sourceStatusClasses = (status: WeatherSourceStatus["status"]) => {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "blocked") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "skipped") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-red-200 bg-red-50 text-red-800";
};

export const beachStatusClasses = (status: BeachCondition["status"]) => {
  if (status === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
};

export const recommendationStatusClasses = (status: BeachRecommendation["status"]) => {
  if (status === "great") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "good") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "caution") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
};

export const confidenceClasses = (confidence?: string | null) => {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
};

export const alertSeverityClasses = (severity?: string | null) => {
  const normalized = (severity || "").toLowerCase();
  if (["severe", "extreme", "red"].some((value) => normalized.includes(value))) return "border-red-200 bg-red-50 text-red-800";
  if (["moderate", "orange"].some((value) => normalized.includes(value))) return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
};

export const sourceHealthSummary = (statuses: WeatherSourceStatus[]) => {
  const updated = statuses.filter((status) => status.status === "success").length;
  const blocked = statuses.filter((status) => status.status === "blocked").length;
  const failed = statuses.filter((status) => status.status === "failed").length;
  return { updated, blocked, failed, total: statuses.length };
};
