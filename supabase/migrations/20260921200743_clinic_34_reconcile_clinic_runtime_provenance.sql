-- Formal forward reconciliation for clinic migrations 32 and 33.
-- This migration is intentionally validation-only: it records the verified
-- staging runtime without replaying data updates or recreating memberships.
DO $$
BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id = true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'clinic_34 reconciliation requires staging';
  END IF;

  IF to_regprocedure('public.list_admin_clinic_directory()') IS NULL THEN
    RAISE EXCEPTION 'clinic migration 32 runtime function is missing';
  END IF;

  IF to_regprocedure('public.get_clinic_contexts()') IS NULL
    OR to_regprocedure('private.capture_clinic_invitation_access_mode()') IS NULL
    OR to_regprocedure('private.apply_clinic_invitation_access_mode()') IS NULL THEN
    RAISE EXCEPTION 'clinic migration 33 runtime functions are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'professionals'
      AND column_name = 'professional_access_mode'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organization_invitations'
      AND column_name = 'intended_access_mode'
  ) THEN
    RAISE EXCEPTION 'clinic migration 33 runtime columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.professionals'::regclass
      AND conname = 'professionals_access_mode_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organization_invitations'::regclass
      AND conname = 'organization_invitations_access_mode_check'
  ) THEN
    RAISE EXCEPTION 'clinic migration 33 runtime constraints are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.organization_invitations'::regclass
      AND tgname = 'organization_invitations_access_mode'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.organization_memberships'::regclass
      AND tgname = 'organization_memberships_access_mode'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'clinic migration 33 runtime triggers are missing';
  END IF;

  IF has_function_privilege('anon', 'public.list_admin_clinic_directory()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.list_admin_clinic_directory()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.list_admin_clinic_directory()', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinic migration 32 function privileges are inconsistent';
  END IF;

  IF has_function_privilege('anon', 'public.get_clinic_contexts()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_clinic_contexts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinic migration 33 function privileges are inconsistent';
  END IF;
END;
$$;
