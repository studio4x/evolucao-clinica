-- Meta delivery is intentionally isolated from GA4 delivery so one destination
-- can retry or fail without changing the authoritative status of another.
CREATE TABLE IF NOT EXISTS public.meta_event_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN ('Purchase')),
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_event_deliveries_claim_idx
  ON public.meta_event_deliveries (status, next_attempt_at, locked_at);

ALTER TABLE public.meta_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_event_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_meta_event_delivery(
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
  INSERT INTO public.meta_event_deliveries (event_key, user_id, event_name, provider, payload)
  VALUES (p_event_key, p_user_id, p_event_name, p_provider, p_payload)
  ON CONFLICT ON CONSTRAINT meta_event_deliveries_event_key_key DO NOTHING;

  RETURN QUERY
  UPDATE public.meta_event_deliveries AS delivery
  SET status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = now(),
      locked_at = now(),
      updated_at = now()
  WHERE delivery.id = (
    SELECT candidate.id
    FROM public.meta_event_deliveries AS candidate
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

REVOKE ALL ON FUNCTION public.claim_meta_event_delivery(text, uuid, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meta_event_delivery(text, uuid, text, text, jsonb, integer) TO service_role;
