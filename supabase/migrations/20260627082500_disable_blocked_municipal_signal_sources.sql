-- These municipal pages currently reject automated cloud reads with 403/406.
-- Keep them documented as potential official sources, but do not hit them
-- on the daily free-source schedule until a compliant feed/API is available.

UPDATE public.x_signal_sources
SET
  enabled = false,
  compliance_status = 'blocked',
  robots_notes = COALESCE(robots_notes || ' ', '') || 'Disabled 2026-06-27: cloud collector received 403/406; do not retry daily without a source-owned feed/API.',
  updated_at = now()
WHERE source_key IN (
  'santa-eularia-news-rss',
  'consell-news-page',
  'eivissa-news-page'
);
