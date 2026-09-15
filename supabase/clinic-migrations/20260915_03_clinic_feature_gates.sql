-- Fase 1B2: gate global DB-side e flags por organização.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.clinic_runtime_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  enabled boolean NOT NULL DEFAULT false,
  allowed_environment text NOT NULL DEFAULT 'staging'
    CHECK (allowed_environment IN ('staging', 'production')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.clinic_runtime_config (id, enabled, allowed_environment)
VALUES (true, false, 'staging')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE private.clinic_runtime_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_runtime_config_no_client_access ON private.clinic_runtime_config;
CREATE POLICY clinic_runtime_config_no_client_access
  ON private.clinic_runtime_config
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON TABLE private.clinic_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.clinic_runtime_config TO service_role;

CREATE OR REPLACE FUNCTION private.is_clinic_global_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT COALESCE((
    SELECT c.enabled IS TRUE
       AND c.allowed_environment IN ('staging', 'production')
      FROM private.clinic_runtime_config AS c
     WHERE c.id IS TRUE
  ), false);
$$;

CREATE TABLE IF NOT EXISTS public.organization_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  feature_key text NOT NULL DEFAULT 'clinic'
    CHECK (feature_key = 'clinic'),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_feature_flags_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_feature_flags_org_key
  ON public.organization_feature_flags (organization_id, feature_key);

CREATE INDEX IF NOT EXISTS organization_feature_flags_by_organization
  ON public.organization_feature_flags (organization_id);

CREATE OR REPLACE FUNCTION private.is_clinic_feature_enabled(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND (SELECT private.is_clinic_global_enabled())
     AND EXISTS (
       SELECT 1
         FROM public.organization_feature_flags AS f
        WHERE f.organization_id = p_organization_id
          AND f.feature_key = 'clinic'
          AND f.enabled IS TRUE
     );
$$;

DROP POLICY IF EXISTS organizations_select_active_member ON public.organizations;
DROP POLICY IF EXISTS organizations_select_feature_member ON public.organizations;
CREATE POLICY organizations_select_feature_member
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_clinic_feature_enabled(id))
    AND (SELECT private.is_organization_member(id))
  );

DROP POLICY IF EXISTS memberships_select_active_member ON public.organization_memberships;
DROP POLICY IF EXISTS memberships_select_feature_member ON public.organization_memberships;
CREATE POLICY memberships_select_feature_member
  ON public.organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_clinic_feature_enabled(organization_id))
    AND (SELECT private.is_organization_member(organization_id))
  );

ALTER TABLE public.organization_feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_feature_flags_select_manager ON public.organization_feature_flags;
CREATE POLICY organization_feature_flags_select_manager
  ON public.organization_feature_flags
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_clinic_feature_enabled(organization_id))
    AND (SELECT private.has_organization_role(organization_id, ARRAY['owner', 'manager']::text[]))
  );

REVOKE ALL ON TABLE public.organization_feature_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_feature_flags TO authenticated;
GRANT ALL ON TABLE public.organization_feature_flags TO service_role;

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name text,
  p_legal_name text DEFAULT NULL,
  p_trade_name text DEFAULT NULL,
  p_document_number text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_locale text DEFAULT 'pt-BR',
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization public.organizations;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;

  IF NOT (SELECT private.is_clinic_global_enabled()) THEN
    RAISE EXCEPTION 'clinic feature is globally disabled' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN
    RAISE EXCEPTION 'professional profile required' USING ERRCODE = '23503';
  END IF;

  IF nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'organization name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (
    name,
    trade_name,
    legal_name,
    document_number,
    contact_email,
    contact_phone,
    locale,
    timezone,
    created_by
  )
  VALUES (
    btrim(p_name),
    nullif(btrim(p_trade_name), ''),
    nullif(btrim(p_legal_name), ''),
    nullif(btrim(p_document_number), ''),
    nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''),
    btrim(coalesce(p_locale, 'pt-BR')),
    btrim(coalesce(p_timezone, 'America/Sao_Paulo')),
    v_actor
  )
  RETURNING * INTO v_organization;

  INSERT INTO public.organization_memberships (
    organization_id,
    professional_id,
    membership_role,
    status,
    clinical_access_enabled,
    created_by
  )
  VALUES (
    v_organization.id,
    v_actor,
    'owner',
    'active',
    false,
    v_actor
  );

  RETURN v_organization;
END;
$$;

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

  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
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

  -- Approved policy: former owner remains an active manager and preserves
  -- clinical_access_enabled.
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

REVOKE ALL ON FUNCTION private.is_clinic_global_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_clinic_feature_enabled(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_clinic_feature_enabled(uuid) TO authenticated;
-- Required by manager/owner-only RLS policies; the private schema is not
-- exposed through PostgREST and anon remains denied.
GRANT EXECUTE ON FUNCTION private.has_organization_role(uuid, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_organization_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_owner(uuid, uuid) TO authenticated;

COMMIT;
