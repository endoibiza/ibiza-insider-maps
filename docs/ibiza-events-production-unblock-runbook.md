# Ibiza Events Production Unblock Runbook

This runbook covers the remaining steps after the Supabase-first events foundation is deployed.

## Current Safe State

- `ibiza_events` remains the public site-facing event table.
- Notion sync is still active for continuity.
- External event rows are protected from Notion cleanup:
  - `notion_page_id LIKE 'agent:%'`
  - `notion_page_id LIKE 'fourvenues:%'`
- `sync-ibiza-events-agent` is deployed and defaults to shadow mode unless `write_events: true` is explicitly passed.
- No agent-owned or Fourvenues-owned public event rows should exist before the first reviewed shadow run.

## Required Secret

Set this Supabase Edge Function secret on project `zqgsgrwtxufxebaujegn`:

- `SYNC_ADMIN_TOKEN`

The local private token file is:

- `.sync-admin-token.local`

That file is intentionally ignored by git and must not be committed.

## First Shadow Run

After `SYNC_ADMIN_TOKEN` is set in Supabase, run a shadow sync with no public event writes:

```bash
source .sync-admin-token.local

curl -sS -X POST "https://zqgsgrwtxufxebaujegn.supabase.co/functions/v1/sync-ibiza-events-agent" \
  -H "content-type: application/json" \
  -H "x-sync-admin-token: ${SYNC_ADMIN_TOKEN}" \
  --data '{
    "run_type": "manual",
    "write_events": false,
    "source_keys": [
      "spotlight-events-calendar",
      "pacha-events",
      "hi-ibiza-events"
    ],
    "start_date": "2026-06-21",
    "end_date": "2026-06-28"
  }'
```

Expected result:

- New row in `event_ingestion_runs`.
- New rows in `event_source_snapshots`.
- New rows in `event_candidates`.
- Zero new rows in `ibiza_events`.

## Review Queries

```sql
select *
from public.event_ingestion_runs
order by started_at desc
limit 5;

select
  source_key,
  review_status,
  count(*) as candidates
from public.event_candidates
group by source_key, review_status
order by source_key, review_status;

select
  event_name,
  event_date,
  venue,
  lineup_details,
  event_url,
  review_status,
  matched_event_id
from public.event_candidates
order by created_at desc
limit 50;
```

## Do Not Enable Yet

Do not pass `write_events: true` until the shadow candidates have been reviewed for:

- duplicates against existing Notion rows
- date-specific official URLs
- clean lineups without room labels or verification text
- no changes to `mikes_pick`
- no changes to `featured_on_party_calendar`
- no changes to Fourvenues-owned rows

## GitHub And Lovable

The local branch is `fourvenues-events-production-setup`.

After GitHub auth is available:

```bash
git push -u origin fourvenues-events-production-setup
```

Then let Lovable pick up the branch through GitHub and verify:

- `/events`
- `/events/:slug`
- one existing Notion-synced event
- one staged agent candidate after review
- one Fourvenues event after API access arrives

