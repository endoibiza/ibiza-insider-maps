-- Illa de Tagomago is a private island, not a visitor beach recommendation.
-- Keep the catalog row for audit/history, but remove it from public/weather picks.

UPDATE public.ibiza_beaches
SET
  is_active = false,
  updated_at = now()
WHERE place_name ILIKE '%Tagomago%';
