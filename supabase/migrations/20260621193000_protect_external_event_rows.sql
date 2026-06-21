-- Protect non-Notion event rows while the legacy Notion sync remains active.
-- The current production sync-notion-data function deletes future rows whose
-- notion_page_id is missing from Notion. Agent and Fourvenues rows intentionally
-- do not exist in Notion, so this trigger skips those deletes at the database
-- boundary regardless of which service-role sync issued them.

CREATE OR REPLACE FUNCTION public.prevent_external_event_row_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.notion_page_id LIKE 'agent:%'
    OR OLD.notion_page_id LIKE 'fourvenues:%'
  THEN
    RETURN NULL;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_external_event_rows_before_delete ON public.ibiza_events;
CREATE TRIGGER protect_external_event_rows_before_delete
  BEFORE DELETE ON public.ibiza_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_external_event_row_delete();

REVOKE ALL ON FUNCTION public.prevent_external_event_row_delete() FROM PUBLIC, anon, authenticated;
