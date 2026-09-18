-- Fase 5. Ecossistema empresarial. Staging hwkdwinfckmjoriqxbjk בלבד.
-- Dashboard/auditoria operacional, lifecycle de paciente e reatribuição de Primary.
-- Nenhuma operação desta migration lê ou altera conteúdo de evolutions.
BEGIN;

DO $$
BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id = true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'Phase 5 requires staging';
  END IF;
END $$;

ALTER TABLE private.organization_admin_events
  ADD COLUMN organization_patient_id uuid NULL
    REFERENCES public.organization_patients(id) ON DELETE NO ACTION,
  ADD COLUMN assignment_id uuid NULL
    REFERENCES public.patient_professional_assignments(id) ON DELETE NO ACTION,
  ADD COLUMN old_primary_professional_id uuid NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  ADD COLUMN new_primary_professional_id uuid NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  ADD COLUMN keep_previous_as_secondary boolean NULL;

CREATE INDEX organization_admin_events_by_cursor
  ON private.organization_admin_events (organization_id, created_at DESC, id DESC);
CREATE INDEX organization_admin_events_by_organization_patient
  ON private.organization_admin_events (organization_patient_id, created_at DESC, id DESC);
CREATE INDEX organization_admin_events_by_assignment
  ON private.organization_admin_events (assignment_id, created_at DESC, id DESC);

ALTER TABLE private.organization_admin_events DROP CONSTRAINT organization_admin_events_event_type_check;
ALTER TABLE private.organization_admin_events ADD CONSTRAINT organization_admin_events_event_type_check CHECK (event_type IN (
  'organization_created', 'organization_rollout_enabled', 'organization_rollout_disabled', 'owner_transferred',
  'member_suspended', 'member_reactivated', 'member_removed', 'member_role_changed',
  'member_clinical_access_enabled', 'member_clinical_access_disabled',
  'invitation_created', 'invitation_revoked', 'invitation_accepted', 'invitation_expired',
  'invitation_resent', 'invitation_delivery_sent', 'invitation_delivery_failed',
  'organization_patient_created', 'organization_patient_updated',
  'patient_assignment_created', 'patient_assignment_revoked',
  'organization_patient_archived', 'organization_patient_reactivated',
  'patient_primary_reassigned', 'patient_assignment_role_changed'
));

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
    SELECT count(*) FILTER (WHERE status = 'active'),
           count(*) FILTER (WHERE status = 'active' AND assignment_role = 'primary'),
           count(*) FILTER (WHERE status = 'active' AND assignment_role = 'secondary'),
           count(*) FILTER (WHERE status = 'active' AND assignment_role = 'consultant')
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

