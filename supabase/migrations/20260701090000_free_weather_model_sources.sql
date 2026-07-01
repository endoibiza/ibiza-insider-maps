-- Register free/open weather intelligence sources.
-- These rows do not activate paid APIs or scraping. Heavy GRIB/Zarr model
-- sources are logged as preprocessor-required until a compact JSON pipeline
-- is added.

INSERT INTO public.weather_sources
  (source_key, label, source_type, source_url, source_domain, priority, enabled, cadence, attribution, attribution_url, access_status, robots_notes, raw_metadata)
VALUES
  (
    'ecmwf-open-data-ifs',
    'ECMWF Open Data - IFS/AIFS',
    'model_api',
    'https://www.ecmwf.int/en/forecasts/datasets/open-data',
    'ecmwf.int',
    40,
    true,
    'daily',
    'ECMWF Open Data',
    'https://www.ecmwf.int/en/forecasts/datasets/open-data',
    'preprocessor_required',
    'Use official ECMWF open data only. Do not scrape charts or third-party apps.',
    '{"license":"CC BY 4.0 attribution required","commercial_use":"allowed with attribution","direct_edge_fetch":false,"preprocessor_required":true}'
  ),
  (
    'dwd-icon-eu-open-data',
    'DWD ICON-EU Open Data',
    'model_api',
    'https://www.dwd.de/EN/ourservices/nwp_forecast_data/nwp_forecast_data.html',
    'dwd.de',
    41,
    true,
    'daily',
    'Deutscher Wetterdienst ICON Open Data',
    'https://www.dwd.de/EN/ourservices/nwp_forecast_data/nwp_forecast_data.html',
    'preprocessor_required',
    'Use official DWD open data only. Do not scrape Windy or rendered maps.',
    '{"license":"CC BY 4.0 attribution required","commercial_use":"allowed with attribution","direct_edge_fetch":false,"preprocessor_required":true}'
  ),
  (
    'cams-dust-air-quality',
    'CAMS Dust and Air Quality',
    'model_api',
    'https://atmosphere.copernicus.eu/data',
    'atmosphere.copernicus.eu',
    42,
    true,
    'daily',
    'Copernicus Atmosphere Monitoring Service',
    'https://atmosphere.copernicus.eu/data',
    'preprocessor_required',
    'Use Copernicus/CAMS data services only. Do not scrape rendered charts.',
    '{"license":"Copernicus data attribution required","commercial_use":"open data terms apply","direct_edge_fetch":false,"preprocessor_required":true,"signals":["dust","aerosols","air_quality"]}'
  ),
  (
    'ibiza-jellyfish-derived-risk',
    'Ibiza Maps Derived Jellyfish Risk',
    'model_api',
    'https://medusasibiza.es/',
    'ibiza-maps.com',
    43,
    true,
    'daily',
    'Ibiza Maps derived signal; check Medusas Ibiza for community sightings',
    'https://medusasibiza.es/',
    'derived',
    'Derived from Ibiza Maps weather and beach exposure data. No scraping or Medusas feed ingestion.',
    '{"derived":true,"live_sightings":false,"medusas_api":false,"inputs":["wind","sea_temperature","seasonality","jellyfish_trap_bay"]}'
  )
ON CONFLICT (source_key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  source_domain = EXCLUDED.source_domain,
  priority = EXCLUDED.priority,
  enabled = EXCLUDED.enabled,
  cadence = EXCLUDED.cadence,
  attribution = EXCLUDED.attribution,
  attribution_url = EXCLUDED.attribution_url,
  access_status = EXCLUDED.access_status,
  robots_notes = EXCLUDED.robots_notes,
  raw_metadata = EXCLUDED.raw_metadata,
  updated_at = now();
