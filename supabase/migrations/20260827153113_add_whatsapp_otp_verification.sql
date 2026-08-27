-- Verificacao do numero de WhatsApp no onboarding por codigo de uso unico.
-- Os desafios ficam acessiveis somente ao backend com service_role.

ALTER TABLE public.communication_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_verified_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

ALTER TABLE public.communication_preferences
  DROP CONSTRAINT IF EXISTS communication_preferences_whatsapp_verified_number_check,
  ADD CONSTRAINT communication_preferences_whatsapp_verified_number_check
    CHECK (
      whatsapp_verified_number IS NULL
      OR whatsapp_verified_number ~ '^[0-9]{8,15}$'
    ),
  DROP CONSTRAINT IF EXISTS communication_preferences_whatsapp_verification_pair_check,
  ADD CONSTRAINT communication_preferences_whatsapp_verification_pair_check
    CHECK (
      (whatsapp_verified_number IS NULL AND whatsapp_verified_at IS NULL)
      OR (whatsapp_verified_number IS NOT NULL AND whatsapp_verified_at IS NOT NULL)
    ),
  DROP CONSTRAINT IF EXISTS communication_preferences_whatsapp_verified_number_matches_check,
  ADD CONSTRAINT communication_preferences_whatsapp_verified_number_matches_check
    CHECK (
      whatsapp_verified_number IS NULL
      OR whatsapp_verified_number = whatsapp_number
    );

CREATE TABLE IF NOT EXISTS public.whatsapp_otp_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL CHECK (phone_number ~ '^[0-9]{8,15}$'),
  code_digest text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  max_attempts smallint NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 5),
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  verified_at timestamptz,
  delivery_id uuid REFERENCES public.whatsapp_message_deliveries(id) ON DELETE SET NULL,
  send_status text NOT NULL DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'accepted', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_otp_challenges_user_created_idx
  ON public.whatsapp_otp_challenges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_otp_challenges_delivery_idx
  ON public.whatsapp_otp_challenges(delivery_id)
  WHERE delivery_id IS NOT NULL;

ALTER TABLE public.whatsapp_otp_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_otp_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_otp_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.protect_whatsapp_verification_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  is_service_request boolean :=
    current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_service_request AND (
      NEW.whatsapp_verified_number IS NOT NULL
      OR NEW.whatsapp_verified_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'O estado de verificacao do WhatsApp so pode ser alterado pelo servidor.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN
    IF NOT (
      is_service_request
      AND NEW.whatsapp_verified_number = NEW.whatsapp_number
      AND NEW.whatsapp_verified_at IS NOT NULL
    ) THEN
      NEW.whatsapp_verified_number := NULL;
      NEW.whatsapp_verified_at := NULL;
    END IF;
  ELSIF NOT is_service_request AND (
    NEW.whatsapp_verified_number IS DISTINCT FROM OLD.whatsapp_verified_number
    OR NEW.whatsapp_verified_at IS DISTINCT FROM OLD.whatsapp_verified_at
  ) THEN
    RAISE EXCEPTION 'O estado de verificacao do WhatsApp so pode ser alterado pelo servidor.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.whatsapp_verified_number IS NOT NULL
    AND NEW.whatsapp_verified_number IS DISTINCT FROM NEW.whatsapp_number THEN
    RAISE EXCEPTION 'O numero verificado deve corresponder ao WhatsApp cadastrado.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_whatsapp_verification_state_trigger
  ON public.communication_preferences;

CREATE TRIGGER protect_whatsapp_verification_state_trigger
BEFORE INSERT OR UPDATE
ON public.communication_preferences
FOR EACH ROW
EXECUTE FUNCTION public.protect_whatsapp_verification_state();

REVOKE ALL ON FUNCTION public.protect_whatsapp_verification_state() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.communication_preferences.whatsapp_verified_number IS
  'Numero em formato internacional confirmado por OTP no WhatsApp.';
COMMENT ON COLUMN public.communication_preferences.whatsapp_verified_at IS
  'Data da ultima confirmacao do numero de WhatsApp por OTP.';
COMMENT ON TABLE public.whatsapp_otp_challenges IS
  'Desafios OTP efemeros do WhatsApp; o codigo e persistido somente como HMAC.';
