# Ibiza Events Production Unblock Runbook

This runbook covers the remaining steps after the Supabase-first events foundation is deployed.

## Current Safe State

- `ibiza_events` remains the public site-facing event table.
- Supabase is now the canonical event database.
- The one-time full Notion event backfill ran on 2026-06-21:
  - `3,287` Notion event pages seen.
  - `103` missing rows inserted.
  - `3,184` existing rows updated.
  - Historical and cancelled Notion rows included.
  - Orphan cleanup disabled.
- A pre-cutover snapshot exists in production:
  - `public.ibiza_events_pre_notion_cutover_20260621`
- Scheduled Notion event sync jobs have been disabled:
  - `sync-notion-morning`
  - `sync-notion-midday`
  - `sync-notion-afternoon`
  - `sync-notion-evening`
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

## Lineup Sweep Automation

Lineup repair is staged before public event text is changed.

New surfaces:

- `event_lineup_sweep_targets`: upcoming non-Fourvenues events with missing, weak, or polluted lineup text.
- `event_lineup_review_queue`: proposed lineup replacements with source URL, source type, confidence, current text, proposed text, and approval status.
- `sweep-event-lineups`: protected Supabase Edge Function for simple HTML/API lineup scans.
- `.github/workflows/event-lineup-browser-sweep.yml`: Playwright-based cloud runner for JavaScript-heavy venue pages.

Default posture:

- Shadow only.
- No public `ibiza_events` writes.
- No changes to `mikes_pick`, `featured_on_party_calendar`, slugs, Fourvenues booking fields, or Fourvenues-owned rows.
- Public lineup text must not include room labels, verification timestamps, agent run IDs, or internal notes.

Manual Supabase shadow sweep:

```bash
source .sync-admin-token.local

curl -sS -X POST "https://zqgsgrwtxufxebaujegn.supabase.co/functions/v1/sweep-event-lineups" \
  -H "content-type: application/json" \
  -H "x-sync-admin-token: ${SYNC_ADMIN_TOKEN}" \
  --data '{
    "run_type": "manual",
    "write_events": false,
    "auto_apply": false,
    "start_date": "2026-06-21",
    "end_date": "2026-07-05",
    "limit": 50
  }'
```

Review queries:

```sql
select issue_type, source_type, count(*)
from public.event_lineup_sweep_targets
group by issue_type, source_type
order by count(*) desc;

select
  event_name,
  event_date,
  venue,
  source_type,
  lineup_confidence,
  approval_status,
  current_lineup_details,
  proposed_lineup_details,
  source_url
from public.event_lineup_review_queue
order by created_at desc
limit 50;
```

GitHub Actions requirements:

- Add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- The workflow is scheduled for a daily shadow browser sweep and can also be run manually.
- It writes snapshots and lineup proposals only; it does not update public events.

## Lovable Cutover Guidance

Lovable should read events from Supabase only. Do not reintroduce Notion as an event runtime, event write target, or sync source.

Use this prompt if Lovable needs a project-side reminder:

```text
Ibiza Events has cut over to Supabase as the canonical events database.

Use `ibiza_events` for `/events` and `/events/:slug`.
Do not add Notion reads, Notion writes, Notion syncs, or Notion Custom Agent dependencies for events.

Cancelled, hidden, or source-missing rows must not appear in the public upcoming event list.
Historical rows may exist in Supabase for archive/admin use, but should not appear in the normal upcoming-events page.

Future automated discovery should stage into Supabase review tables first (`event_candidates`, `event_source_links`, `event_maintenance_queue`) and only write to `ibiza_events` after review or explicit source-level approval.

Fourvenues remains a separate partner feed. Do not call Fourvenues from the frontend. Fourvenues data should enter through Supabase Edge Functions only after the Channel Manager API key and venue approvals are available.
```

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
