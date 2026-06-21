-- Preserve structured audit details for one-time cutovers and future sync jobs.

ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