CREATE OR REPLACE FUNCTION public.list_organization_admin_events(
  p_organization_id uuid,
  p_limit integer DEFAULT 25,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, event_type text, created_at timestamptz, actor_type text,
  actor_professional_id uuid, actor_name text, subject_professional_id uuid,
  subject_name text, organization_patient_id uuid, patient_display_name text,
  assignment_id uuid, old_role text, new_role text, old_status text, new_status text,
  reason text, old_primary_professional_id uuid, new_primary_professional_id uuid,
  keep_previous_as_secondary boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_role text;
BEGIN
  IF v_actor IS NULL OR NOT private.can_access_organization_workspace(p_organization_id) THEN
    RAISE EXCEPTION 'organization audit is not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = v_actor AND status = 'active';
  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'organization audit is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'audit limit is invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT e.id, e.event_type, e.created_at, e.actor_type, e.actor_professional_id,
         actor.full_name, e.subject_professional_id, subject.full_name,
         e.organization_patient_id, patient.full_name, e.assignment_id,
         e.old_role, e.new_role, e.old_status, e.new_status, e.reason,
         e.old_primary_professional_id, e.new_primary_professional_id, e.keep_previous_as_secondary
    FROM private.organization_admin_events e
    LEFT JOIN public.professionals actor ON actor.id = e.actor_professional_id
    LEFT JOIN public.professionals subject ON subject.id = e.subject_professional_id
    LEFT JOIN public.organization_patients op ON op.id = e.organization_patient_id
    LEFT JOIN public.patients patient ON patient.id = op.patient_id
   WHERE e.organization_id = p_organization_id
     AND (p_event_type IS NULL OR e.event_type = p_event_type)
     AND (p_cursor_created_at IS NULL OR e.created_at < p_cursor_created_at
          OR (e.created_at = p_cursor_created_at AND e.id < p_cursor_id))
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_organization_patient(p_organization_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
DECLARE v_op public.organization_patients; v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_op FROM public.organization_patients WHERE id = p_organization_patient_id FOR UPDATE;
  IF NOT FOUND OR v_actor IS NULL OR NOT private.can_access_organization_workspace(v_op.organization_id)
     OR NOT private.has_organization_role(v_op.organization_id, ARRAY['owner','manager']::text[]) THEN
    RAISE EXCEPTION 'patient archive is not authorized' USING ERRCODE='42501';
  END IF;
  IF v_op.status = 'archived' THEN RETURN jsonb_build_object('organizationPatientId', v_op.id, 'status', v_op.status); END IF;
  UPDATE public.organization_patients SET status='archived', updated_at=clock_timestamp() WHERE id=v_op.id RETURNING * INTO v_op;
  INSERT INTO private.organization_admin_events(event_type,organization_id,actor_type,actor_professional_id,organization_patient_id,old_status,new_status)
  VALUES('organization_patient_archived',v_op.organization_id,'authenticated',v_actor,v_op.id,'active','archived');
  RETURN jsonb_build_object('organizationPatientId', v_op.id, 'status', v_op.status);
END; $$;

CREATE OR REPLACE FUNCTION public.reactivate_organization_patient(p_organization_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
DECLARE v_op public.organization_patients; v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_op FROM public.organization_patients WHERE id = p_organization_patient_id FOR UPDATE;
  IF NOT FOUND OR v_actor IS NULL OR NOT private.can_expand_organization(v_op.organization_id)
     OR NOT private.has_organization_role(v_op.organization_id, ARRAY['owner','manager']::text[]) THEN
    RAISE EXCEPTION 'patient reactivation is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_professional_assignments WHERE organization_patient_id=v_op.id AND status='active' AND assignment_role='primary') THEN
    RAISE EXCEPTION 'active patient requires a Primary assignment' USING ERRCODE='23514';
  END IF;
  IF v_op.status = 'active' THEN RETURN jsonb_build_object('organizationPatientId', v_op.id, 'status', v_op.status); END IF;
  UPDATE public.organization_patients SET status='active', updated_at=clock_timestamp() WHERE id=v_op.id RETURNING * INTO v_op;
  INSERT INTO private.organization_admin_events(event_type,organization_id,actor_type,actor_professional_id,organization_patient_id,old_status,new_status)
  VALUES('organization_patient_reactivated',v_op.organization_id,'authenticated',v_actor,v_op.id,'archived','active');
  RETURN jsonb_build_object('organizationPatientId', v_op.id, 'status', v_op.status);
END; $$;

CREATE OR REPLACE FUNCTION public.reassign_organization_patient_primary(
  p_organization_patient_id uuid, p_new_primary_professional_id uuid,
  p_keep_previous_as_secondary boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid()); v_op public.organization_patients;
  v_current public.patient_professional_assignments; v_target public.patient_professional_assignments;
  v_membership public.organization_memberships; v_target_id uuid; v_org uuid; v_has_target boolean := false;
BEGIN
  IF p_new_primary_professional_id IS NULL THEN RAISE EXCEPTION 'new Primary is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_op FROM public.organization_patients WHERE id=p_organization_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE='P0002'; END IF;
  v_org := v_op.organization_id;
  IF v_actor IS NULL OR NOT private.can_expand_organization(v_org)
     OR NOT private.has_organization_role(v_org, ARRAY['owner','manager']::text[]) OR v_op.status <> 'active' THEN
    RAISE EXCEPTION 'Primary reassignment is not authorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_current FROM public.patient_professional_assignments
   WHERE organization_patient_id=v_op.id AND assignment_role='primary' AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active Primary is required' USING ERRCODE='23514'; END IF;
  IF v_current.professional_id = p_new_primary_professional_id THEN
    RETURN jsonb_build_object('organizationPatientId',v_op.id,'oldPrimaryProfessionalId',v_current.professional_id,
      'newPrimaryProfessionalId',v_current.professional_id,'keepPreviousAsSecondary',p_keep_previous_as_secondary,'assignmentId',v_current.id);
  END IF;
  SELECT * INTO v_membership FROM public.organization_memberships
   WHERE organization_id=v_org AND professional_id=p_new_primary_professional_id AND status='active' FOR SHARE;
  IF NOT FOUND OR NOT v_membership.clinical_access_enabled OR NOT private.can_assign_clinical_professional(v_org,p_new_primary_professional_id) THEN
    RAISE EXCEPTION 'new Primary is not eligible' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_target FROM public.patient_professional_assignments
   WHERE organization_patient_id=v_op.id AND professional_id=p_new_primary_professional_id AND status='active' FOR UPDATE;
  v_has_target := FOUND;
  IF FOUND AND v_target.assignment_role='primary' THEN
    RAISE EXCEPTION 'new Primary is already active' USING ERRCODE='40901';
  END IF;
  IF p_keep_previous_as_secondary THEN
    UPDATE public.patient_professional_assignments SET assignment_role='secondary', can_edit=false, can_create_evolution=true, updated_at=clock_timestamp() WHERE id=v_current.id;
  ELSE
    UPDATE public.patient_professional_assignments SET status='revoked', revoked_at=clock_timestamp(), can_create_evolution=false, updated_at=clock_timestamp() WHERE id=v_current.id;
  END IF;
  IF v_has_target THEN
    UPDATE public.patient_professional_assignments SET assignment_role='primary', can_edit=true, can_create_evolution=true, updated_at=clock_timestamp() WHERE id=v_target.id RETURNING id INTO v_target_id;
  ELSE
    INSERT INTO public.patient_professional_assignments(organization_patient_id,professional_id,assignment_role,can_edit,can_view_shared_summary,can_create_evolution,assigned_by)
    VALUES(v_op.id,p_new_primary_professional_id,'primary',true,false,true,v_actor) RETURNING id INTO v_target_id;
  END IF;
  INSERT INTO private.organization_admin_events(event_type,organization_id,actor_type,actor_professional_id,subject_professional_id,organization_patient_id,assignment_id,old_primary_professional_id,new_primary_professional_id,keep_previous_as_secondary,old_role,new_role,old_status,new_status)
  VALUES('patient_primary_reassigned',v_org,'authenticated',v_actor,p_new_primary_professional_id,v_op.id,v_target_id,v_current.professional_id,p_new_primary_professional_id,p_keep_previous_as_secondary,'primary','primary','active','active');
  RETURN jsonb_build_object('organizationPatientId',v_op.id,'oldPrimaryProfessionalId',v_current.professional_id,
    'newPrimaryProfessionalId',p_new_primary_professional_id,'keepPreviousAsSecondary',p_keep_previous_as_secondary,'assignmentId',v_target_id);
END; $$;

-- Generic demographic update remains callable for Primary, but lifecycle is no longer accepted there.
CREATE OR REPLACE FUNCTION public.update_organization_patient(
  p_organization_patient_id uuid, p_full_name text DEFAULT NULL, p_birth_date date DEFAULT NULL,
  p_phone text DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE v_op public.organization_patients; v_patient public.patients;
BEGIN
  IF p_status IS NOT NULL THEN RAISE EXCEPTION 'patient lifecycle requires a dedicated operation' USING ERRCODE='42501'; END IF;
  IF NOT private.can_edit_organization_patient(p_organization_patient_id) THEN RAISE EXCEPTION 'organization patient update is not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.organization_patients WHERE id=p_organization_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE='P0002'; END IF;
  IF p_full_name IS NOT NULL AND char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE='22023'; END IF;
  IF p_phone IS NOT NULL AND char_length(btrim(p_phone)) > 32 THEN RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE='22023'; END IF;
  UPDATE public.patients SET full_name=COALESCE(btrim(p_full_name),full_name), birth_date=COALESCE(p_birth_date,birth_date), phone=CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone),'') END, updated_at=clock_timestamp() WHERE id=v_op.patient_id RETURNING * INTO v_patient;
  PERFORM private.record_organization_admin_event('organization_patient_updated',v_op.organization_id,'authenticated',auth.uid(),NULL,NULL,NULL,NULL,NULL,v_op.status,v_op.status,NULL);
  RETURN jsonb_build_object('organizationPatientId',v_op.id,'patientId',v_patient.id,'status',v_op.status,'fullName',v_patient.full_name,'birthDate',v_patient.birth_date,'phone',v_patient.phone);
END; $$;

REVOKE ALL ON FUNCTION public.get_organization_dashboard(uuid), public.list_organization_admin_events(uuid,integer,timestamptz,uuid,text), public.archive_organization_patient(uuid), public.reactivate_organization_patient(uuid), public.reassign_organization_patient_primary(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_dashboard(uuid), public.list_organization_admin_events(uuid,integer,timestamptz,uuid,text), public.archive_organization_patient(uuid), public.reactivate_organization_patient(uuid), public.reassign_organization_patient_primary(uuid,uuid,boolean) TO authenticated;
COMMIT;
