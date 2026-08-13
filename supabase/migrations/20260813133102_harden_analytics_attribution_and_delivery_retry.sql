ALTER TABLE public.analytics_event_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.analytics_event_deliveries
  ALTER COLUMN next_attempt_at DROP NOT NULL;

ALTER TABLE public.analytics_event_deliveries
  DROP CONSTRAINT IF EXISTS analytics_event_deliveries_status_check;
ALTER TABLE public.analytics_event_deliveries
  ADD CONSTRAINT analytics_event_deliveries_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS analytics_event_deliveries_claim_idx
  ON public.analytics_event_deliveries (status, next_attempt_at, locked_at);

-- Atomically create or claim one delivery. A sent row is immutable; a failed
-- row with next_attempt_at is retryable, and abandoned locks expire safely.
CREATE OR REPLACE FUNCTION public.claim_analytics_event_delivery(
  p_event_key text,
  p_user_id uuid,
  p_event_name text,
  p_provider text,
  p_payload jsonb,
  p_max_attempts integer DEFAULT 6
)
RETURNS TABLE (id bigint, event_key text, user_id uuid, event_name text, provider text, payload jsonb, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.analytics_event_deliveries (event_key, user_id, event_name, provider, payload)
  VALUES (p_event_key, p_user_id, p_event_name, p_provider, p_payload)
  ON CONFLICT (event_key) DO NOTHING;

  RETURN QUERY
  UPDATE public.analytics_event_deliveries AS delivery
  SET status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = now(),
      locked_at = now(),
      updated_at = now()
  WHERE delivery.id = (
    SELECT candidate.id
    FROM public.analytics_event_deliveries AS candidate
    WHERE candidate.event_key = p_event_key
      AND candidate.attempt_count < p_max_attempts
      AND (
        (candidate.status IN ('pending', 'failed') AND candidate.next_attempt_at <= now())
        OR (candidate.status = 'processing' AND candidate.locked_at < now() - interval '15 minutes')
      )
    FOR UPDATE SKIP LOCKED
  )
  RETURNING delivery.id, delivery.event_key, delivery.user_id, delivery.event_name, delivery.provider, delivery.payload, delivery.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_analytics_event_delivery(text, uuid, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_analytics_event_delivery(text, uuid, text, text, jsonb, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.configure_analytics_delivery_retry_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'analytics-delivery-retry' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'analytics_delivery_cron_token' AND decrypted_secret IS NOT NULL)
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'analytics_delivery_retry_url' AND decrypted_secret IS NOT NULL) THEN
    PERFORM cron.schedule(
      'analytics-delivery-retry',
      '*/5 * * * *',
      $job$
        SELECT net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'analytics_delivery_retry_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-analytics-delivery-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'analytics_delivery_cron_token')
          ),
          body := '{"limit":25}'::jsonb,
          timeout_milliseconds := 30000
        );
      $job$
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_analytics_delivery_retry_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_analytics_delivery_retry_job() TO service_role;

SELECT public.configure_analytics_delivery_retry_job();
