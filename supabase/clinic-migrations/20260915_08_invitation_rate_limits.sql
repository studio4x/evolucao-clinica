-- Fase 1B3: rate limiting DB-side de convites e auditoria das transições.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS private.clinic_invitation_rate_limits (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  actor_limit integer NOT NULL DEFAULT 20 CHECK (actor_limit > 0),
  actor_window_seconds integer NOT NULL DEFAULT 3600 CHECK (actor_window_seconds > 0),
  organization_limit integer NOT NULL DEFAULT 100 CHECK (organization_limit > 0),
  organization_window_seconds integer NOT NULL DEFAULT 86400 CHECK (organization_window_seconds > 0),
  recipient_limit integer NOT NULL DEFAULT 3 CHECK (recipient_limit > 0),
  recipient_window_seconds integer NOT NULL DEFAULT 86400 CHECK (recipient_window_seconds > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO private.clinic_invitation_rate_limits (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE private.clinic_invitation_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_invitation_rate_limits_no_client_access
  ON private.clinic_invitation_rate_limits;
CREATE POLICY clinic_invitation_rate_limits_no_client_access
  ON private.clinic_invitation_rate_limits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE private.clinic_invitation_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_invitation_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_clinic_invitation_rate_limit(
  p_organization_id uuid,
  p_actor_professional_id uuid,
  p_normalized_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_limits private.clinic_invitation_rate_limits;
  v_now timestamptz := clock_timestamp();
  v_actor_count integer;
  v_organization_count integer;
  v_recipient_count integer;
BEGIN
  SELECT * INTO v_limits
    FROM private.clinic_invitation_rate_limits
   WHERE id IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation rate limit configuration unavailable' USING ERRCODE = '42501';
  END IF;

  -- The organization lock serializes all issuances for one tenant. The
  -- narrower locks document and protect the actor/recipient dimensions too.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clinic_invitation_org:' || p_organization_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clinic_invitation_actor:' || p_organization_id::text || ':' || p_actor_professional_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clinic_invitation_recipient:' || p_organization_id::text || ':' || p_normalized_email, 0)
  );

  SELECT count(*)::integer INTO v_actor_count
    FROM public.organization_invitations AS i
   WHERE i.organization_id = p_organization_id
     AND i.invited_by = p_actor_professional_id
     AND i.created_at >= v_now - make_interval(secs => v_limits.actor_window_seconds);
  IF v_actor_count >= v_limits.actor_limit THEN
    RAISE EXCEPTION 'invitation rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_organization_count
    FROM public.organization_invitations AS i
   WHERE i.organization_id = p_organization_id
     AND i.created_at >= v_now - make_interval(secs => v_limits.organization_window_seconds);
  IF v_organization_count >= v_limits.organization_limit THEN
    RAISE EXCEPTION 'invitation rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_recipient_count
    FROM public.organization_invitations AS i
   WHERE i.organization_id = p_organization_id
     AND i.normalized_email = p_normalized_email
     AND i.created_at >= v_now - make_interval(secs => v_limits.recipient_window_seconds);
  IF v_recipient_count >= v_limits.recipient_limit THEN
    RAISE EXCEPTION 'invitation rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_clinic_invitation_rate_limit(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_organization public.organizations;
  v_normalized_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_token_hash bytea;
  v_invitation public.organization_invitations;
  v_expired_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_organization FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'organization is not accepting invitations' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'invitation issuer authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_intended_role IS NULL OR p_intended_role NOT IN ('manager', 'professional') THEN
    RAISE EXCEPTION 'invitation role is not allowed' USING ERRCODE = '22023';
  END IF;
  IF v_actor_role = 'manager' AND p_intended_role <> 'professional' THEN
    RAISE EXCEPTION 'invitation issuer cannot grant this role' USING ERRCODE = '42501';
  END IF;
  IF v_normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR char_length(v_normalized_email) > 320 THEN
    RAISE EXCEPTION 'invitation email is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM private.enforce_clinic_invitation_rate_limit(
    p_organization_id, v_actor, v_normalized_email
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || v_normalized_email, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM public.organization_memberships AS m
      JOIN auth.users AS u ON u.id = m.professional_id
     WHERE m.organization_id = p_organization_id
       AND lower(btrim(u.email)) = v_normalized_email
       AND m.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'invitation cannot be issued for this recipient' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_invitations
     SET status = 'expired', updated_at = clock_timestamp()
   WHERE organization_id = p_organization_id
     AND normalized_email = v_normalized_email
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
       AND i.normalized_email = v_normalized_email
       AND i.status = 'pending'
       AND i.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'pending invitation already exists' USING ERRCODE = '23505';
  END IF;

  -- The raw token is returned once for controlled staging smoke only.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := extensions.digest(v_token, 'sha256');
  INSERT INTO public.organization_invitations (
    organization_id, normalized_email, intended_role, intended_clinical_access,
    token_hash, status, expires_at, invited_by
  )
  VALUES (
    p_organization_id, v_normalized_email, p_intended_role,
    coalesce(p_intended_clinical_access, false), v_token_hash, 'pending',
    clock_timestamp() + interval '72 hours', v_actor
  )
  RETURNING * INTO v_invitation;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'invitation_created',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_invitation_id => v_invitation.id,
    p_new_status => 'pending'
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'normalized_email', v_invitation.normalized_email,
    'intended_role', v_invitation.intended_role,
    'intended_clinical_access', v_invitation.intended_clinical_access,
    'expires_at', v_invitation.expires_at,
    'status', v_invitation.status,
    'token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_actor_role text;
  v_invitation public.organization_invitations;
  v_organization public.organizations;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_invitation FROM public.organization_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(v_invitation.organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_organization FROM public.organizations WHERE id = v_invitation.organization_id;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = v_invitation.organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager')
     OR (v_actor_role = 'manager' AND v_invitation.intended_role <> 'professional') THEN
    RAISE EXCEPTION 'invitation revocation authorization required' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status <> 'pending' OR v_invitation.expires_at <= clock_timestamp() THEN
    IF v_invitation.status = 'pending' AND v_invitation.expires_at <= clock_timestamp() THEN
      UPDATE public.organization_invitations
         SET status = 'expired', updated_at = clock_timestamp()
       WHERE id = v_invitation.id;
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
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organization_invitations
     SET status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    p_event_type => 'invitation_revoked',
    p_organization_id => v_invitation.organization_id,
    p_actor_professional_id => v_actor,
    p_invitation_id => v_invitation.id,
    p_old_status => 'pending',
    p_new_status => 'revoked'
  );
  RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', v_invitation.status, 'revoked_at', v_invitation.revoked_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  p_raw_token text
)
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
  v_organization public.organizations;
  v_existing public.organization_memberships;
  v_membership public.organization_memberships;
BEGIN
  IF v_actor IS NULL OR p_raw_token IS NULL OR char_length(p_raw_token) <> 64 THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at INTO v_email, v_email_confirmed_at
    FROM auth.users AS u WHERE u.id = v_actor;
  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  v_token_hash := extensions.digest(p_raw_token, 'sha256');
  SELECT i.* INTO v_invitation FROM public.organization_invitations AS i WHERE i.token_hash = v_token_hash FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.expires_at <= clock_timestamp() THEN
    UPDATE public.organization_invitations SET status = 'expired', updated_at = clock_timestamp() WHERE id = v_invitation.id;
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
  SELECT * INTO v_organization FROM public.organizations WHERE id = v_invitation.organization_id;
  IF NOT FOUND OR v_organization.operational_status <> 'active'
     OR NOT (SELECT private.is_clinic_feature_enabled(v_invitation.organization_id)) THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_email <> v_invitation.normalized_email THEN
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
  INSERT INTO public.organization_memberships (
    organization_id, professional_id, membership_role, status, clinical_access_enabled, created_by
  )
  VALUES (
    v_invitation.organization_id, v_actor, v_invitation.intended_role, 'active', false, v_invitation.invited_by
  )
  RETURNING * INTO v_membership;
  UPDATE public.organization_invitations
     SET status = 'accepted', accepted_by = v_actor, accepted_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    p_event_type => 'invitation_accepted',
    p_organization_id => v_invitation.organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_actor,
    p_membership_id => v_membership.id,
    p_invitation_id => v_invitation.id,
    p_new_status => 'accepted'
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

REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;

COMMIT;
