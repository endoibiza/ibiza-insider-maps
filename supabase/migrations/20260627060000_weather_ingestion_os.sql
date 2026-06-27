-- Supabase-first replacement for the legacy Notion/Lovable Ibiza Weather runtime.
-- Private evidence and run logs stay server-side; the website reads only
-- public-safe views with source names, timestamps, and attribution.

CREATE TABLE IF NOT EXISTS public.weather_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  label text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('official_api', 'model_api', 'marine_api', 'astronomy_api')),
  source_url text NOT NULL,
  source_domain text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  cadence text NOT NULL DEFAULT 'daily',
  attribution text NOT NULL,
  attribution_url text,
  access_status text NOT NULL DEFAULT 'unchecked',
  robots_notes text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weather_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'manual' CHECK (run_type IN ('daily', 'manual', 'alert_refresh', 'backfill', 'source_audit')),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'shadow', 'publish')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  target_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date),
  source_keys text[] NOT NULL DEFAULT '{}'::text[],
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources_seen integer NOT NULL DEFAULT 0,
  snapshots_inserted integer NOT NULL DEFAULT 0,
  forecast_points_inserted integer NOT NULL DEFAULT 0,
  alerts_inserted integer NOT NULL DEFAULT 0,
  source_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  stale_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.weather_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.weather_ingestion_runs(id) ON DELETE CASCADE,
  source_key text NOT NULL REFERENCES public.weather_sources(source_key) ON DELETE RESTRICT,
  source_url text NOT NULL,
  final_url text,
  fetch_status text NOT NULL DEFAULT 'success' CHECK (fetch_status IN ('success', 'failed', 'skipped', 'blocked')),
  status_code integer,
  content_hash text,
  excerpt text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_weather_forecast_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.weather_ingestion_runs(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.weather_source_snapshots(id) ON DELETE SET NULL,
  source_key text NOT NULL REFERENCES public.weather_sources(source_key) ON DELETE RESTRICT,
  report_date date NOT NULL,
  point_type text NOT NULL CHECK (point_type IN ('current', 'hourly', 'daily', 'marine_hourly', 'marine_daily', 'astronomy')),
  location_key text NOT NULL DEFAULT 'ibiza',
  forecast_time timestamptz,
  forecast_date date,
  temperature_c numeric,
  apparent_temperature_c numeric,
  temp_min_c numeric,
  temp_max_c numeric,
  precipitation_probability_pct integer,
  precipitation_mm numeric,
  weather_code integer,
  cloud_cover_pct integer,
  wind_speed_kmh numeric,
  wind_gust_kmh numeric,
  wind_direction_deg integer,
  uv_index numeric,
  wave_height_m numeric,
  wave_period_s numeric,
  wave_direction_deg integer,
  sea_surface_temperature_c numeric,
  sunrise_at timestamptz,
  sunset_at timestamptz,
  source_observed_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_weather_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.weather_ingestion_runs(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.weather_source_snapshots(id) ON DELETE SET NULL,
  source_key text NOT NULL REFERENCES public.weather_sources(source_key) ON DELETE RESTRICT,
  report_date date NOT NULL,
  alert_uid text NOT NULL,
  title text NOT NULL,
  summary text,
  event text,
  zone text NOT NULL DEFAULT 'Ibiza and Formentera',
  severity text NOT NULL DEFAULT 'unknown',
  certainty text,
  urgency text,
  effective_at timestamptz,
  onset_at timestamptz,
  expires_at timestamptz,
  source_url text,
  official boolean NOT NULL DEFAULT false,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_weather_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.weather_ingestion_runs(id) ON DELETE SET NULL,
  report_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'failed')),
  title text NOT NULL,
  headline text NOT NULL,
  summary text NOT NULL,
  current_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  hourly_forecast jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_forecast jsonb NOT NULL DEFAULT '[]'::jsonb,
  marine_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  beach_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_status jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_disagreements jsonb NOT NULL DEFAULT '[]'::jsonb,
  attribution jsonb NOT NULL DEFAULT '[]'::jsonb,
  stale_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources_checked text[] NOT NULL DEFAULT '{}'::text[],
  generated_at timestamptz NOT NULL DEFAULT now(),
  last_successful_source_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weather_sources_priority_idx
  ON public.weather_sources (enabled, priority);

CREATE INDEX IF NOT EXISTS weather_ingestion_runs_started_idx
  ON public.weather_ingestion_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS weather_source_snapshots_run_idx
  ON public.weather_source_snapshots (run_id);

CREATE INDEX IF NOT EXISTS weather_source_snapshots_source_fetched_idx
  ON public.weather_source_snapshots (source_key, fetched_at DESC);

