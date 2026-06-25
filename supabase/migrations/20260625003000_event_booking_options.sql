-- Public-safe event booking/action options.
-- This separates commercial CTAs from event facts so tickets, guest lists,
-- VIP/table reservations, preregistration, and official info can coexist.

CREATE TABLE IF NOT EXISTS public.event_booking_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ibiza_event_id uuid NOT NULL REFERENCES public.ibiza_events(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'tickets',
    'guest_list',
    'vip_tables',
    'preregister',
    'official_event_page',
    'more_info'
  )),
  provider text NOT NULL CHECK (provider IN (
    'fourvenues',
    'official_venue',
    'manual',
    'ibiza_spotlight',
    'ticketing_platform'
  )),
  label text NOT NULL,
  url text NOT NULL CHECK (url ~* '^https?://'),
  priority integer NOT NULL DEFAULT 100,
  source_url text,
  source_event_id uuid REFERENCES public.ibiza_events(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  confidence numeric(3,2) NOT NULL DEFAULT 0.80 CHECK (confidence >= 0 AND confidence <= 1),
  raw_snapshot_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_booking_options_unique_option_idx
  ON public.event_booking_options (ibiza_event_id, kind, provider, url);

CREATE INDEX IF NOT EXISTS event_booking_options_event_active_idx
  ON public.event_booking_options (ibiza_event_id, active, priority);

CREATE INDEX IF NOT EXISTS event_booking_options_kind_idx
  ON public.event_booking_options (kind)
  WHERE active = true;

DROP TRIGGER IF EXISTS update_event_booking_options_updated_at
  ON public.event_booking_options;
CREATE TRIGGER update_event_booking_options_updated_at
  BEFORE UPDATE ON public.event_booking_options
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_booking_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_booking_options FROM anon, authenticated;

DROP VIEW IF EXISTS public.event_booking_options_public;
CREATE VIEW public.event_booking_options_public
WITH (security_invoker = true) AS
SELECT
  id,
  ibiza_event_id,
  kind,
  provider,
  label,
  url,
  priority,
  verified_at
FROM public.event_booking_options
WHERE active = true;

GRANT SELECT ON public.event_booking_options_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_fourvenues_event_booking_options(p_ibiza_event_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count integer := 0;
BEGIN
  DELETE FROM public.event_booking_options
  WHERE provider = 'fourvenues'
    AND (p_ibiza_event_id IS NULL OR ibiza_event_id = p_ibiza_event_id);

  WITH source_rows AS (
    SELECT
      e.id AS ibiza_event_id,
      e.fourvenues_event_id,
      COALESCE(e.checkout_url, e.iframe_tag_url, e.iframe_script_url, e.event_url) AS fallback_url,
      COALESCE(c.has_ticket_rates, jsonb_array_length(COALESCE(e.ticket_rates, '[]'::jsonb)) > 0, false) AS has_ticket_rates,
      COALESCE(c.has_guest_list, jsonb_array_length(COALESCE(e.list_rates, '[]'::jsonb)) > 0, false) AS has_guest_list,
      COALESCE(c.has_active_preregister, (e.preregister->>'is_active')::boolean, (e.preregister->>'is_preregistered')::boolean, false) AS has_active_preregister,
      COALESCE(c.has_vip_tables, false) AS has_vip_tables,
      c.fetched_at
    FROM public.ibiza_events e
    LEFT JOIN public.fourvenues_event_commercial_options c
      ON c.fourvenues_event_id = e.fourvenues_event_id
    WHERE e.fourvenues_event_id IS NOT NULL
      AND (p_ibiza_event_id IS NULL OR e.id = p_ibiza_event_id)
      AND COALESCE(e.checkout_url, e.iframe_tag_url, e.iframe_script_url, e.event_url) IS NOT NULL
  ),
  option_rows AS (
    SELECT ibiza_event_id, 'tickets'::text AS kind, 'Tickets'::text AS label, fallback_url AS url, 10 AS priority, COALESCE(fetched_at, now()) AS verified_at, 0.95::numeric AS confidence
    FROM source_rows
    WHERE has_ticket_rates

    UNION ALL

    SELECT ibiza_event_id, 'vip_tables', 'VIP / Tables', fallback_url, 20, COALESCE(fetched_at, now()), 0.90::numeric
    FROM source_rows
    WHERE has_vip_tables

    UNION ALL

    SELECT ibiza_event_id, 'guest_list', 'Guest List', fallback_url, 30, COALESCE(fetched_at, now()), 0.95::numeric
    FROM source_rows
    WHERE has_guest_list

    UNION ALL

    SELECT ibiza_event_id, 'preregister', 'Preregister', fallback_url, 40, COALESCE(fetched_at, now()), 0.90::numeric
    FROM source_rows
    WHERE has_active_preregister

    UNION ALL

    SELECT ibiza_event_id, 'more_info', 'More Info', fallback_url, 80, COALESCE(fetched_at, now()), 0.75::numeric
    FROM source_rows
    WHERE NOT has_ticket_rates
      AND NOT has_guest_list
      AND NOT has_active_preregister
      AND NOT has_vip_tables
  )
  INSERT INTO public.event_booking_options (
    ibiza_event_id,
    kind,
    provider,
    label,
    url,
    priority,
    source_url,
    verified_at,
    active,
    confidence,
    metadata
  )
  SELECT
    ibiza_event_id,
    kind,
    'fourvenues',
    label,
    url,
    priority,
    url,
    verified_at,
    true,
    confidence,
    jsonb_build_object('generated_from', 'fourvenues_event_commercial_options')
  FROM option_rows
  WHERE url IS NOT NULL
  ON CONFLICT (ibiza_event_id, kind, provider, url) DO UPDATE SET
    label = EXCLUDED.label,
    priority = EXCLUDED.priority,
    source_url = EXCLUDED.source_url,
    verified_at = EXCLUDED.verified_at,
    active = true,
    confidence = EXCLUDED.confidence,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.classify_event_booking_provider(p_url text, p_source text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_url IS NULL THEN 'manual'
    WHEN lower(p_url) LIKE '%dice.fm%' OR lower(p_url) LIKE '%shotgun.live%' OR lower(p_url) LIKE '%eventbrite.%' OR lower(p_url) LIKE '%cm.com%' OR lower(p_url) LIKE '%clubtickets.com%' OR lower(p_url) LIKE '%ticketfairy.com%' OR lower(p_url) LIKE '%skiddle.com%' OR lower(p_url) LIKE '%ticketmaster.%' OR lower(p_url) LIKE '%bacantix.com%' OR lower(p_url) LIKE '%reservaentradas.com%' THEN 'ticketing_platform'
    WHEN lower(p_url) LIKE '%edenibiza.com%' OR lower(p_url) LIKE '%chinois.com%' OR lower(p_url) LIKE '%covasanta.com%' OR lower(p_url) LIKE '%hiibiza.com%' OR lower(p_url) LIKE '%theushuaiaexperience.com%' OR lower(p_url) LIKE '%unvrs.com%' OR lower(p_url) LIKE '%pacha.com%' OR lower(p_url) LIKE '%playasoleil.com%' OR lower(p_url) LIKE '%amnesia.es%' OR lower(p_url) LIKE '%dc10ibiza.com%' OR lower(p_url) LIKE '%pikesibiza.com%' OR lower(p_url) LIKE '%ibizarocks.com%' OR lower(p_url) LIKE '%528ibiza.com%' OR lower(p_url) LIKE '%akashaibiza.com%' OR lower(p_url) LIKE '%lasdalias.es%' THEN 'official_venue'
    WHEN lower(p_url) LIKE '%ibiza-spotlight.com%' OR lower(COALESCE(p_source, '')) LIKE '%spotlight%' THEN 'ibiza_spotlight'
    ELSE 'manual'
  END;
$$;

CREATE OR REPLACE FUNCTION public.classify_event_booking_kind(p_url text, p_provider text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_provider = 'ticketing_platform' THEN 'tickets'
    WHEN lower(COALESCE(p_url, '')) LIKE '%ticket%' THEN 'tickets'
    WHEN p_provider = 'official_venue' THEN 'official_event_page'
    ELSE 'more_info'
  END;
$$;

-- Active booking/info options for current non-Fourvenues rows.
WITH source_rows AS (
  SELECT
    e.id,
    e.event_url,
    e.source,
    public.classify_event_booking_provider(e.event_url, e.source) AS provider
  FROM public.ibiza_events e
  WHERE e.fourvenues_event_id IS NULL
    AND e.event_url IS NOT NULL
    AND e.event_url <> ''
    AND e.source_missing_since IS NULL
    AND lower(COALESCE(e.status, '')) NOT IN ('hidden', 'cancelled')
),
option_rows AS (
  SELECT
    id,
    public.classify_event_booking_kind(event_url, provider) AS kind,
    provider,
    CASE
      WHEN public.classify_event_booking_kind(event_url, provider) = 'tickets' THEN 'Tickets'
      WHEN public.classify_event_booking_kind(event_url, provider) = 'official_event_page' THEN 'Official Info'
      ELSE 'More Info'
    END AS label,
    event_url AS url,
    CASE
      WHEN public.classify_event_booking_kind(event_url, provider) = 'tickets' THEN 10
      WHEN public.classify_event_booking_kind(event_url, provider) = 'official_event_page' THEN 15
      ELSE 80
    END AS priority
  FROM source_rows
)
INSERT INTO public.event_booking_options (
  ibiza_event_id,
  kind,
  provider,
  label,
  url,
  priority,
  source_url,
  verified_at,
  active,
  confidence,
  metadata
)
SELECT
  id,
  kind,
  provider,
  label,
  url,
  priority,
  url,
  now(),
  true,
  CASE WHEN provider IN ('official_venue', 'ticketing_platform') THEN 0.85 ELSE 0.65 END,
  jsonb_build_object('generated_from', 'existing_visible_event_url')
FROM option_rows
ON CONFLICT (ibiza_event_id, kind, provider, url) DO UPDATE SET
  label = EXCLUDED.label,
  priority = EXCLUDED.priority,
  source_url = EXCLUDED.source_url,
  active = true,
  confidence = EXCLUDED.confidence,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Preserve useful old links from hidden/non-Fourvenues duplicates as inactive review options.
WITH fourvenues_rows AS (
  SELECT id, date, venue, event_name, lineup_details
  FROM public.ibiza_events
  WHERE fourvenues_event_id IS NOT NULL
),
old_rows AS (
  SELECT
    id,
    date,
    venue,
    event_name,
    lineup_details,
    event_url,
    source,
    public.classify_event_booking_provider(event_url, source) AS provider
  FROM public.ibiza_events
  WHERE fourvenues_event_id IS NULL
    AND event_url IS NOT NULL
    AND event_url <> ''
),
matches AS (
  SELECT DISTINCT ON (f.id, o.event_url)
    f.id AS target_event_id,
    o.id AS source_event_id,
    o.event_url,
    o.provider
  FROM fourvenues_rows f
  JOIN old_rows o
    ON o.date = f.date
   AND lower(COALESCE(o.venue, '')) = lower(COALESCE(f.venue, ''))
   AND (
     lower(COALESCE(f.event_name, '') || ' ' || COALESCE(f.lineup_details, '')) LIKE '%' || split_part(lower(COALESCE(o.event_name, '')), ' ', 1) || '%'
     OR lower(COALESCE(o.event_name, '') || ' ' || COALESCE(o.lineup_details, '')) LIKE '%' || split_part(lower(COALESCE(f.event_name, '')), ' ', 1) || '%'
   )
  ORDER BY f.id, o.event_url, o.id
)
INSERT INTO public.event_booking_options (
  ibiza_event_id,
  kind,
  provider,
  label,
  url,
  priority,
  source_url,
  source_event_id,
  verified_at,
  active,
  confidence,
  metadata
)
SELECT
  target_event_id,
  CASE
    WHEN public.classify_event_booking_kind(event_url, provider) = 'tickets' THEN 'tickets'
    ELSE 'official_event_page'
  END,
  provider,
  CASE
    WHEN public.classify_event_booking_kind(event_url, provider) = 'tickets' THEN 'Tickets'
    ELSE 'Official Info'
  END,
  event_url,
  CASE
    WHEN public.classify_event_booking_kind(event_url, provider) = 'tickets' THEN 10
    ELSE 15
  END,
  event_url,
  source_event_id,
  now(),
  provider = 'official_venue',
  CASE WHEN provider = 'official_venue' THEN 0.78 ELSE 0.60 END,
  jsonb_build_object(
    'generated_from',
    'recovered_duplicate_event_url',
    'requires_review',
    provider <> 'official_venue'
  )
FROM matches
ON CONFLICT (ibiza_event_id, kind, provider, url) DO UPDATE SET
  source_event_id = EXCLUDED.source_event_id,
  active = CASE
    WHEN event_booking_options.provider = 'official_venue' THEN true
    ELSE event_booking_options.active
  END,
  priority = LEAST(event_booking_options.priority, EXCLUDED.priority),
  confidence = GREATEST(event_booking_options.confidence, EXCLUDED.confidence),
  metadata = event_booking_options.metadata || EXCLUDED.metadata,
  updated_at = now();

SELECT public.refresh_fourvenues_event_booking_options(NULL);

DROP VIEW IF EXISTS public.ibiza_events_public;
CREATE VIEW public.ibiza_events_public
WITH (security_invoker = true) AS
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
  first_option.label AS public_cta_label
FROM public.ibiza_events e
LEFT JOIN public.fourvenues_event_commercial_summary c
  ON c.ibiza_event_id = e.id
LEFT JOIN LATERAL (
  SELECT label
  FROM public.event_booking_options_public b
  WHERE b.ibiza_event_id = e.id
  ORDER BY priority ASC, label ASC
  LIMIT 1
) first_option ON true;

GRANT SELECT ON public.ibiza_events_public TO anon, authenticated;
