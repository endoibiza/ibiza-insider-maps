CREATE OR REPLACE FUNCTION public.enforce_lineup_proposal_quality_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status = 'auto_safe'
    AND NEW.proposed_lineup_details ~* '(resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s*(tba|soon)?|and\s+more|&\s*more|&#038;\s*more|&#8230;)'
  THEN
    NEW.approval_status = 'pending';
    NEW.raw_metadata = coalesce(NEW.raw_metadata, '{}'::jsonb) || jsonb_build_object(
      'quality_gate',
      'generic_lineup_requires_review',
      'quality_gate_applied_at',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lineup_proposal_quality_gate_trigger
  ON public.event_lineup_review_queue;

CREATE TRIGGER enforce_lineup_proposal_quality_gate_trigger
BEFORE INSERT OR UPDATE OF approval_status, proposed_lineup_details
ON public.event_lineup_review_queue
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lineup_proposal_quality_gate();

UPDATE public.event_lineup_review_queue
SET approval_status = 'pending',
    raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || jsonb_build_object(
      'quality_gate',
      'generic_lineup_requires_review',
      'quality_gate_applied_at',
      now()
    )
WHERE approval_status = 'auto_safe'
  AND proposed_lineup_details ~* '(resident\s+djs?|special\s+guests?|guest\s+djs?|line\s*up\s+coming\s+soon|coming\s+soon|more\s*(tba|soon)?|and\s+more|&\s*more|&#038;\s*more|&#8230;)';
