-- Keep the temporary legacy ibiza_news mirror aligned with canonical status.
-- When a canonical story is rejected or otherwise unpublished, remove the
-- mirrored row so stale Lovable bundles cannot display it.

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
  ELSE
    DELETE FROM public.ibiza_news
    WHERE id = NEW.id
      AND notion_page_id = 'news:' || NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

DELETE FROM public.ibiza_news legacy
USING public.ibiza_news_stories stories
WHERE legacy.id = stories.id
  AND legacy.notion_page_id = 'news:' || stories.id::text
  AND (stories.status <> 'published' OR NOT public.is_public_news_source_url(stories.source_url));
