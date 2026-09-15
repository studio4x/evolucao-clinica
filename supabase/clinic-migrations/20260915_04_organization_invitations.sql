-- Fase 1B2: convites, revogação, aceite e expiração lógica.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  normalized_email text NOT NULL,
  intended_role text NOT NULL
    CHECK (intended_role IN ('manager', 'professional')),
  intended_clinical_access boolean NOT NULL DEFAULT false,
  token_hash bytea NOT NULL
    CHECK (octet_length(token_hash) = 32),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  accepted_by uuid
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  accepted_at timestamptz,
  revoked_by uuid
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_email_shape CHECK (
    normalized_email = lower(btrim(normalized_email))
    AND char_length(normalized_email) BETWEEN 3 AND 320
    AND normalized_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ),
  CONSTRAINT organization_invitations_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT organization_invitations_accepted_fields CHECK (
    (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted')
  ),
  CONSTRAINT organization_invitations_revoked_fields CHECK (
    (status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
    OR (status <> 'revoked')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_token_hash_key
  ON public.organization_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_pending_email
  ON public.organization_invitations (organization_id, normalized_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organization_invitations_by_organization
  ON public.organization_invitations (organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS organization_invitations_by_email
  ON public.organization_invitations (normalized_email, organization_id);

CREATE INDEX IF NOT EXISTS organization_feature_flags_by_created_by
  ON public.organization_feature_flags (created_by);

CREATE INDEX IF NOT EXISTS organization_invitations_by_invited_by
  ON public.organization_invitations (invited_by);

CREATE INDEX IF NOT EXISTS organization_invitations_by_accepted_by
  ON public.organization_invitations (accepted_by);

CREATE INDEX IF NOT EXISTS organization_invitations_by_revoked_by
  ON public.organization_invitations (revoked_by);

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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;

  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id;
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

  -- Serialize duplicate checks for the same organization and normalized email.
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
     SET status = 'expired',
         updated_at = clock_timestamp()
   WHERE organization_id = p_organization_id
     AND normalized_email = v_normalized_email
     AND status = 'pending'
     AND expires_at <= clock_timestamp();

  IF EXISTS (
    SELECT 1
      FROM public.organization_invitations AS i
     WHERE i.organization_id = p_organization_id
       AND i.normalized_email = v_normalized_email
       AND i.status = 'pending'
       AND i.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'pending invitation already exists' USING ERRCODE = '23505';
  END IF;

  -- 72 hours; the raw token is returned once and never persisted.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := extensions.digest(v_token, 'sha256');

  INSERT INTO public.organization_invitations (
    organization_id,
    normalized_email,
    intended_role,
    intended_clinical_access,
    token_hash,
    status,
    expires_at,
    invited_by
  )
  VALUES (
    p_organization_id,
    v_normalized_email,
    p_intended_role,
    coalesce(p_intended_clinical_access, false),
    v_token_hash,
    'pending',
    clock_timestamp() + interval '72 hours',
    v_actor
  )
  RETURNING * INTO v_invitation;

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

  SELECT i.* INTO v_invitation
    FROM public.organization_invitations AS i
   WHERE i.id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;

  IF NOT (SELECT private.is_clinic_feature_enabled(v_invitation.organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT o.* INTO v_organization
    FROM public.organizations AS o
   WHERE o.id = v_invitation.organization_id;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;

  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = v_invitation.organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL
     OR v_actor_role NOT IN ('owner', 'manager')
     OR (v_actor_role = 'manager' AND v_invitation.intended_role <> 'professional') THEN
    RAISE EXCEPTION 'invitation revocation authorization required' USING ERRCODE = '42501';
  END IF;

  IF v_invitation.status <> 'pending' OR v_invitation.expires_at <= clock_timestamp() THEN
    IF v_invitation.status = 'pending' AND v_invitation.expires_at <= clock_timestamp() THEN
      UPDATE public.organization_invitations
         SET status = 'expired',
             updated_at = clock_timestamp()
       WHERE id = v_invitation.id;
      RETURN jsonb_build_object(
        'invitation_id', v_invitation.id,
        'status', 'expired'
      );
    END IF;
    RAISE EXCEPTION 'invitation cannot be revoked' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_invitations
     SET status = 'revoked',
         revoked_by = v_actor,
         revoked_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'status', v_invitation.status,
    'revoked_at', v_invitation.revoked_at
  );
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

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
    FROM auth.users AS u
   WHERE u.id = v_actor;
  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  v_token_hash := extensions.digest(p_raw_token, 'sha256');
  SELECT i.* INTO v_invitation
    FROM public.organization_invitations AS i
   WHERE i.token_hash = v_token_hash
   FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  IF v_invitation.expires_at <= clock_timestamp() THEN
    UPDATE public.organization_invitations
       SET status = 'expired',
           updated_at = clock_timestamp()
     WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'invitation_id', v_invitation.id,
      'status', 'expired',
      'accepted', false
    );
  END IF;

  SELECT o.* INTO v_organization
    FROM public.organizations AS o
   WHERE o.id = v_invitation.organization_id;
  IF NOT FOUND
     OR v_organization.operational_status <> 'active'
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
    organization_id,
    professional_id,
    membership_role,
    status,
    clinical_access_enabled,
    created_by
  )
  VALUES (
    v_invitation.organization_id,
    v_actor,
    v_invitation.intended_role,
    'active',
    false,
    v_invitation.invited_by
  )
  RETURNING * INTO v_membership;

  UPDATE public.organization_invitations
     SET status = 'accepted',
         accepted_by = v_actor,
         accepted_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;

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

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_invitations_select_manager ON public.organization_invitations;
CREATE POLICY organization_invitations_select_manager
  ON public.organization_invitations
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_clinic_feature_enabled(organization_id))
    AND (SELECT private.has_organization_role(organization_id, ARRAY['owner', 'manager']::text[]))
    AND (status <> 'pending' OR expires_at > now())
  );

REVOKE ALL ON TABLE public.organization_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  organization_id,
  normalized_email,
  intended_role,
  intended_clinical_access,
  status,
  expires_at,
  invited_by,
  accepted_by,
  accepted_at,
  revoked_by,
  revoked_at,
  created_at,
  updated_at
) ON TABLE public.organization_invitations TO authenticated;
GRANT ALL ON TABLE public.organization_invitations TO service_role;

REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;

COMMIT;
