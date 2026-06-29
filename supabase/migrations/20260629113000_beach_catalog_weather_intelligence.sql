-- Connect the weather recommendation layer to the canonical beach catalog.
-- CSV/enrichment inputs are staged privately and reviewed before any catalog merge.

CREATE TABLE IF NOT EXISTS public.ibiza_beach_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL,
  source_sha256 text,
  row_count integer NOT NULL DEFAULT 0,
  importer_version text NOT NULL DEFAULT 'beach-csv-import-v1',
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'reviewed', 'merged', 'rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_beach_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.ibiza_beach_import_batches(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL,
  source_title text NOT NULL,
  normalized_title text NOT NULL,
  google_maps_url text,
  csv_clock_position numeric,
  csv_area text,
  csv_location text,
  candidate_beach_id uuid REFERENCES public.ibiza_beaches(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'needs_review'
    CHECK (match_status IN ('exact', 'high_confidence', 'possible', 'unmatched', 'needs_review', 'merged', 'rejected')),
  match_confidence integer NOT NULL DEFAULT 0 CHECK (match_confidence BETWEEN 0 AND 100),
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  merge_status text NOT NULL DEFAULT 'not_merged'
    CHECK (merge_status IN ('not_merged', 'auto_merged', 'manual_merged', 'skipped')),
  raw_row jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS ibiza_beach_import_rows_batch_idx
  ON public.ibiza_beach_import_rows (batch_id, source_row_number);

CREATE INDEX IF NOT EXISTS ibiza_beach_import_rows_match_idx
  ON public.ibiza_beach_import_rows (match_status, match_confidence DESC);

CREATE INDEX IF NOT EXISTS ibiza_beach_import_rows_candidate_idx
  ON public.ibiza_beach_import_rows (candidate_beach_id)
  WHERE candidate_beach_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_ibiza_beach_import_batches_updated_at ON public.ibiza_beach_import_batches;
CREATE TRIGGER update_ibiza_beach_import_batches_updated_at
  BEFORE UPDATE ON public.ibiza_beach_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ibiza_beach_import_rows_updated_at ON public.ibiza_beach_import_rows;
CREATE TRIGGER update_ibiza_beach_import_rows_updated_at
  BEFORE UPDATE ON public.ibiza_beach_import_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ibiza_beach_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_beach_import_rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ibiza_beach_import_batches FROM anon, authenticated;
REVOKE ALL ON public.ibiza_beach_import_rows FROM anon, authenticated;

ALTER TABLE public.ibiza_beach_recommendations
  ADD COLUMN IF NOT EXISTS canonical_beach_id uuid REFERENCES public.ibiza_beaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS activity_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS lifeguard_caveat text NOT NULL DEFAULT 'Check posted flags and lifeguard guidance locally before swimming.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ibiza_beach_recommendations_time_window_check'
      AND conrelid = 'public.ibiza_beach_recommendations'::regclass
  ) THEN
    ALTER TABLE public.ibiza_beach_recommendations
      DROP CONSTRAINT ibiza_beach_recommendations_time_window_check;
  END IF;
END $$;

ALTER TABLE public.ibiza_beach_recommendations
  ADD CONSTRAINT ibiza_beach_recommendations_time_window_check
  CHECK (
    time_window IN (
      'best_now',
      'best_swim',
      'best_family',
      'best_sunset',
      'best_afternoon',
      'good_alternative',
      'avoid_exposed'
    )
  );

CREATE INDEX IF NOT EXISTS ibiza_beach_recommendations_canonical_idx
  ON public.ibiza_beach_recommendations (canonical_beach_id)
  WHERE canonical_beach_id IS NOT NULL;

DROP VIEW IF EXISTS public.ibiza_beach_recommendations_public;

CREATE VIEW public.ibiza_beach_recommendations_public AS
SELECT
  recommendations.id,
  recommendations.report_date,
  recommendations.beach_key,
  recommendations.beach_name,
  recommendations.coast,
  COALESCE(recommendations.municipality, profiles.municipality, beaches.municipality) AS municipality,
  COALESCE(recommendations.latitude, profiles.latitude, beaches.gps_latitude) AS latitude,
  COALESCE(recommendations.longitude, profiles.longitude, beaches.gps_longitude) AS longitude,
  COALESCE(NULLIF(recommendations.activity_tags, '{}'::text[]), profiles.activity_tags, beaches.activities_arr, '{}'::text[]) AS activity_tags,
  recommendations.time_window,
  recommendations.rank,
  recommendations.score,
  recommendations.status,
  recommendations.decision,
  recommendations.reasons,
  recommendations.cautions,
  recommendations.source_timestamps,
  recommendations.generated_at,
  COALESCE(
    recommendations.lifeguard_caveat,
    profiles.lifeguard_caveat,
    'Check posted flags and lifeguard guidance locally before swimming.'
  ) AS lifeguard_caveat
FROM public.ibiza_beach_recommendations recommendations
LEFT JOIN public.ibiza_beach_profiles profiles ON profiles.id = recommendations.beach_profile_id
LEFT JOIN public.ibiza_beaches beaches ON beaches.id = recommendations.canonical_beach_id
JOIN public.ibiza_weather_daily_reports reports ON reports.run_id = recommendations.run_id
WHERE reports.status = 'published';

REVOKE ALL ON public.ibiza_beach_recommendations_public FROM anon, authenticated;
GRANT SELECT ON public.ibiza_beach_recommendations_public TO anon, authenticated;
