# Hermes/OpenClaw Event Sweep Packets

Last updated: 2026-06-21 Europe/Madrid

Use these packets when routing Ibiza event work to Hermes or OpenClaw. Codex remains the command center. Workers may collect evidence and stage proposals, but they must not publish public event changes unless Michael approves that exact apply step.

## Packet A: Official Venue Lineup Sweep

Objective: find official lineup/details updates for existing upcoming `ibiza_events` rows.

Allowed actions:

- Read Supabase staging targets.
- Open official event/source URLs.
- Render JavaScript-heavy venue pages with a browser runner.
- Extract event title, date, venue, lineup/details, time, and canonical URL.
- Insert source snapshots and lineup proposals into Supabase staging tables.
- Mark ambiguous, generic, blocked, or low-confidence results for review.

Forbidden actions:

- Do not update `ibiza_events`.
- Do not write to Notion.
- Do not change Mike's Pick, Featured on Party Calendar, slugs, residents pass, or Fourvenues fields.
- Do not send emails/messages or publish Lovable.
- Do not invent missing lineups.

Stop conditions:

- Source requires login or payment.
- Anti-bot/captcha blocks extraction.
- Date/venue/title do not clearly match the existing event.
- Proposed lineup is generic, such as `resident DJs`, `special guests`, `& more`, `TBA`, or `coming soon`.

Expected output:

- `event_source_snapshots` rows.
- `event_lineup_review_queue` rows.
- A short run summary with counts, source failures, and review-needed items.

## Packet B: Full Season Official URL Sweep

Objective: improve canonical event/source URLs for upcoming events that are missing URLs, have generic calendar URLs, or only have aggregator/ticketing URLs.

Allowed actions:

- Read upcoming `ibiza_events` and source-link staging tables.
- Search official venue calendars first.
- Use Ibiza Spotlight/ticketing platforms as fallback evidence.
- Stage proposed canonical URLs with source type and confidence.

Forbidden actions:

- Do not replace public `event_url` directly.
- Do not create duplicate event rows.
- Do not touch protected editorial/Fourvenues fields.

Stop conditions:

- URL pattern has not been sample-checked.
- Source page is generic and no date-specific page is found.
- Two possible event pages conflict.

Expected output:

- New or updated `event_source_links`.
- Source snapshots.
- Maintenance queue notes for rows needing human review.

## Packet C: New Event Discovery Shadow Sweep

Objective: find newly published future events and stage candidates.

Allowed actions:

- Scan Ibiza Spotlight, official venue calendars, municipal agendas, and approved event platforms.
- Dedupe candidates against `ibiza_events` by date + venue + series, then date + event name.
- Insert candidates into `event_candidates`.

Forbidden actions:

- Do not insert `agent:*` public rows without a separately approved write run.
- Do not write to Notion.
- Do not use social posts as primary Event URL if an official page exists.

Stop conditions:

- Candidate lacks a real date.
- Venue cannot be mapped to an approved existing venue name.
- Candidate appears to duplicate an existing row.

Expected output:

- `event_candidates` rows with `auto_safe`, `needs_review`, or `duplicate` review state.
- Source snapshots and a concise source-failure list.

## Packet D: Ibiza X Signal Context

Objective: use X/Twitter only as an upstream lead source for event discovery.

Allowed actions:

- Read exported Ibiza X Agent policy.
- Use approved X/Grok worker only if it is available in the selected runtime.
- Stage leads as candidates or maintenance notes.

Forbidden actions:

- Do not write X-derived content directly to public event fields.
- Do not treat X as stronger than official venue, municipal, Spotlight, or ticket pages.
- Do not browse X through an unapproved path if the X worker is unavailable.

Stop conditions:

- X worker unavailable.
- Relative dates cannot be resolved to an absolute date.
- No official/supporting source can confirm the event.

Expected output:

- Staged leads only.
- Clear source attribution and confidence.

## Default Review Rule

All packets default to shadow mode. Public writes require a separate apply step that names exact rows/proposals and passes these checks:

- official or trusted source;
- date/venue/event match is clear;
- public text contains no internal metadata;
- protected fields are untouched;
- Fourvenues-owned rows are ignored unless the Fourvenues sync is the writer.
