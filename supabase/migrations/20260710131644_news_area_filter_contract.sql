-- Stable municipality keys for server-side filtering. Public labels remain the
-- official Catalan municipality names used by Ibiza Maps.

ALTER TABLE public.ibiza_news_stories
  ADD COLUMN IF NOT EXISTS area_keys text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.canonical_news_area_key(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_label, ''))) IN ('island-wide', 'island wide', 'ibiza-wide', 'ibiza wide') THEN 'island-wide'
    WHEN lower(btrim(coalesce(p_label, ''))) IN ('eivissa', 'ibiza town', 'ciutat d''eivissa', 'ciudad de ibiza') THEN 'eivissa'
    WHEN lower(btrim(coalesce(p_label, ''))) IN (
      'santa eulària des riu', 'santa eularia des riu', 'santa eulària', 'santa eularia',
      'santa eulalia del río', 'santa eulalia del rio', 'es canar', 'cala llonga',
      'puig d''en valls', 'santa gertrudis de fruitera', 'santa gertrudis', 'jesús', 'jesus'
    ) THEN 'santa-eularia-des-riu'
    WHEN lower(btrim(coalesce(p_label, ''))) IN (
      'sant antoni de portmany', 'sant antoni', 'san antonio', 'portmany', 'ses variades',
      'santa agnès de corona', 'santa agnes de corona', 'sant rafel de sa creu', 'sant rafel', 'san rafael'
    ) THEN 'sant-antoni-de-portmany'
    WHEN lower(btrim(coalesce(p_label, ''))) IN (
      'sant josep de sa talaia', 'sant josep', 'san josé', 'san jose', 'sant jordi de ses salines',
      'sant jordi', 'sant agustí des vedrà', 'sant agusti des vedra', 'es cubells', 'cala de bou',
      'cala vedella', 'cala tarida', 'cala bassa', 'cala comte', 'platja d''en bossa',
      'playa d''en bossa', 'port des torrent'
    ) THEN 'sant-josep-de-sa-talaia'
    WHEN lower(btrim(coalesce(p_label, ''))) IN (
      'sant joan de labritja', 'sant joan', 'san juan', 'sant miquel de balansat', 'sant miquel',
      'sant vicent de sa cala', 'sant vicent', 'portinatx', 'benirràs', 'benirras'
    ) THEN 'sant-joan-de-labritja'
    WHEN lower(btrim(coalesce(p_label, ''))) = 'formentera' THEN 'formentera'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_news_area_keys(p_labels text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(array_agg(mapped.area_key ORDER BY mapped.first_ordinal), '{}'::text[])
  FROM (
    SELECT public.canonical_news_area_key(value) AS area_key, min(ordinality) AS first_ordinal
    FROM unnest(coalesce(p_labels, '{}'::text[])) WITH ORDINALITY AS labels(value, ordinality)
    WHERE public.canonical_news_area_key(value) IS NOT NULL
    GROUP BY public.canonical_news_area_key(value)
  ) mapped;
$$;

CREATE OR REPLACE FUNCTION public.news_area_display_label(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_key
    WHEN 'island-wide' THEN 'Ibiza-wide'
    WHEN 'eivissa' THEN 'Eivissa'
    WHEN 'santa-eularia-des-riu' THEN 'Santa Eulària des Riu'
    WHEN 'sant-antoni-de-portmany' THEN 'Sant Antoni de Portmany'
    WHEN 'sant-josep-de-sa-talaia' THEN 'Sant Josep de sa Talaia'
    WHEN 'sant-joan-de-labritja' THEN 'Sant Joan de Labritja'
    WHEN 'formentera' THEN 'Formentera'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.news_area_display_labels(p_keys text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(array_agg(public.news_area_display_label(value) ORDER BY ordinality), '{}'::text[])
  FROM unnest(coalesce(p_keys, '{}'::text[])) WITH ORDINALITY AS keys(value, ordinality)
  WHERE public.news_area_display_label(value) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.public_news_source_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_label, '')) LIKE 'diario de ibiza%' THEN 'Diario de Ibiza'
    WHEN lower(coalesce(p_label, '')) LIKE 'periódico de ibiza y formentera%'
      OR lower(coalesce(p_label, '')) LIKE 'periodico de ibiza y formentera%' THEN 'Periódico de Ibiza y Formentera'
    WHEN lower(coalesce(p_label, '')) LIKE 'la voz de ibiza%' THEN 'La Voz de Ibiza'
    ELSE regexp_replace(coalesce(p_label, ''), '\s+RSS$', '', 'i')
  END;
$$;

UPDATE public.ibiza_news_stories
SET area_keys = CASE
  WHEN cardinality(public.canonical_news_area_keys(area || coalesce(ARRAY[primary_area], '{}'::text[]))) > 0
    THEN public.canonical_news_area_keys(area || coalesce(ARRAY[primary_area], '{}'::text[]))
  ELSE ARRAY['island-wide']::text[]
END;

UPDATE public.ibiza_news_stories
SET
  primary_area = public.news_area_display_label(area_keys[1]),
  source_label = public.public_news_source_label(source_label);

UPDATE public.ibiza_news legacy
SET area = array_to_string(public.news_area_display_labels(stories.area_keys), ', ')
FROM public.ibiza_news_stories stories
WHERE legacy.id = stories.id
  AND legacy.notion_page_id = 'news:' || stories.id::text;

-- Correct two concrete evidence issues discovered in the 10 July public set.
UPDATE public.ibiza_news_stories
SET category = 'Public Safety'
WHERE id = '5bb3e3bd-2280-43b9-a4a0-2451630c8e79'::uuid
  AND category = 'Weather Alert';

UPDATE public.ibiza_news_stories
SET
  status = 'rejected',
  raw_metadata = raw_metadata || jsonb_build_object(
    'review_reason', 'conflicting quantities in source evidence',
    'reviewed_at', now()
  )
WHERE id = '10069116-5096-4378-8b3d-0226a99bce63'::uuid
  AND status = 'published';

UPDATE public.ibiza_news_daily_digests digest
SET
  story_ids = array_remove(story_ids, '10069116-5096-4378-8b3d-0226a99bce63'::uuid),
  sections = (
    SELECT jsonb_object_agg(section_name, filtered_values)
    FROM (
      SELECT
        section.key AS section_name,
        coalesce(
          (
            SELECT jsonb_agg(item.value)
            FROM jsonb_array_elements(section.value) item(value)
            WHERE trim(both '"' FROM item.value::text) <> '10069116-5096-4378-8b3d-0226a99bce63'
          ),
          '[]'::jsonb
        ) AS filtered_values
      FROM jsonb_each(digest.sections) section
    ) cleaned
  )
WHERE story_ids @> ARRAY['10069116-5096-4378-8b3d-0226a99bce63'::uuid];

CREATE INDEX IF NOT EXISTS ibiza_news_stories_area_keys_idx
  ON public.ibiza_news_stories USING gin (area_keys)
  WHERE status = 'published';

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
  stories.source_url,
  stories.story_date AS date,
  stories.created_at,
  stories.updated_at,
  stories.significance,
  stories.ibiza_maps_relevant,
  stories.santa_eularia,
  public.public_news_source_label(stories.source_label) AS source_label,
  stories.source_domain,
  stories.digest_section,
  stories.published_at,
  false AS legacy_source,
  stories.display_language,
  stories.translation_status,
  public.news_area_display_label(stories.area_keys[1]) AS primary_area,
  stories.curation_score,
  stories.area_keys
FROM public.ibiza_news_stories stories
WHERE stories.status = 'published'
  AND stories.ibiza_maps_relevant IS TRUE
  AND public.is_public_news_source_url(stories.source_url)
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
  END AS area_keys
FROM public.ibiza_news legacy
WHERE public.is_public_news_source_url(legacy.source_url)
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
