-- Make Edge Function upserts deterministic. PostgreSQL allows multiple NULLs
-- in unique indexes, so candidate-only rows remain valid while event/source
-- duplicates resolve through ON CONFLICT (event_id, source_url).

CREATE UNIQUE INDEX IF NOT EXISTS event_source_links_event_url_full_key
  ON public.event_source_links (event_id, source_url);

CREATE UNIQUE INDEX IF NOT EXISTS event_source_links_candidate_url_full_key
  ON public.event_source_links (candidate_id, source_url);
