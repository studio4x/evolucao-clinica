-- Fase 2A.2: conversão de reservation e separação da restrição operacional.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE OR REPLACE FUNCTION private.organization_entitlement_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN o.operational_status = 'active'
        THEN private.organization_subscription_access_mode(p_organization_id)
      WHEN o.operational_status = 'restricted'
       AND private.organization_subscription_access_mode(p_organization_id) <> 'none'
        THEN 'restricted'
      ELSE 'none'
    END
      FROM public.organizations AS o
     WHERE o.id = p_organization_id
  ), 'none');
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

  -- Preserve the established lock order. The invitation's valid pending row
  -- owns the reservation that is converted below.
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
     OR v_subscription.id IS NULL
     OR NOT private.is_organization_subscription_structurally_valid(v_invitation.organization_id)
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
    SELECT * INTO v_usage
      FROM private.get_organization_seat_usage(v_invitation.organization_id);
    -- The pending invitation itself is already counted in reserved_seats.
    -- Validate the invariant, but never demand a second available seat.
    IF v_usage.contracted_seats IS NULL
       OR v_usage.active_seats + v_usage.reserved_seats > v_usage.contracted_seats
       OR v_usage.reserved_seats < 1 THEN
      RAISE EXCEPTION 'clinical invitation reservation is invalid' USING ERRCODE = 'P0001';
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

REVOKE ALL ON FUNCTION private.organization_entitlement_mode(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;

COMMIT;
