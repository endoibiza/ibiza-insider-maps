-- Supabase-first replacement for the legacy Notion Ibiza News Agent.
-- The public site should read only public-safe views; collection evidence and
-- run logs stay server-side.

CREATE TABLE IF NOT EXISTS public.ibiza_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id text,
  headline text NOT NULL,
  summary text,
  category text,
  area text,
  source_url text,
  date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  significance text,
  ibiza_maps_relevant boolean NOT NULL DEFAULT false,
  santa_eularia boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION public.is_public_news_source_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_url IS NOT NULL
    AND btrim(p_url) <> ''
    AND p_url ~* '^https?://'
    AND p_url !~* '^https?://[^/]+/?([?#].*)?$'
    AND p_url !~* '^https?://[^/]+/(news|noticias|actualidad|magazine|ibiza|pitiusas|home|inicio)/?([?#].*)?$'
    AND p_url !~* '/(rss|feed)(/|$|[?#])'
    AND p_url !~* '^https?://(www\.)?(x|twitter|facebook|instagram)\.com/?([?#].*)?$';
$$;

CREATE TABLE IF NOT EXISTS public.news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  label text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('rss', 'atom', 'sitemap', 'html', 'ical', 'api', 'signal')),
  source_url text NOT NULL,
  source_domain text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  publish_mode text NOT NULL DEFAULT 'review' CHECK (publish_mode IN ('auto', 'review', 'signal_only')),
  cadence text NOT NULL DEFAULT 'daily',
  robots_notes text,
  access_status text NOT NULL DEFAULT 'unchecked',
  last_checked_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.news_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'manual' CHECK (run_type IN ('daily', 'manual', 'backfill', 'source_audit')),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'shadow', 'publish')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  target_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date),
  source_keys text[] NOT NULL DEFAULT '{}'::text[],
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources_seen integer NOT NULL DEFAULT 0,
  snapshots_inserted integer NOT NULL DEFAULT 0,
  candidates_seen integer NOT NULL DEFAULT 0,
  stories_staged integer NOT NULL DEFAULT 0,
  stories_published integer NOT NULL DEFAULT 0,
  duplicates_seen integer NOT NULL DEFAULT 0,
  skipped_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.news_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.news_ingestion_runs(id) ON DELETE CASCADE,
  source_key text NOT NULL REFERENCES public.news_sources(source_key) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_url text NOT NULL,
  final_url text,
  status_code integer,
  content_hash text,
  excerpt text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_news_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.news_sources(source_key) ON DELETE RESTRICT,
  snapshot_id uuid REFERENCES public.news_source_snapshots(id) ON DELETE SET NULL,
  evidence_hash text NOT NULL,
  canonical_url text NOT NULL,
  source_url text NOT NULL,
  source_label text NOT NULL,
  source_domain text NOT NULL,
  original_headline text NOT NULL,
  headline text NOT NULL,
  summary text NOT NULL DEFAULT '',
  original_language text NOT NULL DEFAULT 'es',
  published_at timestamptz,
  story_date date,
  category text NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Government', 'Infrastructure', 'Public Safety', 'Crime', 'Culture', 'Tourism', 'Environment', 'Business', 'Weather Alert', 'Health', 'Transport', 'Community', 'Other')),
  area text[] NOT NULL DEFAULT '{}'::text[],
  significance text NOT NULL DEFAULT 'Notable'
    CHECK (significance IN ('Breaking', 'Major', 'Notable', 'Minor')),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'published', 'duplicate', 'skipped', 'rejected')),
  digest_section text NOT NULL DEFAULT 'island_wide'
    CHECK (digest_section IN ('island_wide', 'santa_eularia', 'new_businesses', 'weekly_crime', 'other')),
  santa_eularia boolean NOT NULL DEFAULT false,
  ibiza_maps_relevant boolean NOT NULL DEFAULT false,
  dedupe_key text NOT NULL,
  duplicate_of uuid REFERENCES public.ibiza_news_stories(id) ON DELETE SET NULL,
  ai_summary_model text,
  ai_summary_hash text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ibiza_news_daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'failed')),
  title text NOT NULL,
  summary text,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  story_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  source_keys text[] NOT NULL DEFAULT '{}'::text[],
  sources_checked text[] NOT NULL DEFAULT '{}'::text[],
  skipped_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ibiza_news_stories_source_url_key
  ON public.ibiza_news_stories (source_key, canonical_url);

