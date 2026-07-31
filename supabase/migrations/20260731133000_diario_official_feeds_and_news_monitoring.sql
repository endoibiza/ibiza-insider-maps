-- Balance Ibiza News with publisher-owned Diario feeds, add a bounded afternoon
-- refresh, and expose private source-health monitoring to service-role operators.

INSERT INTO public.news_sources
  (source_key, label, source_type, source_url, source_domain, language, priority, enabled, publish_mode, cadence, robots_notes, access_status, raw_metadata)
VALUES
  ('diario-ibiza-news-en-rss', 'Diario de Ibiza — Ibiza News', 'rss', 'https://www.diariodeibiza.es/rss/section/2205582', 'diariodeibiza.es', 'en', 8, true, 'auto', 'twice_daily', 'Publisher-owned RSS metadata only; do not crawl article bodies or bypass paywalls.', 'verified', '{"section":"ibiza-news","source_kind":"verified_media","official_feed":true,"preferred_english_metadata":true}'),
  ('diario-ibiza-rss', 'Diario de Ibiza — Ibiza', 'rss', 'https://www.diariodeibiza.es/rss/section/16001', 'diariodeibiza.es', 'es', 9, true, 'auto', 'twice_daily', 'Publisher-owned RSS metadata only; do not crawl article bodies or bypass paywalls.', 'verified', '{"section":"ibiza","source_kind":"verified_media","official_feed":true}'),
  ('diario-formentera-rss', 'Diario de Ibiza — Formentera', 'rss', 'https://www.diariodeibiza.es/rss/section/16023', 'diariodeibiza.es', 'es', 10, true, 'auto', 'twice_daily', 'Publisher-owned RSS metadata only; do not crawl article bodies or bypass paywalls.', 'verified', '{"section":"formentera","source_kind":"verified_media","official_feed":true,"municipality":"Formentera"}'),
  ('diario-santa-eularia-rss', 'Diario de Ibiza — Santa Eulària', 'rss', 'https://www.diariodeibiza.es/rss/section/2094461', 'diariodeibiza.es', 'es', 11, true, 'auto', 'twice_daily', 'Publisher-owned RSS metadata only; do not crawl article bodies or bypass paywalls.', 'verified', '{"section":"santa-eularia","source_kind":"verified_media","official_feed":true,"municipality":"Santa Eularia"}')
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

UPDATE public.news_sources
SET
  publish_mode = 'signal_only',
  cadence = 'daily',
  robots_notes = 'Publisher-owned general RSS retained for discovery only; local publication uses focused Diario feeds.',
  raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || '{"section":"general","source_kind":"discovery_only","official_feed":true}'::jsonb,
  updated_at = now()
WHERE source_key = 'diario-general-rss';

INSERT INTO public.x_signal_sources
  (source_key, label, source_type, source_url, source_domain, language, priority, enabled, requires_credentials, credential_name, publish_mode, compliance_status, cadence, robots_notes, rate_limit_notes, signal_categories, raw_metadata, canonical_eligible, allow_publisher_original, require_local_signal, require_primary_resolution, public_link_policy)
