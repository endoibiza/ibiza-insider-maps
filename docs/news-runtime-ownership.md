# Ibiza News production ownership

As of 31 July 2026, scheduled Ibiza News collection and reconciliation run in
Supabase project `zqgsgrwtxufxebaujegn`. The public application is maintained in
`endoibiza/ibiza-maps-215cce0d`.

This repository must not deploy the production News database or Edge Functions
through GitHub Actions and must not be given `SUPABASE_DB_PASSWORD` for that
purpose. The obsolete `Ibiza News Production Deploy` workflow was retired to
prevent accidental deployments and false failure alerts.

News source history may remain here until a separately reviewed source handover
is complete. Production schedule or deployment changes require an explicit,
scoped release approval and a Supabase readback.
