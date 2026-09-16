-- Fase 2A: entitlement empresarial, capacidade clínica e seats derivados.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS private.clinic_plan_catalog (
  plan_code text PRIMARY KEY,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  currency text NOT NULL CHECK (currency = 'BRL'),
  base_amount_minor integer NOT NULL CHECK (base_amount_minor >= 0),
  seat_amount_minor integer NOT NULL CHECK (seat_amount_minor >= 0),
  minimum_contracted_seats integer NOT NULL CHECK (minimum_contracted_seats >= 3),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT clinic_plan_catalog_code_interval CHECK (
    (plan_code = 'clinic_monthly' AND billing_interval = 'monthly')
    OR (plan_code = 'clinic_yearly' AND billing_interval = 'annual')
  )
);

INSERT INTO private.clinic_plan_catalog (
  plan_code, billing_interval, currency, base_amount_minor, seat_amount_minor,
  minimum_contracted_seats, enabled
)
VALUES
  ('clinic_monthly', 'monthly', 'BRL', 4990, 2990, 3, true),
  ('clinic_yearly', 'annual', 'BRL', 49900, 29900, 3, true)
ON CONFLICT (plan_code) DO UPDATE
SET billing_interval = EXCLUDED.billing_interval,
    currency = EXCLUDED.currency,
    base_amount_minor = EXCLUDED.base_amount_minor,
    seat_amount_minor = EXCLUDED.seat_amount_minor,
    minimum_contracted_seats = EXCLUDED.minimum_contracted_seats,
    enabled = EXCLUDED.enabled,
    updated_at = clock_timestamp();

CREATE TABLE IF NOT EXISTS private.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE
    REFERENCES public.organizations(id) ON DELETE NO ACTION,
  plan_code text NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  currency text NOT NULL CHECK (currency = 'BRL'),
  base_amount_minor integer NOT NULL CHECK (base_amount_minor >= 0),
  seat_amount_minor integer NOT NULL CHECK (seat_amount_minor >= 0),
  minimum_contracted_seats integer NOT NULL CHECK (minimum_contracted_seats >= 3),
  contracted_seats integer NOT NULL CHECK (contracted_seats >= 3),
  financial_status text NOT NULL CHECK (financial_status IN ('active', 'past_due', 'canceled', 'unpaid')),
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT organization_subscriptions_minimum_consistency CHECK (
    minimum_contracted_seats >= 3 AND contracted_seats >= minimum_contracted_seats
  ),
  CONSTRAINT organization_subscriptions_period_order CHECK (
    current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start
  )
);

CREATE INDEX IF NOT EXISTS organization_subscriptions_by_status
  ON private.organization_subscriptions (financial_status, current_period_end);

ALTER TABLE private.clinic_plan_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.organization_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_plan_catalog_no_client_access ON private.clinic_plan_catalog;
CREATE POLICY clinic_plan_catalog_no_client_access
  ON private.clinic_plan_catalog FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS organization_subscriptions_no_client_access ON private.organization_subscriptions;
CREATE POLICY organization_subscriptions_no_client_access
  ON private.organization_subscriptions FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE private.clinic_plan_catalog FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.organization_subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_plan_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.organization_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION private.organization_entitlement_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT CASE
    WHEN o.id IS NULL OR o.operational_status = 'archived' THEN 'none'
    WHEN o.operational_status NOT IN ('active', 'restricted') THEN 'none'
    WHEN s.id IS NULL THEN 'none'
    WHEN NOT EXISTS (
      SELECT 1
        FROM private.clinic_plan_catalog AS catalog
       WHERE catalog.plan_code = s.plan_code
         AND catalog.enabled IS TRUE
         AND catalog.billing_interval = s.billing_interval
         AND catalog.currency = s.currency
         AND catalog.base_amount_minor = s.base_amount_minor
         AND catalog.seat_amount_minor = s.seat_amount_minor
         AND catalog.minimum_contracted_seats = s.minimum_contracted_seats
    ) THEN 'none'
    WHEN o.operational_status = 'active'
      AND s.financial_status = 'active'
      AND (NOT s.cancel_at_period_end OR s.current_period_end IS NULL OR s.current_period_end > now())
      THEN 'full'
    WHEN o.operational_status = 'active'
      AND s.financial_status = 'past_due'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at > now()
      THEN 'full'
    ELSE 'restricted'
  END
  FROM (SELECT id, operational_status FROM public.organizations WHERE id = p_organization_id) AS o
  FULL JOIN (SELECT id, plan_code, billing_interval, currency, base_amount_minor, seat_amount_minor,
                    minimum_contracted_seats, financial_status, grace_period_ends_at,
                    cancel_at_period_end, current_period_end
               FROM private.organization_subscriptions AS subscription
              WHERE subscription.organization_id = p_organization_id) AS s
    ON true;