CREATE INDEX IF NOT EXISTS ibiza_weather_forecast_points_public_idx
  ON public.ibiza_weather_forecast_points (run_id, point_type, forecast_date, forecast_time);

CREATE INDEX IF NOT EXISTS ibiza_weather_forecast_points_source_idx
  ON public.ibiza_weather_forecast_points (source_key, report_date, point_type);

CREATE INDEX IF NOT EXISTS ibiza_weather_alerts_public_idx
  ON public.ibiza_weather_alerts (run_id, report_date, official, severity);

CREATE INDEX IF NOT EXISTS ibiza_weather_daily_reports_public_idx
  ON public.ibiza_weather_daily_reports (status, report_date DESC)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS update_weather_sources_updated_at ON public.weather_sources;
CREATE TRIGGER update_weather_sources_updated_at
  BEFORE UPDATE ON public.weather_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ibiza_weather_daily_reports_updated_at ON public.ibiza_weather_daily_reports;
CREATE TRIGGER update_ibiza_weather_daily_reports_updated_at
  BEFORE UPDATE ON public.ibiza_weather_daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.weather_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_weather_forecast_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_weather_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_weather_daily_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weather_sources FROM anon, authenticated;
REVOKE ALL ON public.weather_ingestion_runs FROM anon, authenticated;
REVOKE ALL ON public.weather_source_snapshots FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_forecast_points FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_alerts FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_daily_reports FROM anon, authenticated;

INSERT INTO public.weather_sources
  (source_key, label, source_type, source_url, source_domain, priority, enabled, cadence, attribution, attribution_url, access_status, robots_notes, raw_metadata)
VALUES
  (
    'aemet-daily-ibiza',
    'AEMET OpenData - Ibiza Daily Forecast',
    'official_api',
    'https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/07026',
    'opendata.aemet.es',
    10,
    true,
    'daily',
    'AEMET OpenData',
    'https://opendata.aemet.es/',
    'requires_api_key',
    'Official API only. Do not scrape AEMET pages.',
    '{"official":true,"municipality":"07026","area":"Eivissa/Ibiza"}'
  ),
  (
    'aemet-hourly-ibiza',
    'AEMET OpenData - Ibiza Hourly Forecast',
    'official_api',
    'https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/horaria/07026',
    'opendata.aemet.es',
    11,
    true,
    'daily',
    'AEMET OpenData',
    'https://opendata.aemet.es/',
    'requires_api_key',
    'Official API only. Do not scrape AEMET pages.',
    '{"official":true,"municipality":"07026","area":"Eivissa/Ibiza"}'
  ),
  (
    'aemet-alerts-balears',
    'AEMET OpenData - Illes Balears CAP Alerts',
    'official_api',
    'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/64',
    'opendata.aemet.es',
    12,
    true,
    'alert_refresh',
    'AEMET OpenData',
    'https://opendata.aemet.es/',
    'requires_api_key',
    'Official CAP warning API only.',
    '{"official":true,"area_code":"64","area":"Ballears, Illes"}'
  ),
  (
    'aemet-marine-balears',
    'AEMET OpenData - Illes Balears Coastal Forecast',
    'official_api',
    'https://opendata.aemet.es/opendata/api/prediccion/maritima/costera/costa/44',
    'opendata.aemet.es',
    13,
    true,
    'daily',
    'AEMET OpenData',
    'https://opendata.aemet.es/',
    'requires_api_key',
    'Official API only. Do not scrape AEMET pages.',
    '{"official":true,"coast_code":"44","coast":"Costa de Illes Balears"}'
  ),
  (
    'open-meteo-forecast',
    'Open-Meteo Forecast',
    'model_api',
    'https://api.open-meteo.com/v1/forecast',
    'open-meteo.com',
    30,
    true,
    'daily',
    'Weather data by Open-Meteo.com',
    'https://open-meteo.com/',
    'verified',
    'Use public API with attribution; no scraping.',
    '{"latitude":38.9067,"longitude":1.4206,"timezone":"Europe/Madrid","license":"CC BY 4.0 attribution required"}'
  ),
  (
    'open-meteo-marine',
    'Open-Meteo Marine',
    'marine_api',
    'https://marine-api.open-meteo.com/v1/marine',
    'open-meteo.com',
    31,
    true,
    'daily',
    'Marine weather data by Open-Meteo.com',
    'https://open-meteo.com/en/docs/marine-weather-api',
    'verified',
    'Use public marine API with attribution; no scraping.',
    '{"latitude":38.9067,"longitude":1.4206,"timezone":"Europe/Madrid","license":"CC BY 4.0 attribution required"}'
  ),
  (
    'sunrise-sunset-ibiza',
    'Sunrise-Sunset.org',
    'astronomy_api',
    'https://api.sunrise-sunset.org/json',
    'sunrise-sunset.org',
    50,
    true,
    'daily',
    'Sunrise and sunset times by Sunrise-Sunset.org',
    'https://sunrise-sunset.org/api',
    'verified',
    'Use public API with attribution; no scraping.',
    '{"latitude":38.9067,"longitude":1.4206,"timezone":"Europe/Madrid"}'
  )
