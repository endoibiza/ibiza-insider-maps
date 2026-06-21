# Ibiza Events Agent Replacement Snapshot

Last captured: 2026-06-21 Europe/Madrid

This file is the local replacement reference for the old Notion Ibiza Events Agent and Ibiza X Agent. It is based on live read-only Notion fetches plus the latest pasted live instructions supplied by Michael. It is not a Notion write surface.

Source attachments used:

- `/Users/michaelhenderson/.codex/attachments/1bf0ae8e-502a-4083-b007-838ae512d371/pasted-text.txt`

## Ibiza Events Agent

- Registry page: https://app.notion.com/p/faaa9de5b35f4981b1a0b9f08b77ce21
- Agent URL: `agent://2a294afd-9227-4b64-b429-4851daae03b2/3436ca9f-8a25-80a6-b43f-00921a58bbdf`
- Status: Active in Notion, but operational replacement target is Supabase-first.
- Trigger: daily 06:00 Europe/Madrid; mention trigger disabled.
- Model target: Opus 4.7.
- Execution engine: Notion AI.
- Calendar, Mail, MCP, Worker: none.
- Permissions snapshot: https://app.notion.com/p/b72caa2c5e3d45eabe9dfec3eeeab5ef

### Old Notion Access Model

- Could edit: Ibiza Events, Agent Reports, Agent Performance Tracker, Learning Log, Agent Run Log.
- Could view: People, X Daily Digest, Ibiza News, OS/governance reference pages.
- X Daily Digest was read-only context for `Ibiza: Party Calendar` and `Ibiza: Local Events`.
- Ibiza News was read-only context for culture/community event leads.
- The agent intentionally had no Calendar, Mail, MCP, or Workers. The replacement should not require these for core success.

### Replacement Rule

Supabase replaces the Notion event database as the public source of truth. The Notion agent rules become extraction and QA policy for the Supabase OS:

- write public data only to `ibiza_events` through approved Supabase jobs;
- stage new discoveries in `event_candidates`;
- stage lineup changes in `event_lineup_review_queue`;
- preserve public-safe fields only: event name, date, time, venue, series, type, status, lineup/details, event URL, source, notes, residents pass;
- never write agent notes, run IDs, timestamps, verification comments, or internal confidence labels into public fields.

## Preserved Operating Contract

- Daily run anchor: 06:00 Europe/Madrid, with the old Notion goal of event DB writes by 06:45.
- Routine daily scope: today, newly published future events, and next-7-days re-verification.
- Sunday scope: full published-season sweep across Spotlight month pages and tracked venue calendars.
- Biweekly scope: re-verify recurring local/cultural/community events.
- No-stall rule: blocked, sparse, login-walled, or stale sources should be logged and bypassed rather than stopping the run.
- Off-season rule: do not produce filler; check year-round venues and cultural/local sources.
- Report mirroring is optional in the Supabase system. If recreated, reports must be generated from Supabase run data, with no links in report body and links stored in event/source fields.

## Required Event Agent Behavior To Preserve

- Always verify the Europe/Madrid date before a run.
- Use live sources only; never fabricate events, dates, venues, times, lineups, passes, or URLs.
- Query/dedupe before creating anything.
- Prefer official date-specific event URLs over generic calendars.
- Use Ibiza Spotlight as discovery/fallback when no official date-specific page exists.
- Keep Event URL and Original Source URL separate.
- Never modify Mike's Pick.
- Never modify Featured on Party Calendar unless explicitly instructed.
- Never infer end times.
- `Lineup & Details` must not be blank for public cards.
- Club lineups should be flat, comma-separated, and without room labels.
- Local/cultural rows should use a concise description of what the event is.
- Teatro Espana/Cine Regio rows need film title, language/subtitle/showtime detail.
- Existing Notion select options and venue names should be mapped exactly into Supabase equivalents.
- Source labels should remain constrained to the old values when mirroring back to Notion-compatible data: `Ibiza Spotlight`, `Club Website`, `Twitter/X`, `Manual`, `Ibiza Daily Intel Agent`.
- Status must stay within `TBA`, `Confirmed`, `Happened`, `Cancelled`.
- `Residents Pass` should only be populated when clearly supported by a trusted source.
- Do not create People/Known Artists records during routine runs; only link existing known artists after alias-aware lookup.

## Source Priority

1. Ibiza Spotlight party calendar.
2. Ibiza Spotlight events calendar.
3. Direct venue calendars and event pages.
4. Municipal/town hall agendas and PDFs.
5. Special venue workflows.
6. X Daily Digest event signals as read-only support.
7. Ibiza News culture/community leads as read-only support.
8. Aggregators as discovery support.
9. RA/Eventbrite/Shotgun/social only when appropriate or as fallback.

