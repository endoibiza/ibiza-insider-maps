-- Read-only commercial availability summary for Fourvenues event surfaces.
-- Keeps ticket/list/VIP/table evidence separate from public lineup/details copy.

CREATE TABLE IF NOT EXISTS public.fourvenues_event_commercial_options (
  fourvenues_event_id text PRIMARY KEY,
  ibiza_event_id uuid REFERENCES public.ibiza_events(id) ON DELETE CASCADE,
  organization_id text,
  has_ticket_rates boolean NOT NULL DEFAULT false,
  has_guest_list boolean NOT NULL DEFAULT false,
  has_active_preregister boolean NOT NULL DEFAULT false,
  has_vip_tables boolean NOT NULL DEFAULT false,
  lowest_ticket_price numeric,
  lowest_list_price numeric,
  lowest_vip_minimum_spend numeric,
  lowest_vip_deposit numeric,
  currency text,
  ticket_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  list_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  preregister jsonb,
  booking_availability jsonb,
  booking_zones jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fourvenues_event_commercial_options_event_idx
  ON public.fourvenues_event_commercial_options (ibiza_event_id);

CREATE INDEX IF NOT EXISTS fourvenues_event_commercial_options_org_idx
  ON public.fourvenues_event_commercial_options (organization_id);

CREATE INDEX IF NOT EXISTS fourvenues_event_commercial_options_vip_idx
  ON public.fourvenues_event_commercial_options (has_vip_tables)
  WHERE has_vip_tables = true;

DROP TRIGGER IF EXISTS update_fourvenues_event_commercial_options_updated_at
  ON public.fourvenues_event_commercial_options;
CREATE TRIGGER update_fourvenues_event_commercial_options_updated_at
  BEFORE UPDATE ON public.fourvenues_event_commercial_options
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fourvenues_event_commercial_options ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fourvenues_event_commercial_options FROM anon, authenticated;

DROP VIEW IF EXISTS public.fourvenues_event_commercial_summary;
CREATE VIEW public.fourvenues_event_commercial_summary AS
SELECT
  fourvenues_event_id,
  ibiza_event_id,
  organization_id,
  has_ticket_rates,
  has_guest_list,
  has_active_preregister,
  has_vip_tables,
  lowest_ticket_price,
  lowest_list_price,
  lowest_vip_minimum_spend,
  lowest_vip_deposit,
  currency,
  fetched_at
FROM public.fourvenues_event_commercial_options;

GRANT SELECT ON public.fourvenues_event_commercial_summary TO anon, authenticated;

DROP VIEW IF EXISTS public.ibiza_events_public;
CREATE VIEW public.ibiza_events_public AS
SELECT
  e.*,
  COALESCE(c.has_ticket_rates, false) AS has_ticket_rates,
  COALESCE(c.has_guest_list, false) AS has_guest_list,
  COALESCE(c.has_active_preregister, false) AS has_active_preregister,
  COALESCE(c.has_vip_tables, false) AS has_vip_tables,
  c.lowest_ticket_price,
  c.lowest_list_price,
  c.lowest_vip_minimum_spend,
  c.lowest_vip_deposit,
  c.currency AS commercial_currency,
  CASE
    WHEN COALESCE(c.has_ticket_rates, false) THEN 'Tickets'
    WHEN COALESCE(c.has_guest_list, false) THEN 'Guest List'
    WHEN COALESCE(c.has_vip_tables, false) THEN 'VIP / Tables'
    WHEN e.checkout_url IS NOT NULL
      OR e.iframe_tag_url IS NOT NULL
      OR e.iframe_script_url IS NOT NULL
      OR e.event_url IS NOT NULL THEN 'More Info'
    ELSE NULL
  END AS public_cta_label
FROM public.ibiza_events e
LEFT JOIN public.fourvenues_event_commercial_summary c
  ON c.ibiza_event_id = e.id;

GRANT SELECT ON public.ibiza_events_public TO anon, authenticated;
