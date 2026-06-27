-- Private supporting-evidence pipeline for Ibiza Maps social/news signals.
-- This replaces the legacy Notion X Daily Digest runtime without making
-- unverified X/social claims canonical or public.

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'editor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE TABLE IF NOT EXISTS public.x_signal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  label text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('x_api', 'xai_grok', 'rss', 'atom', 'sitemap', 'html', 'ical', 'api', 'manual_import', 'legacy_digest')),
  source_url text NOT NULL,
  source_domain text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  requires_credentials boolean NOT NULL DEFAULT false,
  credential_name text,
  publish_mode text NOT NULL DEFAULT 'supporting_only' CHECK (publish_mode IN ('supporting_only', 'review_only', 'disabled')),
  compliance_status text NOT NULL DEFAULT 'verified' CHECK (compliance_status IN ('verified', 'requires_credentials', 'disabled', 'blocked')),
  cadence text NOT NULL DEFAULT 'daily',
  robots_notes text,
  rate_limit_notes text,
  signal_categories text[] NOT NULL DEFAULT '{}'::text[],
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.x_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL DEFAULT 'manual' CHECK (run_type IN ('daily', 'manual', 'backfill', 'source_audit', 'manual_import')),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'shadow', 'collect')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  target_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date),
  window_start timestamptz,
  window_end timestamptz,
  source_keys text[] NOT NULL DEFAULT '{}'::text[],
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources_seen integer NOT NULL DEFAULT 0,
  snapshots_inserted integer NOT NULL DEFAULT 0,
  items_seen integer NOT NULL DEFAULT 0,
  items_stored integer NOT NULL DEFAULT 0,
  duplicates_seen integer NOT NULL DEFAULT 0,
  credential_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.x_signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.x_digest_runs(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.x_signal_sources(id) ON DELETE SET NULL,
  source_key text NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.x_daily_digest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL,
  run_id uuid REFERENCES public.x_digest_runs(id) ON DELETE SET NULL,
  snapshot_id uuid REFERENCES public.x_signal_snapshots(id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.x_signal_sources(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  signal_key text NOT NULL UNIQUE,
  dedupe_key text NOT NULL,
  duplicate_of uuid REFERENCES public.x_daily_digest_items(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('local_breaking_news', 'government_municipal', 'weather_alert_chatter', 'events_lineup_changes', 'transport_public_safety', 'tourism_community', 'source_hint')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  source_url text NOT NULL,
  source_domain text NOT NULL DEFAULT '',
  source_timestamp timestamptz,
  source_type text NOT NULL,
  source_kind text NOT NULL DEFAULT 'community_unverified' CHECK (source_kind IN ('official_account', 'official_source', 'verified_media', 'venue_promoter', 'community_unverified', 'duplicate_repost', 'manual_import', 'connector_output')),
  source_score integer NOT NULL DEFAULT 40 CHECK (source_score BETWEEN 0 AND 100),
  verification_status text NOT NULL DEFAULT 'needs_verification' CHECK (verification_status IN ('supporting', 'needs_verification', 'source_backed', 'verified', 'rejected')),
  privacy_status text NOT NULL DEFAULT 'private' CHECK (privacy_status IN ('private', 'internal', 'public_eligible')),
  language text NOT NULL DEFAULT 'en',
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.x_signal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_item_id uuid NOT NULL REFERENCES public.x_daily_digest_items(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('news_review', 'weather_review', 'event_review', 'news_story', 'weather_alert', 'event', 'event_candidate', 'event_lineup_review', 'manual_review')),
  target_table text,
  target_id uuid,
  target_key text NOT NULL DEFAULT 'unassigned',
  link_status text NOT NULL DEFAULT 'suggested' CHECK (link_status IN ('suggested', 'confirmed', 'rejected', 'applied')),
  verification_source_url text,
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  notes text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_item_id, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS x_signal_sources_enabled_idx
  ON public.x_signal_sources (enabled, priority, source_key);

CREATE INDEX IF NOT EXISTS x_digest_runs_started_idx
  ON public.x_digest_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS x_digest_runs_target_date_idx
  ON public.x_digest_runs (target_date DESC, status);

CREATE INDEX IF NOT EXISTS x_signal_snapshots_run_idx
  ON public.x_signal_snapshots (run_id);

CREATE INDEX IF NOT EXISTS x_daily_digest_items_date_idx
  ON public.x_daily_digest_items (digest_date DESC, category, source_score DESC);

CREATE INDEX IF NOT EXISTS x_daily_digest_items_dedupe_idx
  ON public.x_daily_digest_items (digest_date DESC, dedupe_key);

CREATE INDEX IF NOT EXISTS x_signal_links_item_idx
  ON public.x_signal_links (signal_item_id, target_type, link_status);

DROP TRIGGER IF EXISTS update_x_signal_sources_updated_at ON public.x_signal_sources;
CREATE TRIGGER update_x_signal_sources_updated_at
  BEFORE UPDATE ON public.x_signal_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_x_daily_digest_items_updated_at ON public.x_daily_digest_items;
CREATE TRIGGER update_x_daily_digest_items_updated_at
  BEFORE UPDATE ON public.x_daily_digest_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_x_signal_links_updated_at ON public.x_signal_links;
CREATE TRIGGER update_x_signal_links_updated_at
  BEFORE UPDATE ON public.x_signal_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_signal_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_signal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_daily_digest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_signal_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.x_signal_sources FROM anon;
REVOKE ALL ON public.x_digest_runs FROM anon;
REVOKE ALL ON public.x_signal_snapshots FROM anon;
REVOKE ALL ON public.x_daily_digest_items FROM anon;
REVOKE ALL ON public.x_signal_links FROM anon;

GRANT SELECT ON public.x_signal_sources TO authenticated;
GRANT SELECT ON public.x_digest_runs TO authenticated;
GRANT SELECT ON public.x_signal_snapshots TO authenticated;
GRANT SELECT ON public.x_daily_digest_items TO authenticated;
GRANT SELECT ON public.x_signal_links TO authenticated;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Signal operators can read sources" ON public.x_signal_sources;
CREATE POLICY "Signal operators can read sources"
  ON public.x_signal_sources
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Signal operators can read runs" ON public.x_digest_runs;
CREATE POLICY "Signal operators can read runs"
  ON public.x_digest_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Signal operators can read snapshots" ON public.x_signal_snapshots;
CREATE POLICY "Signal operators can read snapshots"
  ON public.x_signal_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Signal operators can read items" ON public.x_daily_digest_items;
CREATE POLICY "Signal operators can read items"
  ON public.x_daily_digest_items
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

DROP POLICY IF EXISTS "Signal operators can read links" ON public.x_signal_links;
CREATE POLICY "Signal operators can read links"
  ON public.x_signal_links
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

DO $$
BEGIN
  IF to_regclass('public.x_daily_digest') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public read digest" ON public.x_daily_digest';
    EXECUTE 'REVOKE ALL ON public.x_daily_digest FROM anon, authenticated';
  END IF;
END $$;

DROP VIEW IF EXISTS public.x_signal_operator_dashboard;
CREATE VIEW public.x_signal_operator_dashboard
WITH (security_invoker = true)
AS
SELECT
  items.id,
  items.digest_date,
  items.category,
  items.title,
  items.summary,
  items.source_url,
  items.source_domain,
  items.source_timestamp,
  items.source_type,
  items.source_kind,
  items.source_score,
  items.verification_status,
  items.privacy_status,
  items.created_at,
  sources.label AS source_label,
  runs.status AS run_status,
  runs.mode AS run_mode,
  runs.started_at AS run_started_at,
  links.target_type,
  links.link_status
FROM public.x_daily_digest_items items
LEFT JOIN public.x_signal_sources sources ON sources.id = items.source_id
LEFT JOIN public.x_digest_runs runs ON runs.id = items.run_id
LEFT JOIN public.x_signal_links links ON links.signal_item_id = items.id;

GRANT SELECT ON public.x_signal_operator_dashboard TO authenticated;

INSERT INTO public.x_signal_sources
  (source_key, label, source_type, source_url, source_domain, language, priority, enabled, requires_credentials, credential_name, publish_mode, compliance_status, cadence, robots_notes, rate_limit_notes, signal_categories, raw_metadata)
VALUES
  ('x-ibiza-list-official-api', 'Ibiza X List via official X API', 'x_api', 'https://x.com/i/lists/1919998082248266124', 'x.com', 'multi', 10, false, true, 'X_API_BEARER_TOKEN', 'supporting_only', 'requires_credentials', 'daily', 'Official API only. Never scrape x.com pages, login walls, or personal sessions.', 'Use X API credit caps and no auto-recharge unless approved.', ARRAY['local_breaking_news','government_municipal','weather_alert_chatter','events_lineup_changes','transport_public_safety','tourism_community'], '{"x_list_id":"1919998082248266124","source_kind":"connector_output"}'),
  ('xai-grok-ibiza-search', 'xAI Grok Ibiza live search', 'xai_grok', 'https://api.x.ai/v1', 'api.x.ai', 'multi', 15, false, true, 'XAI_API_KEY', 'supporting_only', 'requires_credentials', 'daily', 'Official xAI API only. No browser fallback for X content.', 'Cap calls per run before enabling.', ARRAY['source_hint'], '{"source_kind":"connector_output"}'),
  ('aemet-balearic-warnings', 'AEMET Balearic warnings', 'html', 'https://www.aemet.es/es/eltiempo/prediccion/avisos?w=hoy&k=bal', 'aemet.es', 'es', 20, true, false, NULL, 'review_only', 'verified', 'daily', 'Official public weather warnings page.', NULL, ARRAY['weather_alert_chatter'], '{"source_kind":"official_source"}'),
  ('diario-general-rss', 'Diario de Ibiza RSS', 'rss', 'https://www.diariodeibiza.es/rss/', 'diariodeibiza.es', 'es', 30, true, false, NULL, 'review_only', 'verified', 'daily', 'Public RSS feed; do not crawl article bodies or bypass paywalls.', NULL, ARRAY['local_breaking_news','transport_public_safety','tourism_community'], '{"source_kind":"verified_media"}'),
  ('periodico-pitiusas-atom', 'Periodico de Ibiza y Formentera - Pitiusas', 'atom', 'https://www.periodicodeibiza.es/pitiusas.rss', 'periodicodeibiza.es', 'es', 35, true, false, NULL, 'review_only', 'verified', 'daily', 'Public Atom feed.', NULL, ARRAY['local_breaking_news','government_municipal','transport_public_safety'], '{"source_kind":"verified_media"}'),
  ('lavoz-ibiza-rss', 'La Voz de Ibiza - Ibiza', 'rss', 'https://lavozdeibiza.com/ibiza/feed/', 'lavozdeibiza.com', 'es', 40, true, false, NULL, 'review_only', 'verified', 'daily', 'Public WordPress RSS feed.', NULL, ARRAY['local_breaking_news','government_municipal','tourism_community'], '{"source_kind":"verified_media"}'),
  ('santa-eularia-news-rss', 'Ajuntament de Santa Eularia news', 'rss', 'https://santaeulariadesriu.com/es/actualidad/noticias?format=feed&type=rss', 'santaeulariadesriu.com', 'es', 50, true, false, NULL, 'review_only', 'verified', 'daily', 'Official municipal RSS feed.', NULL, ARRAY['government_municipal','tourism_community'], '{"source_kind":"official_source","municipality":"Santa Eularia"}'),
  ('consell-news-page', 'Consell d''Eivissa news', 'html', 'https://www.conselldeivissa.es/es/actualidad/noticias', 'conselldeivissa.es', 'es', 55, true, false, NULL, 'review_only', 'verified', 'daily', 'Official public news page.', NULL, ARRAY['government_municipal','transport_public_safety','tourism_community'], '{"source_kind":"official_source"}'),
  ('eivissa-news-page', 'Ajuntament d''Eivissa news', 'html', 'https://www.eivissa.es/es/actualidad/noticias', 'eivissa.es', 'es', 60, true, false, NULL, 'review_only', 'verified', 'daily', 'Official municipal news page.', NULL, ARRAY['government_municipal','tourism_community'], '{"source_kind":"official_source","municipality":"Eivissa"}'),
  ('sant-antoni-events-ical', 'Visit Sant Antoni events iCal', 'ical', 'https://visit.santantoni.net/en/events/?ical=1', 'visit.santantoni.net', 'en', 80, true, false, NULL, 'review_only', 'verified', 'daily', 'Official tourism calendar feed.', NULL, ARRAY['tourism_community'], '{"source_kind":"official_source","municipality":"Sant Antoni"}'),
  ('ibiza-spotlight-magazine', 'Ibiza Spotlight magazine', 'html', 'https://www.ibiza-spotlight.com/magazine', 'ibiza-spotlight.com', 'en', 90, true, false, NULL, 'review_only', 'verified', 'daily', 'Public magazine index; lightweight signal recovery only.', NULL, ARRAY['tourism_community','events_lineup_changes'], '{"source_kind":"verified_media"}'),
  ('ibiza-spotlight-party-calendar', 'Ibiza Spotlight party calendar', 'html', 'https://www.ibiza-spotlight.com/night/events', 'ibiza-spotlight.com', 'en', 95, true, false, NULL, 'review_only', 'verified', 'daily', 'Public event index; signal only, not canonical event publishing.', NULL, ARRAY['events_lineup_changes'], '{"source_kind":"venue_promoter"}'),
  ('manual-signal-import', 'Manual signal import', 'manual_import', 'manual://ibiza-signals', 'manual', 'multi', 500, false, false, NULL, 'supporting_only', 'verified', 'manual', 'Human supplied source URLs and timestamps are required.', NULL, ARRAY['source_hint'], '{"source_kind":"manual_import"}')
ON CONFLICT (source_key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  source_domain = EXCLUDED.source_domain,
  language = EXCLUDED.language,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  requires_credentials = EXCLUDED.requires_credentials,
  credential_name = EXCLUDED.credential_name,
  publish_mode = EXCLUDED.publish_mode,
  compliance_status = EXCLUDED.compliance_status,
  cadence = EXCLUDED.cadence,
  robots_notes = EXCLUDED.robots_notes,
  rate_limit_notes = EXCLUDED.rate_limit_notes,
  signal_categories = EXCLUDED.signal_categories,
  raw_metadata = EXCLUDED.raw_metadata,
  updated_at = now();
