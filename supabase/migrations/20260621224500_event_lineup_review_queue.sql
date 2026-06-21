-- Staging surface for lineup repair proposals. Public event text remains in
-- ibiza_events; this table records evidence and proposed replacements first.

CREATE TABLE IF NOT EXISTS public.event_lineup_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ibiza_events(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.event_ingestion_runs(id) ON DELETE SET NULL,
  source_link_id uuid REFERENCES public.event_source_links(id) ON DELETE SET NULL,
  snapshot_id uuid REFERENCES public.event_source_snapshots(id) ON DELETE SET NULL,
  source_url text NOT NULL,
  source_type text NOT NULL DEFAULT 'unknown'
    CHECK (source_type IN (
      'official_venue',
      'fourvenues_public',
      'fourvenues_channel',
      'ibiza_spotlight',
      'municipal',
      'ticketing_platform',
      'aggregator',
      'social',
      'manual',
      'unknown'
    )),
  event_name text NOT NULL,
  event_date date,
  venue text,
  current_lineup_details text,
  proposed_lineup_details text NOT NULL,
  proposal_hash text NOT NULL,
  lineup_confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'auto_safe', 'approved', 'rejected', 'applied')),
  applied_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_lineup_review_queue_event_idx
  ON public.event_lineup_review_queue (event_id);

CREATE INDEX IF NOT EXISTS event_lineup_review_queue_status_idx
  ON public.event_lineup_review_queue (approval_status);

CREATE INDEX IF NOT EXISTS event_lineup_review_queue_date_idx
  ON public.event_lineup_review_queue (event_date);

CREATE UNIQUE INDEX IF NOT EXISTS event_lineup_review_queue_unique_proposal_idx
  ON public.event_lineup_review_queue (event_id, source_url, proposal_hash);

DROP TRIGGER IF EXISTS update_event_lineup_review_queue_updated_at ON public.event_lineup_review_queue;
CREATE TRIGGER update_event_lineup_review_queue_updated_at
  BEFORE UPDATE ON public.event_lineup_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_lineup_review_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_lineup_review_queue FROM anon, authenticated;

CREATE OR REPLACE VIEW public.event_lineup_sweep_targets AS
SELECT
  e.id AS event_id,
  e.notion_page_id,
  e.event_name,
  e.date,
  e.venue,
  e.event_series,
  e.event_url,
  e.lineup_details,
  e.status,
  e.fourvenues_event_id,
  e.source_missing_since,
  l.id AS source_link_id,
  l.source_url,
  l.source_type,
  l.canonical_for_updates,
  CASE
    WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 'missing_lineup_details'
    WHEN e.lineup_details ~* '^(tba|tbc|lineup tba|to be announced|more tba|coming soon)$' THEN 'weak_lineup_details'
    WHEN e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b' THEN 'internal_metadata_in_lineup'
    ELSE NULL
  END AS issue_type,
  CASE
    WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 10
    WHEN e.lineup_details ~* '^(tba|tbc|lineup tba|to be announced|more tba|coming soon)$' THEN 8
    WHEN e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b' THEN 9
    ELSE 1
  END AS priority
FROM public.ibiza_events e
LEFT JOIN LATERAL (
  SELECT *
  FROM public.event_source_links l
  WHERE l.event_id = e.id
    AND l.status IN ('active', 'needs_review')
  ORDER BY
    l.canonical_for_updates DESC,
    CASE l.source_type
      WHEN 'official_venue' THEN 1
      WHEN 'ibiza_spotlight' THEN 2
      WHEN 'ticketing_platform' THEN 3
      WHEN 'municipal' THEN 4
      ELSE 5
    END,
    l.confidence DESC,
    l.updated_at DESC
  LIMIT 1
) l ON true
WHERE e.date >= CURRENT_DATE
  AND lower(COALESCE(e.status, '')) NOT IN ('cancelled', 'hidden')
  AND e.source_missing_since IS NULL
  AND e.fourvenues_event_id IS NULL
  AND e.notion_page_id NOT LIKE 'fourvenues:%'
  AND (
    e.lineup_details IS NULL
    OR btrim(e.lineup_details) = ''
    OR e.lineup_details ~* '^(tba|tbc|lineup tba|to be announced|more tba|coming soon)$'
    OR e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b'
  );

REVOKE ALL ON TABLE public.event_lineup_sweep_targets FROM anon, authenticated;
