-- Fase 2A.1: snapshots contratuais, elegibilidade de rollout e expiração idempotente.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

-- O catálogo é a oferta atual; a subscription preserva o contrato histórico.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'private.organization_subscriptions'::regclass
       AND conname = 'organization_subscriptions_plan_code_fkey'
  ) THEN
    ALTER TABLE private.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_plan_code_fkey
      FOREIGN KEY (plan_code)
      REFERENCES private.clinic_plan_catalog (plan_code)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE private.organization_subscriptions
  VALIDATE CONSTRAINT organization_subscriptions_plan_code_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'private.organization_subscriptions'::regclass
       AND conname = 'organization_subscriptions_plan_interval_consistency'
  ) THEN
    ALTER TABLE private.organization_subscriptions
      ADD CONSTRAINT organization_subscriptions_plan_interval_consistency
      CHECK (
        (plan_code = 'clinic_monthly' AND billing_interval = 'monthly')
        OR (plan_code = 'clinic_yearly' AND billing_interval = 'annual')
      )
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE private.organization_subscriptions
  VALIDATE CONSTRAINT organization_subscriptions_plan_interval_consistency;

CREATE OR REPLACE FUNCTION private.is_clinic_plan_sellable(p_plan_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM private.clinic_plan_catalog AS c
     WHERE c.plan_code = p_plan_code
       AND c.enabled IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_subscription_structurally_valid(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM private.organization_subscriptions AS s
      JOIN private.clinic_plan_catalog AS c
        ON c.plan_code = s.plan_code
     WHERE s.organization_id = p_organization_id
       AND s.plan_code IN ('clinic_monthly', 'clinic_yearly')
       AND c.billing_interval = s.billing_interval
       AND s.currency = 'BRL'
       AND s.base_amount_minor >= 0
       AND s.seat_amount_minor >= 0
       AND s.minimum_contracted_seats >= 3
       AND s.contracted_seats >= s.minimum_contracted_seats
       AND s.contracted_seats >= (
         SELECT count(*)::integer
           FROM public.organization_memberships AS m
          WHERE m.organization_id = s.organization_id
            AND m.status = 'active'
            AND m.clinical_access_enabled IS TRUE
       ) + (
         SELECT count(*)::integer
           FROM public.organization_invitations AS i
          WHERE i.organization_id = s.organization_id
            AND i.status = 'pending'
            AND i.expires_at > now()
            AND i.intended_clinical_access IS TRUE
       )
       AND (
         s.current_period_end IS NULL
         OR s.current_period_start IS NULL
         OR s.current_period_end > s.current_period_start
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.organization_subscription_access_mode(
  p_organization_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN NOT private.is_organization_subscription_structurally_valid(p_organization_id)
        THEN 'none'
      WHEN s.financial_status = 'active'
       AND (
         NOT s.cancel_at_period_end
         OR (
           s.cancel_at_period_end
           AND s.current_period_end IS NOT NULL
           AND s.current_period_end > now()
         )
       ) THEN 'full'
      WHEN s.financial_status = 'past_due'
       AND s.grace_period_ends_at IS NOT NULL
       AND s.grace_period_ends_at > now()
        THEN 'full'
      ELSE 'restricted'
    END
      FROM private.organization_subscriptions AS s
     WHERE s.organization_id = p_organization_id
  ), 'none');
$$;

CREATE OR REPLACE FUNCTION private.organization_entitlement_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN o.operational_status NOT IN ('active', 'restricted') THEN 'none'
      WHEN private.organization_subscription_access_mode(p_organization_id) = 'full' THEN 'full'
      WHEN private.organization_subscription_access_mode(p_organization_id) = 'restricted' THEN 'restricted'
      ELSE 'none'
    END
      FROM public.organizations AS o
     WHERE o.id = p_organization_id
  ), 'none');
$$;

