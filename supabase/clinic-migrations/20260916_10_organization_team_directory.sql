-- Fase 1B5: diretório operacional mínimo da equipe.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não editar/reaplicar migrations 01-09, não usar supabase db push e não aplicar em produção.

BEGIN;

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
  IF v_actor IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'authenticated team access required' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND operational_status = 'active'
  ) THEN
    RAISE EXCEPTION 'organization is not active' USING ERRCODE = '42501';
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
  SELECT
    m.id,
    m.professional_id,
    p.full_name,
    p.professional_title,
    m.membership_role,
    m.status,
    m.clinical_access_enabled,
    m.joined_at,
    m.suspended_at
  FROM public.organization_memberships AS m
  JOIN public.professionals AS p ON p.id = m.professional_id
  WHERE m.organization_id = p_organization_id
    AND m.status IN ('active', 'suspended')
  ORDER BY
    CASE m.membership_role
      WHEN 'owner' THEN 0
      WHEN 'manager' THEN 1
      ELSE 2
    END,
    lower(coalesce(p.full_name, '')),
    m.joined_at,
    m.id;
END;
$$;

COMMENT ON FUNCTION public.get_organization_team(uuid) IS
  'Returns the minimum active/suspended operational team directory for an authorized owner or manager.';

REVOKE ALL ON FUNCTION public.get_organization_team(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_team(uuid) TO authenticated;

COMMIT;
