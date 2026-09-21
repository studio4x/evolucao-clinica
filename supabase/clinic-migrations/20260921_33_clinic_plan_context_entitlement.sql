-- Fase 6C: ownership explícito do Plano Clínica e entitlement por contexto.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk.
-- Não executar em produção nem via supabase db push.
BEGIN;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS professional_access_mode text NOT NULL DEFAULT 'personal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.professionals'::regclass
      AND conname = 'professionals_access_mode_check'
  ) THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_access_mode_check
      CHECK (professional_access_mode IN ('personal', 'hybrid', 'clinic_only'));
  END IF;
END $$;

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS intended_access_mode text NOT NULL DEFAULT 'clinic_only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organization_invitations'::regclass
      AND conname = 'organization_invitations_access_mode_check'
  ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_access_mode_check
      CHECK (intended_access_mode IN ('personal', 'hybrid', 'clinic_only'));
  END IF;
END $$;

-- Existing personal accounts keep their independent entitlement when a
-- pending clinical invitation is accepted. New recipients default to clinic_only.
UPDATE public.organization_invitations AS i
SET intended_access_mode = CASE WHEN EXISTS (
  SELECT 1
    FROM auth.users AS u
    JOIN public.professionals AS p ON p.id = u.id
   WHERE lower(btrim(u.email)) = i.normalized_email
) THEN 'hybrid' ELSE 'clinic_only' END
WHERE i.intended_clinical_access IS TRUE
  AND i.status = 'pending';

CREATE OR REPLACE FUNCTION private.capture_clinic_invitation_access_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  IF NEW.intended_clinical_access IS TRUE THEN
    NEW.intended_access_mode := CASE WHEN EXISTS (
      SELECT 1
        FROM auth.users AS u
        JOIN public.professionals AS p ON p.id = u.id
       WHERE lower(btrim(u.email)) = NEW.normalized_email
    ) THEN 'hybrid' ELSE 'clinic_only' END;
  ELSE
    NEW.intended_access_mode := 'personal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_invitations_access_mode ON public.organization_invitations;
CREATE TRIGGER organization_invitations_access_mode
BEFORE INSERT OR UPDATE OF normalized_email, intended_clinical_access
ON public.organization_invitations
FOR EACH ROW EXECUTE FUNCTION private.capture_clinic_invitation_access_mode();

CREATE OR REPLACE FUNCTION private.apply_clinic_invitation_access_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_email text;
  v_mode text;
BEGIN
  IF NEW.clinical_access_enabled IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT lower(btrim(email)) INTO v_email FROM auth.users WHERE id = NEW.professional_id;
  SELECT i.intended_access_mode INTO v_mode
    FROM public.organization_invitations AS i
   WHERE i.organization_id = NEW.organization_id
     AND i.normalized_email = v_email
     AND i.intended_clinical_access IS TRUE
     AND i.status IN ('pending', 'accepted')
   ORDER BY i.created_at DESC, i.id DESC
   LIMIT 1;
  IF v_mode IS NOT NULL THEN
    UPDATE public.professionals
       SET professional_access_mode = v_mode, updated_at = clock_timestamp()
     WHERE id = NEW.professional_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_memberships_access_mode ON public.organization_memberships;
CREATE TRIGGER organization_memberships_access_mode
AFTER INSERT ON public.organization_memberships
FOR EACH ROW EXECUTE FUNCTION private.apply_clinic_invitation_access_mode();

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

  v_personal_available := v_profile.role = 'admin'
    OR (v_profile.professional_access_mode <> 'clinic_only'
      AND v_profile.subscription_status IN ('active', 'trialing')
      AND (v_profile.subscription_ends_at IS NULL OR v_profile.subscription_ends_at > clock_timestamp()));

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

REVOKE ALL ON FUNCTION private.capture_clinic_invitation_access_mode() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_clinic_invitation_access_mode() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