CREATE OR REPLACE FUNCTION public.set_organization_clinic_rollout_state(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization public.organizations;
  v_subscription private.organization_subscriptions;
  v_flag public.organization_feature_flags;
  v_owner_count integer;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
       <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'organization and reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization and reason are required' USING ERRCODE = '22023';
  END IF;

  IF p_enabled IS TRUE THEN
    -- This helper validates runtime identity and the global gate. It does not
    -- depend on the organization status or its feature flag.
    IF NOT private.is_clinic_global_enabled()
       OR v_organization.operational_status IN ('restricted', 'archived') THEN
      RAISE EXCEPTION 'organization rollout cannot be enabled' USING ERRCODE = '42501';
    END IF;
    SELECT count(*)::integer INTO v_owner_count
      FROM public.organization_memberships
     WHERE organization_id = p_organization_id
       AND membership_role = 'owner'
       AND status = 'active';
    SELECT * INTO v_subscription
      FROM private.organization_subscriptions
     WHERE organization_id = p_organization_id
     FOR UPDATE;
    IF v_owner_count <> 1
       OR v_subscription.id IS NULL
       OR NOT private.is_organization_subscription_structurally_valid(p_organization_id)
       OR private.organization_subscription_access_mode(p_organization_id) <> 'full' THEN
      RAISE EXCEPTION 'fully eligible organization entitlement required' USING ERRCODE = '42501';
    END IF;
    IF v_organization.operational_status = 'pending_setup' THEN
      UPDATE public.organizations
         SET operational_status = 'active', updated_at = clock_timestamp()
       WHERE id = p_organization_id;
    END IF;
  END IF;

  INSERT INTO public.organization_feature_flags (
    organization_id, feature_key, enabled, created_by, created_by_type, reason
  )
  VALUES (
    p_organization_id, 'clinic', p_enabled, NULL, 'service_role', left(btrim(p_reason), 500)
  )
  ON CONFLICT (organization_id, feature_key) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        created_by = NULL,
        created_by_type = 'service_role',
        reason = EXCLUDED.reason,
        updated_at = clock_timestamp()
  RETURNING * INTO v_flag;

  PERFORM private.record_organization_admin_event(
    CASE WHEN p_enabled THEN 'organization_rollout_enabled' ELSE 'organization_rollout_disabled' END,
    p_organization_id, 'service_role', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_reason
  );
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'enabled', p_enabled,
    'operational_status', (SELECT operational_status FROM public.organizations WHERE id = p_organization_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_intended_role text,
  p_intended_clinical_access boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_actor_role text;
  v_token text;
  v_invitation public.organization_invitations;
  v_subscription private.organization_subscriptions;
  v_usage record;
  v_expired_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_actor IS NULL OR NOT private.can_expand_organization(p_organization_id) THEN
    RAISE EXCEPTION 'organization cannot accept invitations' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active';
  IF v_actor_role NOT IN ('owner', 'manager')
     OR (v_actor_role = 'manager' AND p_intended_role <> 'professional') THEN
    RAISE EXCEPTION 'invitation issuer authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_intended_role NOT IN ('manager', 'professional')
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'invitation input is invalid' USING ERRCODE = '22023';
  END IF;

  -- The subscription row serializes every operation that can consume a seat.
  SELECT * INTO v_subscription
    FROM private.organization_subscriptions
   WHERE organization_id = p_organization_id
   FOR UPDATE;
  PERFORM private.enforce_clinic_invitation_rate_limit(p_organization_id, v_actor, v_email);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || v_email, 0)
  );
  UPDATE public.organization_invitations
     SET status = 'expired', updated_at = clock_timestamp()
   WHERE organization_id = p_organization_id
     AND normalized_email = v_email
     AND status = 'pending'
     AND expires_at <= clock_timestamp()
  RETURNING id INTO v_expired_id;
  IF v_expired_id IS NOT NULL THEN
    PERFORM private.record_organization_admin_event(
      p_event_type => 'invitation_expired',
      p_organization_id => p_organization_id,
      p_actor_professional_id => v_actor,
      p_invitation_id => v_expired_id,
      p_old_status => 'pending',
      p_new_status => 'expired',
      p_reason => 'logical expiration during invitation issuance'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations AS i
     WHERE i.organization_id = p_organization_id
       AND i.normalized_email = v_email
       AND i.status = 'pending'
       AND i.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'pending invitation already exists' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.organization_memberships AS m
      JOIN auth.users AS u ON u.id = m.professional_id
     WHERE m.organization_id = p_organization_id
       AND lower(btrim(u.email)) = v_email
       AND m.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'invitation cannot be issued for this recipient' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_intended_clinical_access, false) IS TRUE THEN
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF v_usage.available_seats < 1 THEN
      RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.organization_invitations (
    organization_id, normalized_email, intended_role, intended_clinical_access,
    token_hash, status, expires_at, invited_by
  )
  VALUES (
    p_organization_id, v_email, p_intended_role, coalesce(p_intended_clinical_access, false),
    extensions.digest(v_token, 'sha256'), 'pending', clock_timestamp() + interval '72 hours', v_actor
  )
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    'invitation_created', p_organization_id, 'authenticated', v_actor,
    NULL, NULL, v_invitation.id, NULL, NULL, NULL, 'pending', NULL
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'normalized_email', v_invitation.normalized_email,
    'intended_role', v_invitation.intended_role,
    'intended_clinical_access', v_invitation.intended_clinical_access,
    'expires_at', v_invitation.expires_at,
    'status', 'pending',
    'token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_invitation public.organization_invitations;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_invitation
    FROM public.organization_invitations
   WHERE id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND OR NOT private.can_access_organization_workspace(v_invitation.organization_id) THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;
  SELECT membership_role INTO v_role
    FROM public.organization_memberships
   WHERE organization_id = v_invitation.organization_id
     AND professional_id = v_actor
     AND status = 'active';
  IF v_role NOT IN ('owner', 'manager')
     OR (v_role = 'manager' AND v_invitation.intended_role <> 'professional') THEN
    RAISE EXCEPTION 'invitation revocation authorization required' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status = 'pending' AND v_invitation.expires_at <= clock_timestamp() THEN
    UPDATE public.organization_invitations
       SET status = 'expired', updated_at = clock_timestamp()
     WHERE id = v_invitation.id AND status = 'pending';
    PERFORM private.record_organization_admin_event(
      p_event_type => 'invitation_expired',
      p_organization_id => v_invitation.organization_id,
      p_actor_professional_id => v_actor,
      p_invitation_id => v_invitation.id,
      p_old_status => 'pending',
      p_new_status => 'expired',
      p_reason => 'logical expiration during invitation revocation'
    );
    RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired');
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organization_invitations
     SET status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    'invitation_revoked', v_invitation.organization_id, 'authenticated', v_actor,
    NULL, NULL, v_invitation.id, NULL, NULL, 'pending', 'revoked', NULL
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id, 'status', 'revoked', 'revoked_at', v_invitation.revoked_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_raw_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash bytea;
  v_invitation public.organization_invitations;
  v_org public.organizations;
  v_subscription private.organization_subscriptions;
  v_existing public.organization_memberships;
  v_membership public.organization_memberships;
  v_usage record;
