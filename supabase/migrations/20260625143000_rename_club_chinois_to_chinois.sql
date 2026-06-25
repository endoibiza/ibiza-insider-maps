-- Use the official public venue name "Chinois" while preserving stable slugs.

UPDATE public.ibiza_events
SET
  venue = CASE WHEN venue = 'Club Chinois' THEN 'Chinois' ELSE venue END,
  location_name = CASE WHEN location_name = 'Club Chinois' THEN 'Chinois' ELSE location_name END,
  event_name = replace(event_name, 'Club Chinois', 'Chinois')
WHERE venue = 'Club Chinois'
   OR location_name = 'Club Chinois'
   OR event_name LIKE '%Club Chinois%';