$$;

CREATE OR REPLACE FUNCTION private.can_access_organization_workspace(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND (SELECT private.is_clinic_feature_enabled(p_organization_id))
     AND (SELECT private.organization_entitlement_mode(p_organization_id)) IN ('full', 'restricted')
     AND EXISTS (
       SELECT 1
         FROM public.organization_memberships AS m
        WHERE m.organization_id = p_organization_id
          AND m.professional_id = (SELECT auth.uid())
          AND m.status = 'active'
     );
$$;

CREATE OR REPLACE FUNCTION private.can_expand_organization(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT private.can_access_organization_workspace(p_organization_id))
     AND (SELECT private.organization_entitlement_mode(p_organization_id)) = 'full';
$$;

CREATE OR REPLACE FUNCTION public.get_organization_team(
  p_organization_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  professional_id uuid,
  full_name text,
  professional_title text,
  membership_role text,
  status text,
  clinical_access_enabled boolean,
  joined_at timestamptz,
  suspended_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_actor_role text;
BEGIN
  IF v_actor IS NULL OR NOT private.can_access_organization_workspace(p_organization_id) THEN
    RAISE EXCEPTION 'authenticated team access required' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'team directory authorization required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.professional_id, p.full_name, p.professional_title,
         m.membership_role, m.status, m.clinical_access_enabled,
         m.joined_at, m.suspended_at
    FROM public.organization_memberships AS m
    JOIN public.professionals AS p ON p.id = m.professional_id
   WHERE m.organization_id = p_organization_id
     AND m.status IN ('active', 'suspended')
   ORDER BY CASE m.membership_role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
            lower(coalesce(p.full_name, '')), m.joined_at, m.id;
END;
$$;

CREATE OR REPLACE FUNCTION private.has_clinical_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT private.is_clinic_feature_enabled(p_organization_id))
     AND (SELECT private.organization_entitlement_mode(p_organization_id)) = 'full'
     AND EXISTS (
       SELECT 1 FROM public.organization_memberships AS m
        WHERE m.organization_id = p_organization_id
          AND m.professional_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.clinical_access_enabled IS TRUE
     );
$$;

CREATE OR REPLACE FUNCTION private.get_organization_seat_usage(p_organization_id uuid)
RETURNS TABLE (
  contracted_seats integer,
  active_seats bigint,
  reserved_seats bigint,
  available_seats bigint
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT
    COALESCE(s.contracted_seats, 0),
    (SELECT count(*) FROM public.organization_memberships AS m
      WHERE m.organization_id = p_organization_id
        AND m.status = 'active'
        AND m.clinical_access_enabled IS TRUE),
    (SELECT count(*) FROM public.organization_invitations AS i
      WHERE i.organization_id = p_organization_id
        AND i.status = 'pending'
        AND i.expires_at > clock_timestamp()
        AND i.intended_clinical_access IS TRUE),
    COALESCE(s.contracted_seats, 0)::bigint
      - (SELECT count(*) FROM public.organization_memberships AS m
          WHERE m.organization_id = p_organization_id
            AND m.status = 'active'
            AND m.clinical_access_enabled IS TRUE)
      - (SELECT count(*) FROM public.organization_invitations AS i
          WHERE i.organization_id = p_organization_id
            AND i.status = 'pending'
            AND i.expires_at > clock_timestamp()
            AND i.intended_clinical_access IS TRUE)
  FROM (SELECT contracted_seats FROM private.organization_subscriptions
         WHERE organization_id = p_organization_id) AS s;
$$;

CREATE OR REPLACE FUNCTION private.assert_organization_seat_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization_id uuid;
  v_contracted integer;
  v_active bigint;
  v_reserved bigint;
BEGIN
  v_organization_id := CASE TG_TABLE_NAME
    WHEN 'organization_subscriptions' THEN COALESCE(NEW.organization_id, OLD.organization_id)
    ELSE COALESCE(NEW.organization_id, OLD.organization_id)
  END;
  IF v_organization_id IS NULL THEN RETURN NULL; END IF;

  SELECT s.contracted_seats INTO v_contracted
    FROM private.organization_subscriptions AS s
   WHERE s.organization_id = v_organization_id;
  SELECT count(*) INTO v_active
    FROM public.organization_memberships AS m
   WHERE m.organization_id = v_organization_id
     AND m.status = 'active'
     AND m.clinical_access_enabled IS TRUE;
  SELECT count(*) INTO v_reserved
    FROM public.organization_invitations AS i
   WHERE i.organization_id = v_organization_id
     AND i.status = 'pending'
     AND i.expires_at > clock_timestamp()
     AND i.intended_clinical_access IS TRUE;

  IF COALESCE(v_active, 0) + COALESCE(v_reserved, 0) > COALESCE(v_contracted, 0) THEN
    RAISE EXCEPTION 'organization seat capacity exceeded'
      USING ERRCODE = '23514', DETAIL = 'active clinical memberships plus valid clinical invitations exceed contracted seats';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organization_memberships_seat_capacity ON public.organization_memberships;
CREATE CONSTRAINT TRIGGER organization_memberships_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_organization_seat_capacity();
DROP TRIGGER IF EXISTS organization_invitations_seat_capacity ON public.organization_invitations;
CREATE CONSTRAINT TRIGGER organization_invitations_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_organization_seat_capacity();
DROP TRIGGER IF EXISTS organization_subscriptions_seat_capacity ON private.organization_subscriptions;
CREATE CONSTRAINT TRIGGER organization_subscriptions_seat_capacity
AFTER INSERT OR UPDATE OR DELETE ON private.organization_subscriptions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_organization_seat_capacity();

CREATE OR REPLACE FUNCTION public.get_organization_seat_summary(p_organization_id uuid)
RETURNS TABLE (
  organization_id uuid,
  plan_code text,
  billing_interval text,
  contracted_seats integer,
  active_seats bigint,
  reserved_seats bigint,
  available_seats bigint,
  minimum_contracted_seats integer,
  financial_status text,
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean,
  entitlement_mode text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_subscription private.organization_subscriptions;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.can_access_organization_workspace(p_organization_id)) THEN
    RAISE EXCEPTION 'organization seat summary authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_role FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id AND m.professional_id = v_actor AND m.status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'administrative seat summary authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_subscription FROM private.organization_subscriptions AS subscription
   WHERE subscription.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization entitlement unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p_organization_id, v_subscription.plan_code, v_subscription.billing_interval,
         u.contracted_seats, u.active_seats, u.reserved_seats, u.available_seats,
         v_subscription.minimum_contracted_seats, v_subscription.financial_status,
         v_subscription.grace_period_ends_at, v_subscription.cancel_at_period_end,
         private.organization_entitlement_mode(p_organization_id)
    FROM private.get_organization_seat_usage(p_organization_id) AS u;
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_organization_member_clinical_access(
  p_organization_id uuid,
  p_target_professional_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_target public.organization_memberships;
  v_subscription private.organization_subscriptions;
  v_usage record;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_clinic_feature_enabled(p_organization_id))
     OR (SELECT private.organization_entitlement_mode(p_organization_id)) <> 'full' THEN
    RAISE EXCEPTION 'clinical access cannot be enabled' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active' AND membership_role = 'owner') THEN
    RAISE EXCEPTION 'active owner authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization entitlement unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_target FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active target membership required' USING ERRCODE = '42501'; END IF;
  IF v_target.clinical_access_enabled IS TRUE THEN RETURN v_target; END IF;
  SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
  IF v_usage.available_seats < 1 THEN
    RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.organization_memberships SET clinical_access_enabled = true, updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_clinical_access_enabled', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, NULL, NULL, 'false', 'true', p_reason);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_organization_member_clinical_access(
  p_organization_id uuid,
  p_target_professional_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_target public.organization_memberships;
  v_mode text;
BEGIN
  v_mode := private.organization_entitlement_mode(p_organization_id);
  IF v_actor IS NULL OR NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) OR v_mode NOT IN ('full', 'restricted') THEN
    RAISE EXCEPTION 'clinical access cannot be disabled' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active' AND membership_role = 'owner') THEN
    RAISE EXCEPTION 'active owner authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status IN ('active', 'suspended') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target membership required' USING ERRCODE = '42501'; END IF;
  IF v_target.clinical_access_enabled IS FALSE THEN RETURN v_target; END IF;
  UPDATE public.organization_memberships SET clinical_access_enabled = false, updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_clinical_access_disabled', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, NULL, NULL, 'true', 'false', p_reason);
  RETURN v_target;
END;
$$;

ALTER TABLE private.organization_admin_events DROP CONSTRAINT IF EXISTS organization_admin_events_event_type_check;
ALTER TABLE private.organization_admin_events ADD CONSTRAINT organization_admin_events_event_type_check CHECK (event_type IN (
  'organization_created', 'organization_rollout_enabled', 'organization_rollout_disabled', 'owner_transferred',
  'member_suspended', 'member_reactivated', 'member_removed', 'member_role_changed',
  'member_clinical_access_enabled', 'member_clinical_access_disabled',
  'invitation_created', 'invitation_revoked', 'invitation_accepted', 'invitation_expired'
));

DROP POLICY IF EXISTS organizations_select_feature_member ON public.organizations;
DROP POLICY IF EXISTS organizations_select_entitled_member ON public.organizations;
CREATE POLICY organizations_select_entitled_member ON public.organizations FOR SELECT TO authenticated
  USING ((SELECT private.can_access_organization_workspace(id)));
DROP POLICY IF EXISTS memberships_select_feature_member ON public.organization_memberships;
DROP POLICY IF EXISTS memberships_select_entitled_member ON public.organization_memberships;
CREATE POLICY memberships_select_entitled_member ON public.organization_memberships FOR SELECT TO authenticated
  USING ((SELECT private.can_access_organization_workspace(organization_id)));

CREATE OR REPLACE FUNCTION public.set_organization_clinic_rollout_state(
  p_organization_id uuid, p_enabled boolean, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization public.organizations;
  v_flag public.organization_feature_flags;
  v_owner_count integer;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_organization FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR p_reason IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'organization and reason are required' USING ERRCODE = '22023'; END IF;
  IF p_enabled IS TRUE THEN
    IF NOT private.is_clinic_global_enabled() OR v_organization.operational_status IN ('restricted', 'archived') THEN RAISE EXCEPTION 'organization rollout cannot be enabled' USING ERRCODE = '42501'; END IF;
    SELECT count(*)::integer INTO v_owner_count FROM public.organization_memberships WHERE organization_id = p_organization_id AND membership_role = 'owner' AND status = 'active';
    IF v_owner_count <> 1 OR NOT EXISTS (SELECT 1 FROM private.organization_subscriptions WHERE organization_id = p_organization_id AND financial_status IN ('active', 'past_due') AND (financial_status = 'active' OR (grace_period_ends_at IS NOT NULL AND grace_period_ends_at > now()))) THEN
      RAISE EXCEPTION 'funded organization entitlement required' USING ERRCODE = '42501';
    END IF;
    IF v_organization.operational_status = 'pending_setup' THEN UPDATE public.organizations SET operational_status = 'active', updated_at = clock_timestamp() WHERE id = p_organization_id; END IF;
  END IF;
  INSERT INTO public.organization_feature_flags (organization_id, feature_key, enabled, created_by, created_by_type, reason)
  VALUES (p_organization_id, 'clinic', p_enabled, NULL, 'service_role', left(btrim(p_reason), 500))
  ON CONFLICT (organization_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, created_by = NULL, created_by_type = 'service_role', reason = EXCLUDED.reason, updated_at = clock_timestamp()
  RETURNING * INTO v_flag;
  PERFORM private.record_organization_admin_event(CASE WHEN p_enabled THEN 'organization_rollout_enabled' ELSE 'organization_rollout_disabled' END, p_organization_id, 'service_role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_reason);
  RETURN jsonb_build_object('organization_id', p_organization_id, 'enabled', p_enabled, 'operational_status', (SELECT operational_status FROM public.organizations WHERE id = p_organization_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id uuid, p_email text, p_intended_role text, p_intended_clinical_access boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid()); v_actor_role text; v_token text; v_invitation public.organization_invitations; v_subscription private.organization_subscriptions; v_usage record; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_actor IS NULL OR NOT private.can_expand_organization(p_organization_id) THEN RAISE EXCEPTION 'organization cannot accept invitations' USING ERRCODE = '42501'; END IF;
  SELECT m.membership_role INTO v_actor_role FROM public.organization_memberships m WHERE m.organization_id = p_organization_id AND m.professional_id = v_actor AND m.status = 'active';
  IF v_actor_role NOT IN ('owner', 'manager') OR (v_actor_role = 'manager' AND p_intended_role <> 'professional') THEN RAISE EXCEPTION 'invitation issuer authorization required' USING ERRCODE = '42501'; END IF;
  IF p_intended_role NOT IN ('manager', 'professional') OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR char_length(v_email) > 320 THEN RAISE EXCEPTION 'invitation input is invalid' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  PERFORM private.enforce_clinic_invitation_rate_limit(p_organization_id, v_actor, v_email);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || v_email, 0));
  UPDATE public.organization_invitations SET status = 'expired', updated_at = clock_timestamp() WHERE organization_id = p_organization_id AND normalized_email = v_email AND status = 'pending' AND expires_at <= clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.organization_invitations WHERE organization_id = p_organization_id AND normalized_email = v_email AND status = 'pending' AND expires_at > clock_timestamp()) THEN RAISE EXCEPTION 'pending invitation already exists' USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships m JOIN auth.users u ON u.id = m.professional_id WHERE m.organization_id = p_organization_id AND lower(btrim(u.email)) = v_email AND m.status IN ('active', 'suspended')) THEN RAISE EXCEPTION 'invitation cannot be issued for this recipient' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_intended_clinical_access, false) IS TRUE THEN
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF v_usage.available_seats < 1 THEN RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001'; END IF;
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.organization_invitations (organization_id, normalized_email, intended_role, intended_clinical_access, token_hash, status, expires_at, invited_by)
  VALUES (p_organization_id, v_email, p_intended_role, coalesce(p_intended_clinical_access, false), extensions.digest(v_token, 'sha256'), 'pending', clock_timestamp() + interval '72 hours', v_actor)
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event('invitation_created', p_organization_id, 'authenticated', v_actor, NULL, NULL, v_invitation.id, NULL, NULL, NULL, 'pending', NULL);
  RETURN jsonb_build_object('invitation_id', v_invitation.id, 'organization_id', v_invitation.organization_id, 'normalized_email', v_invitation.normalized_email, 'intended_role', v_invitation.intended_role, 'intended_clinical_access', v_invitation.intended_clinical_access, 'expires_at', v_invitation.expires_at, 'status', 'pending', 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_invitation(p_invitation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_role text; v_invitation public.organization_invitations; v_org public.organizations;
BEGIN
  SELECT i.* INTO v_invitation FROM public.organization_invitations i WHERE i.id = p_invitation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_invitation.organization_id FOR UPDATE;
  IF NOT private.can_access_organization_workspace(v_invitation.organization_id) THEN RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501'; END IF;
  SELECT membership_role INTO v_role FROM public.organization_memberships WHERE organization_id = v_invitation.organization_id AND professional_id = v_actor AND status = 'active';
  IF v_role NOT IN ('owner', 'manager') OR (v_role = 'manager' AND v_invitation.intended_role <> 'professional') THEN RAISE EXCEPTION 'invitation revocation authorization required' USING ERRCODE = '42501'; END IF;
  SELECT i.* INTO v_invitation FROM public.organization_invitations i WHERE i.id = p_invitation_id FOR UPDATE;
  IF v_invitation.status = 'pending' AND v_invitation.expires_at <= clock_timestamp() THEN UPDATE public.organization_invitations SET status = 'expired', updated_at = clock_timestamp() WHERE id = v_invitation.id; RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired'); END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501'; END IF;
  UPDATE public.organization_invitations SET status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = v_invitation.id RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event('invitation_revoked', v_invitation.organization_id, 'authenticated', v_actor, NULL, NULL, v_invitation.id, NULL, NULL, 'pending', 'revoked', NULL);
  RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'revoked', 'revoked_at', v_invitation.revoked_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_raw_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_email text; v_invitation public.organization_invitations; v_org public.organizations; v_subscription private.organization_subscriptions; v_membership public.organization_memberships;
BEGIN
  IF v_actor IS NULL OR p_raw_token IS NULL OR char_length(p_raw_token) <> 64 THEN RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(email)) INTO v_email FROM auth.users WHERE id = v_actor;
  SELECT * INTO v_invitation FROM public.organization_invitations WHERE token_hash = extensions.digest(p_raw_token, 'sha256');
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_invitation.organization_id FOR UPDATE;
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = v_invitation.organization_id FOR UPDATE;
  SELECT * INTO v_invitation FROM public.organization_invitations WHERE id = v_invitation.id FOR UPDATE;
  IF v_invitation.status <> 'pending' OR v_invitation.expires_at <= clock_timestamp() OR v_email IS NULL OR v_email <> v_invitation.normalized_email OR NOT private.is_clinic_feature_enabled(v_invitation.organization_id) OR private.organization_entitlement_mode(v_invitation.organization_id) <> 'full' THEN
    IF v_invitation.status = 'pending' AND v_invitation.expires_at <= clock_timestamp() THEN UPDATE public.organization_invitations SET status = 'expired', updated_at = clock_timestamp() WHERE id = v_invitation.id; END IF;
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actor AND email_confirmed_at IS NOT NULL) OR NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = v_invitation.organization_id AND professional_id = v_actor AND status <> 'removed') THEN RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501'; END IF;
  IF v_invitation.intended_clinical_access IS TRUE THEN
    -- The valid pending invitation owns the reservation; no second free seat is required.
    INSERT INTO public.organization_memberships (organization_id, professional_id, membership_role, status, clinical_access_enabled, created_by)
    VALUES (v_invitation.organization_id, v_actor, v_invitation.intended_role, 'active', true, v_invitation.invited_by) RETURNING * INTO v_membership;
  ELSE
    INSERT INTO public.organization_memberships (organization_id, professional_id, membership_role, status, clinical_access_enabled, created_by)
    VALUES (v_invitation.organization_id, v_actor, v_invitation.intended_role, 'active', false, v_invitation.invited_by) RETURNING * INTO v_membership;
  END IF;
  UPDATE public.organization_invitations SET status = 'accepted', accepted_by = v_actor, accepted_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = v_invitation.id RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event('invitation_accepted', v_invitation.organization_id, 'authenticated', v_actor, v_actor, v_membership.id, v_invitation.id, NULL, NULL, 'pending', 'accepted', NULL);
  RETURN jsonb_build_object('invitation_id', v_invitation.id, 'organization_id', v_membership.organization_id, 'membership_id', v_membership.id, 'membership_role', v_membership.membership_role, 'status', 'accepted', 'intended_clinical_access', v_invitation.intended_clinical_access, 'clinical_access_enabled', v_membership.clinical_access_enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_organization_member(p_organization_id uuid, p_target_professional_id uuid, p_reason text DEFAULT NULL)
RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_actor_role text; v_target public.organization_memberships; v_subscription private.organization_subscriptions; v_usage record;
BEGIN
  IF v_actor IS NULL OR NOT private.is_clinic_feature_enabled(p_organization_id) THEN RAISE EXCEPTION 'membership reactivation authorization required' USING ERRCODE = '42501'; END IF;
  SELECT membership_role INTO v_actor_role FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN RAISE EXCEPTION 'membership reactivation authorization required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_target FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status = 'suspended' FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' OR (v_actor_role = 'manager' AND v_target.membership_role <> 'professional') THEN RAISE EXCEPTION 'membership cannot be reactivated' USING ERRCODE = '42501'; END IF;
  IF NOT private.can_expand_organization(p_organization_id) THEN RAISE EXCEPTION 'restricted organization cannot reactivate membership' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_target.clinical_access_enabled IS TRUE THEN
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF v_usage.available_seats < 1 THEN RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001'; END IF;
  END IF;
  UPDATE public.organization_memberships SET status = 'active', suspended_at = NULL, updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_reactivated', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, NULL, NULL, 'suspended', 'active', p_reason);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_organization_member(p_organization_id uuid, p_target_professional_id uuid, p_reason text DEFAULT NULL)
RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_actor_role text; v_target public.organization_memberships;
BEGIN
  IF v_actor IS NULL OR p_target_professional_id = v_actor OR NOT private.can_access_organization_workspace(p_organization_id) THEN RAISE EXCEPTION 'membership suspension authorization required' USING ERRCODE = '42501'; END IF;
  SELECT membership_role INTO v_actor_role FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active';
  SELECT * INTO v_target FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status = 'active' FOR UPDATE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') OR NOT FOUND OR v_target.membership_role = 'owner' OR (v_actor_role = 'manager' AND v_target.membership_role <> 'professional') THEN RAISE EXCEPTION 'membership cannot be suspended' USING ERRCODE = '42501'; END IF;
  UPDATE public.organization_memberships SET status = 'suspended', suspended_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_suspended', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, NULL, NULL, 'active', 'suspended', p_reason);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_member(p_organization_id uuid, p_target_professional_id uuid, p_reason text DEFAULT NULL)
RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_actor_role text; v_target public.organization_memberships; v_old_status text;
BEGIN
  IF v_actor IS NULL OR p_target_professional_id = v_actor OR NOT private.can_access_organization_workspace(p_organization_id) THEN RAISE EXCEPTION 'membership removal authorization required' USING ERRCODE = '42501'; END IF;
  SELECT membership_role INTO v_actor_role FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active';
  SELECT * INTO v_target FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status IN ('active', 'suspended') FOR UPDATE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') OR NOT FOUND OR v_target.membership_role = 'owner' OR (v_actor_role = 'manager' AND v_target.membership_role <> 'professional') THEN RAISE EXCEPTION 'membership cannot be removed' USING ERRCODE = '42501'; END IF;
  v_old_status := v_target.status;
  UPDATE public.organization_memberships SET status = 'removed', removed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_removed', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, NULL, NULL, v_old_status, 'removed', p_reason);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_organization_member_role(p_organization_id uuid, p_target_professional_id uuid, p_new_role text, p_reason text DEFAULT NULL)
RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_target public.organization_memberships; v_old_role text;
BEGIN
  IF v_actor IS NULL OR p_new_role NOT IN ('manager', 'professional') OR NOT private.can_access_organization_workspace(p_organization_id) THEN RAISE EXCEPTION 'role change authorization required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND membership_role = 'owner' AND status = 'active') THEN RAISE EXCEPTION 'active owner authorization required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_target FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' THEN RAISE EXCEPTION 'role target is not eligible' USING ERRCODE = '42501'; END IF;
  v_old_role := v_target.membership_role;
  IF v_old_role = p_new_role THEN RETURN v_target; END IF;
  UPDATE public.organization_memberships SET membership_role = p_new_role, updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('member_role_changed', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, v_old_role, p_new_role, 'active', 'active', p_reason);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_organization_owner(p_organization_id uuid, p_target_professional_id uuid)
RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_current public.organization_memberships; v_target public.organization_memberships; v_old_role text;
BEGIN
  IF v_actor IS NULL OR NOT private.can_access_organization_workspace(p_organization_id) THEN RAISE EXCEPTION 'owner transfer authorization required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_current FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = v_actor AND membership_role = 'owner' AND status = 'active' FOR UPDATE;
  SELECT * INTO v_target FROM public.organization_memberships WHERE organization_id = p_organization_id AND professional_id = p_target_professional_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target must be an active membership in the same organization' USING ERRCODE = '42501'; END IF;
  IF v_current.id IS NULL OR v_target.id IS NULL THEN RAISE EXCEPTION 'owner transfer authorization required' USING ERRCODE = '42501'; END IF;
  v_old_role := v_target.membership_role;
  UPDATE public.organization_memberships SET membership_role = 'manager', updated_at = clock_timestamp() WHERE id = v_current.id;
  UPDATE public.organization_memberships SET membership_role = 'owner', updated_at = clock_timestamp() WHERE id = v_target.id RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event('owner_transferred', p_organization_id, 'authenticated', v_actor, v_target.professional_id, v_target.id, NULL, v_old_role, 'owner', NULL, NULL, NULL);
  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION private.organization_entitlement_mode(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_access_organization_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_expand_organization(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_organization_seat_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assert_organization_seat_capacity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_organization_seat_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enable_organization_member_clinical_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disable_organization_member_clinical_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_seat_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_organization_member_clinical_access(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_organization_member_clinical_access(uuid, uuid, text) TO authenticated;

COMMIT;
