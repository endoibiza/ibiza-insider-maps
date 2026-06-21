# Ibiza Events Agent Replacement Snapshot

Last captured: 2026-06-21 Europe/Madrid

This file is the local replacement reference for the old Notion Ibiza Events Agent and Ibiza X Agent. It is based on live read-only Notion fetches plus the latest pasted live instructions supplied by Michael. It is not a Notion write surface.

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

### Replacement Rule

Supabase replaces the Notion event database as the public source of truth. The Notion agent rules become extraction and QA policy for the Supabase OS:

- write public data only to `ibiza_events` through approved Supabase jobs;
- stage new discoveries in `event_candidates`;
- stage lineup changes in `event_lineup_review_queue`;
- preserve public-safe fields only: event name, date, time, venue, series, type, status, lineup/details, event URL, source, notes, residents pass;
- never write agent notes, run IDs, timestamps, verification comments, or internal confidence labels into public fields.

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
