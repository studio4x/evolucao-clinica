-- Fase 2B.1: lease de operações comerciais, payloads imutáveis e claim idempotente.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS private.clinic_billing_operations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE NO ACTION,
  operation_type text NOT NULL CHECK (operation_type IN ('seat_increase', 'seat_decrease', 'cancel_at_period_end')),
  requested_target_seats integer,
  idempotency_key uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'processing', 'pending_payment', 'completed', 'failed', 'expired')),
  stripe_subscription_id text CHECK (stripe_subscription_id IS NULL OR stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_reference text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT clinic_billing_operations_target_shape CHECK (
    (operation_type IN ('seat_increase', 'seat_decrease') AND requested_target_seats >= 3)
    OR (operation_type = 'cancel_at_period_end' AND requested_target_seats IS NULL)
  ),
  CONSTRAINT clinic_billing_operations_expiry CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_billing_operations_idempotency
  ON private.clinic_billing_operations (organization_id, operation_type, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_billing_operations_open_org
  ON private.clinic_billing_operations (organization_id)
  WHERE status IN ('prepared', 'processing', 'pending_payment');
CREATE INDEX IF NOT EXISTS clinic_billing_operations_subscription
  ON private.clinic_billing_operations (stripe_subscription_id, status);

ALTER TABLE private.clinic_billing_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_billing_operations_no_client_access ON private.clinic_billing_operations;
CREATE POLICY clinic_billing_operations_no_client_access
  ON private.clinic_billing_operations FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE private.clinic_billing_operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_billing_operations TO service_role;

ALTER TABLE private.clinic_stripe_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

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
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_attempt_id IS NULL OR p_actor_professional_id IS NULL OR p_requested_seats < 3 THEN
    RAISE EXCEPTION 'invalid clinic checkout attempt' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  SELECT * INTO v_existing FROM private.organization_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.organization_id <> p_organization_id
       OR v_existing.actor_professional_id <> p_actor_professional_id
       OR v_existing.plan_code <> p_plan_code
       OR v_existing.requested_seats <> p_requested_seats THEN
      RAISE EXCEPTION 'checkout attempt payload mismatch' USING ERRCODE = 'P0003';
    END IF;
    IF v_existing.status IN ('completed', 'activated') THEN
      RAISE EXCEPTION 'checkout attempt already completed' USING ERRCODE = '23505';
    END IF;
    IF v_existing.status IN ('failed', 'expired') THEN
      RAISE EXCEPTION 'checkout attempt is not reusable' USING ERRCODE = 'P0004';
    END IF;
    RETURN jsonb_build_object(
      'attempt_id', v_existing.id, 'organization_id', v_existing.organization_id,
      'plan_code', v_existing.plan_code, 'requested_seats', v_existing.requested_seats,
      'status', v_existing.status, 'reused', true
    );
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_catalog FROM private.clinic_plan_catalog WHERE plan_code = p_plan_code AND enabled IS TRUE;
  IF v_org.id IS NULL OR v_org.operational_status <> 'pending_setup'
     OR v_role <> 'owner' OR v_catalog.plan_code IS NULL
     OR p_requested_seats < v_catalog.minimum_contracted_seats
     OR NOT private.is_clinic_global_enabled() THEN
    RAISE EXCEPTION 'clinic checkout is not available' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM private.organization_subscriptions WHERE organization_id = p_organization_id AND financial_status IN ('active', 'past_due', 'unpaid')) THEN
    RAISE EXCEPTION 'organization already has a clinic contract' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_open FROM private.organization_checkout_attempts
   WHERE organization_id = p_organization_id AND status IN ('started', 'session_created', 'completed')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_open.id IS NOT NULL THEN
    RAISE EXCEPTION 'clinic checkout already in progress' USING ERRCODE = '23505';
  END IF;
  INSERT INTO private.organization_checkout_attempts (id, organization_id, actor_professional_id, plan_code, requested_seats, status)
  VALUES (p_attempt_id, p_organization_id, p_actor_professional_id, p_plan_code, p_requested_seats, 'started')
  RETURNING * INTO v_attempt;
  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id,
    'plan_code', v_attempt.plan_code, 'requested_seats', v_attempt.requested_seats,
    'status', v_attempt.status, 'reused', false
  );
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
  v_claimed boolean := false;
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_actor_professional_id IS NULL OR p_idempotency_key IS NULL
     OR p_operation_type NOT IN ('seat_increase', 'seat_decrease', 'cancel_at_period_end') THEN
    RAISE EXCEPTION 'invalid clinic billing operation' USING ERRCODE = '22023';
  END IF;
  IF p_operation_type IN ('seat_increase', 'seat_decrease') AND (p_target_seats IS NULL OR p_target_seats < 3 OR p_target_seats > 10000) THEN
    RAISE EXCEPTION 'invalid clinic seat target' USING ERRCODE = '22023';
  END IF;
  IF p_operation_type = 'cancel_at_period_end' AND p_target_seats IS NOT NULL THEN
    RAISE EXCEPTION 'cancel operation cannot contain seat target' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_role <> 'owner' OR v_subscription.id IS NULL OR v_subscription.billing_provider <> 'stripe'
     OR v_subscription.financial_status <> 'active' OR v_subscription.stripe_subscription_id IS NULL THEN
    RAISE EXCEPTION 'clinic billing operation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF private.organization_entitlement_mode(p_organization_id) <> 'full' THEN
    RAISE EXCEPTION 'clinic billing operation requires full entitlement' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing FROM private.clinic_billing_operations
   WHERE organization_id = p_organization_id AND operation_type = p_operation_type AND idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.requested_target_seats IS DISTINCT FROM p_target_seats THEN
      RAISE EXCEPTION 'billing operation payload mismatch' USING ERRCODE = 'P0003';
    END IF;
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object('operation_id', v_existing.id, 'operation_type', v_existing.operation_type, 'status', v_existing.status, 'claimed', false, 'reused', true, 'subscription_id', v_existing.stripe_subscription_id, 'stripe_reference', v_existing.stripe_reference, 'target_seats', v_existing.requested_target_seats);
    END IF;
    IF v_existing.status IN ('prepared', 'processing', 'pending_payment') AND v_existing.expires_at > v_now THEN
      RETURN jsonb_build_object('operation_id', v_existing.id, 'operation_type', v_existing.operation_type, 'status', v_existing.status, 'claimed', false, 'reused', true, 'subscription_id', v_existing.stripe_subscription_id, 'stripe_reference', v_existing.stripe_reference, 'target_seats', v_existing.requested_target_seats);
    END IF;
    UPDATE private.clinic_billing_operations
       SET status = 'processing', started_at = v_now, expires_at = v_now + interval '5 minutes', completed_at = NULL, failed_at = NULL, error_code = NULL, updated_at = v_now
     WHERE id = v_existing.id
     RETURNING * INTO v_operation;
    v_claimed := true;
  ELSE
    SELECT * INTO v_open FROM private.clinic_billing_operations
     WHERE organization_id = p_organization_id AND status IN ('prepared', 'processing', 'pending_payment')
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_open.id IS NOT NULL THEN
      RAISE EXCEPTION 'clinic billing operation already in progress' USING ERRCODE = 'P0004';
    END IF;
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF p_operation_type IN ('seat_increase', 'seat_decrease') THEN
      IF p_target_seats < v_subscription.minimum_contracted_seats OR p_target_seats < v_usage.active_seats + v_usage.reserved_seats THEN
        RAISE EXCEPTION 'clinic seat target violates current capacity' USING ERRCODE = '23514';
      END IF;
      IF p_target_seats = v_subscription.contracted_seats THEN
        RAISE EXCEPTION 'clinic seat quantity is unchanged' USING ERRCODE = '22023';
      END IF;
      IF p_target_seats < v_subscription.contracted_seats AND v_subscription.pending_contracted_seats IS NOT NULL THEN
        RAISE EXCEPTION 'clinic seat reduction is already pending' USING ERRCODE = 'P0004';
      END IF;
      IF p_target_seats > v_subscription.contracted_seats AND v_subscription.pending_contracted_seats IS NOT NULL THEN
        RAISE EXCEPTION 'clinic seat expansion exceeds pending reduction cap' USING ERRCODE = '23514';
      END IF;
    ELSIF v_subscription.cancel_at_period_end IS TRUE THEN
      RAISE EXCEPTION 'clinic subscription is already scheduled for cancellation' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.clinic_billing_operations (
      organization_id, operation_type, requested_target_seats, idempotency_key, status,
      stripe_subscription_id, stripe_reference, started_at, expires_at
    ) VALUES (
      p_organization_id, p_operation_type, p_target_seats, p_idempotency_key, 'processing',
      v_subscription.stripe_subscription_id,
      CASE WHEN p_operation_type IN ('seat_increase', 'seat_decrease') THEN v_subscription.stripe_seat_subscription_item_id ELSE 'cancel_at_period_end' END,
      v_now, v_now + interval '5 minutes'
    ) RETURNING * INTO v_operation;
    IF p_operation_type = 'seat_decrease' THEN
      UPDATE private.organization_subscriptions
         SET pending_contracted_seats = p_target_seats,
             pending_seat_change_effective_at = current_period_end,
             updated_at = v_now
       WHERE id = v_subscription.id;
    END IF;
    v_claimed := true;
  END IF;
  RETURN jsonb_build_object(
    'operation_id', v_operation.id, 'operation_type', v_operation.operation_type, 'status', v_operation.status, 'claimed', v_claimed,
    'reused', v_existing.id IS NOT NULL, 'subscription_id', v_operation.stripe_subscription_id,
    'stripe_reference', v_operation.stripe_reference, 'target_seats', v_operation.requested_target_seats
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_clinic_billing_operation(
  p_operation_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_operation private.clinic_billing_operations; v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('prepared', 'processing', 'pending_payment', 'completed', 'failed', 'expired') THEN RAISE EXCEPTION 'invalid billing operation status' USING ERRCODE = '22023'; END IF;
  UPDATE private.clinic_billing_operations
     SET status = p_status,
         completed_at = CASE WHEN p_status = 'completed' THEN clock_timestamp() ELSE completed_at END,
         failed_at = CASE WHEN p_status IN ('failed', 'expired') THEN clock_timestamp() ELSE NULL END,
         error_code = left(p_error_code, 120),
         updated_at = clock_timestamp()
   WHERE id = p_operation_id
  RETURNING * INTO v_operation;
  IF v_operation.id IS NULL THEN RAISE EXCEPTION 'billing operation not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('operation_id', v_operation.id, 'status', v_operation.status, 'stripe_subscription_id', v_operation.stripe_subscription_id, 'target_seats', v_operation.requested_target_seats);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_clinic_billing_operations_for_subscription(
  p_stripe_subscription_id text,
  p_seat_quantity integer,
  p_cancel_at_period_end boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_count integer; v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  UPDATE private.clinic_billing_operations
     SET status = 'completed', completed_at = clock_timestamp(), failed_at = NULL, error_code = NULL, updated_at = clock_timestamp()
   WHERE stripe_subscription_id = p_stripe_subscription_id
     AND status IN ('prepared', 'processing', 'pending_payment')
     AND (
       (operation_type IN ('seat_increase', 'seat_decrease') AND requested_target_seats = p_seat_quantity)
       OR (operation_type = 'cancel_at_period_end' AND p_cancel_at_period_end IS TRUE)
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_clinic_stripe_event(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_stripe_subscription_id text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_event private.clinic_stripe_events;
  v_now timestamptz := clock_timestamp();
  v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  INSERT INTO private.clinic_stripe_events (stripe_event_id, event_type, stripe_created_at, stripe_subscription_id, organization_id, processing_status, processing_started_at)
  VALUES (p_stripe_event_id, p_event_type, p_stripe_created_at, p_stripe_subscription_id, p_organization_id, 'received', v_now)
  ON CONFLICT (stripe_event_id) DO NOTHING;
  SELECT * INTO v_event FROM private.clinic_stripe_events WHERE stripe_event_id = p_stripe_event_id FOR UPDATE;
  IF v_event.event_type <> p_event_type
     OR (v_event.stripe_subscription_id IS NOT NULL AND p_stripe_subscription_id IS NOT NULL AND v_event.stripe_subscription_id <> p_stripe_subscription_id) THEN
    RAISE EXCEPTION 'Stripe event payload mismatch' USING ERRCODE = 'P0003';
  END IF;
  IF v_event.processing_status IN ('processed', 'ignored') THEN
    RETURN jsonb_build_object('duplicate', true, 'claim_status', v_event.processing_status, 'stripe_event_id', v_event.stripe_event_id);
  END IF;
  IF v_event.processing_status = 'processing' AND v_event.processing_started_at IS NOT NULL AND v_event.processing_started_at > v_now - interval '5 minutes' THEN
    RETURN jsonb_build_object('duplicate', true, 'claim_status', 'in_progress', 'stripe_event_id', v_event.stripe_event_id);
  END IF;
  UPDATE private.clinic_stripe_events
     SET processing_status = 'processing',
         processing_started_at = v_now,
         stripe_created_at = COALESCE(p_stripe_created_at, stripe_created_at),
         stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
         organization_id = COALESCE(p_organization_id, organization_id),
         error_code = NULL,
         processed_at = NULL,
         updated_at = v_now
   WHERE stripe_event_id = p_stripe_event_id
  RETURNING * INTO v_event;
  RETURN jsonb_build_object('duplicate', false, 'claimed', true, 'processing_status', v_event.processing_status, 'stripe_event_id', v_event.stripe_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_clinic_stripe_event(
  p_stripe_event_id text,
  p_processing_status text,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_event private.clinic_stripe_events; v_service_role text := COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '');
BEGIN
  IF v_service_role <> 'service_role' THEN RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501'; END IF;
  IF p_processing_status NOT IN ('processed', 'failed', 'ignored') THEN RAISE EXCEPTION 'invalid Stripe event final status' USING ERRCODE = '22023'; END IF;
  UPDATE private.clinic_stripe_events
     SET processing_status = p_processing_status,
         processing_started_at = NULL,
         processed_at = CASE WHEN p_processing_status IN ('processed', 'ignored') THEN clock_timestamp() ELSE NULL END,
         error_code = left(p_error_code, 120), updated_at = clock_timestamp()
   WHERE stripe_event_id = p_stripe_event_id
  RETURNING * INTO v_event;
  IF v_event.stripe_event_id IS NULL THEN RAISE EXCEPTION 'Stripe event not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('stripe_event_id', v_event.stripe_event_id, 'processing_status', v_event.processing_status, 'processed_at', v_event.processed_at);
END;
$$;

REVOKE ALL ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_clinic_billing_operation(uuid, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_clinic_billing_operation(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_clinic_billing_operations_for_subscription(text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_clinic_stripe_event(text, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_clinic_stripe_event(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_clinic_billing_operation(uuid, uuid, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_clinic_billing_operation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_clinic_billing_operations_for_subscription(text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_clinic_stripe_event(text, text, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_clinic_stripe_event(text, text, text) TO service_role;

COMMENT ON TABLE private.clinic_billing_operations IS 'Leased, idempotent Stripe Test Mode commercial operations for clinic billing.';

COMMIT;