CREATE INDEX IF NOT EXISTS ibiza_news_stories_public_idx
  ON public.ibiza_news_stories (status, story_date DESC, category)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS ibiza_news_stories_dedupe_idx
  ON public.ibiza_news_stories (dedupe_key, story_date DESC);

CREATE INDEX IF NOT EXISTS news_source_snapshots_run_idx
  ON public.news_source_snapshots (run_id);

CREATE INDEX IF NOT EXISTS news_ingestion_runs_started_idx
  ON public.news_ingestion_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS ibiza_news_daily_digests_public_idx
  ON public.ibiza_news_daily_digests (status, digest_date DESC)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS update_news_sources_updated_at ON public.news_sources;
CREATE TRIGGER update_news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ibiza_news_stories_updated_at ON public.ibiza_news_stories;
CREATE TRIGGER update_ibiza_news_stories_updated_at
  BEFORE UPDATE ON public.ibiza_news_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ibiza_news_daily_digests_updated_at ON public.ibiza_news_daily_digests;
CREATE TRIGGER update_ibiza_news_daily_digests_updated_at
  BEFORE UPDATE ON public.ibiza_news_daily_digests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_news_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibiza_news_daily_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.news_sources FROM anon, authenticated;
REVOKE ALL ON public.news_ingestion_runs FROM anon, authenticated;
REVOKE ALL ON public.news_source_snapshots FROM anon, authenticated;
REVOKE ALL ON public.ibiza_news_stories FROM anon, authenticated;
REVOKE ALL ON public.ibiza_news_daily_digests FROM anon, authenticated;

INSERT INTO public.news_sources
  (source_key, label, source_type, source_url, source_domain, language, priority, enabled, publish_mode, cadence, robots_notes, access_status, raw_metadata)
VALUES
  ('diario-general-rss', 'Diario de Ibiza RSS', 'rss', 'https://www.diariodeibiza.es/rss/', 'diariodeibiza.es', 'es', 10, true, 'auto', 'daily', 'RSS feed is public; do not crawl article bodies or bypass paywalls.', 'verified', '{"section":"general"}'),
  ('periodico-pitiusas-atom', 'Periódico de Ibiza y Formentera — Pitiusas', 'atom', 'https://www.periodicodeibiza.es/pitiusas.rss', 'periodicodeibiza.es', 'es', 20, true, 'auto', 'daily', 'Public Atom feed.', 'verified', '{"section":"pitiusas"}'),
  ('periodico-ibiza-atom', 'Periódico de Ibiza y Formentera — Ibiza', 'atom', 'https://www.periodicodeibiza.es/pitiusas/ibiza.rss', 'periodicodeibiza.es', 'es', 21, true, 'auto', 'daily', 'Public Atom feed.', 'verified', '{"section":"ibiza"}'),
  ('periodico-santa-eularia-atom', 'Periódico de Ibiza y Formentera — Santa Eulària', 'atom', 'https://www.periodicodeibiza.es/pitiusas/ibiza/santa-eularia.rss', 'periodicodeibiza.es', 'es', 22, true, 'auto', 'daily', 'Public Atom feed.', 'verified', '{"section":"santa_eularia"}'),
  ('lavoz-ibiza-rss', 'La Voz de Ibiza — Ibiza', 'rss', 'https://lavozdeibiza.com/ibiza/feed/', 'lavozdeibiza.com', 'es', 30, true, 'auto', 'daily', 'Public WordPress RSS feed.', 'verified', '{"section":"ibiza"}'),
  ('lavoz-general-rss', 'La Voz de Ibiza RSS', 'rss', 'https://lavozdeibiza.com/feed/', 'lavozdeibiza.com', 'es', 31, true, 'auto', 'daily', 'Public WordPress RSS feed.', 'verified', '{"section":"general"}'),
  ('santa-eularia-news-rss', 'Ajuntament de Santa Eulària — Noticias', 'rss', 'https://santaeulariadesriu.com/es/actualidad/noticias?format=feed&type=rss', 'santaeulariadesriu.com', 'es', 40, true, 'auto', 'daily', 'Official municipal RSS feed.', 'verified', '{"municipality":"Santa Eularia"}'),
  ('santa-eularia-sitemap', 'Ajuntament de Santa Eulària Sitemap', 'sitemap', 'https://santaeulariadesriu.com/index.php?option=com_jmap&view=sitemap&format=xml&lang=es', 'santaeulariadesriu.com', 'es', 80, true, 'review', 'daily', 'Official sitemap; candidates require direct page metadata before publishing.', 'verified', '{"municipality":"Santa Eularia"}'),
  ('consell-news-page', 'Consell d''Eivissa Noticias', 'html', 'https://www.conselldeivissa.es/es/actualidad/noticias', 'conselldeivissa.es', 'es', 90, true, 'review', 'daily', 'Official news page; links are staged unless exact metadata is available.', 'verified', '{"official":true}'),
  ('eivissa-news-page', 'Ajuntament d''Eivissa Noticias', 'html', 'https://www.eivissa.es/es/actualidad/noticias', 'eivissa.es', 'es', 91, true, 'review', 'daily', 'Official news page; links are staged unless exact metadata is available.', 'verified', '{"municipality":"Eivissa"}'),
  ('sant-antoni-news-page', 'Ajuntament de Sant Antoni Actualidad', 'html', 'https://www.santantoni.net/home/actualidad', 'santantoni.net', 'es', 92, true, 'review', 'daily', 'Official municipal page; no working RSS found in audit.', 'verified', '{"municipality":"Sant Antoni"}'),
  ('sant-josep-sitemap', 'Ajuntament de Sant Josep Sitemap', 'sitemap', 'https://www.santjosep.org/sitemap.xml', 'santjosep.org', 'ca', 93, true, 'review', 'daily', 'Official sitemap; WordPress feed returned 500 during audit.', 'verified', '{"municipality":"Sant Josep"}'),
  ('sant-antoni-events-ical', 'Visit Sant Antoni Events iCal', 'ical', 'https://visit.santantoni.net/en/events/?ical=1', 'visit.santantoni.net', 'en', 120, true, 'review', 'daily', 'Official tourism calendar; event signal only unless newsworthy.', 'verified', '{"signal":"events"}'),
  ('ibiza-spotlight-magazine', 'Ibiza Spotlight Magazine', 'html', 'https://www.ibiza-spotlight.com/magazine', 'ibiza-spotlight.com', 'en', 130, true, 'review', 'daily', 'Magazine index is public; no RSS found in audit.', 'verified', '{"fallback":true}'),
  ('x-daily-digest-signal', 'X Daily Digest Signal', 'signal', 'supabase://public.x_daily_digest', 'supabase', 'en', 200, false, 'signal_only', 'daily', 'Read-only upstream signal. Must never be canonical evidence.', 'verified', '{"read_only":true}')
