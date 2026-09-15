-- Fase 1B1.1: hardening da transferência de owner.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

CREATE OR REPLACE FUNCTION public.transfer_organization_owner(
  p_organization_id uuid,
  p_target_professional_id uuid
)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization public.organizations;
  v_current_owner public.organization_memberships;
  v_target public.organization_memberships;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_organization.operational_status = 'archived' THEN
    RAISE EXCEPTION 'archived organization cannot transfer ownership' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current_owner
    FROM public.organization_memberships
   WHERE organization_id = p_organization_id
     AND professional_id = v_actor
     AND membership_role = 'owner'
     AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current active owner authorization required' USING ERRCODE = '42501';
  END IF;

  -- Select only the current active association. Historical removed rows may coexist
  -- with a new active membership for the same professional and organization.
  SELECT * INTO v_target
    FROM public.organization_memberships
   WHERE organization_id = p_organization_id
     AND professional_id = p_target_professional_id
     AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'target must be an active membership in the same organization'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.id = v_current_owner.id THEN
    RETURN v_target;
  END IF;

  -- Approved policy: former owner remains an active manager and keeps the
  -- existing clinical_access_enabled value unchanged.
  UPDATE public.organization_memberships
     SET membership_role = 'manager',
         updated_at = clock_timestamp()
   WHERE id = v_current_owner.id;

  UPDATE public.organization_memberships
     SET membership_role = 'owner',
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

-- Preserve the existing least-privilege surface; authenticated is the only
-- application role allowed to execute this atomic RPC.
REVOKE ALL ON FUNCTION public.transfer_organization_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_owner(uuid, uuid) TO authenticated;
