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
- Old Notion agent behavior is captured locally for replacement work:
  - `docs/ibiza-events-agent-replacement-snapshot.md`
  - `docs/hermes-openclaw-event-sweep-packets.md`
- The captured Notion permissions are historical behavior/spec context only. They do not grant the replacement system permission to write Notion; replacement writes stage in Supabase first.
- GitHub Actions browser-sweep activation is still blocked until GitHub auth has `workflow` scope or the workflow template is installed manually.

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
- Generic lineup text such as `resident DJs`, `special guests`, `& more`, `TBA`, or `coming soon` must be staged for review, not marked auto-safe.

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
- Install `.github/workflows/event-lineup-browser-sweep.yml` from `docs/event-lineup-browser-sweep.workflow.yml.template` after GitHub auth has `workflow` scope.
- The workflow is scheduled for a daily shadow browser sweep and can also be run manually after installation.
- It writes snapshots and lineup proposals only; it does not update public events.

## Hermes/OpenClaw Season Sweep

Use `docs/hermes-openclaw-event-sweep-packets.md` as the bounded worker contract.
Use `docs/ibiza-events-agent-replacement-snapshot.md` as the preserved old-agent behavior contract.

### Sweep Learnings: 2026-06-22 Customer-Facing Push

- Generic official index pages such as `/events/`, `/calendar`, `/agenda`, and `/whats-on` are useful for discovery and snapshots, but they must not auto-publish lineups unless the proposal is tied to the exact event date.
- Ticket package or VIP benefit text is not lineup text. Reject phrases such as `drinks included`, `entry via`, `private terrace`, `valet parking`, and `table service`.
- `auto_safe` still requires review. The 528 Ibiza wave proved that a real named lineup can be attached to the wrong dates when extracted from a broad venue page.
- UNVRS ticketing pages can expose package benefits where the lineup parser expects artists. Keep these staged/rejected until an official or trusted source provides named artists.
- Browser sweeps that stage zero proposals are still useful when they refresh canonical source checks; they should be reported as freshness coverage, not treated as completed lineup repair.
- 528 Ibiza official pages can leave older date-specific URLs as `404` while the current season data lives on the official `/events/` calendar or public Fourvenues pages. Use exact-date metadata when the official calendar is the best available fallback, and do not treat that as a lineup source unless the rendered block clearly exposes named artists for that date.
- Public Fourvenues pages may show useful event facts now, but `web.fourvenues.com`/`site.fourvenues.com` can present bot checks in browser sweeps. Treat public Fourvenues evidence as non-monetized staging only until Channel Manager API access confirms approved organizations and events.
- Club Chinois date-specific official pages can render residency/booking copy without date-specific artist lineups. If a Chinois sweep stages zero proposals after refreshing snapshots, route La Troya/Defected rows to exact public Fourvenues source discovery or API waitlist instead of fabricating from residency copy.
- Circoloco/DC10 2026 correction: official Circoloco and DC10/DICE evidence confirms the Ibiza residency runs on Mondays, not Tuesdays. Correct exact Circoloco rows by date, preserve slugs for stable URLs, and prefer `https://circolocoibiza.com/event/ibiza-2026` as the canonical update source when DICE links contain stale Tuesday date tokens.
- Chinois duplicate handling: if two rows are exact same-date/name/venue duplicates and one is a later duplicate slug, hide the duplicate with `source_missing_since` rather than deleting it. Keep the canonical row visible for later Fourvenues/official-source repair.
- Tomodachi workflow: Shotgun is the official structured source. Exact Shotgun pages can safely repair `event_url`, `start_time`, and `end_time`; if the Shotgun page says lineup TBA, keep the public lineup as source-backed TBA and queue it rather than inventing artists.
- Amnesia ticketing workflow: `sales.ticketing.cm.com` pages are valid official/ticketing sources for Amnesia date-specific rows. Apply named artist lineups only when the ticketing page exposes real artists; otherwise use the page for URL repair and leave TBA/series copy intact.
- Cova Santa workflow: official residency pages such as `/en/parties/piv`, `/rumors`, and `/pantheon` are better canonical links than Ibiza Spotlight for recurring rows, but they often do not publish date-specific artist lineups. Use them for official URL/source coverage, not automatic lineup completion.
- Ibiza Rocks workflow: recurring official pages often publish resident/party descriptions rather than named weekly lineups. Keep those rows queued for freshness instead of rewriting resident-DJ copy into fake completeness.
- Pikes exact-page workflow: if a Pikes row's official URL/slug names a different event than the public `event_name` or `lineup_details`, the official exact-date page wins. Preserve the slug and Mike's Pick, but repair public name/lineup text and strip `& more`, `special guests`, and resident-DJ filler unless named artists are actually published.
- Amnesia ticketing workflow: CM.com official ticketing pages can expose named artists in plain text. Use them for exact-date lineup repairs, strip room labels and generic `+ More TBA` / `special guests`, and leave Bresh/Rememberland rows as honest unpublished-lineup rows when the official ticketing page confirms the event but exposes no artists.
- Amnesia stale placeholder workflow: when Supabase has `TBA at Amnesia` rows with the generic calendar URL, parse the official Amnesia calendar first. The calendar can expose the real residency name, CM.com ticket URL, and room lineup; apply exact date matches only, preserve slugs, and strip generic `Special Guest` text while keeping named artists.
- 528 Ibiza workflow: the official `/events/` calendar is the highest-yield source for 528 lineups, even when individual old `/event/...` pages are 404 and short Fourvenues links are bot-checked. Match by exact date + event title, keep existing ticket/Fourvenues links for checkout, and use the official 528 calendar as canonical source evidence for named lineups.
- Club Chinois workflow: official Chinois residency pages can embed separate public Fourvenues event groups below the intro copy. For Defected use `chinois-ibiza@g:dqjdq`; for La Troya use `chinois-ibiza@g:nhwoc`. Pull the monthly iframe HTML from `web.fourvenues.com/en/iframe/.../events?date=YYYY-MM`, match by exact date + series, then use the rendered event card name as the public lineup source and the `web.fourvenues.com/.../events/{slug}-{code}` URL as the exact public event link until Channel Manager access provides monetizable links. Do not stop at the top-of-page residency intro or generic Chinois event page if the embedded cards expose weekly lineups.
- 528 Ibiza stale-row handling: if the official 528 `/events/` calendar lacks a DB row and the row appears to be an unsupported stale date, hide it with `source_missing_since` rather than deleting it. Preserve canonical same-date rows such as Kaluki or other official listings, and keep Mike's Pick untouched.
- Cova Santa URL workflow: the official Cova Santa `/en/events` page embeds `https://www.fourvenues.com/assets/iframe/cova-santa/events`. Use `web.fourvenues.com/en/iframe/cova-santa/events?date=YYYY-MM` to extract exact event slugs/codes for PIV, RUMORS, Pantheøn, and AMÉMÉ. These cards currently provide exact event links but not weekly named artists, so repair `event_url` and source evidence while leaving lineup rows queued unless a separate official source publishes artists.
- Ushuaïa workflow: official residency pages such as `/en/club/events/ants`, `/tomorrowland-and-dimitri-vegas-like-mike`, `/elrow`, and `/calvin-harris` embed Livewire snapshots with per-date `lineup` and ticket URLs. Parse the snapshots, match by exact date + existing series URL slug, use the date-specific official venue URL pattern `/en/club/events/{slug}-on-YYYY-MM-DD`, and strip `+ TBA` / `Special Guest` fragments instead of publishing them. If a page exposes no event-grid data, keep that row queued.
- UNVRS workflow: the official `/events-calendar` SSR payload contains visible event cards and lineups for the full season. Parse cards by exact date and event title, flatten rooms while dropping room labels and `Artists TBA`, keep existing date-specific ticket URLs when they are already more specific than the generic calendar, and use `/events-calendar` as source evidence. Leave rows queued when official cards publish no artists (e.g. blank Adriatique/No Art rows).
- Pikes exact-page workflow: exact event pages expose a reliable `LINE UP ... How to be there` block. Parse the existing `event_url` first, update only exact-date pages with real named lineups, and keep pages queued when the block contains `Secret DJs`, `Very Special Guests`, `Resident DJs`, `UNANNOUNCED`, `Coming Soon`, or `& more`. Exact Pikes pages can also repair placeholder event names such as `Coming Soon at Pikes` to the official page title, while preserving the row slug and editorial flags.
- Pikes `/whats-on/` workflow: the official index exposes a JSON-LD Event list with event-specific URLs and short lineup snippets. Use it to repair placeholder names/URLs such as `Coming Soon at Pikes` -> `Pikes Sessions`, but do not publish snippets containing `& more`, `Line Up Coming Soon`, `Secret DJs`, `Special Guests`, or resident-DJ filler as complete lineups. Record those pages as source-checked/queued instead.
- Ibiza Rocks recurring-page workflow: recurring official pages are series-first, not date-specific. `Ibiza Anthems` publishes named residents (`Switch Disco, Chris Watson, Ellie Sax`) and is safe to use across its matching Saturday rows. `Nothing New` and `Ibiza Rocks Pool Party` currently publish only generic resident/live-musician copy, so keep those queued rather than pretending they have full weekly lineups.
- Ibiza Rocks queue workflow: for official recurring pages that publish only concept copy such as Nothing New, Bingo Brunch, or generic resident-DJ/live-musician pool-party text, upsert `event_source_links` with `status = needs_review` and `raw_metadata.queued_reason = official_series_page_has_generic_or_resident_dj_copy_only`. This creates an explicit queued exception without polluting public `lineup_details`; as of 2026-06-22 all 40 remaining generic Ibiza Rocks rows are classified this way.
- Pikes queue workflow: the official `/whats-on/` JSON-LD and exact pages may expose truncated metadata snippets while the visible exact page still says `LINE-UP Coming Soon`, `Secret DJs`, `Very Special Guests`, `Pikes Resident DJs`, or similar. Do not publish truncated JSON-LD snippets or generic exact-page text as complete lineups. Upsert `event_source_links.status = needs_review` with `raw_metadata.queued_reason = pikes_official_exact_page_generic_or_unpublished` when the official page is checked but does not publish a clean full lineup.
- Cova Santa queue workflow: `covasanta.com/en/events` and `web.fourvenues.com/en/iframe/cova-santa/events?date=YYYY-MM` expose exact event cards and public Fourvenues links for PIV, RUMORS, Pantheøn, and AMÉMÉ, but the static payload does not expose weekly named artists and direct `web.fourvenues.com/cova-santa/events/...` pages can return a bot-check page locally. Queue these rows with `raw_metadata.queued_reason = cova_santa_fourvenues_page_blocked_or_no_static_lineup` unless a cloud browser/OpenClaw run captures real artist text.
- Local/cultural fallback workflow: many `venue = Other` rows are recurring markets, cinema, walks, runs, and community listings where Ibiza Spotlight is the practical recurring source. Classify Spotlight-backed rows with `raw_metadata.queued_reason = spotlight_only_local_or_cultural_recurring_fallback` instead of spending broad-crawl budget on low-impact URL replacement. Rows with no URL at all remain maintenance targets for municipal/manual URL discovery.
- Eden URL repair workflow: if a recurring Eden event has the same verified title/date pattern and surrounding rows use the same official residency page, a missing `event_url` can be repaired to the official residency page without changing lineup text. Example: Markus Schulz `Open To Close` rows use `https://www.edenibiza.com/markus-schulz/`; keep Galactica rows queued when the official page or iframe does not expose date-specific artists.
- Amnesia partial-lineup workflow: remaining Rememberland ticketing pages currently expose `Dreamteam, La Movida, + more TBA`. Do not silently strip `+ more TBA` and publish it as a complete lineup unless the apply policy explicitly allows partial lineups. Queue with `raw_metadata.queued_reason = amnesia_official_ticketing_partial_or_tba_lineup` until full weekly artist lists are published.
- Fourvenues Channel Manager unblock: the API key must be requested by a user inside the Ibiza Maps Fourvenues organization under Settings > Developer Portal. If the Developer Portal is missing, the likely blockers are missing fiscal information or an inactive organization. Inacio asked for the organization name or slug if activation is needed. Venues must approve/invite Ibiza Maps as a channel/collaborator before their events appear through Channel Manager; there are no event-created/event-updated webhooks, so use polling or dynamic reads.
- DC10/Solid Grooves queue workflow: exact DICE links exist for all Solid Grooves rows, and DICE can expose `summary_lineup.top_artists`, but some pages report a higher `total_artists` than the displayed top-artist subset or no artists at all. Queue with `raw_metadata.queued_reason = dc10_dice_summary_lineup_partial_or_tba` instead of publishing partial DICE summaries as complete lineups.
- Tomodachi/Shotgun queue workflow: Shotgun remains the official structured source. When local fetches return a Vercel security checkpoint and the public row says the lineup is not yet posted, keep rows queued with `raw_metadata.queued_reason = tomodachi_shotgun_tba_or_browser_required`. Do not guess future Shotgun URL slugs for missing URLs; route those to browser/API verification.
- Pacha Solomun +1 workflow: exact Pacha pages can expose only Solomun when the +1 guest is not announced. Queue these rows with `raw_metadata.queued_reason = pacha_solomun_plus_one_guest_unpublished` rather than replacing `Solomun (+1 TBA)` with a less informative single-artist lineup.
- UNVRS TBA workflow: the official `/events-calendar` page can confirm exact event URLs and explicitly show `Artists TBA` for some future dates. Queue with `raw_metadata.queued_reason = unvrs_official_calendar_artists_tba` until artists are published.
- Ushuaïa deterministic repair workflow: stale/generic Ushuaïa URLs can be repaired to date-specific official pages when the Livewire/event payload exposes the exact date and lineup. Example: HUGEL on 2026-06-25 repaired from the stale `/events/hugel` route to `/en/club/events/hugel-on-2026-06-25` with public lineup `DERON, COCO & BREEZY, GROSSOMODDO B2B SOLTO, AMÉMÉ, HUGEL`.
- Venue Spotlight fallback workflow: Las Dalias, Es Birra, and Akasha recurring rows are often Spotlight-backed with acceptable local/cultural or venue-recurring details but no official date-specific URL in Supabase. Classify these with `raw_metadata.queued_reason = venue_event_spotlight_fallback_needs_official_url_sweep` so they are known lower-priority URL replacement candidates rather than silent unprocessed defects.
- Eden workflow: Eden residency pages can embed custom Fourvenues iframes, but `custom-iframe.fourvenues.com` may be blocked by a Vercel checkpoint from local execution. The normalized `site.fourvenues.com/en/iframe/eden-ibiza/events?...` shell loads, but does not expose cards in static HTML. Route Galactica/other Eden iframe extraction to the cloud browser/OpenClaw lane unless a plain official page or searchable trusted source exposes exact weekly artists.
- Amnesia workflow: CM.com ticket pages can expose real per-date lineup text in the rendered static payload for some events (e.g. Rememberland `Terrace: ...`). Strip room labels before writing public `lineup_details`. The official Amnesia party page can also expose the next few Bresh special guests (`SPECIAL GUEST: ...`); only apply named guests and leave later `SPECIAL GUEST TBA` rows queued.
- Amnesia calendar-card workflow: the official `/en/calendar/ibiza/2026/all` page contains analytics snippets and duplicate visible cards. Ignore early analytics occurrences; parse the `<article>` card occurrence around the CM.com link to extract the real visible `<div class="text">` lineup. Apply only clean card text; leave `SPECIAL GUEST TBA` and `+ TBA` Rememberland rows queued with evidence.
- DC10/Solid Grooves workflow: the official DC10 events page publishes exact DICE URLs and poster image URLs for each Solid Grooves date. Use those URLs to replace generic DC10 calendar links. DICE may expose only `summary_lineup.top_artists` plus a larger `total_artists`, so do not publish that partial summary as a full lineup; record it as evidence and route full-lineup extraction to poster OCR/OpenClaw if needed.

Allowed:

- read official sources and render JavaScript-heavy pages;
- compare source evidence to Supabase events;
- stage source snapshots, event candidates, source links, and lineup proposals;
- report blocked or low-confidence sources.
- run municipal/local sweeps and Known Artists cross-checks as staging/review tasks.

Forbidden without separate approval:

- public `ibiza_events` writes;
- Notion writes;
- Lovable publishing;
- credential/secret changes;
- service restarts;
- external sends.

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
