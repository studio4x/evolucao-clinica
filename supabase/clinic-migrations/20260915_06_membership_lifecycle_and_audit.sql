-- Fase 1B3: lifecycle de memberships e audit trail operacional mínimo.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.organization_admin_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE NO ACTION,
  event_type text NOT NULL CHECK (event_type IN (
    'organization_created',
    'organization_rollout_enabled',
    'organization_rollout_disabled',
    'owner_transferred',
    'member_suspended',
    'member_reactivated',
    'member_removed',
    'member_role_changed',
    'invitation_created',
    'invitation_revoked',
    'invitation_accepted',
    'invitation_expired'
  )),
  actor_type text NOT NULL CHECK (actor_type IN ('authenticated', 'service_role', 'system')),
  actor_professional_id uuid
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  subject_professional_id uuid
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  membership_id uuid
    REFERENCES public.organization_memberships(id) ON DELETE NO ACTION,
  invitation_id uuid
    REFERENCES public.organization_invitations(id) ON DELETE NO ACTION,
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT organization_admin_events_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 500
  )
);

CREATE INDEX IF NOT EXISTS organization_admin_events_by_organization
  ON private.organization_admin_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_admin_events_by_membership
  ON private.organization_admin_events (membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_admin_events_by_invitation
  ON private.organization_admin_events (invitation_id, created_at DESC);

ALTER TABLE private.organization_admin_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_admin_events_no_client_access
  ON private.organization_admin_events;
CREATE POLICY organization_admin_events_no_client_access
  ON private.organization_admin_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE private.organization_admin_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.organization_admin_events TO service_role;

CREATE OR REPLACE FUNCTION private.reject_organization_admin_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('private.organization_admin_event_cleanup', true) = 'staging_cleanup' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'organization admin events are immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS organization_admin_events_immutable
  ON private.organization_admin_events;
CREATE TRIGGER organization_admin_events_immutable
BEFORE UPDATE OR DELETE ON private.organization_admin_events
FOR EACH ROW EXECUTE FUNCTION private.reject_organization_admin_event_mutation();

CREATE OR REPLACE FUNCTION private.record_organization_admin_event(
  p_event_type text,
  p_organization_id uuid,
  p_actor_type text DEFAULT 'authenticated',
  p_actor_professional_id uuid DEFAULT NULL,
  p_subject_professional_id uuid DEFAULT NULL,
  p_membership_id uuid DEFAULT NULL,
  p_invitation_id uuid DEFAULT NULL,
  p_old_role text DEFAULT NULL,
  p_new_role text DEFAULT NULL,
  p_old_status text DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO private.organization_admin_events (
    event_type,
    organization_id,
    actor_type,
    actor_professional_id,
    subject_professional_id,
    membership_id,
    invitation_id,
    old_role,
    new_role,
    old_status,
    new_status,
    reason
  )
  VALUES (
    p_event_type,
    p_organization_id,
    p_actor_type,
    p_actor_professional_id,
    p_subject_professional_id,
    p_membership_id,
    p_invitation_id,
    p_old_role,
    p_new_role,
    p_old_status,
    p_new_status,
    nullif(left(btrim(coalesce(p_reason, '')), 500), '')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_organization_admin_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.record_organization_admin_event(
  text, uuid, text, uuid, uuid, uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.purge_organization_admin_events_for_staging_cleanup(
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization is required' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('private.organization_admin_event_cleanup', 'staging_cleanup', true);
  DELETE FROM private.organization_admin_events
   WHERE organization_id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_organization_admin_events_for_staging_cleanup(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.suspend_organization_member(
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
  v_actor_role text;
  v_organization public.organizations;
  v_target public.organization_memberships;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_target_professional_id = v_actor THEN
    RAISE EXCEPTION 'self-management is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'organization is not active' USING ERRCODE = '42501';
  END IF;

  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'membership administration authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = p_target_professional_id
   ORDER BY (m.status <> 'removed'), m.updated_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' OR v_target.membership_role = 'owner' THEN
    RAISE EXCEPTION 'target membership cannot be suspended' USING ERRCODE = '42501';
  END IF;
  IF v_actor_role = 'manager' AND v_target.membership_role <> 'professional' THEN
    RAISE EXCEPTION 'manager can administer professionals only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_memberships
     SET status = 'suspended',
         suspended_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'member_suspended',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_target.professional_id,
    p_membership_id => v_target.id,
    p_old_status => 'active',
    p_new_status => 'suspended',
    p_reason => p_reason
  );
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_organization_member(
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
  v_actor_role text;
  v_organization public.organizations;
  v_target public.organization_memberships;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_target_professional_id = v_actor THEN
    RAISE EXCEPTION 'self-management is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'organization is not active' USING ERRCODE = '42501';
  END IF;

  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'membership administration authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = p_target_professional_id
     AND m.status = 'suspended'
   ORDER BY m.updated_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' THEN
    RAISE EXCEPTION 'only suspended non-owner memberships can be reactivated' USING ERRCODE = '42501';
  END IF;
  IF v_actor_role = 'manager' AND v_target.membership_role <> 'professional' THEN
    RAISE EXCEPTION 'manager can administer professionals only' USING ERRCODE = '42501';
  END IF;
  IF v_target.clinical_access_enabled IS TRUE THEN
    RAISE EXCEPTION 'clinical capability reactivation requires phase 2' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_memberships
     SET status = 'active',
         suspended_at = NULL,
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'member_reactivated',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_target.professional_id,
    p_membership_id => v_target.id,
    p_old_status => 'suspended',
    p_new_status => 'active',
    p_reason => p_reason
  );
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_member(
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
  v_actor_role text;
  v_organization public.organizations;
  v_target public.organization_memberships;
  v_old_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_target_professional_id = v_actor THEN
    RAISE EXCEPTION 'self-management is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'organization is not active' USING ERRCODE = '42501';
  END IF;

  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active'
   FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'membership administration authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = p_target_professional_id
     AND m.status IN ('active', 'suspended')
   ORDER BY (m.status = 'active') DESC, m.updated_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' THEN
    RAISE EXCEPTION 'target membership cannot be removed' USING ERRCODE = '42501';
  END IF;
  IF v_actor_role = 'manager' AND v_target.membership_role <> 'professional' THEN
    RAISE EXCEPTION 'manager can administer professionals only' USING ERRCODE = '42501';
  END IF;
  v_old_status := v_target.status;

  UPDATE public.organization_memberships
     SET status = 'removed',
         removed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'member_removed',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_target.professional_id,
    p_membership_id => v_target.id,
    p_old_status => v_old_status,
    p_new_status => 'removed',
    p_reason => p_reason
  );
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_organization_member_role(
  p_organization_id uuid,
  p_target_professional_id uuid,
  p_new_role text,
  p_reason text DEFAULT NULL
)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization public.organizations;
  v_target public.organization_memberships;
  v_old_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_new_role IS NULL OR p_new_role NOT IN ('manager', 'professional') THEN
    RAISE EXCEPTION 'target role is not allowed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND OR v_organization.operational_status <> 'active' THEN
    RAISE EXCEPTION 'organization is not active' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
     WHERE m.organization_id = p_organization_id
       AND m.professional_id = v_actor
       AND m.membership_role = 'owner'
       AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active owner authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = p_target_professional_id
     AND m.status = 'active'
   ORDER BY m.updated_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' THEN
    RAISE EXCEPTION 'owner or inactive membership cannot change role' USING ERRCODE = '42501';
  END IF;
  v_old_role := v_target.membership_role;
  IF v_old_role = p_new_role THEN
    RETURN v_target;
  END IF;

  UPDATE public.organization_memberships
     SET membership_role = p_new_role,
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'member_role_changed',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_target.professional_id,
    p_membership_id => v_target.id,
    p_old_role => v_old_role,
    p_new_role => p_new_role,
    p_old_status => 'active',
    p_new_status => 'active',
    p_reason => p_reason
  );
  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_organization_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reactivate_organization_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_organization_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_organization_member_role(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_organization_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_organization_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_organization_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_organization_member_role(uuid, uuid, text, text) TO authenticated;

COMMIT;
