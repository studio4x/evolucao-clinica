-- Fase 2B.3: apply only to staging hwkdwinfckmjoriqxbjk via Management API.
-- Current ownership authorizes user-triggered recovery, not financial entitlement.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_clinic_billing_owner_authorized(
  p_organization_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'billing operation not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT o.operational_status INTO v_status
    FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id = o.id
    JOIN public.professionals p ON p.id = m.professional_id
   WHERE o.id = p_organization_id AND o.operational_status <> 'archived'
     AND p.id = p_actor_professional_id
     AND m.status = 'active' AND m.membership_role = 'owner';
  IF NOT FOUND THEN
    -- Identical denial for nonexistent, archived, foreign and non-owner organizations.
    RAISE EXCEPTION 'billing operation not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('organization_id', p_organization_id,
    'actor_professional_id', p_actor_professional_id, 'role', 'owner', 'operational_status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_open_clinic_checkout_attempt_for_organization_admin(
  p_organization_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt private.organization_checkout_attempts;
BEGIN
  -- Defense in depth: caller cannot look up another tenant with service-role RPC access.
  PERFORM public.assert_clinic_billing_owner_authorized(p_organization_id, p_actor_professional_id);
  SELECT * INTO v_attempt FROM private.organization_checkout_attempts
   -- Include activated contracts: the signed webhook may have completed the
   -- attempt before the new owner returns. Never start a second checkout then.
   WHERE organization_id = p_organization_id AND status IN ('started', 'session_created', 'completed', 'activated')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id,
    'actor_professional_id', v_attempt.actor_professional_id, 'plan_code', v_attempt.plan_code,
    'requested_seats', v_attempt.requested_seats, 'status', v_attempt.status,
    'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id,
    'stripe_subscription_id', v_attempt.stripe_subscription_id,
    'stripe_customer_id', v_attempt.stripe_customer_id, 'expires_at', v_attempt.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_clinic_billing_owner_authorized(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_open_clinic_checkout_attempt_for_organization_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_clinic_billing_owner_authorized(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_open_clinic_checkout_attempt_for_organization_admin(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.assert_clinic_billing_owner_authorized(uuid, uuid) IS 'Current active owner authorization only; no financial entitlement requirement. Actor must originate from a verified JWT.';
COMMENT ON FUNCTION public.get_open_clinic_checkout_attempt_for_organization_admin(uuid, uuid) IS 'Current-owner guarded server lookup including historical initiator attempts and webhook-activated contracts; prevents duplicate checkout after ownership transfer.';
COMMIT;
