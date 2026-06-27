# Ibiza Weather Production Runbook

This weather system is designed to run in Supabase and GitHub Actions, not on Michael's laptop and not through Notion, Lovable AI, OpenClaw, Hermes, or Codex at runtime.

## One-Time Secrets

Already present in GitHub:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_ADMIN_TOKEN`
- `AEMET_API_KEY`

Needed for production deploy workflow:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

Needed for official AEMET data:
- Supabase Edge Function secret `AEMET_API_KEY`

The AEMET key has been verified against the official daily, hourly, CAP alert, and coastal forecast endpoints. The production deploy workflow copies the GitHub `AEMET_API_KEY` secret into Supabase Edge Function secrets when `SUPABASE_ACCESS_TOKEN` is available.

## Deploy

After `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` exist in GitHub repo secrets:

1. Open GitHub Actions.
2. Run `Ibiza Weather Production Deploy`.
3. Use:
   - `deploy_migration=true`
   - `deploy_functions=true`
   - `run_publish_after_deploy=true`

That workflow applies the weather schema, deploys `collect-ibiza-weather`, deploys the `get-weather` compatibility reader, and publishes the first source-backed report.

## Daily Runtime

`Ibiza Weather Ingestion` runs automatically:
- `03:15 UTC` daily publish run
- `08:30`, `12:30`, and `16:30 UTC` lightweight refresh runs

The collector works without AEMET using:
- Open-Meteo Forecast
- Open-Meteo Marine
- Sunrise-Sunset.org fallback/cross-check

When `AEMET_API_KEY` is present, it also collects:
- AEMET daily Ibiza forecast, municipality `07026`
- AEMET hourly Ibiza forecast, municipality `07026`
- AEMET CAP alerts for Illes Balears, area `64`
- AEMET coastal maritime forecast for Illes Balears coast, coast `44`

## First Checks

After deploy:

1. Confirm the workflow logs show `ok: true`.
2. Open `/weather` and confirm the page shows:
   - last updated timestamp
   - source evidence
   - beach/coast conditions
   - current weather and marine state
   - AEMET pending or official AEMET status
3. If AEMET is missing, confirm the source evidence says the API key is pending rather than failing the report.

## Expected Degraded State

If AEMET is not configured, the public report should still publish from free sources and show AEMET as pending.

If one free source fails, the run should complete with source failure evidence and keep the latest available public report visible with a stale/partial-source banner.
