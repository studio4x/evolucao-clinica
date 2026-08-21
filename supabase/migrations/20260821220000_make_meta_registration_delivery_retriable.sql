-- Keeps the registration marker pending until the browser has queued the
-- CompleteRegistration event with a loaded Meta Pixel. Retries reuse the same
-- opaque event_id so Meta can deduplicate an acknowledgement-loss replay.
ALTER TABLE public.meta_registration_events
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Rows consumed by the previous one-step implementation are preserved as
-- delivered. New attempts use delivered_at and no longer mutate claimed_at
-- before the browser event is ready.
UPDATE public.meta_registration_events
SET delivered_at = claimed_at
WHERE claimed_at IS NOT NULL
  AND delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_pending_meta_registration_event(p_user_id uuid)
RETURNS TABLE(event_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT registration.event_id
  FROM public.meta_registration_events AS registration
  WHERE registration.user_id = p_user_id
    AND registration.delivered_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_pending_meta_registration_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_meta_registration_event(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_meta_registration_event(
  p_user_id uuid,
  p_event_id text
)
RETURNS TABLE(event_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.meta_registration_events AS registration
  SET delivered_at = COALESCE(registration.delivered_at, now()),
      claimed_at = COALESCE(registration.claimed_at, now())
  WHERE registration.user_id = p_user_id
    AND registration.event_id = p_event_id;

  RETURN QUERY
  SELECT registration.event_id
  FROM public.meta_registration_events AS registration
  WHERE registration.user_id = p_user_id
    AND registration.event_id = p_event_id
    AND registration.delivered_at IS NOT NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_meta_registration_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_meta_registration_event(uuid, text) TO service_role;

COMMENT ON COLUMN public.meta_registration_events.delivered_at IS
  'Set only after the browser queues CompleteRegistration with a loaded Meta Pixel.';
