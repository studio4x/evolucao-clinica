-- Creates an opaque, one-time Meta registration marker only for accounts
-- created after this migration. Existing auth users are intentionally not
-- backfilled, so an ordinary login can never become a registration conversion.
CREATE TABLE IF NOT EXISTS public.meta_registration_events (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE DEFAULT ('registration-' || encode(gen_random_bytes(16), 'hex')),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_registration_events_event_id_format
    CHECK (event_id ~ '^registration-[a-f0-9]{32}$')
);

ALTER TABLE public.meta_registration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_registration_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.meta_registration_events TO service_role;

CREATE OR REPLACE FUNCTION public.create_meta_registration_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.meta_registration_events (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_meta_registration_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_meta_registration ON auth.users;
CREATE TRIGGER on_auth_user_created_meta_registration
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_meta_registration_event();

CREATE OR REPLACE FUNCTION public.claim_meta_registration_event(p_user_id uuid)
RETURNS TABLE(event_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.meta_registration_events AS registration
  SET claimed_at = now()
  WHERE registration.user_id = p_user_id
    AND registration.claimed_at IS NULL
  RETURNING registration.event_id;
$$;

REVOKE ALL ON FUNCTION public.claim_meta_registration_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meta_registration_event(uuid) TO service_role;
