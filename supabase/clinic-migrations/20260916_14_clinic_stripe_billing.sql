-- Fase 2B: Stripe Test Mode para contratos empresariais do Plano Clínica.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS private.clinic_stripe_catalog (
  plan_code text PRIMARY KEY REFERENCES private.clinic_plan_catalog(plan_code) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment = 'test'),
  stripe_base_product_id text NOT NULL CHECK (stripe_base_product_id ~ '^prod_[A-Za-z0-9]+$'),
  stripe_base_price_id text NOT NULL CHECK (stripe_base_price_id ~ '^price_[A-Za-z0-9]+$'),
  stripe_seat_product_id text NOT NULL CHECK (stripe_seat_product_id ~ '^prod_[A-Za-z0-9]+$'),
  stripe_seat_price_id text NOT NULL CHECK (stripe_seat_price_id ~ '^price_[A-Za-z0-9]+$'),
  base_lookup_key text NOT NULL UNIQUE,
  seat_lookup_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE private.clinic_stripe_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_stripe_catalog_no_client_access ON private.clinic_stripe_catalog;
CREATE POLICY clinic_stripe_catalog_no_client_access
  ON private.clinic_stripe_catalog FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE private.clinic_stripe_catalog FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_stripe_catalog TO service_role;

ALTER TABLE private.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_base_subscription_item_id text,
  ADD COLUMN IF NOT EXISTS stripe_seat_subscription_item_id text,
  ADD COLUMN IF NOT EXISTS stripe_base_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_seat_price_id text,
  ADD COLUMN IF NOT EXISTS pending_contracted_seats integer,
  ADD COLUMN IF NOT EXISTS pending_seat_change_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.organization_subscriptions'::regclass AND conname = 'organization_subscriptions_billing_provider_check') THEN
    ALTER TABLE private.organization_subscriptions ADD CONSTRAINT organization_subscriptions_billing_provider_check
      CHECK (billing_provider IS NULL OR billing_provider = 'stripe') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.organization_subscriptions'::regclass AND conname = 'organization_subscriptions_clinic_stripe_linkage') THEN
    ALTER TABLE private.organization_subscriptions ADD CONSTRAINT organization_subscriptions_clinic_stripe_linkage
      CHECK (
        billing_provider IS NULL OR (
          billing_provider = 'stripe'
          AND stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
          AND stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
          AND stripe_base_subscription_item_id ~ '^si_[A-Za-z0-9]+$'
          AND stripe_seat_subscription_item_id ~ '^si_[A-Za-z0-9]+$'
          AND stripe_base_price_id ~ '^price_[A-Za-z0-9]+$'
          AND stripe_seat_price_id ~ '^price_[A-Za-z0-9]+$'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.organization_subscriptions'::regclass AND conname = 'organization_subscriptions_pending_seats_shape') THEN
    ALTER TABLE private.organization_subscriptions ADD CONSTRAINT organization_subscriptions_pending_seats_shape
      CHECK (pending_contracted_seats IS NULL OR pending_contracted_seats >= minimum_contracted_seats)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE private.organization_subscriptions VALIDATE CONSTRAINT organization_subscriptions_billing_provider_check;
ALTER TABLE private.organization_subscriptions VALIDATE CONSTRAINT organization_subscriptions_clinic_stripe_linkage;
ALTER TABLE private.organization_subscriptions VALIDATE CONSTRAINT organization_subscriptions_pending_seats_shape;

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_stripe_subscription_unique
  ON private.organization_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organization_subscriptions_stripe_customer_idx
  ON private.organization_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.assert_clinic_pending_seat_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization_id uuid;
  v_pending integer;
  v_active bigint;
  v_reserved bigint;
BEGIN
  v_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
  IF v_organization_id IS NULL THEN RETURN NULL; END IF;
  SELECT pending_contracted_seats INTO v_pending
    FROM private.organization_subscriptions
   WHERE organization_id = v_organization_id;
  IF v_pending IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_active
    FROM public.organization_memberships
   WHERE organization_id = v_organization_id AND status = 'active' AND clinical_access_enabled IS TRUE;
  SELECT count(*) INTO v_reserved
    FROM public.organization_invitations
   WHERE organization_id = v_organization_id AND status = 'pending'
     AND expires_at > clock_timestamp() AND intended_clinical_access IS TRUE;
  IF v_pending < COALESCE(v_active, 0) + COALESCE(v_reserved, 0) THEN
    RAISE EXCEPTION 'pending contracted seats below current occupancy'
      USING ERRCODE = '23514', DETAIL = 'pending contracted seats must cover active and reserved clinical capacity';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organization_subscriptions_pending_seat_capacity ON private.organization_subscriptions;
CREATE CONSTRAINT TRIGGER organization_subscriptions_pending_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON private.organization_subscriptions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_clinic_pending_seat_capacity();
DROP TRIGGER IF EXISTS organization_memberships_pending_seat_capacity ON public.organization_memberships;
CREATE CONSTRAINT TRIGGER organization_memberships_pending_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_clinic_pending_seat_capacity();
DROP TRIGGER IF EXISTS organization_invitations_pending_seat_capacity ON public.organization_invitations;
CREATE CONSTRAINT TRIGGER organization_invitations_pending_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_clinic_pending_seat_capacity();

CREATE TABLE IF NOT EXISTS private.organization_checkout_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE NO ACTION,
  actor_professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE NO ACTION,
  plan_code text NOT NULL REFERENCES private.clinic_plan_catalog(plan_code) ON DELETE RESTRICT,
  requested_seats integer NOT NULL CHECK (requested_seats >= 3),
  stripe_checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL CHECK (status IN ('started', 'session_created', 'completed', 'activated', 'failed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours')
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_checkout_attempts_open_org
  ON private.organization_checkout_attempts (organization_id)
  WHERE status IN ('started', 'session_created', 'completed');
CREATE UNIQUE INDEX IF NOT EXISTS organization_checkout_attempts_stripe_session
  ON private.organization_checkout_attempts (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organization_checkout_attempts_stripe_subscription
  ON private.organization_checkout_attempts (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
ALTER TABLE private.organization_checkout_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_checkout_attempts_no_client_access ON private.organization_checkout_attempts;
CREATE POLICY organization_checkout_attempts_no_client_access ON private.organization_checkout_attempts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE private.organization_checkout_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.organization_checkout_attempts TO service_role;

CREATE TABLE IF NOT EXISTS private.clinic_stripe_events (
  stripe_event_id text PRIMARY KEY CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text NOT NULL,
  stripe_created_at timestamptz,
  stripe_subscription_id text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE NO ACTION,
  processing_status text NOT NULL CHECK (processing_status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  processed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clinic_stripe_events_subscription_idx ON private.clinic_stripe_events (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS clinic_stripe_events_status_idx ON private.clinic_stripe_events (processing_status, created_at);
ALTER TABLE private.clinic_stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_stripe_events_no_client_access ON private.clinic_stripe_events;
CREATE POLICY clinic_stripe_events_no_client_access ON private.clinic_stripe_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE private.clinic_stripe_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_stripe_events TO service_role;

CREATE TABLE IF NOT EXISTS private.clinic_stripe_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE NO ACTION,
  stripe_invoice_id text NOT NULL UNIQUE CHECK (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_subscription_id text NOT NULL CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'BRL'),
  status text NOT NULL CHECK (status IN ('paid', 'failed', 'void', 'uncollectible')),
  billing_reason text,
  invoice_url text,
  invoice_pdf_url text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.clinic_stripe_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_stripe_transactions_no_client_access ON private.clinic_stripe_transactions;
CREATE POLICY clinic_stripe_transactions_no_client_access ON private.clinic_stripe_transactions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE private.clinic_stripe_transactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_stripe_transactions TO service_role;

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
  v_attempt private.organization_checkout_attempts;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_attempt_id IS NULL OR p_actor_professional_id IS NULL OR p_requested_seats < 3 THEN
    RAISE EXCEPTION 'invalid clinic checkout attempt' USING ERRCODE = '22023';
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
  SELECT * INTO v_existing FROM private.organization_checkout_attempts
   WHERE organization_id = p_organization_id AND status IN ('started', 'session_created', 'completed')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL AND v_existing.id <> p_attempt_id THEN
    RAISE EXCEPTION 'clinic checkout already in progress' USING ERRCODE = '23505';
  END IF;
  INSERT INTO private.organization_checkout_attempts (id, organization_id, actor_professional_id, plan_code, requested_seats, status)
  VALUES (p_attempt_id, p_organization_id, p_actor_professional_id, p_plan_code, p_requested_seats, 'started')
  ON CONFLICT (id) DO UPDATE SET updated_at = clock_timestamp()
  RETURNING * INTO v_attempt;
  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'organization_id', v_attempt.organization_id, 'plan_code', v_attempt.plan_code, 'requested_seats', v_attempt.requested_seats, 'status', v_attempt.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_clinic_seat_change(
  p_organization_id uuid,
  p_actor_professional_id uuid,
  p_target_seats integer
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
  v_operation text;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_role <> 'owner' OR v_subscription.id IS NULL OR v_subscription.billing_provider <> 'stripe'
     OR v_subscription.financial_status <> 'active' OR v_subscription.stripe_subscription_id IS NULL THEN
    RAISE EXCEPTION 'clinic seat change is not authorized' USING ERRCODE = '42501';
  END IF;
  IF private.organization_entitlement_mode(p_organization_id) <> 'full' THEN
    RAISE EXCEPTION 'clinic seat change requires full entitlement' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
  IF p_target_seats < v_subscription.minimum_contracted_seats OR p_target_seats < v_usage.active_seats + v_usage.reserved_seats THEN
    RAISE EXCEPTION 'clinic seat reduction violates current capacity' USING ERRCODE = '23514';
  END IF;
  IF p_target_seats = v_subscription.contracted_seats THEN
    RAISE EXCEPTION 'clinic seat quantity is unchanged' USING ERRCODE = '22023';
  END IF;
  IF p_target_seats < v_subscription.contracted_seats THEN
    v_operation := 'decrease';
    UPDATE private.organization_subscriptions
       SET pending_contracted_seats = p_target_seats,
           pending_seat_change_effective_at = current_period_end,
           updated_at = clock_timestamp()
     WHERE id = v_subscription.id;
  ELSE
    IF v_subscription.pending_contracted_seats IS NOT NULL THEN
      RAISE EXCEPTION 'clinic seat expansion exceeds pending reduction cap' USING ERRCODE = '23514';
    END IF;
    v_operation := 'increase';
  END IF;
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'operation', v_operation,
    'target_seats', p_target_seats,
    'current_seats', v_subscription.contracted_seats,
    'subscription_id', v_subscription.stripe_subscription_id,
    'seat_item_id', v_subscription.stripe_seat_subscription_item_id,
    'current_period_end', v_subscription.current_period_end,
    'pending_contracted_seats', CASE WHEN v_operation = 'decrease' THEN p_target_seats ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_clinic_pending_seat_change(
  p_organization_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_subscription private.organization_subscriptions;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  UPDATE private.organization_subscriptions
     SET pending_contracted_seats = NULL, pending_seat_change_effective_at = NULL, updated_at = clock_timestamp()
   WHERE organization_id = p_organization_id
  RETURNING * INTO v_subscription;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION 'clinic subscription not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'cleared', true, 'reason', left(COALESCE(p_reason, 'stripe update failed'), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_clinic_stripe_subscription(
  p_organization_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_stripe_base_subscription_item_id text,
  p_stripe_seat_subscription_item_id text,
  p_stripe_base_price_id text,
  p_stripe_seat_price_id text,
  p_plan_code text,
  p_billing_interval text,
  p_stripe_status text,
  p_stripe_seat_quantity integer,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_org public.organizations;
  v_catalog private.clinic_plan_catalog;
  v_subscription private.organization_subscriptions;
  v_existing private.organization_subscriptions;
  v_access_mode text;
  v_financial_status text;
  v_grace timestamptz;
  v_contract_seats integer;
  v_pending integer;
  v_effective timestamptz;
  v_owner_count integer;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_stripe_status NOT IN ('active', 'past_due', 'unpaid', 'canceled')
     OR p_stripe_seat_quantity < 3
     OR p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
     OR p_stripe_base_subscription_item_id !~ '^si_[A-Za-z0-9]+$'
     OR p_stripe_seat_subscription_item_id !~ '^si_[A-Za-z0-9]+$'
     OR p_stripe_base_price_id !~ '^price_[A-Za-z0-9]+$'
     OR p_stripe_seat_price_id !~ '^price_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'stripe subscription is not eligible for reconciliation' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_catalog FROM private.clinic_plan_catalog WHERE plan_code = p_plan_code;
  IF v_catalog.plan_code IS NULL OR v_catalog.billing_interval <> p_billing_interval THEN
    RAISE EXCEPTION 'clinic plan mapping is invalid' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.clinic_stripe_catalog c
     WHERE c.plan_code = p_plan_code AND c.environment = 'test'
       AND c.stripe_base_price_id = p_stripe_base_price_id
       AND c.stripe_seat_price_id = p_stripe_seat_price_id
  ) THEN
    RAISE EXCEPTION 'stripe price mapping is invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF v_org.id IS NULL OR v_org.operational_status = 'archived' THEN
    RAISE EXCEPTION 'organization is not eligible for clinic billing' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer INTO v_owner_count FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND membership_role = 'owner' AND status = 'active';
  IF v_owner_count <> 1 THEN RAISE EXCEPTION 'exactly one active owner is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_existing FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_existing.id IS NOT NULL AND v_existing.stripe_subscription_id IS NOT NULL AND v_existing.stripe_subscription_id <> p_stripe_subscription_id THEN
    RAISE EXCEPTION 'different active clinic subscription already linked' USING ERRCODE = '23505';
  END IF;
  IF v_existing.id IS NOT NULL AND (v_existing.plan_code <> p_plan_code OR v_existing.billing_interval <> p_billing_interval) THEN
    RAISE EXCEPTION 'clinic subscription plan cannot change in this phase' USING ERRCODE = 'P0001';
  END IF;
  v_financial_status := p_stripe_status;
  v_grace := v_existing.grace_period_ends_at;
  IF p_stripe_status = 'past_due' THEN
    IF v_existing.financial_status <> 'past_due' OR v_grace IS NULL THEN v_grace := clock_timestamp() + interval '7 days'; END IF;
  ELSE
    v_grace := NULL;
  END IF;
  v_pending := v_existing.pending_contracted_seats;
  v_effective := v_existing.pending_seat_change_effective_at;
  IF v_pending IS NOT NULL AND (v_effective IS NULL OR p_current_period_start IS NULL OR p_current_period_start >= v_effective) THEN
    v_contract_seats := p_stripe_seat_quantity;
    v_pending := NULL;
    v_effective := NULL;
  ELSIF v_existing.id IS NULL OR v_pending IS NULL THEN
    v_contract_seats := p_stripe_seat_quantity;
  ELSE
    v_contract_seats := v_existing.contracted_seats;
  END IF;
  IF v_contract_seats < v_catalog.minimum_contracted_seats THEN
    RAISE EXCEPTION 'stripe seat quantity is below minimum' USING ERRCODE = '23514';
  END IF;
  IF v_existing.id IS NULL THEN
    IF p_stripe_status NOT IN ('active', 'past_due', 'unpaid', 'canceled') THEN
      RAISE EXCEPTION 'initial stripe subscription is not eligible' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO private.organization_subscriptions (
      organization_id, plan_code, billing_interval, currency,
      base_amount_minor, seat_amount_minor, minimum_contracted_seats,
      contracted_seats, financial_status, grace_period_ends_at,
      cancel_at_period_end, current_period_start, current_period_end,
      billing_provider, stripe_customer_id, stripe_subscription_id,
      stripe_base_subscription_item_id, stripe_seat_subscription_item_id,
      stripe_base_price_id, stripe_seat_price_id, canceled_at, last_reconciled_at
    ) VALUES (
      p_organization_id, p_plan_code, v_catalog.billing_interval, v_catalog.currency,
      v_catalog.base_amount_minor, v_catalog.seat_amount_minor, v_catalog.minimum_contracted_seats,
      v_contract_seats, v_financial_status, v_grace, COALESCE(p_cancel_at_period_end, false),
      p_current_period_start, p_current_period_end, 'stripe', p_stripe_customer_id,
      p_stripe_subscription_id, p_stripe_base_subscription_item_id, p_stripe_seat_subscription_item_id,
      p_stripe_base_price_id, p_stripe_seat_price_id,
      CASE WHEN p_stripe_status = 'canceled' THEN clock_timestamp() ELSE NULL END, clock_timestamp()
    ) RETURNING * INTO v_subscription;
  ELSE
    UPDATE private.organization_subscriptions
       SET financial_status = v_financial_status,
           grace_period_ends_at = v_grace,
           cancel_at_period_end = COALESCE(p_cancel_at_period_end, false),
           current_period_start = p_current_period_start,
           current_period_end = p_current_period_end,
           contracted_seats = v_contract_seats,
           pending_contracted_seats = v_pending,
           pending_seat_change_effective_at = v_effective,
           billing_provider = 'stripe',
           stripe_customer_id = p_stripe_customer_id,
           stripe_subscription_id = p_stripe_subscription_id,
           stripe_base_subscription_item_id = p_stripe_base_subscription_item_id,
           stripe_seat_subscription_item_id = p_stripe_seat_subscription_item_id,
           stripe_base_price_id = p_stripe_base_price_id,
           stripe_seat_price_id = p_stripe_seat_price_id,
           canceled_at = CASE WHEN p_stripe_status = 'canceled' THEN COALESCE(canceled_at, clock_timestamp()) ELSE canceled_at END,
           last_reconciled_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = v_existing.id
     RETURNING * INTO v_subscription;
  END IF;
  v_access_mode := private.organization_subscription_access_mode(p_organization_id);
  IF v_org.operational_status = 'pending_setup' AND p_stripe_status = 'active' AND v_access_mode = 'full' THEN
    PERFORM public.set_organization_clinic_rollout_state(p_organization_id, true, 'stripe clinic subscription reconciled');
  END IF;
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'subscription_id', v_subscription.id,
    'stripe_subscription_id', v_subscription.stripe_subscription_id,
    'financial_status', v_subscription.financial_status,
    'grace_period_ends_at', v_subscription.grace_period_ends_at,
    'contracted_seats', v_subscription.contracted_seats,
    'pending_contracted_seats', v_subscription.pending_contracted_seats,
    'entitlement_mode', private.organization_entitlement_mode(p_organization_id),
    'operational_status', (SELECT operational_status FROM public.organizations WHERE id = p_organization_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.assert_clinic_pending_seat_capacity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_clinic_seat_change(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_clinic_pending_seat_change(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_clinic_stripe_subscription(uuid, text, text, text, text, text, text, text, text, text, integer, timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_clinic_checkout_attempt(uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_clinic_seat_change(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_clinic_pending_seat_change(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_clinic_stripe_subscription(uuid, text, text, text, text, text, text, text, text, text, integer, timestamptz, timestamptz, boolean) TO service_role;

COMMENT ON TABLE private.clinic_stripe_catalog IS 'Stripe Test Mode catalog mapping for clinic billing; never exposed to clients.';
COMMENT ON TABLE private.clinic_stripe_events IS 'Idempotent Stripe Test Mode event ledger for clinic billing.';
COMMENT ON TABLE private.organization_checkout_attempts IS 'Server-side clinic checkout attempts; individual checkout_attempts remains separate.';

COMMIT;
