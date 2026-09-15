-- Fase 1B3.1: selecionar somente a membership corrente no lifecycle.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não editar/reaplicar o SQL 06 e não aplicar em produção.

BEGIN;

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

  -- A removed membership is historical. The partial unique index guarantees at
  -- most one current non-removed membership for this organization/professional.
  SELECT * INTO v_target
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = p_target_professional_id
     AND m.status = 'active'
   FOR UPDATE;
  IF NOT FOUND OR v_target.membership_role = 'owner' THEN
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

REVOKE ALL ON FUNCTION public.suspend_organization_member(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_organization_member(uuid, uuid, text)
  TO authenticated;

COMMIT;
