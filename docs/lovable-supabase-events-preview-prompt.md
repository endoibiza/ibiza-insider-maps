# Lovable Preview Prompt: Supabase Events Cutover

Use this in Lovable Plan mode first. Do not publish until Michael approves.

## Goal

Verify the `fourvenues-events-production-setup` branch after the Supabase events cutover. Ibiza Maps events are now read from Supabase `ibiza_events`; Notion is retired as the event database/runtime.

## Scope

Review only:

- `/events`
- `/events/:slug`
- shared event card/detail behavior used by those routes

Do not change:

- auth
- payments
- promo codes
- weather/news functions
- map/listing data
- Supabase credentials
- Notion sync functions
- Fourvenues functions/secrets
- publishing settings
- analytics
- unrelated routes/components

## Checks

1. Confirm `/events` reads only from Supabase `ibiza_events`.
2. Confirm `/events` excludes:
   - `status = Cancelled`
   - hidden status values
   - rows where `source_missing_since` is not null
3. Confirm `/events/:slug` blocks cancelled/hidden/source-missing rows.
4. Confirm there are no frontend calls to `sync-notion-data`.
5. Confirm there are no public Notion strings or Notion refresh buttons.
6. Confirm there are no direct frontend calls to Fourvenues.
7. Confirm missing lineups, images, and URLs degrade gracefully.
8. Confirm no internal fields are rendered publicly:
   - agent notes
   - confidence scores
   - run IDs
   - verification timestamps
   - `source_missing_since`
9. Test mobile and desktop layouts.

## Expected State

- Existing Supabase events should show before Fourvenues is connected.
- Fourvenues is future monetization/inventory, not required for `/events` to work.
- Lovable remains display-only: all event data comes from Supabase.

## Output Requested

Return findings only. If changes are needed, propose the smallest safe patch first. Do not publish.
