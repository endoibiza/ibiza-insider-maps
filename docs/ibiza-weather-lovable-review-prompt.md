# Ibiza Weather Lovable Review Prompt

Use Plan mode first for Ibiza Maps.

Goal:
- Review the upgraded `/weather` experience and the surrounding site structure so Ibiza Maps visitors can quickly decide what today is good for: beach, sea, wind, alerts, sunrise/sunset, and local planning.

Scope:
- Inspect only `/weather`, `/news`, `/events`, the home-page section that links to those routes, and shared navigation/header behavior that affects those routes.
- Produce a UI/site-structure plan before any edits.

Current behavior:
- `/weather` now reads source-backed Supabase public views instead of generated AI HTML.
- Weather reports include current conditions, hourly/daily forecasts, marine summary, official alerts when available, coast-by-coast beach guidance, source health, timestamps, stale flags, and attribution.
- AEMET official data is available when the Supabase Edge Function secret `AEMET_API_KEY` is configured. Before that, the system uses compliant free sources and shows AEMET as pending.

Expected review output:
- Recommended page structure for `/weather`.
- Mobile and desktop layout improvements.
- Clearer grouping of weather, sea, beach, and alert information.
- Better internal links between Weather, News, Events, and Island Maps.
- SEO/AEO improvements for source-backed Ibiza weather.
- Any copy that should change to avoid unsupported claims.
- Any accessibility, readability, or empty/stale/error-state issues.

Source basis:
- Use only the stored Supabase weather fields and source labels surfaced by the app.
- Do not invent live weather values, jellyfish claims, source coverage, event dates, venue facts, prices, transport details, or local claims.

States to inspect:
- loading
- empty/no published report
- stale report
- partial source failure
- AEMET key missing
- official alert present
- no official alert
- mobile
- desktop

Do not change:
- Supabase schema, migrations, Edge Functions, workflows, secrets, or API connectors
- map/listing data sources
- Notion sync or schema assumptions
- auth, payments, analytics setup, publishing, custom domain, or deployment settings
- unrelated routes/components
- live listings, partner data, Fourvenues data, or event commercial logic

Before editing:
- Inspect dependencies and flag risky changes.
- Stay in Plan mode until Michael approves a scoped Build-mode prompt.

After any approved later edit:
- Verify `/weather` on mobile and desktop.
- Verify source timestamps remain visible.
- Verify no public weather claim appears without a source/status context.
- Check `/news`, `/events`, and the home page for regressions.
