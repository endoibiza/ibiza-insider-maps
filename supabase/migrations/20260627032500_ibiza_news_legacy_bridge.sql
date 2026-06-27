-- Temporary compatibility bridge for the currently deployed /news bundle.
-- Canonical evidence-backed stories remain in ibiza_news_stories; this mirror
-- keeps the legacy ibiza_news table fresh until every frontend reads the
-- public-safe views directly.

CREATE OR REPLACE FUNCTION public.sync_ibiza_news_legacy_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND public.is_public_news_source_url(NEW.source_url) THEN
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
    santa_eularia
  ON public.ibiza_news_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ibiza_news_legacy_row();

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
SELECT
  stories.id,
  'news:' || stories.id::text,
  stories.headline,
  stories.summary,
  stories.category,
  array_to_string(stories.area, ', '),
  stories.source_url,
  stories.story_date,
  stories.created_at,
  stories.updated_at,
  stories.significance,
  stories.ibiza_maps_relevant,
  stories.santa_eularia
FROM public.ibiza_news_stories stories
WHERE stories.status = 'published'
  AND public.is_public_news_source_url(stories.source_url)
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
