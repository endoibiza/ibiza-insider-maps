-- Add a private multi-source evidence layer for Ibiza News. Publisher and
-- discovery feeds may surface a story, while the public URL can point to a
-- verified official/owner source when one exists.

ALTER TABLE public.x_signal_sources
  ADD COLUMN IF NOT EXISTS canonical_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_publisher_original boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_local_signal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_primary_resolution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_link_policy text NOT NULL DEFAULT 'never'
    CHECK (public_link_policy IN ('primary_only', 'publisher_allowed', 'never')),
  ADD COLUMN IF NOT EXISTS content_deny_patterns text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.ibiza_news_story_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.ibiza_news_stories(id) ON DELETE CASCADE,
  signal_item_id uuid REFERENCES public.x_daily_digest_items(id) ON DELETE SET NULL,
  snapshot_id uuid REFERENCES public.news_source_snapshots(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  source_label text NOT NULL,
  source_url text NOT NULL,
  source_domain text NOT NULL,
  evidence_role text NOT NULL
    CHECK (evidence_role IN ('discovery', 'canonical', 'corroborating')),
  source_kind text NOT NULL
    CHECK (source_kind IN ('official_source', 'owner_source', 'publisher_original', 'verified_media', 'discovery_only')),
  verification_status text NOT NULL DEFAULT 'candidate'
    CHECK (verification_status IN ('candidate', 'verified', 'rejected', 'conflict')),
  evidence_hash text NOT NULL,
  source_published_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, source_url)
);

CREATE TABLE IF NOT EXISTS public.news_resolution_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date date NOT NULL,
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'resolve')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  signals_seen integer NOT NULL DEFAULT 0,
  official_matches integer NOT NULL DEFAULT 0,
  publisher_originals integer NOT NULL DEFAULT 0,
  review_required integer NOT NULL DEFAULT 0,
  event_candidates integer NOT NULL DEFAULT 0,
  conflicts integer NOT NULL DEFAULT 0,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ibiza_news_stories
  ADD COLUMN IF NOT EXISTS canonical_evidence_id uuid,
  ADD COLUMN IF NOT EXISTS source_resolution_status text NOT NULL DEFAULT 'unresolved'
    CHECK (source_resolution_status IN (
      'unresolved',
      'official_resolved',
      'owner_resolved',
      'publisher_original',
      'review_required',
      'conflict'
    )),
  ADD COLUMN IF NOT EXISTS corroborating_source_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.ibiza_news_stories
  ADD CONSTRAINT ibiza_news_stories_canonical_evidence_fk
  FOREIGN KEY (canonical_evidence_id)
  REFERENCES public.ibiza_news_story_evidence(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ibiza_news_story_evidence_story_idx
  ON public.ibiza_news_story_evidence (story_id, evidence_role, verification_status);

CREATE INDEX IF NOT EXISTS ibiza_news_story_evidence_signal_idx
  ON public.ibiza_news_story_evidence (signal_item_id)
  WHERE signal_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ibiza_news_story_evidence_hash_idx
  ON public.ibiza_news_story_evidence (evidence_hash);

DROP TRIGGER IF EXISTS update_ibiza_news_story_evidence_updated_at
  ON public.ibiza_news_story_evidence;
CREATE TRIGGER update_ibiza_news_story_evidence_updated_at
  BEFORE UPDATE ON public.ibiza_news_story_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ibiza_news_story_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_resolution_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ibiza_news_story_evidence FROM anon, authenticated;
REVOKE ALL ON public.news_resolution_runs FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS news_resolution_runs_target_idx
  ON public.news_resolution_runs (target_date DESC, started_at DESC);

-- Existing rows stay public during the transition. Their current direct
-- publisher URL is recorded as provisional publisher-original evidence.
INSERT INTO public.ibiza_news_story_evidence (
  story_id,
  snapshot_id,
  source_key,
  source_label,
  source_url,
  source_domain,
  evidence_role,
  source_kind,
  verification_status,
  evidence_hash,
  source_published_at,
  raw_metadata
)
SELECT
  stories.id,
  stories.snapshot_id,
  stories.source_key,
  stories.source_label,
  stories.source_url,
  stories.source_domain,
  CASE WHEN stories.source_domain = 'ibiza-spotlight.com' THEN 'discovery' ELSE 'canonical' END,
  CASE WHEN stories.source_domain = 'ibiza-spotlight.com' THEN 'discovery_only' ELSE 'publisher_original' END,
  CASE WHEN stories.source_domain = 'ibiza-spotlight.com' THEN 'candidate' ELSE 'verified' END,
  stories.evidence_hash,
  stories.published_at,
  jsonb_build_object('backfilled', true, 'backfilled_at', now())
FROM public.ibiza_news_stories stories
WHERE stories.status = 'published'
  AND public.is_public_news_source_url(stories.source_url)
ON CONFLICT (story_id, source_url) DO NOTHING;

UPDATE public.ibiza_news_stories stories
SET
  canonical_evidence_id = evidence.id,
  source_resolution_status = 'publisher_original',
  corroborating_source_count = evidence_counts.corroborating_count
FROM public.ibiza_news_story_evidence evidence
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS corroborating_count
  FROM public.ibiza_news_story_evidence corroborating
  WHERE corroborating.story_id = evidence.story_id
    AND corroborating.evidence_role = 'corroborating'
    AND corroborating.verification_status = 'verified'
) evidence_counts ON true
WHERE evidence.story_id = stories.id
  AND evidence.evidence_role = 'canonical'
  AND evidence.verification_status = 'verified'
  AND stories.canonical_evidence_id IS NULL;

