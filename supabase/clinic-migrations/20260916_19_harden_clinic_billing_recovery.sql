-- Fase 2B.2: recovery conclusivo de operações/checkout stale e grace period.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_stale_clinic_billing_operation(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_operation private.clinic_billing_operations;
  v_now timestamptz := clock_timestamp();
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  SELECT * INTO v_operation
    FROM private.clinic_billing_operations
   WHERE organization_id = p_organization_id
     AND status IN ('prepared', 'processing', 'pending_payment')
     AND expires_at <= v_now
   ORDER BY expires_at, created_at
   LIMIT 1
   FOR UPDATE;
  IF v_operation.id IS NULL THEN
    RETURN jsonb_build_object('recovery_required', false);
  END IF;
  RETURN jsonb_build_object(
    'recovery_required', true,
    'operation_id', v_operation.id,
    'organization_id', v_operation.organization_id,
    'operation_type', v_operation.operation_type,
    'requested_target_seats', v_operation.requested_target_seats,
    'stripe_subscription_id', v_operation.stripe_subscription_id,
    'stripe_reference', v_operation.stripe_reference,
    'status', v_operation.status,
    'expires_at', v_operation.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clinic_billing_operation(
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_operation private.clinic_billing_operations;
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_operation FROM private.clinic_billing_operations WHERE id = p_operation_id;
  IF v_operation.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'organization_id', v_operation.organization_id,
    'operation_type', v_operation.operation_type,
    'requested_target_seats', v_operation.requested_target_seats,
    'stripe_subscription_id', v_operation.stripe_subscription_id,
    'stripe_reference', v_operation.stripe_reference,
    'status', v_operation.status,
    'expires_at', v_operation.expires_at,
    'completed_at', v_operation.completed_at,
    'failed_at', v_operation.failed_at,
    'error_code', v_operation.error_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_clinic_billing_operation_pending_payment(
  p_operation_id uuid,
  p_error_code text DEFAULT 'payment_action_required'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_operation private.clinic_billing_operations;
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_operation FROM private.clinic_billing_operations WHERE id = p_operation_id FOR UPDATE;
  IF v_operation.id IS NULL THEN RAISE EXCEPTION 'billing operation not found' USING ERRCODE = 'P0002'; END IF;
  IF v_operation.status NOT IN ('prepared', 'processing', 'pending_payment') THEN
    RETURN jsonb_build_object('operation_id', v_operation.id, 'status', v_operation.status);
  END IF;
  UPDATE private.clinic_billing_operations
     SET status = 'pending_payment', expires_at = clock_timestamp() + interval '5 minutes',
         failed_at = NULL, error_code = left(p_error_code, 120), updated_at = clock_timestamp()
   WHERE id = v_operation.id
  RETURNING * INTO v_operation;
  RETURN jsonb_build_object('operation_id', v_operation.id, 'status', v_operation.status, 'expires_at', v_operation.expires_at, 'stripe_subscription_id', v_operation.stripe_subscription_id, 'target_seats', v_operation.requested_target_seats);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_clinic_billing_operation(
  p_operation_id uuid,
  p_error_code text DEFAULT 'stale_operation_released'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_operation private.clinic_billing_operations;
  v_subscription private.organization_subscriptions;
  v_now timestamptz := clock_timestamp();
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_operation FROM private.clinic_billing_operations WHERE id = p_operation_id FOR UPDATE;
  IF v_operation.id IS NULL THEN RAISE EXCEPTION 'billing operation not found' USING ERRCODE = 'P0002'; END IF;
  IF v_operation.status NOT IN ('prepared', 'processing', 'pending_payment') THEN
    RETURN jsonb_build_object('operation_id', v_operation.id, 'status', v_operation.status);
  END IF;
  IF v_operation.expires_at > v_now THEN
    RAISE EXCEPTION 'billing operation lease is still active' USING ERRCODE = 'P0004';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_operation.organization_id::text, 0));
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = v_operation.organization_id FOR UPDATE;
  IF v_operation.operation_type = 'seat_decrease'
     AND v_subscription.id IS NOT NULL
     AND v_subscription.pending_contracted_seats IS NOT NULL
     AND v_subscription.pending_contracted_seats = v_operation.requested_target_seats THEN
    UPDATE private.organization_subscriptions
       SET pending_contracted_seats = NULL, pending_seat_change_effective_at = NULL, updated_at = v_now
     WHERE id = v_subscription.id;
  END IF;
  UPDATE private.clinic_billing_operations
     SET status = 'expired', failed_at = v_now, error_code = left(p_error_code, 120), updated_at = v_now
   WHERE id = v_operation.id
  RETURNING * INTO v_operation;
  RETURN jsonb_build_object('operation_id', v_operation.id, 'status', v_operation.status, 'stripe_subscription_id', v_operation.stripe_subscription_id, 'target_seats', v_operation.requested_target_seats);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_clinic_billing_operation(
  p_organization_id uuid,
  p_actor_professional_id uuid,
  p_operation_type text,
  p_target_seats integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_subscription private.organization_subscriptions;
  v_usage record;
  v_role text;
  v_existing private.clinic_billing_operations;
  v_open private.clinic_billing_operations;
  v_operation private.clinic_billing_operations;
  v_now timestamptz := clock_timestamp();
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  IF p_organization_id IS NULL OR p_actor_professional_id IS NULL OR p_idempotency_key IS NULL OR p_operation_type NOT IN ('seat_increase', 'seat_decrease', 'cancel_at_period_end') THEN
    RAISE EXCEPTION 'invalid clinic billing operation' USING ERRCODE = '22023';
  END IF;
  IF p_operation_type IN ('seat_increase', 'seat_decrease') AND (p_target_seats IS NULL OR p_target_seats < 3 OR p_target_seats > 10000) THEN RAISE EXCEPTION 'invalid clinic seat target' USING ERRCODE = '22023'; END IF;
  IF p_operation_type = 'cancel_at_period_end' AND p_target_seats IS NOT NULL THEN RAISE EXCEPTION 'cancel operation cannot contain seat target' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  SELECT membership_role INTO v_role FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_role <> 'owner' OR v_subscription.id IS NULL OR v_subscription.billing_provider <> 'stripe'
     OR v_subscription.financial_status NOT IN ('active', 'past_due') OR v_subscription.stripe_subscription_id IS NULL THEN
    RAISE EXCEPTION 'clinic billing operation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF private.organization_entitlement_mode(p_organization_id) <> 'full' THEN RAISE EXCEPTION 'clinic billing operation requires full entitlement' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_existing FROM private.clinic_billing_operations WHERE organization_id = p_organization_id AND operation_type = p_operation_type AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.requested_target_seats IS DISTINCT FROM p_target_seats THEN RAISE EXCEPTION 'billing operation payload mismatch' USING ERRCODE = 'P0003'; END IF;
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object('operation_id', v_existing.id, 'operation_type', v_existing.operation_type, 'status', v_existing.status, 'claimed', false, 'reused', true, 'subscription_id', v_existing.stripe_subscription_id, 'stripe_reference', v_existing.stripe_reference, 'target_seats', v_existing.requested_target_seats);
    END IF;
    IF v_existing.status IN ('prepared', 'processing', 'pending_payment') AND v_existing.expires_at > v_now THEN
      RETURN jsonb_build_object('operation_id', v_existing.id, 'operation_type', v_existing.operation_type, 'status', v_existing.status, 'claimed', false, 'reused', true, 'subscription_id', v_existing.stripe_subscription_id, 'stripe_reference', v_existing.stripe_reference, 'target_seats', v_existing.requested_target_seats);
    END IF;
    UPDATE private.clinic_billing_operations SET status = 'processing', started_at = v_now, expires_at = v_now + interval '5 minutes', completed_at = NULL, failed_at = NULL, error_code = NULL, updated_at = v_now WHERE id = v_existing.id RETURNING * INTO v_operation;
  ELSE
    SELECT * INTO v_open FROM private.clinic_billing_operations WHERE organization_id = p_organization_id AND status IN ('prepared', 'processing', 'pending_payment') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_open.id IS NOT NULL THEN
      IF v_open.expires_at <= v_now THEN
        RETURN jsonb_build_object('recovery_required', true, 'operation_id', v_open.id, 'organization_id', v_open.organization_id, 'operation_type', v_open.operation_type, 'requested_target_seats', v_open.requested_target_seats, 'stripe_subscription_id', v_open.stripe_subscription_id, 'stripe_reference', v_open.stripe_reference, 'status', v_open.status, 'expires_at', v_open.expires_at);
      END IF;
      RAISE EXCEPTION 'clinic billing operation already in progress' USING ERRCODE = 'P0004';
    END IF;
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF p_operation_type IN ('seat_increase', 'seat_decrease') THEN
      IF p_target_seats < v_subscription.minimum_contracted_seats OR p_target_seats < v_usage.active_seats + v_usage.reserved_seats THEN RAISE EXCEPTION 'clinic seat target violates current capacity' USING ERRCODE = '23514'; END IF;
      IF p_target_seats = v_subscription.contracted_seats THEN RAISE EXCEPTION 'clinic seat quantity is unchanged' USING ERRCODE = '22023'; END IF;
      IF p_target_seats < v_subscription.contracted_seats AND v_subscription.pending_contracted_seats IS NOT NULL THEN RAISE EXCEPTION 'clinic seat reduction is already pending' USING ERRCODE = 'P0004'; END IF;
      IF p_target_seats > v_subscription.contracted_seats AND v_subscription.pending_contracted_seats IS NOT NULL THEN RAISE EXCEPTION 'clinic seat expansion exceeds pending reduction cap' USING ERRCODE = '23514'; END IF;
    ELSIF v_subscription.cancel_at_period_end IS TRUE THEN
      RAISE EXCEPTION 'clinic subscription is already scheduled for cancellation' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.clinic_billing_operations (organization_id, operation_type, requested_target_seats, idempotency_key, status, stripe_subscription_id, stripe_reference, started_at, expires_at)
    VALUES (p_organization_id, p_operation_type, p_target_seats, p_idempotency_key, 'processing', v_subscription.stripe_subscription_id, CASE WHEN p_operation_type IN ('seat_increase', 'seat_decrease') THEN v_subscription.stripe_seat_subscription_item_id ELSE 'cancel_at_period_end' END, v_now, v_now + interval '5 minutes')
    RETURNING * INTO v_operation;
    IF p_operation_type = 'seat_decrease' THEN
      UPDATE private.organization_subscriptions SET pending_contracted_seats = p_target_seats, pending_seat_change_effective_at = current_period_end, updated_at = v_now WHERE id = v_subscription.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('operation_id', v_operation.id, 'operation_type', v_operation.operation_type, 'status', v_operation.status, 'claimed', true, 'reused', v_existing.id IS NOT NULL, 'subscription_id', v_operation.stripe_subscription_id, 'stripe_reference', v_operation.stripe_reference, 'target_seats', v_operation.requested_target_seats);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_clinic_checkout_attempt(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_actor_professional_id uuid,
  p_plan_code text,
  p_requested_seats integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_org public.organizations;
  v_catalog private.clinic_plan_catalog;
  v_role text;
  v_existing private.organization_checkout_attempts;
  v_open private.organization_checkout_attempts;
  v_attempt private.organization_checkout_attempts;
  v_now timestamptz := clock_timestamp();
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  IF p_organization_id IS NULL OR p_attempt_id IS NULL OR p_actor_professional_id IS NULL OR p_requested_seats < 3 THEN RAISE EXCEPTION 'invalid clinic checkout attempt' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  SELECT * INTO v_existing FROM private.organization_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.organization_id <> p_organization_id OR v_existing.actor_professional_id <> p_actor_professional_id OR v_existing.plan_code <> p_plan_code OR v_existing.requested_seats <> p_requested_seats THEN RAISE EXCEPTION 'checkout attempt payload mismatch' USING ERRCODE = 'P0003'; END IF;
    IF v_existing.status IN ('completed', 'activated') THEN RAISE EXCEPTION 'checkout attempt already completed' USING ERRCODE = '23505'; END IF;
    IF v_existing.status IN ('failed', 'expired') THEN RAISE EXCEPTION 'checkout attempt is not reusable' USING ERRCODE = 'P0004'; END IF;
    RETURN jsonb_build_object('attempt_id', v_existing.id, 'organization_id', v_existing.organization_id, 'plan_code', v_existing.plan_code, 'requested_seats', v_existing.requested_seats, 'status', v_existing.status, 'stripe_checkout_session_id', v_existing.stripe_checkout_session_id, 'stripe_customer_id', v_existing.stripe_customer_id, 'stripe_subscription_id', v_existing.stripe_subscription_id, 'expires_at', v_existing.expires_at, 'reused', true);
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  SELECT membership_role INTO v_role FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_catalog FROM private.clinic_plan_catalog WHERE plan_code = p_plan_code AND enabled IS TRUE;
  IF v_org.id IS NULL OR v_org.operational_status <> 'pending_setup' OR v_role <> 'owner' OR v_catalog.plan_code IS NULL OR p_requested_seats < v_catalog.minimum_contracted_seats OR NOT private.is_clinic_global_enabled() THEN RAISE EXCEPTION 'clinic checkout is not available' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM private.organization_subscriptions WHERE organization_id = p_organization_id AND financial_status IN ('active', 'past_due', 'unpaid')) THEN RAISE EXCEPTION 'organization already has a clinic contract' USING ERRCODE = '23505'; END IF;
  SELECT * INTO v_open FROM private.organization_checkout_attempts WHERE organization_id = p_organization_id AND status IN ('started', 'session_created', 'completed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_open.id IS NOT NULL THEN
    IF v_open.expires_at <= v_now AND v_open.status IN ('started', 'session_created') THEN
      RETURN jsonb_build_object('recovery_required', true, 'attempt_id', v_open.id, 'organization_id', v_open.organization_id, 'actor_professional_id', v_open.actor_professional_id, 'plan_code', v_open.plan_code, 'requested_seats', v_open.requested_seats, 'status', v_open.status, 'stripe_checkout_session_id', v_open.stripe_checkout_session_id, 'stripe_customer_id', v_open.stripe_customer_id, 'stripe_subscription_id', v_open.stripe_subscription_id, 'created_at', v_open.created_at, 'updated_at', v_open.updated_at, 'expires_at', v_open.expires_at);
    END IF;
    RAISE EXCEPTION 'clinic checkout already in progress' USING ERRCODE = '23505';
  END IF;
  INSERT INTO private.organization_checkout_attempts (id, organization_id, actor_professional_id, plan_code, requested_seats, status)
  VALUES (p_attempt_id, p_organization_id, p_actor_professional_id, p_plan_code, p_requested_seats, 'started') RETURNING * INTO v_attempt;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id, 'plan_code', v_attempt.plan_code, 'requested_seats', v_attempt.requested_seats, 'status', v_attempt.status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_open_clinic_checkout_attempt_for_organization(
  p_organization_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_attempt private.organization_checkout_attempts;
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_attempt FROM private.organization_checkout_attempts WHERE organization_id = p_organization_id AND actor_professional_id = p_actor_professional_id AND status IN ('started', 'session_created', 'completed') ORDER BY created_at DESC LIMIT 1;
  IF v_attempt.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id, 'actor_professional_id', v_attempt.actor_professional_id, 'plan_code', v_attempt.plan_code, 'requested_seats', v_attempt.requested_seats, 'status', v_attempt.status, 'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id, 'stripe_customer_id', v_attempt.stripe_customer_id, 'stripe_subscription_id', v_attempt.stripe_subscription_id, 'created_at', v_attempt.created_at, 'updated_at', v_attempt.updated_at, 'expires_at', v_attempt.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_clinic_checkout_attempt(
  p_attempt_id uuid,
  p_reason text DEFAULT 'checkout_session_expired'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_attempt private.organization_checkout_attempts;
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_attempt FROM private.organization_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'clinic checkout attempt not found' USING ERRCODE = 'P0002'; END IF;
  IF v_attempt.status IN ('completed', 'activated') THEN RAISE EXCEPTION 'completed checkout attempt cannot expire' USING ERRCODE = 'P0004'; END IF;
  IF v_attempt.status NOT IN ('started', 'session_created') THEN RETURN jsonb_build_object('attempt_id', v_attempt.id, 'status', v_attempt.status); END IF;
  UPDATE private.organization_checkout_attempts SET status = 'expired', updated_at = clock_timestamp() WHERE id = v_attempt.id RETURNING * INTO v_attempt;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'status', v_attempt.status, 'organization_id', v_attempt.organization_id, 'reason', left(p_reason, 120));
END;
$$;

REVOKE ALL ON FUNCTION public.get_stale_clinic_billing_operation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_clinic_billing_operation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_clinic_billing_operation_pending_payment(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_clinic_billing_operation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_clinic_billing_operation(uuid, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_open_clinic_checkout_attempt_for_organization(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_clinic_checkout_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stale_clinic_billing_operation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clinic_billing_operation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_clinic_billing_operation_pending_payment(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_clinic_billing_operation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_clinic_billing_operation(uuid, uuid, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_open_clinic_checkout_attempt_for_organization(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_clinic_checkout_attempt(uuid, text) TO service_role;

COMMENT ON FUNCTION public.get_stale_clinic_billing_operation(uuid) IS 'Server-side stale billing operation lookup; Stripe reconciliation must precede release.';
COMMENT ON FUNCTION public.expire_stale_clinic_billing_operation(uuid, text) IS 'Releases only a conclusively stale operation; seat reduction cleanup is target-matched.';
COMMENT ON FUNCTION public.expire_clinic_checkout_attempt(uuid, text) IS 'Materializes only started/session_created checkout expiration; completed attempts cannot be expired.';

COMMIT;
