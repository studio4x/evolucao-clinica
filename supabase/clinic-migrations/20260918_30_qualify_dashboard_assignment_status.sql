-- Fase 6: reproduzido via E2E integrado (dashboard administrativo HTTP 503 / 42702).
-- Exclusivamente staging; artefato equivalente de produção exige revisão separada.
BEGIN;
DO $$ BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id=true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'staging only';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_organization_dashboard(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_membership public.organization_memberships;
  v_org public.organizations;
  v_subscription private.organization_subscriptions;
  v_active_patients bigint;
  v_archived_patients bigint;
  v_active_members bigint;
  v_suspended_members bigint;
  v_clinical_members bigint;
  v_active_assignments bigint;
  v_primary_assignments bigint;
  v_secondary_assignments bigint;
  v_consultant_assignments bigint;
  v_pending_invites bigint;
  v_pending_clinical_invites bigint;
  v_my_patients bigint;
  v_my_primary bigint;
  v_my_secondary bigint;
  v_my_consultant bigint;
BEGIN
  IF v_actor IS NULL OR NOT private.can_access_organization_workspace(p_organization_id) THEN
    RAISE EXCEPTION 'organization dashboard is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id;
  SELECT * INTO v_membership FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active';
  v_role := v_membership.membership_role;

  IF v_role IN ('owner', 'manager') THEN
    SELECT count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE status = 'archived')
      INTO v_active_patients, v_archived_patients
      FROM public.organization_patients WHERE organization_id = p_organization_id;
    SELECT count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE status = 'suspended'),
           count(*) FILTER (WHERE status = 'active' AND clinical_access_enabled IS TRUE)
      INTO v_active_members, v_suspended_members, v_clinical_members
      FROM public.organization_memberships WHERE organization_id = p_organization_id;
    SELECT count(*) FILTER (WHERE a.status = 'active'),
           count(*) FILTER (WHERE a.status = 'active' AND assignment_role = 'primary'),
           count(*) FILTER (WHERE a.status = 'active' AND assignment_role = 'secondary'),
           count(*) FILTER (WHERE a.status = 'active' AND assignment_role = 'consultant')
      INTO v_active_assignments, v_primary_assignments, v_secondary_assignments, v_consultant_assignments
      FROM public.patient_professional_assignments a
      JOIN public.organization_patients op ON op.id = a.organization_patient_id
     WHERE op.organization_id = p_organization_id;
    SELECT count(*) FILTER (WHERE status = 'pending' AND expires_at > clock_timestamp()),
           count(*) FILTER (WHERE status = 'pending' AND expires_at > clock_timestamp() AND intended_clinical_access IS TRUE)
      INTO v_pending_invites, v_pending_clinical_invites
      FROM public.organization_invitations WHERE organization_id = p_organization_id;
    SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'tradeName', v_org.trade_name,
        'operationalStatus', v_org.operational_status, 'membershipRole', v_role,
        'clinicalAccessEnabled', v_membership.clinical_access_enabled,
        'entitlementMode', private.organization_entitlement_mode(p_organization_id)),
      'scope', 'administrative',
      'patients', jsonb_build_object('active', coalesce(v_active_patients, 0), 'archived', coalesce(v_archived_patients, 0)),
      'team', jsonb_build_object('active', coalesce(v_active_members, 0), 'suspended', coalesce(v_suspended_members, 0), 'clinicalAccessEnabled', coalesce(v_clinical_members, 0)),
      'assignments', jsonb_build_object('active', coalesce(v_active_assignments, 0), 'primary', coalesce(v_primary_assignments, 0), 'secondary', coalesce(v_secondary_assignments, 0), 'consultant', coalesce(v_consultant_assignments, 0)),
      'invitations', jsonb_build_object('pending', coalesce(v_pending_invites, 0), 'pendingClinical', coalesce(v_pending_clinical_invites, 0)),
      'seats', jsonb_build_object('contracted', coalesce(v_subscription.contracted_seats, 0),
        'active', coalesce(v_clinical_members, 0), 'reserved', coalesce(v_pending_clinical_invites, 0),
        'available', coalesce(v_subscription.contracted_seats, 0) - coalesce(v_clinical_members, 0) - coalesce(v_pending_clinical_invites, 0)),
      'financial', CASE WHEN v_subscription.id IS NULL THEN NULL ELSE jsonb_build_object(
        'planCode', v_subscription.plan_code, 'billingInterval', v_subscription.billing_interval,
        'financialStatus', v_subscription.financial_status, 'cancelAtPeriodEnd', v_subscription.cancel_at_period_end,
        'gracePeriodEndsAt', v_subscription.grace_period_ends_at) END
    );
  END IF;

  SELECT count(*) FILTER (WHERE op.status = 'active'),
         count(*) FILTER (WHERE a.assignment_role = 'primary'),
         count(*) FILTER (WHERE a.assignment_role = 'secondary'),
         count(*) FILTER (WHERE a.assignment_role = 'consultant')
    INTO v_my_patients, v_my_primary, v_my_secondary, v_my_consultant
    FROM public.patient_professional_assignments a
    JOIN public.organization_patients op ON op.id = a.organization_patient_id
   WHERE op.organization_id = p_organization_id AND a.professional_id = v_actor AND a.status = 'active';
  RETURN jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'tradeName', v_org.trade_name,
      'operationalStatus', v_org.operational_status, 'membershipRole', v_role,
      'clinicalAccessEnabled', v_membership.clinical_access_enabled,
      'entitlementMode', private.organization_entitlement_mode(p_organization_id)),
    'scope', 'professional',
    'myPatients', jsonb_build_object('active', coalesce(v_my_patients, 0), 'primary', coalesce(v_my_primary, 0),
      'secondary', coalesce(v_my_secondary, 0), 'consultant', coalesce(v_my_consultant, 0)),
    'membership', jsonb_build_object('status', v_membership.status, 'clinicalAccessEnabled', v_membership.clinical_access_enabled)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_organization_dashboard(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_dashboard(uuid) TO authenticated;
COMMIT;