BEGIN
  IF v_actor IS NULL OR p_raw_token IS NULL OR char_length(p_raw_token) <> 64 THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
    FROM auth.users AS u
   WHERE u.id = v_actor;
  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  v_token_hash := extensions.digest(p_raw_token, 'sha256');
  SELECT * INTO v_invitation
    FROM public.organization_invitations
   WHERE token_hash = v_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  -- Keep the lock order organization -> subscription -> invitation, then
  -- persist logical expiry without raising and rolling it back.
  SELECT * INTO v_org
    FROM public.organizations
   WHERE id = v_invitation.organization_id
   FOR UPDATE;
  SELECT * INTO v_subscription
    FROM private.organization_subscriptions
   WHERE organization_id = v_invitation.organization_id
   FOR UPDATE;
  SELECT * INTO v_invitation
    FROM public.organization_invitations
   WHERE id = v_invitation.id
   FOR UPDATE;
  IF v_invitation.status = 'expired' THEN
    RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired', 'accepted', false);
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.expires_at <= clock_timestamp() THEN
    UPDATE public.organization_invitations
       SET status = 'expired', updated_at = clock_timestamp()
     WHERE id = v_invitation.id AND status = 'pending';
    PERFORM private.record_organization_admin_event(
      p_event_type => 'invitation_expired',
      p_organization_id => v_invitation.organization_id,
      p_actor_professional_id => v_actor,
      p_invitation_id => v_invitation.id,
      p_old_status => 'pending',
      p_new_status => 'expired',
      p_reason => 'logical expiration during invitation acceptance'
    );
    RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired', 'accepted', false);
  END IF;
  IF v_org.id IS NULL
     OR v_org.operational_status <> 'active'
     OR NOT private.is_clinic_feature_enabled(v_invitation.organization_id)
     OR private.organization_entitlement_mode(v_invitation.organization_id) <> 'full'
     OR v_email <> v_invitation.normalized_email THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '23503';
  END IF;
  SELECT m.* INTO v_existing
    FROM public.organization_memberships AS m
   WHERE m.organization_id = v_invitation.organization_id
     AND m.professional_id = v_actor
     AND m.status <> 'removed'
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.intended_clinical_access IS TRUE THEN
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(v_invitation.organization_id);
    IF v_usage.available_seats < 1 THEN
      RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.organization_memberships (
    organization_id, professional_id, membership_role, status, clinical_access_enabled, created_by
  )
  VALUES (
    v_invitation.organization_id, v_actor, v_invitation.intended_role, 'active',
    v_invitation.intended_clinical_access, v_invitation.invited_by
  )
  RETURNING * INTO v_membership;
  UPDATE public.organization_invitations
     SET status = 'accepted', accepted_by = v_actor, accepted_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    'invitation_accepted', v_invitation.organization_id, 'authenticated', v_actor,
    v_actor, v_membership.id, v_invitation.id, NULL, NULL, 'pending', 'accepted', NULL
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_membership.organization_id,
    'membership_id', v_membership.id,
    'membership_role', v_membership.membership_role,
    'status', v_invitation.status,
    'intended_clinical_access', v_invitation.intended_clinical_access,
    'clinical_access_enabled', v_membership.clinical_access_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION private.is_clinic_plan_sellable(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_organization_subscription_structurally_valid(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.organization_subscription_access_mode(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.organization_entitlement_mode(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_organization_clinic_rollout_state(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_clinic_rollout_state(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;

COMMIT;
