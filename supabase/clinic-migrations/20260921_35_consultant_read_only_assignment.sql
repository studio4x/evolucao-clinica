-- Fase 6D: capabilities explícitas de Primary, Secondary e Consultor.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não editar/reaplicar as migrations 23, 26, 32, 33 ou 34; não aplicar em produção.
BEGIN;

-- O papel, e não o default legado, é a autoridade das capabilities.
ALTER TABLE public.patient_professional_assignments
  ALTER COLUMN can_edit SET DEFAULT false,
  ALTER COLUMN can_create_evolution SET DEFAULT false;

CREATE OR REPLACE FUNCTION private.apply_patient_assignment_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  NEW.can_edit := NEW.status = 'active' AND NEW.assignment_role = 'primary';
  NEW.can_create_evolution := CASE
    WHEN NEW.status = 'active' AND NEW.assignment_role = 'primary' THEN true
    WHEN NEW.status = 'active' AND NEW.assignment_role = 'secondary' THEN true
    WHEN NEW.status = 'active' AND NEW.assignment_role = 'consultant' THEN false
    ELSE false
  END;
  NEW.can_view_shared_summary := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_assignment_capabilities ON public.patient_professional_assignments;
CREATE TRIGGER patient_assignment_capabilities
BEFORE INSERT OR UPDATE OF assignment_role, status, can_edit, can_create_evolution, can_view_shared_summary
ON public.patient_professional_assignments
FOR EACH ROW EXECUTE FUNCTION private.apply_patient_assignment_capabilities();

-- Backfill active and historical rows without changing assignment ownership or status.
UPDATE public.patient_professional_assignments
SET can_edit = (status = 'active' AND assignment_role = 'primary'),
    can_create_evolution = (status = 'active' AND assignment_role IN ('primary', 'secondary')),
    can_view_shared_summary = false,
    updated_at = clock_timestamp();

-- Forward correction: personal workspace availability is a global profile-state
-- decision, independent from the commercial personal subscription entitlement.
CREATE OR REPLACE FUNCTION public.get_clinic_contexts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.professionals;
  v_personal_available boolean;
  v_organizations jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_profile FROM public.professionals WHERE id = v_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional profile required' USING ERRCODE = '42501'; END IF;

  v_personal_available := v_profile.status = 'active'
    AND v_profile.professional_access_mode <> 'clinic_only';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'tradeName', o.trade_name,
    'operationalStatus', o.operational_status,
    'membershipRole', m.membership_role,
    'clinicalAccessEnabled', m.clinical_access_enabled,
    'planCode', s.plan_code,
    'planLabel', CASE WHEN s.plan_code IS NOT NULL THEN 'Plano Clínica' ELSE NULL END,
    'entitlementMode', private.organization_entitlement_mode(o.id),
    'accessSource', CASE WHEN m.membership_role IN ('owner', 'manager') THEN 'organization_admin'
                         WHEN m.clinical_access_enabled IS TRUE THEN 'organization_seat'
                         ELSE 'organization_membership' END,
    'licenseActive', CASE WHEN m.membership_role IN ('owner', 'manager')
                              THEN private.organization_entitlement_mode(o.id) IN ('full', 'restricted')
                          ELSE m.clinical_access_enabled IS TRUE
                               AND private.organization_entitlement_mode(o.id) IN ('full', 'restricted') END
  ) ORDER BY lower(coalesce(o.name, '')), o.id), '[]'::jsonb)
    INTO v_organizations
    FROM public.organization_memberships AS m
    JOIN public.organizations AS o ON o.id = m.organization_id
    LEFT JOIN private.organization_subscriptions AS s ON s.organization_id = o.id
   WHERE m.professional_id = v_actor
     AND m.status = 'active'
     AND o.operational_status <> 'archived';

  RETURN jsonb_build_object(
    'personal', jsonb_build_object('available', v_personal_available),
    'accessMode', v_profile.professional_access_mode,
    'organizations', v_organizations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_contexts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_contexts() TO authenticated;
REVOKE ALL ON FUNCTION private.apply_patient_assignment_capabilities() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
