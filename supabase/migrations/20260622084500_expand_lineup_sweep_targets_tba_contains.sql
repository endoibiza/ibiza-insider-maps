-- Keep the browser-sweep target view aligned with the stricter public-safety
-- gates used by the lineup reports and apply scripts. This catches rows where
-- TBA language is embedded inside otherwise useful descriptions.

CREATE OR REPLACE VIEW public.event_lineup_sweep_targets AS
SELECT
  e.id AS event_id,
  e.notion_page_id,
  e.event_name,
  e.date,
  e.venue,
  e.event_series,
  e.event_url,
  e.lineup_details,
  e.status,
  e.fourvenues_event_id,
  e.source_missing_since,
  l.id AS source_link_id,
  l.source_url,
  l.source_type,
  l.canonical_for_updates,
  CASE
    WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 'missing_lineup_details'
    WHEN e.lineup_details ~* '(^|\m)(tba|tbc|artists?[[:space:]]+tba|line[[:space:]]*-?[[:space:]]*up[[:space:]]+tba|lineup[[:space:]]+tba|to be announced|lineup not yet posted)(\M|$)' THEN 'weak_lineup_details'
    WHEN e.lineup_details ~* '(agent run|run id|verified on|last verified)' THEN 'internal_metadata_in_lineup'
    WHEN e.lineup_details ~* '(resident[[:space:]]+djs?|special[[:space:]]+guests?|guest[[:space:]]+djs?|line[[:space:]]+up[[:space:]]+coming[[:space:]]+soon|coming[[:space:]]+soon|more[[:space:]]+(artists|names|acts|djs)?[[:space:]]*(tba|soon)?|and[[:space:]]+more|&[[:space:]]*more)' THEN 'generic_lineup_details'
    ELSE NULL
  END AS issue_type,
  CASE
    WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 10
    WHEN e.lineup_details ~* '(^|\m)(tba|tbc|artists?[[:space:]]+tba|line[[:space:]]*-?[[:space:]]*up[[:space:]]+tba|lineup[[:space:]]+tba|to be announced|lineup not yet posted)(\M|$)' THEN 8
    WHEN e.lineup_details ~* '(agent run|run id|verified on|last verified)' THEN 9
    WHEN e.lineup_details ~* '(resident[[:space:]]+djs?|special[[:space:]]+guests?|guest[[:space:]]+djs?|line[[:space:]]+up[[:space:]]+coming[[:space:]]+soon|coming[[:space:]]+soon|more[[:space:]]+(artists|names|acts|djs)?[[:space:]]*(tba|soon)?|and[[:space:]]+more|&[[:space:]]*more)' THEN 6
    ELSE 1
  END AS priority
FROM public.ibiza_events e
LEFT JOIN LATERAL (
  SELECT *
  FROM public.event_source_links l
  WHERE l.event_id = e.id
    AND l.status IN ('active', 'needs_review')
  ORDER BY
    l.canonical_for_updates DESC,
    CASE l.source_type
      WHEN 'official_venue' THEN 1
      WHEN 'ibiza_spotlight' THEN 2
      WHEN 'ticketing_platform' THEN 3
      WHEN 'municipal' THEN 4
      ELSE 5
    END,
    l.confidence DESC,
    l.updated_at DESC
  LIMIT 1
) l ON true
WHERE e.date >= CURRENT_DATE
  AND lower(COALESCE(e.status, '')) NOT IN ('cancelled', 'hidden')
  AND e.source_missing_since IS NULL
  AND e.fourvenues_event_id IS NULL
  AND e.notion_page_id NOT LIKE 'fourvenues:%'
  AND (
    e.lineup_details IS NULL
    OR btrim(e.lineup_details) = ''
    OR e.lineup_details ~* '(^|\m)(tba|tbc|artists?[[:space:]]+tba|line[[:space:]]*-?[[:space:]]*up[[:space:]]+tba|lineup[[:space:]]+tba|to be announced|lineup not yet posted)(\M|$)'
    OR e.lineup_details ~* '(agent run|run id|verified on|last verified)'
    OR e.lineup_details ~* '(resident[[:space:]]+djs?|special[[:space:]]+guests?|guest[[:space:]]+djs?|line[[:space:]]+up[[:space:]]+coming[[:space:]]+soon|coming[[:space:]]+soon|more[[:space:]]+(artists|names|acts|djs)?[[:space:]]*(tba|soon)?|and[[:space:]]+more|&[[:space:]]*more)'
  );

REVOKE ALL ON TABLE public.event_lineup_sweep_targets FROM anon, authenticated;
