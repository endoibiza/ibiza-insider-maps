-- Weather intelligence and beach recommendation layer.
-- Keeps raw source evidence private while exposing only visitor-safe decisions.

ALTER TABLE public.ibiza_weather_daily_reports
  ADD COLUMN IF NOT EXISTS weather_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.ibiza_beach_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_key text NOT NULL UNIQUE,
  beach_name text NOT NULL,
  coast text NOT NULL CHECK (coast IN ('North coast', 'East coast', 'South coast', 'West coast')),
  municipality text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  wind_exposure_degrees integer[] NOT NULL DEFAULT '{}'::integer[],
  swell_exposure_degrees integer[] NOT NULL DEFAULT '{}'::integer[],
  shelter_level integer NOT NULL DEFAULT 2 CHECK (shelter_level BETWEEN 1 AND 5),
  swim_suitability integer NOT NULL DEFAULT 3 CHECK (swim_suitability BETWEEN 1 AND 5),
  family_suitability integer NOT NULL DEFAULT 3 CHECK (family_suitability BETWEEN 1 AND 5),
  sunset_value integer NOT NULL DEFAULT 1 CHECK (sunset_value BETWEEN 1 AND 5),
  sunrise_value integer NOT NULL DEFAULT 1 CHECK (sunrise_value BETWEEN 1 AND 5),
  activity_tags text[] NOT NULL DEFAULT '{}'::text[],
  lifeguard_caveat text NOT NULL DEFAULT 'Check posted flags and lifeguard guidance locally before swimming.',
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_beach_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.weather_ingestion_runs(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  beach_profile_id uuid REFERENCES public.ibiza_beach_profiles(id) ON DELETE SET NULL,
  beach_key text NOT NULL,
  beach_name text NOT NULL,
  coast text NOT NULL,
  time_window text NOT NULL CHECK (time_window IN ('best_now', 'best_afternoon', 'good_alternative', 'avoid_exposed')),
  rank integer NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('great', 'good', 'caution', 'avoid')),
  decision text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  cautions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_timestamps jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_date, beach_key, time_window)
);

CREATE INDEX IF NOT EXISTS ibiza_beach_profiles_enabled_idx
  ON public.ibiza_beach_profiles (enabled, coast, beach_name);

CREATE INDEX IF NOT EXISTS ibiza_beach_recommendations_public_idx
  ON public.ibiza_beach_recommendations (report_date DESC, time_window, rank);

CREATE INDEX IF NOT EXISTS ibiza_beach_recommendations_run_idx
  ON public.ibiza_beach_recommendations (run_id);

DROP TRIGGER IF EXISTS update_ibiza_beach_profiles_updated_at ON public.ibiza_beach_profiles;
CREATE TRIGGER update_ibiza_beach_profiles_updated_at
  BEFORE UPDATE ON public.ibiza_beach_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ibiza_beach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_beach_recommendations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ibiza_beach_profiles FROM anon, authenticated;
REVOKE ALL ON public.ibiza_beach_recommendations FROM anon, authenticated;

INSERT INTO public.ibiza_beach_profiles
  (
    beach_key,
    beach_name,
    coast,
    municipality,
    latitude,
    longitude,
    wind_exposure_degrees,
    swell_exposure_degrees,
    shelter_level,
    swim_suitability,
    family_suitability,
    sunset_value,
    sunrise_value,
    activity_tags,
    raw_metadata
  )
