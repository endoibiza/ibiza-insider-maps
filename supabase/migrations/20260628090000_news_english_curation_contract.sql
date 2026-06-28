ALTER TABLE public.ibiza_news_stories
  ADD COLUMN IF NOT EXISTS display_language text,
  ADD COLUMN IF NOT EXISTS translation_status text,
  ADD COLUMN IF NOT EXISTS primary_area text,
  ADD COLUMN IF NOT EXISTS curation_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ibiza_news_stories_curation_idx
  ON public.ibiza_news_stories (status, story_date DESC, curation_score DESC);

CREATE OR REPLACE FUNCTION public.is_public_english_news_text(
  p_headline text,
  p_summary text,
  p_display_language text,
  p_translation_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    coalesce(p_display_language, '') = 'en'
    AND coalesce(p_translation_status, '') IN ('translated', 'ai_polished', 'manual', 'backfilled')
    AND NOT (
      coalesce(p_headline, '') || ' ' || coalesce(p_summary, '')
    ) ~* '\m(el|la|los|las|que|para|con|desde|hasta|del|se|sus|más|año|años|isla|playa|viviendas|trabajadores|gobierno|ayuntamiento|consell|policía|fiestas|abre|abierto|regresa|desembarca|protagoniza|protagonizan|continúa|celebra|espera|financiación|reconoce|robos|vivienda|alcalde|desesperada|búsqueda|martillo|hidráulico|robado|tejado|patronal|construcción|niñas|salud|mental)\M';
$$;

UPDATE public.ibiza_news_stories
SET
  display_language = 'en',
  translation_status = CASE
    WHEN ai_summary_model = 'google/gemini-2.5-flash' THEN 'ai_polished'
    WHEN ai_summary_model = 'google_translate_fallback' THEN 'translated'
    WHEN ai_summary_model ILIKE 'codex_manual%' THEN 'manual'
    ELSE 'backfilled'
  END,
  primary_area = coalesce(primary_area, area[1], 'Island-Wide'),
  curation_score = greatest(curation_score, CASE
    WHEN category IN ('Public Safety', 'Crime') THEN 70
    WHEN category IN ('Transport', 'Weather Alert') THEN 66
    WHEN category IN ('Infrastructure', 'Government') THEN 62
    WHEN category IN ('Business', 'Tourism', 'Environment', 'Health') THEN 52
    WHEN category IN ('Community', 'Culture') THEN 46
    ELSE 35
  END)
WHERE status = 'published'
  AND ai_summary_hash IS NOT NULL
  AND public.is_public_english_news_text(
    headline,
    summary,
    'en',
    CASE
      WHEN ai_summary_model = 'google/gemini-2.5-flash' THEN 'ai_polished'
      WHEN ai_summary_model = 'google_translate_fallback' THEN 'translated'
      WHEN ai_summary_model ILIKE 'codex_manual%' THEN 'manual'
      ELSE 'backfilled'
    END
  );

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
  false AS legacy_source,
  stories.display_language,
  stories.translation_status,
  coalesce(stories.primary_area, stories.area[1], 'Island-Wide') AS primary_area,
  stories.curation_score
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
  true AS legacy_source,
  'en'::text AS display_language,
  'backfilled'::text AS translation_status,
  split_part(COALESCE(legacy.area, 'Island-Wide'), ',', 1) AS primary_area,
  0::integer AS curation_score
FROM public.ibiza_news legacy
WHERE public.is_public_news_source_url(legacy.source_url)
  AND public.is_public_english_news_text(legacy.headline, COALESCE(legacy.summary, ''), 'en', 'backfilled')
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

CREATE OR REPLACE FUNCTION public.sync_ibiza_news_legacy_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published'
     AND NEW.ibiza_maps_relevant IS TRUE
     AND public.is_public_news_source_url(NEW.source_url)
     AND public.is_public_english_news_text(NEW.headline, NEW.summary, NEW.display_language, NEW.translation_status) THEN
    INSERT INTO public.ibiza_news (
      id,
      notion_page_id,
      headline,
      summary,
      category,
      area,
      source_url,
      date,
      created_at,
      updated_at,
      significance,
      ibiza_maps_relevant,
      santa_eularia
    )
    VALUES (
      NEW.id,
      'news:' || NEW.id::text,
      NEW.headline,
      NEW.summary,
      NEW.category,
      array_to_string(NEW.area, ', '),
      NEW.source_url,
      NEW.story_date,
      NEW.created_at,
      NEW.updated_at,
      NEW.significance,
      NEW.ibiza_maps_relevant,
      NEW.santa_eularia
    )
    ON CONFLICT (id) DO UPDATE SET
      notion_page_id = EXCLUDED.notion_page_id,
      headline = EXCLUDED.headline,
      summary = EXCLUDED.summary,
      category = EXCLUDED.category,
      area = EXCLUDED.area,
      source_url = EXCLUDED.source_url,
      date = EXCLUDED.date,
      updated_at = EXCLUDED.updated_at,
      significance = EXCLUDED.significance,
      ibiza_maps_relevant = EXCLUDED.ibiza_maps_relevant,
      santa_eularia = EXCLUDED.santa_eularia;
  ELSE
    DELETE FROM public.ibiza_news
    WHERE id = NEW.id
      AND notion_page_id = 'news:' || NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ibiza_news_legacy_after_publish ON public.ibiza_news_stories;
CREATE TRIGGER sync_ibiza_news_legacy_after_publish
  AFTER INSERT OR UPDATE OF
    status,
    headline,
    summary,
    category,
    area,
    source_url,
    story_date,
    significance,
    ibiza_maps_relevant,
    santa_eularia,
    display_language,
    translation_status
  ON public.ibiza_news_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ibiza_news_legacy_row();

DELETE FROM public.ibiza_news legacy
USING public.ibiza_news_stories stories
WHERE legacy.id = stories.id
  AND legacy.notion_page_id = 'news:' || stories.id::text
  AND (
    stories.status <> 'published'
    OR stories.ibiza_maps_relevant IS NOT TRUE
    OR NOT public.is_public_news_source_url(stories.source_url)
    OR NOT public.is_public_english_news_text(stories.headline, stories.summary, stories.display_language, stories.translation_status)
  );
