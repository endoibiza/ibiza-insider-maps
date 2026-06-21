-- Include generic but updateable lineup text in the staging target view.
-- These rows are not blank/TBA, but they still need official-source repair
-- when they contain public filler such as "More Artists TBA" or resident-DJ
-- placeholders.

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
    WHEN e.lineup_details ~* '^(tba|tbc|lineup tba|line up tba|to be announced|more tba|coming soon|line up coming soon)$' THEN 'weak_lineup_details'
    WHEN e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b' THEN 'internal_metadata_in_lineup'
    WHEN e.lineup_details ~* '(\b(resident djs?|special guests?|guest djs?|line up coming soon|coming soon|more (artists|names|acts|djs)?\s*(tba|soon)?|and more)\b|&\s*more)' THEN 'generic_lineup_details'
    ELSE NULL
  END AS issue_type,
  CASE
    WHEN e.lineup_details IS NULL OR btrim(e.lineup_details) = '' THEN 10
    WHEN e.lineup_details ~* '^(tba|tbc|lineup tba|line up tba|to be announced|more tba|coming soon|line up coming soon)$' THEN 8
    WHEN e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b' THEN 9
    WHEN e.lineup_details ~* '(\b(resident djs?|special guests?|guest djs?|line up coming soon|coming soon|more (artists|names|acts|djs)?\s*(tba|soon)?|and more)\b|&\s*more)' THEN 6
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
    OR e.lineup_details ~* '^(tba|tbc|lineup tba|line up tba|to be announced|more tba|coming soon|line up coming soon)$'
    OR e.lineup_details ~* '\b(agent run|run id|verified on|last verified)\b'
    OR e.lineup_details ~* '(\b(resident djs?|special guests?|guest djs?|line up coming soon|coming soon|more (artists|names|acts|djs)?\s*(tba|soon)?|and more)\b|&\s*more)'
  );

REVOKE ALL ON TABLE public.event_lineup_sweep_targets FROM anon, authenticated;
