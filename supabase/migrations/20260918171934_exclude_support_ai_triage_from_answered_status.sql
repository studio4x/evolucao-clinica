CREATE OR REPLACE FUNCTION public.handle_support_message_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_role text;
  ai_mode text;
  counts_as_response boolean := false;
BEGIN
  SELECT role INTO sender_role
  FROM public.professionals
  WHERE id = new.sender_id;

  IF new.origin = 'support_ai' AND new.ai_run_id IS NOT NULL THEN
    SELECT mode INTO ai_mode
    FROM public.support_ai_runs
    WHERE id = new.ai_run_id;
  END IF;

  counts_as_response :=
    sender_role = 'admin'
    AND NOT (new.origin = 'support_ai' AND coalesce(ai_mode, '') = 'triage');

  UPDATE public.support_tickets
  SET
    first_response_at = CASE
      WHEN counts_as_response AND first_response_at IS NULL THEN new.created_at
      ELSE first_response_at
    END,
    status = CASE
      WHEN counts_as_response AND status = 'open' THEN 'in_progress'
      ELSE status
    END,
    updated_at = now()
  WHERE id = new.ticket_id;

  RETURN new;
END;
$$;