VALUES
  ('diario-ibiza-news-en-rss', 'Diario de Ibiza — Ibiza News', 'rss', 'https://www.diariodeibiza.es/rss/section/2205582', 'diariodeibiza.es', 'en', 26, true, false, NULL, 'review_only', 'verified', 'twice_daily', 'Publisher-owned RSS metadata only; no article-body crawling.', NULL, ARRAY['local_breaking_news','tourism_community'], '{"section":"ibiza-news","source_kind":"verified_media","official_feed":true,"preferred_english_metadata":true}', true, true, true, false, 'publisher_allowed'),
  ('diario-ibiza-rss', 'Diario de Ibiza — Ibiza', 'rss', 'https://www.diariodeibiza.es/rss/section/16001', 'diariodeibiza.es', 'es', 27, true, false, NULL, 'review_only', 'verified', 'twice_daily', 'Publisher-owned RSS metadata only; no article-body crawling.', NULL, ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'], '{"section":"ibiza","source_kind":"verified_media","official_feed":true}', true, true, true, false, 'publisher_allowed'),
  ('diario-formentera-rss', 'Diario de Ibiza — Formentera', 'rss', 'https://www.diariodeibiza.es/rss/section/16023', 'diariodeibiza.es', 'es', 28, true, false, NULL, 'review_only', 'verified', 'twice_daily', 'Publisher-owned RSS metadata only; no article-body crawling.', NULL, ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'], '{"section":"formentera","source_kind":"verified_media","official_feed":true,"municipality":"Formentera"}', true, true, true, false, 'publisher_allowed'),
  ('diario-santa-eularia-rss', 'Diario de Ibiza — Santa Eulària', 'rss', 'https://www.diariodeibiza.es/rss/section/2094461', 'diariodeibiza.es', 'es', 29, true, false, NULL, 'review_only', 'verified', 'twice_daily', 'Publisher-owned RSS metadata only; no article-body crawling.', NULL, ARRAY['local_breaking_news','government_municipal','transport_public_safety','tourism_community'], '{"section":"santa-eularia","source_kind":"verified_media","official_feed":true,"municipality":"Santa Eularia"}', true, true, true, false, 'publisher_allowed')
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
  updated_at = now();

UPDATE public.x_signal_sources
SET
  canonical_eligible = false,
  allow_publisher_original = false,
  raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || '{"source_kind":"discovery_only","official_feed":true}'::jsonb,
  updated_at = now()
WHERE source_key = 'diario-general-rss';

CREATE OR REPLACE FUNCTION cron_ops.dispatch_news_packet(packet_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  run_date date := cron_ops.madrid_date();
  source_keys text[];
  payload jsonb;
  edge_function_name text := 'collect-ibiza-news';
  max_ai_summaries integer := 0;
  use_ai boolean := true;
  request_id bigint;
BEGIN
  CASE packet_name
    WHEN 'resolver' THEN
      edge_function_name := 'resolve-ibiza-signals';
      source_keys := ARRAY[]::text[];
      payload := jsonb_build_object(
        'target_date', run_date,
        'dry_run', false,
        'limit', 300,
        'trigger_key', 'supabase-cron-news-resolver'
      );
    WHEN 'formentera-media' THEN
      source_keys := ARRAY['radio-illa-actualitat-rss'];
      max_ai_summaries := 2;
    WHEN 'diario-focused' THEN
      source_keys := ARRAY[
        'diario-ibiza-news-en-rss',
        'diario-ibiza-rss',
        'diario-formentera-rss',
        'diario-santa-eularia-rss'
      ];
      max_ai_summaries := 3;
    WHEN 'core-media' THEN
      source_keys := ARRAY[
        'periodico-pitiusas-atom',
        'periodico-ibiza-atom',
        'periodico-santa-eularia-atom',
        'lavoz-ibiza-rss',
        'lavoz-general-rss'
      ];
      max_ai_summaries := 3;
    WHEN 'official-review' THEN
      source_keys := ARRAY[
        'santa-eularia-news-rss',
        'santa-eularia-sitemap',
        'consell-news-page',
        'eivissa-news-page',
        'sant-antoni-news-page',
        'sant-josep-sitemap',
        'sant-antoni-events-ical'
      ];
      max_ai_summaries := 0;
    WHEN 'diario-afternoon' THEN
      source_keys := ARRAY[
        'diario-ibiza-news-en-rss',
        'diario-ibiza-rss',
        'diario-formentera-rss',
        'diario-santa-eularia-rss'
      ];
      max_ai_summaries := 0;
      use_ai := false;
    ELSE
      RAISE EXCEPTION 'unknown News packet %', packet_name;
  END CASE;

  IF packet_name <> 'resolver' THEN
    payload := jsonb_build_object(
      'run_type', 'daily',
      'target_date', run_date,
      'dry_run', false,
      'publish', true,
      'use_ai', use_ai,
      'max_ai_summaries', max_ai_summaries,
      'limit_per_source', 25,
      'enforce_primary_resolution', false,
      'source_keys', to_jsonb(source_keys),
      'trigger_key', format('supabase-cron-news-%s', packet_name)
    );
  END IF;

  PERFORM cron_ops.claim_daily_lane('news', run_date, 6);
  UPDATE cron_ops.daily_lane_runs
  SET expected_packets = greatest(expected_packets, 6),
      updated_at = now()
  WHERE lane = 'news' AND target_date = run_date;

  request_id := cron_ops.dispatch_packet(
    'news', packet_name, edge_function_name, source_keys, payload, true, 6
  );
  RETURN request_id;
END
$function$;

CREATE OR REPLACE FUNCTION cron_ops.reconcile_news_lane(run_date date DEFAULT cron_ops.madrid_date())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  packet record;
  evidence record;
  completed_count integer;
  partial_count integer;
  failed_count integer;
  packet_total integer;
  expected_count integer := 6;
  digest_story_count integer := 0;
  bad_source_url_count integer := 0;
  final_status text;
BEGIN
  PERFORM cron_ops.recover_stale_news_runs(interval '45 minutes', 10);
  PERFORM cron_ops.recover_stale_news_resolution_runs(interval '45 minutes', 10);

  FOR packet IN
    SELECT * FROM cron_ops.packet_dispatches
    WHERE lane = 'news' AND target_date = run_date
  LOOP
    IF packet.packet_key = 'resolver' THEN
      SELECT id, status, NULL::jsonb AS source_failures, error_message
      INTO evidence
      FROM public.news_resolution_runs
      WHERE target_date = run_date
        AND metadata ->> 'trigger_key' = 'supabase-cron-news-resolver'
      ORDER BY started_at DESC LIMIT 1;
    ELSE
      SELECT id, status, source_failures, error_message
      INTO evidence
      FROM public.news_ingestion_runs
      WHERE target_date = run_date
        AND metadata ->> 'trigger_key' = format('supabase-cron-news-%s', packet.packet_key)
      ORDER BY started_at DESC LIMIT 1;
    END IF;

    IF evidence.id IS NOT NULL THEN
      UPDATE cron_ops.packet_dispatches
      SET evidence_run_id = evidence.id,
          evidence_status = evidence.status,
          source_failure_count = CASE WHEN evidence.source_failures IS NULL THEN 0 ELSE jsonb_array_length(evidence.source_failures) END,
          status = CASE
            WHEN evidence.status = 'completed' AND evidence.source_failures IS NOT NULL AND jsonb_array_length(evidence.source_failures) > 0 THEN 'partial'
            WHEN evidence.status = 'completed' THEN 'completed'
            WHEN evidence.status = 'running' THEN 'running'
            ELSE 'failed'
          END,
          error_message = evidence.error_message,
          reconciled_at = now()
      WHERE lane = 'news' AND target_date = run_date AND packet_key = packet.packet_key;
    ELSIF packet.dispatched_at < now() - interval '20 minutes' THEN
      UPDATE cron_ops.packet_dispatches
      SET status = 'failed', error_message = 'missing_news_run_ledger_after_dispatch', reconciled_at = now()
      WHERE lane = 'news' AND target_date = run_date AND packet_key = packet.packet_key;
    END IF;
  END LOOP;

  SELECT coalesce(cardinality(story_ids), 0)
  INTO digest_story_count
  FROM public.ibiza_news_daily_digests
  WHERE digest_date = run_date AND status = 'published'
  ORDER BY generated_at DESC LIMIT 1;
  digest_story_count := coalesce(digest_story_count, 0);

  SELECT count(*)::integer
  INTO bad_source_url_count
  FROM public.ibiza_news_daily_digests AS digest
  JOIN public.ibiza_news AS story ON story.id = ANY(digest.story_ids)
  WHERE digest.digest_date = run_date
    AND digest.status = 'published'
    AND (story.source_url IS NULL OR btrim(story.source_url) = '' OR story.source_url ~* '/(rss|feed)/?$');

  SELECT expected_packets INTO expected_count
  FROM cron_ops.daily_lane_runs
  WHERE lane = 'news' AND target_date = run_date;
  expected_count := coalesce(expected_count, 6);

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'completed')::integer,
         count(*) FILTER (WHERE status = 'partial')::integer,
         count(*) FILTER (WHERE status = 'failed')::integer
  INTO packet_total, completed_count, partial_count, failed_count
  FROM cron_ops.packet_dispatches
  WHERE lane = 'news' AND target_date = run_date;

  final_status := CASE
    WHEN packet_total < expected_count THEN 'running'
    WHEN digest_story_count = 0 OR bad_source_url_count > 0 THEN 'failed'
    WHEN failed_count > 0 OR partial_count > 0 THEN 'partial'
    ELSE 'completed'
  END;

  UPDATE cron_ops.daily_lane_runs
  SET status = final_status,
      expected_packets = expected_count,
      completed_packets = completed_count,
      partial_packets = partial_count,
      failed_packets = failed_count,
      updated_at = now(),
      finished_at = CASE WHEN final_status = 'running' THEN NULL ELSE now() END,
      metadata = jsonb_build_object(
        'digest_story_count', digest_story_count,
        'bad_source_url_count', bad_source_url_count,
        'packet_total', packet_total,
        'reconciled_at', now()
      )
  WHERE lane = 'news' AND target_date = run_date;

  RETURN final_status;
END
$function$;

SELECT cron.schedule(
  'ibiza-news-cron-02b-diario-focused',
  '53 3 * * *',
  $cron$SELECT cron_ops.dispatch_news_packet('diario-focused');$cron$
);
SELECT cron.schedule(
  'ibiza-news-cron-07-diario-afternoon',
  '30 13 * * *',
  $cron$SELECT cron_ops.dispatch_news_packet('diario-afternoon');$cron$
);
SELECT cron.schedule(
  'ibiza-news-cron-08-afternoon-reconcile',
  '45 13 * * *',
  $cron$SELECT cron_ops.reconcile_news_lane();$cron$
);
SELECT cron.schedule(
  'ibiza-news-cron-09-afternoon-timeout-reconcile',
  '15 14 * * *',
  $cron$SELECT cron_ops.reconcile_news_lane();$cron$
);

CREATE OR REPLACE VIEW cron_ops.news_publisher_health
WITH (security_invoker = true)
AS
WITH publisher_sources AS (
  SELECT
    source_key,
    source_domain,
    CASE source_domain
      WHEN 'diariodeibiza.es' THEN 'Diario de Ibiza'
      WHEN 'periodicodeibiza.es' THEN 'Periódico de Ibiza y Formentera'
      WHEN 'lavozdeibiza.com' THEN 'La Voz de Ibiza'
      WHEN 'radioillaformentera.cat' THEN 'Ràdio Illa Formentera'
      ELSE label
    END AS publisher_label,
    enabled,
    publish_mode,
    access_status
  FROM public.news_sources
  WHERE source_type IN ('rss', 'atom')
), latest_snapshots AS (
  SELECT DISTINCT ON (snapshots.source_key)
    snapshots.source_key,
    snapshots.fetched_at,
    snapshots.status_code,
    snapshots.raw_metadata
  FROM public.news_source_snapshots AS snapshots
  JOIN publisher_sources USING (source_key)
  ORDER BY snapshots.source_key, snapshots.fetched_at DESC
), source_health AS (
  SELECT
    sources.publisher_label,
    count(*)::integer AS source_count,
    count(*) FILTER (WHERE sources.enabled)::integer AS enabled_source_count,
    max(latest.fetched_at) AS last_fetch_at,
    max(NULLIF(latest.raw_metadata ->> 'newest_item_at', '')::timestamptz) AS newest_item_at,
    sum(CASE WHEN latest.raw_metadata ->> 'candidate_count' ~ '^\d+$' THEN (latest.raw_metadata ->> 'candidate_count')::integer ELSE 0 END)::integer AS latest_candidate_count,
    jsonb_object_agg(sources.source_key, jsonb_build_object(
      'enabled', sources.enabled,
      'publish_mode', sources.publish_mode,
      'access_status', sources.access_status,
      'status_code', latest.status_code,
      'fetched_at', latest.fetched_at
    ) ORDER BY sources.source_key) AS source_statuses
  FROM publisher_sources AS sources
  LEFT JOIN latest_snapshots AS latest USING (source_key)
  GROUP BY sources.publisher_label
), story_health AS (
  SELECT
    sources.publisher_label,
    count(*) FILTER (WHERE stories.status = 'published' AND stories.published_at >= now() - interval '24 hours')::integer AS published_last_24h,
    count(*) FILTER (WHERE stories.status = 'published' AND stories.published_at >= now() - interval '7 days')::integer AS published_last_7d
  FROM publisher_sources AS sources
  LEFT JOIN public.ibiza_news_stories AS stories USING (source_key)
  GROUP BY sources.publisher_label
), totals AS (
  SELECT sum(published_last_7d)::numeric AS published_last_7d FROM story_health
)
SELECT
  source_health.publisher_label,
  source_health.source_count,
  source_health.enabled_source_count,
  source_health.last_fetch_at,
  source_health.newest_item_at,
  source_health.latest_candidate_count,
  coalesce(story_health.published_last_24h, 0) AS published_last_24h,
  coalesce(story_health.published_last_7d, 0) AS published_last_7d,
  round(100 * coalesce(story_health.published_last_7d, 0) / NULLIF(totals.published_last_7d, 0), 2) AS seven_day_share_pct,
  source_health.source_statuses
FROM source_health
JOIN story_health USING (publisher_label)
CROSS JOIN totals
ORDER BY published_last_7d DESC, source_health.publisher_label;

REVOKE ALL ON cron_ops.news_publisher_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON cron_ops.news_publisher_health TO service_role;

COMMENT ON VIEW cron_ops.news_publisher_health IS
  'Private News publisher monitoring: current feed status, newest item, candidate volume, publication counts, and seven-day share.';
