-- Fase 2B.2: lookup server-side idempotente de tentativas empresariais.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_clinic_checkout_attempt(
  p_attempt_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_attempt private.organization_checkout_attempts;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_attempt FROM private.organization_checkout_attempts
   WHERE id = p_attempt_id AND actor_professional_id = p_actor_professional_id;
  IF v_attempt.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id,
    'actor_professional_id', v_attempt.actor_professional_id, 'plan_code', v_attempt.plan_code,
    'requested_seats', v_attempt.requested_seats, 'status', v_attempt.status,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id,
    'stripe_customer_id', v_attempt.stripe_customer_id,
    'stripe_subscription_id', v_attempt.stripe_subscription_id,
    'created_at', v_attempt.created_at, 'updated_at', v_attempt.updated_at, 'expires_at', v_attempt.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_checkout_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinic_checkout_attempt(uuid, uuid) TO service_role;

COMMIT;
