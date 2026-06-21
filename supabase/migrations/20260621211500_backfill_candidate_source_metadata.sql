-- Backfill source metadata for candidates staged before event_source_links existed.

UPDATE public.event_candidates
SET
  source_url_type = CASE
    WHEN event_url ~* '(fourvenues\.com|fourvenues\.site|site\.fourvenues\.com)' THEN 'fourvenues_public'
    WHEN event_url ~* 'ibiza-spotlight\.com' THEN 'ibiza_spotlight'
    WHEN event_url ~* '(santaeularia|eivissa\.es|santantoni|santjosep|santjoan|conselldeivissa|caib\.es|illesbalears)' THEN 'municipal'
    WHEN event_url ~* '(ra\.co|shotgun\.live|eventbrite|skiddle|dice\.fm|ticketing|tickets|bacantix|reservaentradas)' THEN 'ticketing_platform'
    WHEN event_url ~* '(instagram\.com|facebook\.com|x\.com|twitter\.com)' THEN 'social'
    WHEN event_url ~* '(pacha\.com|hiibiza\.com|theushuaiaexperience\.com|unvrs\.com|amnesia\.es|dc10ibiza\.com|circolocoibiza\.com|covasanta\.com|ibizarocks\.com|pikesibiza\.com|528ibiza\.com|chinois\.com|akashaibiza\.com|lasdalias\.es|edenibiza\.com|liogroup\.com|bluemarlinibiza\.com|nikkibeach\.com|jockeyclubibiza\.com|ibiza\.cafedelmar\.com)' THEN 'official_venue'
    WHEN source_key LIKE 'spotlight-%' THEN 'ibiza_spotlight'
    WHEN source_key LIKE '%agenda%' THEN 'municipal'
    WHEN source_key LIKE '%events' THEN 'official_venue'
    ELSE 'unknown'
  END,
  canonical_source_url = CASE
    WHEN event_url IS NULL OR btrim(event_url) = '' THEN NULL
    WHEN event_url ~* 'ibiza-spotlight\.com/(night/events|events/?$)' THEN NULL
    WHEN event_url ~* '/(events|calendar|agenda)/?$' THEN NULL
    ELSE event_url
  END,
  maintenance_flags = array_remove(ARRAY[
    CASE WHEN event_url IS NULL OR btrim(event_url) = '' THEN 'missing_event_url' END,
    CASE WHEN lineup_details IS NULL OR btrim(lineup_details) = '' THEN 'missing_lineup_details' END,
    CASE
      WHEN event_url ~* 'ibiza-spotlight\.com/(night/events|events/?$)'
        OR event_url ~* '/(events|calendar|agenda)/?$'
      THEN 'generic_event_url'
    END
  ]::text[], NULL)
WHERE source_url_type IS NULL
   OR canonical_source_url IS NULL
   OR maintenance_flags = '{}'::text[];

WITH candidate_links AS (
  SELECT DISTINCT ON (
    COALESCE(c.existing_event_id::text, c.id::text),
    COALESCE(c.canonical_source_url, c.event_url, c.original_source_url)
  )
    c.existing_event_id AS event_id,
    c.id AS candidate_id,
    c.snapshot_id,
    COALESCE(c.canonical_source_url, c.event_url, c.original_source_url) AS source_url,
    COALESCE(c.source_url_type, 'unknown') AS source_type,
    c.source_key,
    c.source_label,
    c.canonical_source_url IS NOT NULL AS canonical_for_updates,
    COALESCE(c.source_url_type, 'unknown') IN ('fourvenues_public', 'fourvenues_channel') AS monetizable,
    c.confidence,
    CASE WHEN array_length(c.maintenance_flags, 1) > 0 THEN 'needs_review' ELSE 'active' END AS status,
    jsonb_build_object(
      'seeded_from', 'event_candidates',
      'external_id', c.external_id,
      'maintenance_flags', c.maintenance_flags
    ) AS raw_metadata
  FROM public.event_candidates c
  WHERE COALESCE(c.canonical_source_url, c.event_url, c.original_source_url) IS NOT NULL
  ORDER BY
    COALESCE(c.existing_event_id::text, c.id::text),
    COALESCE(c.canonical_source_url, c.event_url, c.original_source_url),
    c.confidence DESC,
    c.created_at DESC
)
INSERT INTO public.event_source_links (
  event_id,
  candidate_id,
  snapshot_id,
  source_url,
  source_type,
  source_key,
  source_label,
  canonical_for_updates,
  monetizable,
  confidence,
  last_checked_at,
  status,
  raw_metadata
)
SELECT
  c.event_id,
  c.candidate_id,
  c.snapshot_id,
  c.source_url,
  c.source_type,
  c.source_key,
  c.source_label,
  c.canonical_for_updates,
  c.monetizable,
  c.confidence,
  now(),
  c.status,
  c.raw_metadata
FROM candidate_links c
WHERE c.source_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_source_links existing_link
    WHERE existing_link.event_id = c.event_id
      AND existing_link.source_url = c.source_url
  )
ON CONFLICT (candidate_id, source_url) WHERE candidate_id IS NOT NULL
DO UPDATE SET
  event_id = COALESCE(EXCLUDED.event_id, public.event_source_links.event_id),
  snapshot_id = EXCLUDED.snapshot_id,
  source_type = EXCLUDED.source_type,
  source_key = EXCLUDED.source_key,
  source_label = EXCLUDED.source_label,
  canonical_for_updates = EXCLUDED.canonical_for_updates,
  monetizable = EXCLUDED.monetizable,
  confidence = EXCLUDED.confidence,
  last_checked_at = EXCLUDED.last_checked_at,
  status = EXCLUDED.status,
  raw_metadata = public.event_source_links.raw_metadata || EXCLUDED.raw_metadata;