VALUES
  ('portinatx', 'Portinatx', 'North coast', 'Sant Joan de Labritja', 39.109300, 1.517800, ARRAY[315,0,45], ARRAY[315,0,45], 3, 4, 4, 2, 3, ARRAY['swim','family','snorkel'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_xarraca', 'Cala Xarraca', 'North coast', 'Sant Joan de Labritja', 39.102600, 1.485900, ARRAY[315,0,45], ARRAY[315,0,45], 3, 4, 2, 2, 3, ARRAY['swim','snorkel'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('benirras', 'Benirras', 'North coast', 'Sant Joan de Labritja', 39.090000, 1.447600, ARRAY[315,0,45], ARRAY[315,0,45], 2, 3, 3, 4, 2, ARRAY['sunset','swim'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('aigues_blanques', 'Aigues Blanques', 'East coast', 'Santa Eularia des Riu', 39.051900, 1.589900, ARRAY[45,90,135], ARRAY[45,90,135], 2, 3, 2, 1, 5, ARRAY['sunrise','swim'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_nova', 'Cala Nova', 'East coast', 'Santa Eularia des Riu', 39.003700, 1.586400, ARRAY[45,90,135], ARRAY[45,90,135], 2, 3, 4, 1, 4, ARRAY['swim','family','surf_watch'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('santa_eularia', 'Santa Eularia Beach', 'East coast', 'Santa Eularia des Riu', 38.984300, 1.537100, ARRAY[45,90,135], ARRAY[45,90,135], 4, 4, 5, 1, 3, ARRAY['swim','family','accessible'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_llonga', 'Cala Llonga', 'East coast', 'Santa Eularia des Riu', 38.953200, 1.521800, ARRAY[90,135], ARRAY[90,135], 4, 4, 5, 1, 3, ARRAY['swim','family'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('playa_den_bossa', 'Playa d''en Bossa', 'South coast', 'Sant Josep de sa Talaia', 38.884200, 1.404100, ARRAY[135,180,225], ARRAY[135,180,225], 2, 3, 4, 1, 2, ARRAY['swim','family','long_walk'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('ses_salines', 'Ses Salines', 'South coast', 'Sant Josep de sa Talaia', 38.841300, 1.388700, ARRAY[135,180,225], ARRAY[135,180,225], 2, 3, 3, 2, 2, ARRAY['swim','scene'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('es_cavallet', 'Es Cavallet', 'South coast', 'Sant Josep de sa Talaia', 38.845900, 1.410600, ARRAY[135,180,225], ARRAY[135,180,225], 1, 2, 2, 2, 2, ARRAY['walk','scene'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_jondal', 'Cala Jondal', 'South coast', 'Sant Josep de sa Talaia', 38.867900, 1.317800, ARRAY[135,180,225], ARRAY[135,180,225], 3, 3, 2, 2, 1, ARRAY['lunch','swim'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_tarida', 'Cala Tarida', 'West coast', 'Sant Josep de sa Talaia', 38.941000, 1.235900, ARRAY[225,270,315], ARRAY[225,270,315], 3, 4, 4, 5, 1, ARRAY['sunset','swim','family'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_comte', 'Cala Comte', 'West coast', 'Sant Josep de sa Talaia', 38.963500, 1.220400, ARRAY[225,270,315], ARRAY[225,270,315], 2, 3, 3, 5, 1, ARRAY['sunset','swim','snorkel'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_bassa', 'Cala Bassa', 'West coast', 'Sant Josep de sa Talaia', 38.967700, 1.241800, ARRAY[225,270,315], ARRAY[225,270,315], 4, 4, 4, 4, 1, ARRAY['sunset','swim','family'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('cala_salada', 'Cala Salada', 'West coast', 'Sant Antoni de Portmany', 39.007500, 1.299700, ARRAY[225,270,315], ARRAY[225,270,315], 4, 4, 3, 4, 1, ARRAY['sunset','swim','snorkel'], '{"profile_basis":"Ibiza Maps default beach exposure model"}'),
  ('san_antonio_bay', 'San Antonio Bay', 'West coast', 'Sant Antoni de Portmany', 38.973400, 1.303600, ARRAY[225,270,315], ARRAY[225,270,315], 4, 4, 5, 4, 1, ARRAY['sunset','family','swim'], '{"profile_basis":"Ibiza Maps default beach exposure model"}')
ON CONFLICT (beach_key) DO UPDATE SET
  beach_name = EXCLUDED.beach_name,
  coast = EXCLUDED.coast,
  municipality = EXCLUDED.municipality,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  wind_exposure_degrees = EXCLUDED.wind_exposure_degrees,
  swell_exposure_degrees = EXCLUDED.swell_exposure_degrees,
  shelter_level = EXCLUDED.shelter_level,
  swim_suitability = EXCLUDED.swim_suitability,
  family_suitability = EXCLUDED.family_suitability,
  sunset_value = EXCLUDED.sunset_value,
  sunrise_value = EXCLUDED.sunrise_value,
  activity_tags = EXCLUDED.activity_tags,
  raw_metadata = EXCLUDED.raw_metadata,
  updated_at = now();

DROP VIEW IF EXISTS public.ibiza_beach_recommendations_public;
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
  weather_intelligence,
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
  weather_intelligence,
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

CREATE VIEW public.ibiza_beach_recommendations_public AS
SELECT
  recommendations.id,
  recommendations.report_date,
  recommendations.beach_key,
  recommendations.beach_name,
  recommendations.coast,
  profiles.municipality,
  profiles.latitude,
  profiles.longitude,
  profiles.activity_tags,
  recommendations.time_window,
  recommendations.rank,
  recommendations.score,
  recommendations.status,
  recommendations.decision,
  recommendations.reasons,
  recommendations.cautions,
  recommendations.source_timestamps,
  recommendations.generated_at,
  profiles.lifeguard_caveat
FROM public.ibiza_beach_recommendations recommendations
LEFT JOIN public.ibiza_beach_profiles profiles ON profiles.id = recommendations.beach_profile_id
JOIN public.ibiza_weather_daily_reports reports ON reports.run_id = recommendations.run_id
WHERE reports.status = 'published';

REVOKE ALL ON public.ibiza_weather_daily_reports_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_public_current FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_forecast_points_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_weather_alerts_public FROM anon, authenticated;
REVOKE ALL ON public.ibiza_beach_recommendations_public FROM anon, authenticated;

GRANT SELECT ON public.ibiza_weather_daily_reports_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_public_current TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_forecast_points_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_weather_alerts_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_beach_recommendations_public TO anon, authenticated;
