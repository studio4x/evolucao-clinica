-- Qualify the unique target by constraint name. In a RETURNS TABLE PL/pgSQL
-- function, the output variable event_key otherwise makes ON CONFLICT
-- (event_key) ambiguous and prevents every queue claim at runtime.
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
  ON CONFLICT ON CONSTRAINT analytics_event_deliveries_event_key_key DO NOTHING;

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