ON CONFLICT (source_key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  source_domain = EXCLUDED.source_domain,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  cadence = EXCLUDED.cadence,
  attribution = EXCLUDED.attribution,
  attribution_url = EXCLUDED.attribution_url,
  access_status = EXCLUDED.access_status,
  robots_notes = EXCLUDED.robots_notes,
  raw_metadata = EXCLUDED.raw_metadata,
  updated_at = now();

DROP VIEW IF EXISTS public.ibiza_weather_public_current;
DROP VIEW IF EXISTS public.ibiza_weather_alerts_public;
DROP VIEW IF EXISTS public.ibiza_weather_forecast_points_public;
DROP VIEW IF EXISTS public.ibiza_weather_daily_reports_public;

CREATE VIEW public.ibiza_weather_daily_reports_public AS
SELECT
  id,
  report_date,
  title,
  headline,
  summary,
  current_conditions,
  hourly_forecast,
  daily_forecast,
  marine_summary,
  beach_conditions,
  alerts_summary,
  source_status,
  source_disagreements,
  attribution,
  stale_flags,
  sources_checked,
  generated_at,
  last_successful_source_at,
  created_at,
  updated_at
FROM public.ibiza_weather_daily_reports
WHERE status = 'published';

CREATE VIEW public.ibiza_weather_public_current AS
SELECT
  id,
  report_date,
  title,
  headline,
  summary,
  current_conditions,
  hourly_forecast,
  daily_forecast,
  marine_summary,
  beach_conditions,
  alerts_summary,
  source_status,
  source_disagreements,
  attribution,
  stale_flags,
  sources_checked,
  generated_at,
  last_successful_source_at,
  updated_at
FROM public.ibiza_weather_daily_reports
WHERE status = 'published'
ORDER BY report_date DESC, generated_at DESC
LIMIT 1;

CREATE VIEW public.ibiza_weather_forecast_points_public AS
SELECT
  points.id,
  points.report_date,
  points.point_type,
  points.location_key,
  points.forecast_time,
  points.forecast_date,
  points.temperature_c,
  points.apparent_temperature_c,
  points.temp_min_c,
  points.temp_max_c,
  points.precipitation_probability_pct,
  points.precipitation_mm,
  points.weather_code,
  points.cloud_cover_pct,
  points.wind_speed_kmh,
  points.wind_gust_kmh,
  points.wind_direction_deg,
  points.uv_index,
  points.wave_height_m,
  points.wave_period_s,
  points.wave_direction_deg,
  points.sea_surface_temperature_c,
  points.sunrise_at,
  points.sunset_at,
  points.source_observed_at,
  points.created_at,
  sources.source_key,
  sources.label AS source_label,
  sources.source_domain,
  sources.attribution,
  sources.attribution_url
FROM public.ibiza_weather_forecast_points points
JOIN public.weather_sources sources ON sources.source_key = points.source_key
JOIN public.ibiza_weather_daily_reports reports ON reports.run_id = points.run_id
WHERE reports.status = 'published';

CREATE VIEW public.ibiza_weather_alerts_public AS
SELECT
  alerts.id,
  alerts.report_date,
  alerts.alert_uid,
  alerts.title,
  alerts.summary,
  alerts.event,
  alerts.zone,
  alerts.severity,
  alerts.certainty,
  alerts.urgency,
  alerts.effective_at,
  alerts.onset_at,
  alerts.expires_at,
  alerts.source_url,
  alerts.official,
  alerts.created_at,
  sources.source_key,
  sources.label AS source_label,
  sources.source_domain,
  sources.attribution,
  sources.attribution_url
FROM public.ibiza_weather_alerts alerts
JOIN public.weather_sources sources ON sources.source_key = alerts.source_key
JOIN public.ibiza_weather_daily_reports reports ON reports.run_id = alerts.run_id
WHERE reports.status = 'published';

REVOKE ALL ON public.ibiza_weather_daily_reports_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_public_current FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_forecast_points_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_alerts_public FROM anon, authenticated;

GRANT SELECT ON public.ibiza_weather_daily_reports_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_public_current TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_forecast_points_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_alerts_public TO anon, authenticated;
