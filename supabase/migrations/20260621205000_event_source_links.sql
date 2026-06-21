-- Source-link and maintenance layer for the Supabase-first Ibiza Events OS.
-- This records which URL should be used to re-scan an event without changing
-- the public ibiza_events contract consumed by Lovable.

CREATE TABLE IF NOT EXISTS public.event_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.ibiza_events(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.event_candidates(id) ON DELETE SET NULL,
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
  source_key text,
  source_label text,
  canonical_for_updates boolean NOT NULL DEFAULT false,
  monetizable boolean NOT NULL DEFAULT false,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'broken', 'needs_review', 'replaced')),
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_id IS NOT NULL OR candidate_id IS NOT NULL)
);

ALTER TABLE public.event_candidates
  ADD COLUMN IF NOT EXISTS source_url_type text
    CHECK (source_url_type IS NULL OR source_url_type IN (
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
  ADD COLUMN IF NOT EXISTS canonical_source_url text,
  ADD COLUMN IF NOT EXISTS maintenance_flags text[] NOT NULL DEFAULT '{}'::text[];

CREATE UNIQUE INDEX IF NOT EXISTS event_source_links_event_url_key
  ON public.event_source_links (event_id, source_url)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_source_links_candidate_url_key
  ON public.event_source_links (candidate_id, source_url)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_source_links_event_idx
  ON public.event_source_links (event_id);

CREATE INDEX IF NOT EXISTS event_source_links_candidate_idx
  ON public.event_source_links (candidate_id);

CREATE INDEX IF NOT EXISTS event_source_links_source_type_idx
  ON public.event_source_links (source_type);

CREATE INDEX IF NOT EXISTS event_source_links_canonical_idx
  ON public.event_source_links (canonical_for_updates)
  WHERE canonical_for_updates = true;

DROP TRIGGER IF EXISTS update_event_source_links_updated_at ON public.event_source_links;
CREATE TRIGGER update_event_source_links_updated_at
  BEFORE UPDATE ON public.event_source_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_source_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_source_links FROM anon, authenticated;

DROP VIEW IF EXISTS public.event_maintenance_queue;
CREATE VIEW public.event_maintenance_queue AS
WITH classified AS (
  SELECT
    e.id AS event_id,
    e.notion_page_id,
    e.event_name,
    e.date,
    e.venue,
    e.event_series,
    e.event_url,
    e.lineup_details,
    e.source,
    e.status,
    CASE
      WHEN e.event_url IS NULL OR btrim(e.event_url) = '' THEN 'missing_event_url'
      WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 'missing_lineup_details'
      WHEN e.event_url ~* 'ibiza-spotlight\.com/(night/events|events/?$)' THEN 'generic_event_url'
      WHEN e.event_url ~* '/(events|calendar|agenda)/?$' THEN 'generic_event_url'
      WHEN e.event_url ~* '(ra\.co|shotgun\.live|eventbrite|skiddle|dice\.fm)' THEN 'ticketing_or_aggregator_url'
      ELSE NULL
    END AS issue_type
  FROM public.ibiza_events e
  WHERE e.date >= CURRENT_DATE
    AND COALESCE(e.status, '') <> 'Cancelled'
)
SELECT
  event_id,
  notion_page_id,
  event_name,
  date,
  venue,
  event_series,
  event_url,
  lineup_details,
  source,
  status,
  issue_type,
  CASE issue_type
    WHEN 'missing_event_url' THEN 10
    WHEN 'missing_lineup_details' THEN 8
    WHEN 'generic_event_url' THEN 6
    WHEN 'ticketing_or_aggregator_url' THEN 4
    ELSE 1
  END AS priority
FROM classified
WHERE issue_type IS NOT NULL;

REVOKE ALL ON public.event_maintenance_queue FROM anon, authenticated;

INSERT INTO public.event_source_links (
  event_id,
  source_url,
  source_type,
  source_key,
  source_label,
  canonical_for_updates,
  monetizable,
  confidence,
  last_checked_at,
  raw_metadata
)
SELECT
  e.id,
  e.event_url,
  CASE
    WHEN e.event_url ~* '(fourvenues\.com|fourvenues\.site|site\.fourvenues\.com)' THEN 'fourvenues_public'
    WHEN e.event_url ~* 'ibiza-spotlight\.com' THEN 'ibiza_spotlight'
    WHEN e.event_url ~* '(santaeularia|eivissa\.es|santantoni|santjosep|santjoan|conselldeivissa|caib\.es|illesbalears)' THEN 'municipal'
    WHEN e.event_url ~* '(ra\.co|shotgun\.live|eventbrite|skiddle|dice\.fm|ticketing|tickets)' THEN 'ticketing_platform'
    WHEN e.event_url ~* '(instagram\.com|facebook\.com|x\.com|twitter\.com)' THEN 'social'
    WHEN e.event_url ~* '(pacha\.com|hiibiza\.com|theushuaiaexperience\.com|unvrs\.com|amnesia\.es|dc10ibiza\.com|circolocoibiza\.com|covasanta\.com|ibizarocks\.com|pikesibiza\.com|528ibiza\.com|chinois\.com|akashaibiza\.com|lasdalias\.es|edenibiza\.com|liogroup\.com|bluemarlinibiza\.com|nikkibeach\.com|jockeyclubibiza\.com|ibiza\.cafedelmar\.com)' THEN 'official_venue'
    ELSE 'unknown'
  END AS source_type,
  CASE
    WHEN e.notion_page_id LIKE 'fourvenues:%' THEN 'fourvenues'
    WHEN e.notion_page_id LIKE 'agent:%' THEN split_part(e.notion_page_id, ':', 2)
    ELSE 'notion'
  END AS source_key,
  e.source,
  CASE
    WHEN e.event_url ~* '(fourvenues\.com|fourvenues\.site|site\.fourvenues\.com)' THEN true
    WHEN e.event_url ~* 'ibiza-spotlight\.com/(night/events|events/?$)' THEN false
    WHEN e.event_url ~* '/(events|calendar|agenda)/?$' THEN false
    ELSE true
  END AS canonical_for_updates,
  (e.checkout_url IS NOT NULL OR e.iframe_tag_url IS NOT NULL OR e.iframe_script_url IS NOT NULL OR e.fourvenues_event_id IS NOT NULL) AS monetizable,
  CASE
    WHEN e.event_url ~* '(pacha\.com|hiibiza\.com|theushuaiaexperience\.com|unvrs\.com|amnesia\.es|dc10ibiza\.com|circolocoibiza\.com|covasanta\.com|ibizarocks\.com|pikesibiza\.com|528ibiza\.com|chinois\.com|akashaibiza\.com|lasdalias\.es|edenibiza\.com)' THEN 0.850
    WHEN e.event_url ~* '(fourvenues\.com|fourvenues\.site|site\.fourvenues\.com)' THEN 0.800
    WHEN e.event_url ~* 'ibiza-spotlight\.com' THEN 0.650
    ELSE 0.500
  END AS confidence,
  now(),
  jsonb_build_object(
    'seeded_from', 'ibiza_events.event_url',
    'notion_page_id', e.notion_page_id,
    'venue', e.venue
  )
FROM public.ibiza_events e
WHERE e.event_url IS NOT NULL
  AND btrim(e.event_url) <> ''
ON CONFLICT (event_id, source_url) WHERE event_id IS NOT NULL
DO UPDATE SET
  source_type = EXCLUDED.source_type,
  source_key = EXCLUDED.source_key,
  source_label = EXCLUDED.source_label,
  canonical_for_updates = EXCLUDED.canonical_for_updates,
  monetizable = EXCLUDED.monetizable,
  confidence = EXCLUDED.confidence,
  last_checked_at = EXCLUDED.last_checked_at,
  raw_metadata = public.event_source_links.raw_metadata || EXCLUDED.raw_metadata;
