-- Lifecycle Automation: claim concorrente e recuperação de mensagens presas.

CREATE OR REPLACE FUNCTION public.claim_lifecycle_dispatches(
  p_worker_id text,
  p_batch_size integer DEFAULT 25
)
RETURNS SETOF public.lifecycle_dispatches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE safe_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 25), 1), 100);
BEGIN
  UPDATE public.lifecycle_dispatches
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'retry' END,
      next_attempt_at = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE now() END,
      failure_reason = CASE WHEN attempt_count >= max_attempts THEN COALESCE(failure_reason, 'worker_timeout') ELSE failure_reason END,
      updated_at = now()
  WHERE status = 'processing' AND claimed_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.lifecycle_dispatches
    WHERE status IN ('queued', 'retry')
      AND scheduled_for <= now()
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      AND attempt_count < max_attempts
    ORDER BY priority DESC, scheduled_for ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT safe_batch
  )
  UPDATE public.lifecycle_dispatches d
  SET status = 'processing', claimed_at = now(), claimed_by = p_worker_id,
      attempt_count = d.attempt_count + 1, updated_at = now()
  FROM candidates
  WHERE d.id = candidates.id
  RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_lifecycle_dispatches(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lifecycle_dispatches(text, integer) TO service_role;