-- Source policy. Media can be canonical only for original reporting. Official
-- and owner sources may be canonical primary evidence. Spotlight is discovery
-- only and must never become a public link.
UPDATE public.x_signal_sources
SET
  canonical_eligible = true,
  allow_publisher_original = false,
  require_primary_resolution = false,
  public_link_policy = 'primary_only'
WHERE coalesce(raw_metadata->>'source_kind', '') IN ('official_source', 'official_account');

UPDATE public.x_signal_sources
SET
  canonical_eligible = true,
  allow_publisher_original = true,
  require_primary_resolution = false,
  public_link_policy = 'publisher_allowed'
WHERE coalesce(raw_metadata->>'source_kind', '') = 'verified_media'
  AND source_domain <> 'ibiza-spotlight.com';

UPDATE public.x_signal_sources
SET
  canonical_eligible = false,
  allow_publisher_original = false,
  require_primary_resolution = true,
  public_link_policy = 'never',
  raw_metadata = raw_metadata || '{"discovery_only":true,"competitor":true}'::jsonb
WHERE source_domain = 'ibiza-spotlight.com';

INSERT INTO public.x_signal_sources (
  source_key,
  label,
  source_type,
  source_url,
  source_domain,
  language,
  priority,
  enabled,
  requires_credentials,
  publish_mode,
  compliance_status,
  cadence,
  robots_notes,
  signal_categories,
  raw_metadata,
  canonical_eligible,
  allow_publisher_original,
  require_local_signal,
  require_primary_resolution,
  public_link_policy,
  content_deny_patterns
)
VALUES
  (
    'noudiari-rss', 'Noudiari', 'rss', 'https://www.noudiari.es/feed/',
    'noudiari.es', 'es', 42, false, false, 'review_only', 'verified', 'daily',
    'Public RSS metadata only; do not crawl article bodies.',
    ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'],
    '{"source_kind":"verified_media","shadow_source":true}',
    true, true, true, false, 'publisher_allowed', ARRAY['esquela','necrológica','obituario']
  ),
  (
    'onda-cero-ibiza-rss', 'Onda Cero Ibiza', 'rss', 'https://www.ondacero.es/rss/8689.xml',
    'ondacero.es', 'es', 43, false, false, 'review_only', 'verified', 'daily',
    'Official Onda Cero Ibiza RSS metadata only.',
    ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'],
    '{"source_kind":"verified_media","shadow_source":true}',
    true, true, true, false, 'publisher_allowed', '{}'::text[]
  ),
  (
    'ib3-eivissa-rss', 'IB3 Notícies Eivissa', 'rss', 'https://ib3.org/seccio/noticies/eivissa/feed/',
    'ib3.org', 'ca', 44, false, false, 'review_only', 'verified', 'daily',
    'Official public Eivissa section RSS metadata only.',
    ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'],
    '{"source_kind":"verified_media","shadow_source":true}',
    true, true, true, false, 'publisher_allowed', '{}'::text[]
  ),
  (
    'radio-illa-actualitat-rss', 'Ràdio Illa Actualitat', 'rss', 'https://www.radioillaformentera.cat/category/actualitat/feed/',
    'radioillaformentera.cat', 'ca', 45, false, false, 'review_only', 'verified', 'daily',
    'Public Formentera news RSS metadata only.',
    ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'],
    '{"source_kind":"verified_media","shadow_source":true,"municipality":"Formentera"}',
    true, true, true, false, 'publisher_allowed', '{}'::text[]
  ),
  (
    'tef-rss', 'TEF', 'rss', 'https://teftv.com/feed/',
    'teftv.com', 'es', 140, false, false, 'review_only', 'verified', 'daily',
    'Mixed programme and reporting feed; review only.',
    ARRAY['local_breaking_news','tourism_community','source_hint'],
    '{"source_kind":"verified_media","shadow_source":true,"supporting_only":true}',
    false, false, true, true, 'never', ARRAY['programa completo','capítulo','episodio']
  ),
  (
    'majorca-daily-bulletin-atom', 'Majorca Daily Bulletin', 'atom', 'https://www.majorcadailybulletin.com/feed.rss',
    'majorcadailybulletin.com', 'en', 150, false, false, 'review_only', 'verified', 'daily',
    'Balearic-wide feed; explicit Ibiza/Formentera locality required.',
    ARRAY['local_breaking_news','transport_public_safety','tourism_community'],
    '{"source_kind":"verified_media","shadow_source":true,"supporting_only":true}',
    false, false, true, true, 'never', '{}'::text[]
  ),
  (
    'cope-ibiza-rss', 'COPE Ibiza', 'rss', 'https://www.cope.es/emisoras/illes-balears/baleares/ibiza/rss',
    'cope.es', 'es', 180, false, false, 'disabled', 'disabled', 'quarterly',
    'Official feed was stale in July 2026; keep disabled pending re-audit.',
    ARRAY['source_hint'],
    '{"source_kind":"verified_media","stale_since":"2026-02-15"}',
    false, false, true, true, 'never', '{}'::text[]
  )