## Direct-Open-First Venue Set

Pacha, Amnesia, Hï Ibiza, Ushuaïa, Akasha, Pikes, DC10, Circoloco, UNVRS, Paradise Lost, Playa Soleil, Jockey Club, Blue Marlin, Nikki Beach, 528 Ibiza, Lío, Club Chinois, IMS, Cova Santa, Café del Mar.

Special cases:

- Ibiza Rocks: official calendar first, preserve San An Pass when clearly supported.
- Pikes/528: official pages first; browser rendering often required.
- Tomodachi: Shotgun is usually the best structured event page.
- Café Mambo: ibizafiestas event pages are the primary structured fallback.
- Cova Santa: official page preferred, Spotlight acceptable for discovery when JS blocks extraction.
- Las Dalias: handle separately from Akasha.
- Municipal/local: check all six town hall sources and import named dated acts individually.
- Paradise Lost: tracked venue even when structured calendars are weak.
- Café del Mar: official page first, social fallback second.
- Lolas: Instagram-first if official site is unreliable.
- Es Birra: direct-open first, expect intermittent failures.
- WOM Radio Café / Word of Mouth: Instagram and Eventbrite.
- Sigma Club Ibiza: direct-open first; also check RA, ibizafiestas, Ticket Fairy, Skiddle, Instagram, and Makino source pages.
- theHUB. Ibiza: use social/event-platform discovery and do not fabricate URL patterns.
- Teatro Espana and Cine Regio: current-week film rows only.

## Municipal And Local Rules

Municipal/local events are first-class content, not filler. The replacement sweep must check:

- Santa Eularia: `visitsantaeulalia.com/en/agenda`, `santaeulariadesriu.com`, `bacantix.com`.
- Eivissa: `eivissa.es`, `ibiza.travel`.
- Sant Antoni: `santantoni.net`.
- Sant Josep: `santjosep.org`.
- Sant Joan: `santjoandelabritja.com`.
- Island-wide: `conselldeivissa.es`, `illesbalears.travel`.
- Aggregator cross-check: `welcometoibiza.com/en/agenda-ibiza`, Ibiza Spotlight Events Calendar.

When multi-day fiesta programmes list named, dated sub-events, prefer one row per named act/event instead of one umbrella row. Use the headline name as the event name, map `Type = Cultural` for concerts/theatre/film/dance/folk and `Type = Local` for markets/processions/community events, and use `Venue = Other` only when no existing venue fits.

## Dedupe And Update Rules

- Primary dedupe: date + venue + event series.
- Fallback dedupe: date + event name, then keyword overlap.
- For full-season sweeps, cross-check the last 30 days of X Daily Digest event fields as supporting signal.
- Do not create duplicates because source wording changed.
- Do not hard-publish newly discovered events from generic scraping; stage into `event_candidates` first.
- Public writes require a separate apply step or an explicitly approved source-level safe-write rule.

## Ibiza X Agent

- Registry page: https://app.notion.com/p/c73d9b5bae4a44a69098dac62bc3c6bc
- Agent URL: `agent://2a294afd-9227-4b64-b429-4851daae03b2/3426ca9f-8a25-80c2-9c77-0092dd93bc8f`
- Status: Active in Notion, but useful now as upstream signal policy.
- Trigger: daily 05:00 Europe/Madrid.
- Model setting: Auto.
- Permissions page: https://app.notion.com/p/c7588eeeeda6401aa6efdba0019654bb
- Could edit only: X Daily Digest, Agent Performance Tracker, Agent Run Log, Learning Log.
- Could not edit Ibiza Events.
- X access method in the old design: Grok X MCP worker `collect_ibiza_x_digest_signals`.

### Replacement Rule

X/Twitter remains a signal layer only. It can stage leads for review, but it must not directly publish event rows or overwrite official source data.

## Supabase Mapping

- Public event table: `ibiza_events`.
- New discovery staging: `event_candidates`.
- Source evidence: `event_source_links` and `event_source_snapshots`.
- Maintenance targeting: `event_maintenance_queue` and `event_lineup_sweep_targets`.
- Lineup proposals: `event_lineup_review_queue`.
- Run audit: `event_ingestion_runs` and `sync_log`.

## Protected Fields

Automation must not change:

- `mikes_pick`
- `featured_on_party_calendar`
- `slug`
- Fourvenues booking/rate/checkout fields
- Fourvenues-owned rows from generic scraping
- public text fields with agent metadata

## Current Replacement Posture

- Supabase is canonical.
- Notion sync jobs are disabled.
- Lineup sweep is shadow-first.
- Existing proposals are staged, not applied.
- Hermes/OpenClaw may help with full-season sweep only through bounded staging packets.
- Fourvenues remains separate until Channel Manager API key and venue approvals arrive.
