-- Supabase-first replacement for the legacy Notion Ibiza Events Agent.
-- These tables stage source evidence and normalized candidates before any row is
-- merged into the public ibiza_events surface.

CREATE TABLE IF NOT EXISTS public.event_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'daily'
    CHECK (run_type IN ('daily', 'sunday_full_season', 'biweekly_reverify', 'manual', 'backfill')),
  mode text NOT NULL DEFAULT 'shadow'
    CHECK (mode IN ('shadow', 'write')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  source_keys text[] NOT NULL DEFAULT '{}'::text[],
  window_start date,
  window_end date,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources_seen integer NOT NULL DEFAULT 0,
  snapshots_inserted integer NOT NULL DEFAULT 0,
  candidates_seen integer NOT NULL DEFAULT 0,
  candidates_inserted integer NOT NULL DEFAULT 0,
  existing_matches integer NOT NULL DEFAULT 0,
  events_inserted integer NOT NULL DEFAULT 0,
  events_updated integer NOT NULL DEFAULT 0,
  source_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.event_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.event_ingestion_runs(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_kind text NOT NULL,
  source_url text NOT NULL,
  status_code integer,
  content_hash text,
  excerpt text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.event_ingestion_runs(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.event_source_snapshots(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  external_id text NOT NULL,
  dedupe_key text NOT NULL,
  event_name text NOT NULL,
  event_date date,
  start_time text,
  end_time text,
  venue text,
  event_series text,
  type text,
  status text,
  lineup_details text,
  event_url text,
  original_source_url text,
  source_label text,
  residents_pass text,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'auto_safe', 'needs_review', 'duplicate', 'rejected', 'merged')),
  existing_event_id uuid REFERENCES public.ibiza_events(id) ON DELETE SET NULL,
  raw_candidate jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_ingestion_runs_started_at_idx
  ON public.event_ingestion_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS event_source_snapshots_run_idx
  ON public.event_source_snapshots (run_id);

CREATE INDEX IF NOT EXISTS event_candidates_run_idx
  ON public.event_candidates (run_id);

CREATE INDEX IF NOT EXISTS event_candidates_event_date_idx
  ON public.event_candidates (event_date);

CREATE INDEX IF NOT EXISTS event_candidates_review_status_idx
  ON public.event_candidates (review_status);

CREATE UNIQUE INDEX IF NOT EXISTS event_candidates_source_external_run_key
  ON public.event_candidates (run_id, source_key, external_id);

DROP TRIGGER IF EXISTS update_event_candidates_updated_at ON public.event_candidates;
CREATE TRIGGER update_event_candidates_updated_at
  BEFORE UPDATE ON public.event_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_ingestion_runs FROM anon, authenticated;
REVOKE ALL ON public.event_source_snapshots FROM anon, authenticated;
REVOKE ALL ON public.event_candidates FROM anon, authenticated;