ON CONFLICT (source_key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  source_domain = EXCLUDED.source_domain,
  language = EXCLUDED.language,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  publish_mode = EXCLUDED.publish_mode,
  compliance_status = EXCLUDED.compliance_status,
  cadence = EXCLUDED.cadence,
  robots_notes = EXCLUDED.robots_notes,
  signal_categories = EXCLUDED.signal_categories,
  raw_metadata = EXCLUDED.raw_metadata,
  canonical_eligible = EXCLUDED.canonical_eligible,
  allow_publisher_original = EXCLUDED.allow_publisher_original,
  require_local_signal = EXCLUDED.require_local_signal,
  require_primary_resolution = EXCLUDED.require_primary_resolution,
  public_link_policy = EXCLUDED.public_link_policy,
  content_deny_patterns = EXCLUDED.content_deny_patterns,
  updated_at = now();

-- Mirror shadow media keys in the private canonical registry so future
-- promotion can retain the originating source key without changing the FK.
INSERT INTO public.news_sources (
  source_key,
  label,
  source_type,
  source_url,
  source_domain,
  language,
  priority,
  enabled,
  publish_mode,
  cadence,
  robots_notes,
  access_status,
  raw_metadata
)
SELECT
  source_key,
  label,
  CASE WHEN source_type = 'atom' THEN 'atom' ELSE 'rss' END,
  source_url,
  source_domain,
  language,
  priority,
  false,
  'signal_only',
  cadence,
  robots_notes,
  compliance_status,
  raw_metadata || '{"registered_for_resolved_signal_promotion":true}'::jsonb
FROM public.x_signal_sources
WHERE source_key IN (
  'noudiari-rss',
  'onda-cero-ibiza-rss',
  'ib3-eivissa-rss',
  'radio-illa-actualitat-rss',
  'tef-rss',
  'majorca-daily-bulletin-atom',
  'cope-ibiza-rss'
)
ON CONFLICT (source_key) DO NOTHING;

UPDATE public.news_sources
SET
  enabled = false,
  publish_mode = 'signal_only',
  raw_metadata = raw_metadata || '{"discovery_only":true,"public_link_policy":"never"}'::jsonb
WHERE source_key = 'ibiza-spotlight-magazine';

DROP VIEW IF EXISTS public.ibiza_news_daily_digests_public;
DROP VIEW IF EXISTS public.ibiza_news_public;

CREATE VIEW public.ibiza_news_public AS
SELECT
  stories.id,
  ('news:' || stories.id::text) AS notion_page_id,
  stories.headline,
  stories.summary,
  stories.category,
  array_to_string(public.news_area_display_labels(stories.area_keys), ', ') AS area,
  coalesce(canonical.source_url, stories.source_url) AS source_url,
  stories.story_date AS date,
  stories.created_at,
  stories.updated_at,
  stories.significance,
  stories.ibiza_maps_relevant,
  stories.santa_eularia,
  public.public_news_source_label(coalesce(canonical.source_label, stories.source_label)) AS source_label,
  coalesce(canonical.source_domain, stories.source_domain) AS source_domain,
  stories.digest_section,
  stories.published_at,
  false AS legacy_source,
  stories.display_language,
  stories.translation_status,
  public.news_area_display_label(stories.area_keys[1]) AS primary_area,
  stories.curation_score,
  stories.area_keys,
  stories.source_resolution_status,
  canonical.source_kind AS evidence_type,
  stories.corroborating_source_count
FROM public.ibiza_news_stories stories
LEFT JOIN public.ibiza_news_story_evidence canonical
  ON canonical.id = stories.canonical_evidence_id
  AND canonical.evidence_role = 'canonical'
  AND canonical.verification_status = 'verified'
WHERE stories.status = 'published'
  AND stories.ibiza_maps_relevant IS TRUE
  AND public.is_public_news_source_url(coalesce(canonical.source_url, stories.source_url))
  AND coalesce(canonical.source_domain, stories.source_domain) <> 'ibiza-spotlight.com'
  AND public.is_public_english_news_text(stories.headline, stories.summary, stories.display_language, stories.translation_status)

UNION ALL

SELECT
  legacy.id,
  legacy.notion_page_id,
  legacy.headline,
  coalesce(legacy.summary, '') AS summary,
  coalesce(legacy.category, 'Other') AS category,
  array_to_string(
    public.news_area_display_labels(
      CASE
        WHEN cardinality(public.canonical_news_area_keys(regexp_split_to_array(coalesce(legacy.area, 'Island-Wide'), '\s*,\s*'))) > 0
          THEN public.canonical_news_area_keys(regexp_split_to_array(coalesce(legacy.area, 'Island-Wide'), '\s*,\s*'))
        ELSE ARRAY['island-wide']::text[]
      END
    ),
    ', '
  ) AS area,
  legacy.source_url,
  legacy.date,
  legacy.created_at,
  legacy.updated_at,
  coalesce(nullif(initcap(legacy.significance), ''), 'Notable') AS significance,
  legacy.ibiza_maps_relevant,
  legacy.santa_eularia,
  NULL::text AS source_label,
  regexp_replace(legacy.source_url, '^https?://(www\.)?([^/]+).*$'::text, '\2'::text) AS source_domain,
  NULL::text AS digest_section,
  legacy.date::timestamptz AS published_at,
  true AS legacy_source,
  'en'::text AS display_language,
  'backfilled'::text AS translation_status,
  public.news_area_display_label(
    coalesce(
      (public.canonical_news_area_keys(regexp_split_to_array(coalesce(legacy.area, 'Island-Wide'), '\s*,\s*')))[1],
      'island-wide'
    )
  ) AS primary_area,
  0::integer AS curation_score,
  CASE
    WHEN cardinality(public.canonical_news_area_keys(regexp_split_to_array(coalesce(legacy.area, 'Island-Wide'), '\s*,\s*'))) > 0
      THEN public.canonical_news_area_keys(regexp_split_to_array(coalesce(legacy.area, 'Island-Wide'), '\s*,\s*'))
    ELSE ARRAY['island-wide']::text[]
  END AS area_keys,
  'publisher_original'::text AS source_resolution_status,
  'publisher_original'::text AS evidence_type,
  0::integer AS corroborating_source_count
FROM public.ibiza_news legacy
WHERE public.is_public_news_source_url(legacy.source_url)
  AND legacy.source_url !~* 'ibiza-spotlight\.com'
  AND public.is_public_english_news_text(legacy.headline, coalesce(legacy.summary, ''), 'en', 'backfilled')
  AND NOT EXISTS (
    SELECT 1
    FROM public.ibiza_news_stories stories
    WHERE stories.source_url = legacy.source_url
  );

CREATE VIEW public.ibiza_news_daily_digests_public AS
SELECT
  id,
  digest_date,
  title,
  summary,
  sections,
  story_ids,
  source_keys,
  sources_checked,
  skipped_sources,
  counts,
  generated_at,
  created_at,
  updated_at
FROM public.ibiza_news_daily_digests
WHERE status = 'published';

GRANT SELECT ON public.ibiza_news_public TO anon, authenticated;
GRANT SELECT ON public.ibiza_news_daily_digests_public TO anon, authenticated;
