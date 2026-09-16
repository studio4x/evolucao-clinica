-- Fase 2B.1: wrappers server-side para as estruturas privadas de billing.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_clinic_stripe_catalog(p_plan_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_catalog record;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT c.plan_code, c.billing_interval, c.currency, c.base_amount_minor,
         c.seat_amount_minor, c.minimum_contracted_seats, c.enabled,
         s.environment, s.stripe_base_product_id, s.stripe_base_price_id,
         s.stripe_seat_product_id, s.stripe_seat_price_id,
         s.base_lookup_key, s.seat_lookup_key
    INTO v_catalog
    FROM private.clinic_plan_catalog c
    JOIN private.clinic_stripe_catalog s ON s.plan_code = c.plan_code AND s.environment = 'test'
   WHERE c.plan_code = p_plan_code;
  IF v_catalog.plan_code IS NULL THEN
    RAISE EXCEPTION 'clinic Stripe catalog entry not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(v_catalog);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_clinic_checkout_attempt(
  p_attempt_id uuid,
  p_status text,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_stripe_customer_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL
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
  IF p_status NOT IN ('started', 'session_created', 'completed', 'activated', 'failed', 'expired') THEN
    RAISE EXCEPTION 'invalid checkout attempt status' USING ERRCODE = '22023';
  END IF;
  UPDATE private.organization_checkout_attempts
     SET status = p_status,
         stripe_checkout_session_id = COALESCE(p_stripe_checkout_session_id, stripe_checkout_session_id),
         stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
         stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
         updated_at = clock_timestamp()
   WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;
  IF v_attempt.id IS NULL THEN RAISE EXCEPTION 'clinic checkout attempt not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'status', v_attempt.status, 'organization_id', v_attempt.organization_id, 'stripe_checkout_session_id', v_attempt.stripe_checkout_session_id, 'stripe_subscription_id', v_attempt.stripe_subscription_id);
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
DECLARE v_event private.clinic_stripe_events;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.clinic_stripe_events (stripe_event_id, event_type, stripe_created_at, stripe_subscription_id, organization_id, processing_status)
  VALUES (p_stripe_event_id, p_event_type, p_stripe_created_at, p_stripe_subscription_id, p_organization_id, 'received')
  ON CONFLICT (stripe_event_id) DO NOTHING;
  SELECT * INTO v_event FROM private.clinic_stripe_events WHERE stripe_event_id = p_stripe_event_id FOR UPDATE;
  IF v_event.processing_status IN ('processed', 'ignored') THEN
    RETURN jsonb_build_object('duplicate', true, 'processing_status', v_event.processing_status, 'stripe_event_id', v_event.stripe_event_id);
  END IF;
  UPDATE private.clinic_stripe_events
     SET processing_status = 'processing',
         event_type = p_event_type,
         stripe_created_at = COALESCE(p_stripe_created_at, stripe_created_at),
         stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
         organization_id = COALESCE(p_organization_id, organization_id),
         error_code = NULL,
         updated_at = clock_timestamp()
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
DECLARE v_event private.clinic_stripe_events;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_processing_status NOT IN ('processed', 'failed', 'ignored') THEN
    RAISE EXCEPTION 'invalid Stripe event final status' USING ERRCODE = '22023';
  END IF;
  UPDATE private.clinic_stripe_events
     SET processing_status = p_processing_status,
         processed_at = CASE WHEN p_processing_status IN ('processed', 'ignored') THEN clock_timestamp() ELSE processed_at END,
         error_code = left(p_error_code, 120), updated_at = clock_timestamp()
   WHERE stripe_event_id = p_stripe_event_id
  RETURNING * INTO v_event;
  IF v_event.stripe_event_id IS NULL THEN RAISE EXCEPTION 'Stripe event not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('stripe_event_id', v_event.stripe_event_id, 'processing_status', v_event.processing_status, 'processed_at', v_event.processed_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_clinic_stripe_transaction(
  p_organization_id uuid,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_amount_minor integer,
  p_currency text,
  p_status text,
  p_billing_reason text DEFAULT NULL,
  p_invoice_url text DEFAULT NULL,
  p_invoice_pdf_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_transaction private.clinic_stripe_transactions;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_currency IS NULL OR upper(p_currency) <> 'BRL' OR p_status NOT IN ('paid', 'failed', 'void', 'uncollectible') THEN
    RAISE EXCEPTION 'invalid clinic transaction' USING ERRCODE = '22023';
  END IF;
  INSERT INTO private.clinic_stripe_transactions (organization_id, stripe_invoice_id, stripe_subscription_id, amount_minor, currency, status, billing_reason, invoice_url, invoice_pdf_url)
  VALUES (p_organization_id, p_stripe_invoice_id, p_stripe_subscription_id, p_amount_minor, upper(p_currency), p_status, left(p_billing_reason, 120), left(p_invoice_url, 1000), left(p_invoice_pdf_url, 1000))
  ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = EXCLUDED.status, amount_minor = EXCLUDED.amount_minor, billing_reason = EXCLUDED.billing_reason, invoice_url = EXCLUDED.invoice_url, invoice_pdf_url = EXCLUDED.invoice_pdf_url, updated_at = clock_timestamp()
  RETURNING * INTO v_transaction;
  RETURN jsonb_build_object('id', v_transaction.id, 'organization_id', v_transaction.organization_id, 'stripe_invoice_id', v_transaction.stripe_invoice_id, 'status', v_transaction.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_clinic_billing_status(
  p_organization_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_org public.organizations;
  v_subscription private.organization_subscriptions;
  v_role text;
  v_usage record;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id;
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  IF v_org.id IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'clinic billing authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id;
  SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'organization_name', v_org.name,
    'operational_status', v_org.operational_status,
    'role', v_role,
    'subscription', CASE WHEN v_subscription.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_subscription.id, 'plan_code', v_subscription.plan_code, 'billing_interval', v_subscription.billing_interval,
      'currency', v_subscription.currency, 'base_amount_minor', v_subscription.base_amount_minor, 'seat_amount_minor', v_subscription.seat_amount_minor,
      'minimum_contracted_seats', v_subscription.minimum_contracted_seats, 'contracted_seats', v_subscription.contracted_seats,
      'financial_status', v_subscription.financial_status, 'grace_period_ends_at', v_subscription.grace_period_ends_at,
      'cancel_at_period_end', v_subscription.cancel_at_period_end, 'current_period_start', v_subscription.current_period_start,
      'current_period_end', v_subscription.current_period_end, 'pending_contracted_seats', v_subscription.pending_contracted_seats,
      'pending_seat_change_effective_at', v_subscription.pending_seat_change_effective_at,
      'canceled_at', v_subscription.canceled_at, 'last_reconciled_at', v_subscription.last_reconciled_at
    ) END,
    'seats', jsonb_build_object('contracted_seats', v_usage.contracted_seats, 'active_seats', v_usage.active_seats, 'reserved_seats', v_usage.reserved_seats, 'available_seats', v_usage.available_seats),
    'entitlement_mode', private.organization_entitlement_mode(p_organization_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_stripe_catalog(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_clinic_checkout_attempt(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_clinic_stripe_event(text, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_clinic_stripe_event(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_clinic_stripe_transaction(uuid, text, text, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_clinic_billing_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinic_stripe_catalog(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_clinic_checkout_attempt(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_clinic_stripe_event(text, text, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_clinic_stripe_event(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_clinic_stripe_transaction(uuid, text, text, integer, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clinic_billing_status(uuid, uuid) TO service_role;

COMMIT;