ON CONFLICT (source_key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  source_domain = EXCLUDED.source_domain,
  language = EXCLUDED.language,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  publish_mode = EXCLUDED.publish_mode,
  cadence = EXCLUDED.cadence,
  robots_notes = EXCLUDED.robots_notes,
  access_status = EXCLUDED.access_status,
  raw_metadata = EXCLUDED.raw_metadata,
  updated_at = now();

DROP VIEW IF EXISTS public.ibiza_news_daily_digests_public;
DROP VIEW IF EXISTS public.ibiza_news_public;

CREATE VIEW public.ibiza_news_public AS
SELECT
  stories.id,
  ('news:' || stories.id::text) AS notion_page_id,
  stories.headline,
  stories.summary,
  stories.category,
  array_to_string(stories.area, ', ') AS area,
  stories.source_url,
  stories.story_date AS date,
  stories.created_at,
  stories.updated_at,
  stories.significance,
  stories.ibiza_maps_relevant,
  stories.santa_eularia,
  stories.source_label,
  stories.source_domain,
  stories.digest_section,
  stories.published_at,
  false AS legacy_source
FROM public.ibiza_news_stories stories
WHERE stories.status = 'published'
  AND public.is_public_news_source_url(stories.source_url)

UNION ALL

SELECT
  legacy.id,
  legacy.notion_page_id,
  legacy.headline,
  COALESCE(legacy.summary, '') AS summary,
  COALESCE(legacy.category, 'Other') AS category,
  COALESCE(legacy.area, 'Island-Wide') AS area,
  legacy.source_url,
  legacy.date,
  legacy.created_at,
  legacy.updated_at,
  COALESCE(NULLIF(initcap(legacy.significance), ''), 'Notable') AS significance,
  legacy.ibiza_maps_relevant,
  legacy.santa_eularia,
  NULL::text AS source_label,
  regexp_replace(legacy.source_url, '^https?://(www\.)?([^/]+).*$'::text, '\2'::text) AS source_domain,
  NULL::text AS digest_section,
  legacy.date::timestamptz AS published_at,
  true AS legacy_source
FROM public.ibiza_news legacy
WHERE public.is_public_news_source_url(legacy.source_url)
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
