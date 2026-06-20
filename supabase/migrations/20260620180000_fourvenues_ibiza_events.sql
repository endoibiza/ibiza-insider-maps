-- Fourvenues Channel Manager support for the existing production event table.
-- This intentionally extends public.ibiza_events instead of introducing a second public event source.

ALTER TABLE public.ibiza_events
  ADD COLUMN IF NOT EXISTS fourvenues_event_id text,
  ADD COLUMN IF NOT EXISTS fourvenues_organization_id text,
  ADD COLUMN IF NOT EXISTS fourvenues_slug text,
  ADD COLUMN IF NOT EXISTS fourvenues_currency text,
  ADD COLUMN IF NOT EXISTS display_date text,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS location_longitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS iframe_tag_url text,
  ADD COLUMN IF NOT EXISTS iframe_script_url text,
  ADD COLUMN IF NOT EXISTS ticket_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS list_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preregister jsonb,
  ADD COLUMN IF NOT EXISTS event_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_fourvenues_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_missing_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ibiza_events_fourvenues_event_id_key
  ON public.ibiza_events (fourvenues_event_id)
  WHERE fourvenues_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ibiza_events_fourvenues_org_idx
  ON public.ibiza_events (fourvenues_organization_id)
  WHERE fourvenues_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ibiza_events_date_idx
  ON public.ibiza_events (date);

CREATE TABLE IF NOT EXISTS public.fourvenues_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fourvenues_id text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text,
  organization_type text NOT NULL DEFAULT 'host'
    CHECK (organization_type IN ('channel', 'host')),
  currency text,
  locale text,
  timezone text DEFAULT 'Europe/Madrid',
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fourvenues_event_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fourvenues_event_id text NOT NULL UNIQUE,
  organization_id text,
  payload jsonb NOT NULL,
  payload_hash text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.mark_missing_fourvenues_ibiza_events(
  seen_external_ids text[],
  window_start date,
  window_end date,
  target_organization_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.ibiza_events
  SET source_missing_since = COALESCE(source_missing_since, now()),
      last_synced_at = now()
  WHERE notion_page_id LIKE 'fourvenues:%'
    AND date >= window_start
    AND date <= window_end
    AND (target_organization_id IS NULL OR fourvenues_organization_id = target_organization_id)
    AND NOT (fourvenues_event_id = ANY(seen_external_ids))
    AND source_missing_since IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_missing_fourvenues_ibiza_events(text[], date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_missing_fourvenues_ibiza_events(text[], date, date, text)
  TO service_role;

ALTER TABLE public.fourvenues_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fourvenues_event_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active Fourvenues organizations" ON public.fourvenues_organizations;
CREATE POLICY "Anyone can read active Fourvenues organizations"
  ON public.fourvenues_organizations
  FOR SELECT
  USING (true);

DROP TRIGGER IF EXISTS update_fourvenues_organizations_updated_at ON public.fourvenues_organizations;
CREATE TRIGGER update_fourvenues_organizations_updated_at
  BEFORE UPDATE ON public.fourvenues_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
