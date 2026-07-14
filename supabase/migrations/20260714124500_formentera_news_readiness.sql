-- Activate Ràdio Illa Formentera after a successful private shadow run and
-- repair the seven audited false-positive Formentera area assignments.

UPDATE public.x_signal_sources
SET
  label = 'Ràdio Illa Formentera',
  enabled = true,
  publish_mode = 'review_only',
  compliance_status = 'verified',
  canonical_eligible = true,
  allow_publisher_original = true,
  require_local_signal = true,
  require_primary_resolution = false,
  public_link_policy = 'publisher_allowed',
  raw_metadata = raw_metadata || '{"source_kind":"verified_media","municipality":"Formentera","shadow_source":false,"activated_at":"2026-07-14"}'::jsonb,
  updated_at = now()
WHERE source_key = 'radio-illa-actualitat-rss';

UPDATE public.news_sources
SET
  label = 'Ràdio Illa Formentera',
  enabled = true,
  publish_mode = 'signal_only',
  access_status = 'verified',
  raw_metadata = raw_metadata || '{"source_kind":"verified_media","municipality":"Formentera","resolved_signal_promotion":true,"activated_at":"2026-07-14"}'::jsonb,
  updated_at = now()
WHERE source_key = 'radio-illa-actualitat-rss';

WITH repairs(canonical_url, corrected_area_keys) AS (
  VALUES
    ('https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/12/2668785/cerrada-bano-playa-ibiza-por-vertido-aceite-huele-mucho-combustible.html', ARRAY['sant-josep-de-sa-talaia']::text[]),
    ('https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/09/2667391/buscan-duke-perro-perdido-alrededores-del-hostal-torre.html', ARRAY['sant-antoni-de-portmany']::text[]),
    ('https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/09/2666643/familias-escuela-verano-del-ceip-ses-planes-denuncian-excesivo-calor-centro.html', ARRAY['sant-josep-de-sa-talaia']::text[]),
    ('https://www.periodicodeibiza.es/pitiusas/aldia/2026/07/09/2666907/sant-miquel-recibira-este-viernes-imagen-peregrina-santa-maria-les-neus-una-solemne-procesion.html', ARRAY['sant-joan-de-labritja']::text[]),
    ('https://www.periodicodeibiza.es/pitiusas/ibiza/2026/07/07/2665145/endesa-atribuye-cortes-luz-vila-incidencias-puntuales-arregladas.html', ARRAY['eivissa']::text[]),
    ('https://lavozdeibiza.com/actualidad/la-inviabilidad-economica-que-amenaza-con-dejar-las-miles-de-vpl-de-ibiza-en-un-simple-y-bonito-titular', ARRAY['santa-eularia-des-riu']::text[]),
    ('https://www.diariodeibiza.es/ibiza/2026/06/28/absentismo-laboral-falta-relevo-ibiza-131589914.html', ARRAY['eivissa']::text[])
)
UPDATE public.ibiza_news_stories stories
SET
  area_keys = repairs.corrected_area_keys,
  area = public.news_area_display_labels(repairs.corrected_area_keys),
  primary_area = public.news_area_display_label(repairs.corrected_area_keys[1]),
  santa_eularia = 'santa-eularia-des-riu' = ANY(repairs.corrected_area_keys),
  raw_metadata = coalesce(stories.raw_metadata, '{}'::jsonb) || jsonb_build_object(
    'formentera_area_repaired_at', now(),
    'formentera_area_repair_reason', 'audited false-positive publisher or institutional name match'
  ),
  updated_at = now()
FROM repairs
WHERE stories.canonical_url = repairs.canonical_url
  AND 'formentera' = ANY(stories.area_keys);
