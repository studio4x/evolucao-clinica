ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS auto_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_close_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_auto_close_reason_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_auto_close_reason_check
      CHECK (
        auto_close_reason IS NULL
        OR auto_close_reason = 'inactivity_after_response'
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.close_inactive_answered_support_tickets()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  closed_count integer := 0;
BEGIN
  WITH latest_active_message AS (
    SELECT DISTINCT ON (m.ticket_id)
      m.ticket_id,
      m.created_at,
      p.role AS sender_role
    FROM public.support_messages m
    JOIN public.professionals p
      ON p.id = m.sender_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.ticket_id, m.created_at DESC, m.id DESC
  ),
  eligible AS (
    SELECT t.id
    FROM public.support_tickets t
    JOIN latest_active_message lm
      ON lm.ticket_id = t.id
    WHERE t.status <> 'closed'
      AND t.sla_status = 'answered'
      AND lm.sender_role = 'admin'
      AND lm.created_at <= now() - interval '3 days'
  ),
  closed AS (
    UPDATE public.support_tickets t
    SET
      status = 'closed',
      auto_closed_at = now(),
      auto_close_reason = 'inactivity_after_response',
      updated_at = now()
    FROM eligible e
    WHERE t.id = e.id
    RETURNING t.id
  )
  SELECT count(*)::integer
  INTO closed_count
  FROM closed;

  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_inactive_answered_support_tickets()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.close_inactive_answered_support_tickets()
TO postgres, service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'auto-close-inactive-support-tickets';

SELECT cron.schedule(
  'auto-close-inactive-support-tickets',
  '23 * * * *',
  $$SELECT public.close_inactive_answered_support_tickets();$$
);
