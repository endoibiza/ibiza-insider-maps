-- Durable internal queue for event-production repair exceptions that cannot be
-- represented as source links yet, such as rows with no known source URL.
CREATE TABLE IF NOT EXISTS public.event_repair_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ibiza_events(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  queue_reason text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'resolved', 'dismissed')),
  source_url text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS event_repair_exceptions_event_issue_reason_key
  ON public.event_repair_exceptions (event_id, issue_type, queue_reason);

CREATE INDEX IF NOT EXISTS event_repair_exceptions_status_idx
  ON public.event_repair_exceptions (status);

DROP TRIGGER IF EXISTS update_event_repair_exceptions_updated_at
  ON public.event_repair_exceptions;

CREATE TRIGGER update_event_repair_exceptions_updated_at
  BEFORE UPDATE ON public.event_repair_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_repair_exceptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_repair_exceptions FROM anon, authenticated;

DROP POLICY IF EXISTS "No client access to event repair exceptions"
  ON public.event_repair_exceptions;

CREATE POLICY "No client access to event repair exceptions"
  ON public.event_repair_exceptions
  FOR ALL
  USING (false)
  WITH CHECK (false);
