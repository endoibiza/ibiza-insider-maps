DROP POLICY IF EXISTS "Public can read active event booking options"
  ON public.event_booking_options;
CREATE POLICY "Public can read active event booking options"
  ON public.event_booking_options
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

GRANT SELECT (
  id,
  ibiza_event_id,
  kind,
  provider,
  label,
  url,
  priority,
  verified_at,
  active
) ON public.event_booking_options TO anon, authenticated;

DROP VIEW IF EXISTS public.ibiza_events_public;
CREATE VIEW public.ibiza_events_public
WITH (security_invoker = true) AS
SELECT
  e.*,
  EXISTS (
    SELECT 1
    FROM public.event_booking_options_public b
    WHERE b.ibiza_event_id = e.id
      AND b.kind = 'tickets'
  ) AS has_ticket_rates,
  EXISTS (
    SELECT 1
    FROM public.event_booking_options_public b
    WHERE b.ibiza_event_id = e.id
      AND b.kind = 'guest_list'
  ) AS has_guest_list,
  EXISTS (
    SELECT 1
    FROM public.event_booking_options_public b
    WHERE b.ibiza_event_id = e.id
      AND b.kind = 'preregister'
  ) AS has_active_preregister,
  EXISTS (
    SELECT 1
    FROM public.event_booking_options_public b
    WHERE b.ibiza_event_id = e.id
      AND b.kind = 'vip_tables'
  ) AS has_vip_tables,
  NULL::numeric AS lowest_ticket_price,
  NULL::numeric AS lowest_list_price,
  NULL::numeric AS lowest_vip_minimum_spend,
  NULL::numeric AS lowest_vip_deposit,
  NULL::text AS commercial_currency,
  first_option.label AS public_cta_label
FROM public.ibiza_events e
LEFT JOIN LATERAL (
  SELECT label
  FROM public.event_booking_options_public b
  WHERE b.ibiza_event_id = e.id
  ORDER BY priority ASC, label ASC
  LIMIT 1
) first_option ON true;

GRANT SELECT ON public.ibiza_events_public TO anon, authenticated;
