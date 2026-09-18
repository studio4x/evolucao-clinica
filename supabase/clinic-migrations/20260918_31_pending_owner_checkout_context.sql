-- Fase 6B: pending checkout context only; staging authorization remains explicit.
BEGIN;
DO $$ BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id=true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'staging only';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_pending_organization_checkout_contexts()
RETURNS TABLE(id uuid, name text, trade_name text, operational_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT o.id, o.name, o.trade_name, o.operational_status
    FROM public.organizations o
    JOIN public.organization_memberships m ON m.organization_id=o.id
   WHERE m.professional_id=(SELECT auth.uid())
     AND m.membership_role='owner' AND m.status='active'
     AND o.operational_status='pending_setup'
     AND private.is_clinic_feature_enabled(o.id);
$$;
REVOKE ALL ON FUNCTION public.get_pending_organization_checkout_contexts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_organization_checkout_contexts() TO authenticated;
COMMIT;
