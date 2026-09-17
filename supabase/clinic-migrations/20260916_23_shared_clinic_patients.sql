-- Fase 3: pacientes compartilhados, sem alterar evolutions nem o modelo
-- individual. Aplicar exclusivamente no Supabase staging
-- hwkdwinfckmjoriqxbjk; não usar em produção.

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  patient_id uuid NOT NULL
    REFERENCES public.patients(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL REFERENCES public.professionals(id) ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT organization_patients_org_patient_unique UNIQUE (organization_id, patient_id)
);

CREATE INDEX IF NOT EXISTS organization_patients_by_organization
  ON public.organization_patients (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_patients_by_patient
  ON public.organization_patients (patient_id);

CREATE TABLE IF NOT EXISTS public.patient_professional_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_patient_id uuid NOT NULL
    REFERENCES public.organization_patients(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE NO ACTION,
  assignment_role text NOT NULL
    CHECK (assignment_role IN ('primary', 'secondary', 'consultant')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  can_edit boolean NOT NULL DEFAULT false,
  can_view_shared_summary boolean NOT NULL DEFAULT false,
  can_create_evolution boolean NOT NULL DEFAULT false,
  assigned_by uuid NOT NULL REFERENCES public.professionals(id) ON DELETE NO ACTION,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT patient_assignment_revoked_timestamp CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL) OR status = 'active'
  ),
  CONSTRAINT patient_assignment_primary_edit CHECK (
    assignment_role <> 'primary' OR can_edit IS TRUE
  ),
  CONSTRAINT patient_assignment_structural_evolution CHECK (
    can_create_evolution IS FALSE
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_assignments_one_active_professional
  ON public.patient_professional_assignments (organization_patient_id, professional_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS patient_assignments_one_active_primary
  ON public.patient_professional_assignments (organization_patient_id)
  WHERE status = 'active' AND assignment_role = 'primary';
CREATE INDEX IF NOT EXISTS patient_assignments_by_professional
  ON public.patient_professional_assignments (professional_id, status);
CREATE INDEX IF NOT EXISTS patient_assignments_by_patient
  ON public.patient_professional_assignments (organization_patient_id, status, assignment_role);

CREATE OR REPLACE FUNCTION private.is_organization_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_patients op WHERE op.patient_id = p_patient_id
  );
$$;

CREATE OR REPLACE FUNCTION private.can_assign_clinical_professional(
  p_organization_id uuid,
  p_professional_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_memberships m
     WHERE m.organization_id = p_organization_id
       AND m.professional_id = p_professional_id
       AND m.status = 'active'
       AND m.clinical_access_enabled IS TRUE
       AND m.membership_role IN ('owner', 'manager', 'professional')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_organization_patient(p_organization_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_patients op
     WHERE op.id = p_organization_patient_id
       AND private.can_access_organization_workspace(op.organization_id)
       AND (
         private.has_organization_role(op.organization_id, ARRAY['owner', 'manager']::text[])
         OR EXISTS (
           SELECT 1
             FROM public.patient_professional_assignments a
             JOIN public.organization_memberships m
               ON m.organization_id = op.organization_id
              AND m.professional_id = a.professional_id
            WHERE a.organization_patient_id = op.id
              AND a.professional_id = auth.uid()
              AND a.status = 'active'
              AND m.status = 'active'
              AND m.clinical_access_enabled IS TRUE
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_edit_organization_patient(p_organization_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_patients op
     WHERE op.id = p_organization_patient_id
       AND private.can_access_organization_workspace(op.organization_id)
       AND (
         private.has_organization_role(op.organization_id, ARRAY['owner', 'manager']::text[])
         OR EXISTS (
           SELECT 1
             FROM public.patient_professional_assignments a
             JOIN public.organization_memberships m
               ON m.organization_id = op.organization_id
              AND m.professional_id = a.professional_id
            WHERE a.organization_patient_id = op.id
              AND a.professional_id = auth.uid()
              AND a.assignment_role = 'primary'
              AND a.status = 'active'
              AND m.status = 'active'
              AND m.clinical_access_enabled IS TRUE
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_organization_patient_assignments(
  p_organization_patient_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_patients op
     WHERE op.id = p_organization_patient_id
       AND private.can_expand_organization(op.organization_id)
       AND private.has_organization_role(op.organization_id, ARRAY['owner', 'manager']::text[])
  );
$$;

CREATE OR REPLACE FUNCTION private.assert_active_organization_patient_primary()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization_patient_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'organization_patients' THEN
    v_organization_patient_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_organization_patient_id := COALESCE(NEW.organization_patient_id, OLD.organization_patient_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_patients op
     WHERE op.id = v_organization_patient_id AND op.status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.patient_professional_assignments a
     WHERE a.organization_patient_id = v_organization_patient_id
       AND a.assignment_role = 'primary' AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active organization patient requires an active primary assignment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organization_patients_require_primary ON public.organization_patients;
CREATE CONSTRAINT TRIGGER organization_patients_require_primary
AFTER INSERT OR UPDATE ON public.organization_patients
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_active_organization_patient_primary();

DROP TRIGGER IF EXISTS patient_assignments_require_primary ON public.patient_professional_assignments;
CREATE CONSTRAINT TRIGGER patient_assignments_require_primary
AFTER INSERT OR UPDATE OR DELETE ON public.patient_professional_assignments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.assert_active_organization_patient_primary();

CREATE OR REPLACE FUNCTION public.create_organization_patient(
  p_organization_id uuid,
  p_full_name text,
  p_birth_date date DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_primary_professional_id uuid DEFAULT NULL,
  p_secondary_professional_ids uuid[] DEFAULT '{}',
  p_consultant_professional_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_patient public.patients;
  v_organization_patient public.organization_patients;
  v_primary uuid := COALESCE(p_primary_professional_id, v_actor);
  v_secondaries uuid[] := COALESCE(p_secondary_professional_ids, '{}');
  v_consultants uuid[] := COALESCE(p_consultant_professional_ids, '{}');
  v_professional uuid;
BEGIN
  IF v_actor IS NULL OR NOT private.can_expand_organization(p_organization_id)
     OR NOT private.has_organization_role(p_organization_id, ARRAY['owner', 'manager']::text[]) THEN
    RAISE EXCEPTION 'organization patient creation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 200
     OR p_phone IS NOT NULL AND char_length(btrim(p_phone)) > 32 THEN
    RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_primary_professional_id IS NULL THEN
    v_primary := v_actor;
  END IF;
  IF NOT private.can_assign_clinical_professional(p_organization_id, v_primary) THEN
    RAISE EXCEPTION 'primary professional is not eligible' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_secondaries || v_consultants || ARRAY[v_primary]) id WHERE id IS NULL)
     OR (SELECT count(*) FROM unnest(v_secondaries) id) <> cardinality(v_secondaries)
     OR (SELECT count(*) FROM unnest(v_consultants) id) <> cardinality(v_consultants)
     OR v_secondaries && v_consultants
     OR v_secondaries @> ARRAY[v_primary]
     OR v_consultants @> ARRAY[v_primary] THEN
    RAISE EXCEPTION 'organization patient assignments contain duplicates' USING ERRCODE = '22023';
  END IF;
  FOREACH v_professional IN ARRAY v_secondaries || v_consultants LOOP
    IF NOT private.can_assign_clinical_professional(p_organization_id, v_professional) THEN
      RAISE EXCEPTION 'assigned professional is not eligible' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  INSERT INTO public.patients (professional_id, full_name, birth_date, phone, status)
  VALUES (v_actor, btrim(p_full_name), p_birth_date, nullif(btrim(p_phone), ''), 'active')
  RETURNING * INTO v_patient;

  INSERT INTO public.organization_patients (organization_id, patient_id, created_by)
  VALUES (p_organization_id, v_patient.id, v_actor)
  RETURNING * INTO v_organization_patient;

  INSERT INTO public.patient_professional_assignments
    (organization_patient_id, professional_id, assignment_role, can_edit, can_view_shared_summary, can_create_evolution, assigned_by)
  VALUES (v_organization_patient.id, v_primary, 'primary', true, false, false, v_actor);
  FOREACH v_professional IN ARRAY v_secondaries LOOP
    INSERT INTO public.patient_professional_assignments
      (organization_patient_id, professional_id, assignment_role, assigned_by)
    VALUES (v_organization_patient.id, v_professional, 'secondary', v_actor);
  END LOOP;
  FOREACH v_professional IN ARRAY v_consultants LOOP
    INSERT INTO public.patient_professional_assignments
      (organization_patient_id, professional_id, assignment_role, assigned_by)
    VALUES (v_organization_patient.id, v_professional, 'consultant', v_actor);
  END LOOP;

  PERFORM private.record_organization_admin_event('organization_patient_created', p_organization_id, 'authenticated', v_actor, v_primary, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  RETURN jsonb_build_object('organization_patient_id', v_organization_patient.id, 'patient_id', v_patient.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_organization_patients(
  p_organization_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  organization_patient_id uuid,
  patient_id uuid,
  full_name text,
  birth_date date,
  phone text,
  status text,
  primary_professional_id uuid,
  primary_professional_name text,
  current_assignment_role text,
  assignment_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  IF NOT private.can_access_organization_workspace(p_organization_id) THEN
    RAISE EXCEPTION 'organization patient list is not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT op.id, op.patient_id, p.full_name, p.birth_date, p.phone, op.status,
    primary_assignment.professional_id, primary_professional.full_name,
    current_assignment.assignment_role, count(a.id), op.created_at, op.updated_at
  FROM public.organization_patients op
  JOIN public.patients p ON p.id = op.patient_id
  LEFT JOIN public.patient_professional_assignments a
    ON a.organization_patient_id = op.id AND a.status = 'active'
  LEFT JOIN LATERAL (
    SELECT a1.professional_id FROM public.patient_professional_assignments a1
     WHERE a1.organization_patient_id = op.id AND a1.status = 'active' AND a1.assignment_role = 'primary'
     LIMIT 1
  ) primary_assignment ON true
  LEFT JOIN public.professionals primary_professional ON primary_professional.id = primary_assignment.professional_id
  LEFT JOIN LATERAL (
    SELECT a2.assignment_role FROM public.patient_professional_assignments a2
     WHERE a2.organization_patient_id = op.id AND a2.professional_id = auth.uid() AND a2.status = 'active'
     LIMIT 1
  ) current_assignment ON true
  WHERE op.organization_id = p_organization_id
    AND (private.has_organization_role(p_organization_id, ARRAY['owner', 'manager']::text[])
         OR EXISTS (SELECT 1 FROM public.patient_professional_assignments ax WHERE ax.organization_patient_id = op.id AND ax.professional_id = auth.uid() AND ax.status = 'active'))
    AND (p_search IS NULL OR btrim(p_search) = '' OR p.full_name ILIKE '%' || btrim(p_search) || '%')
  GROUP BY op.id, p.id, primary_assignment.professional_id, primary_professional.full_name, current_assignment.assignment_role
  ORDER BY op.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_patient(p_organization_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_patient record;
BEGIN
  IF NOT private.can_access_organization_patient(p_organization_patient_id) THEN
    RAISE EXCEPTION 'organization patient is not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT op.id organization_patient_id, op.organization_id, op.patient_id, op.status organization_status,
         p.full_name, p.birth_date, p.phone, p.status patient_status, op.created_at, op.updated_at
    INTO v_patient
    FROM public.organization_patients op JOIN public.patients p ON p.id = op.patient_id
   WHERE op.id = p_organization_patient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'organizationPatientId', v_patient.organization_patient_id,
    'organizationId', v_patient.organization_id,
    'patientId', v_patient.patient_id,
    'status', v_patient.organization_status,
    'fullName', v_patient.full_name,
    'birthDate', v_patient.birth_date,
    'phone', v_patient.phone,
    'patientStatus', v_patient.patient_status,
    'createdAt', v_patient.created_at,
    'updatedAt', v_patient.updated_at,
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'professionalId', a.professional_id, 'fullName', prof.full_name,
        'professionalTitle', prof.professional_title, 'assignmentRole', a.assignment_role,
        'status', a.status, 'canEdit', a.can_edit, 'canViewSharedSummary', a.can_view_shared_summary,
        'assignedAt', a.assigned_at
      ) ORDER BY CASE a.assignment_role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END, prof.full_name)
      FROM public.patient_professional_assignments a
      JOIN public.professionals prof ON prof.id = a.professional_id
      WHERE a.organization_patient_id = p_organization_patient_id AND a.status = 'active'
    ), '[]'::jsonb),
    'currentAssignmentRole', (SELECT a.assignment_role FROM public.patient_professional_assignments a WHERE a.organization_patient_id = p_organization_patient_id AND a.professional_id = auth.uid() AND a.status = 'active' LIMIT 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_patient(
  p_organization_patient_id uuid,
  p_full_name text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_op public.organization_patients; v_patient public.patients;
BEGIN
  IF NOT private.can_edit_organization_patient(p_organization_patient_id) THEN
    RAISE EXCEPTION 'organization patient update is not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.organization_patients WHERE id = p_organization_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE = 'P0002'; END IF;
  IF p_full_name IS NOT NULL AND char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_phone IS NOT NULL AND char_length(btrim(p_phone)) > 32 THEN
    RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'organization patient status is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.patients SET full_name = COALESCE(btrim(p_full_name), full_name), birth_date = COALESCE(p_birth_date, birth_date), phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone), '') END, updated_at = clock_timestamp() WHERE id = v_op.patient_id RETURNING * INTO v_patient;
  UPDATE public.organization_patients SET status = COALESCE(p_status, status), updated_at = clock_timestamp() WHERE id = v_op.id RETURNING * INTO v_op;
  PERFORM private.record_organization_admin_event('organization_patient_updated', v_op.organization_id, 'authenticated', auth.uid(), NULL, NULL, NULL, NULL, NULL, NULL, v_op.status, NULL);
  RETURN jsonb_build_object('organizationPatientId', v_op.id, 'patientId', v_patient.id, 'status', v_op.status, 'fullName', v_patient.full_name, 'birthDate', v_patient.birth_date, 'phone', v_patient.phone);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_organization_patient_assignment(
  p_organization_patient_id uuid,
  p_professional_id uuid,
  p_assignment_role text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_org uuid; v_assignment public.patient_professional_assignments;
BEGIN
  IF p_assignment_role NOT IN ('secondary', 'consultant') OR p_professional_id IS NULL THEN
    RAISE EXCEPTION 'assignment input is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT organization_id INTO v_org FROM public.organization_patients WHERE id = p_organization_patient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT private.can_manage_organization_patient_assignments(p_organization_patient_id)
     OR NOT private.can_assign_clinical_professional(v_org, p_professional_id) THEN
    RAISE EXCEPTION 'assignment is not authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.patient_professional_assignments (organization_patient_id, professional_id, assignment_role, assigned_by)
  VALUES (p_organization_patient_id, p_professional_id, p_assignment_role, auth.uid()) RETURNING * INTO v_assignment;
  PERFORM private.record_organization_admin_event('patient_assignment_created', v_org, 'authenticated', auth.uid(), p_professional_id, NULL, NULL, NULL, p_assignment_role, NULL, 'active', NULL);
  RETURN jsonb_build_object('id', v_assignment.id, 'professionalId', v_assignment.professional_id, 'assignmentRole', v_assignment.assignment_role, 'status', v_assignment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_patient_assignment(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_assignment public.patient_professional_assignments; v_org uuid;
BEGIN
  SELECT a.* INTO v_assignment
    FROM public.patient_professional_assignments a
   WHERE a.id = p_assignment_id FOR UPDATE;
  SELECT op.organization_id INTO v_org
    FROM public.organization_patients op
   WHERE op.id = v_assignment.organization_patient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002'; END IF;
  IF v_assignment.assignment_role = 'primary' OR v_assignment.status <> 'active' OR NOT private.can_manage_organization_patient_assignments(v_assignment.organization_patient_id) THEN
    RAISE EXCEPTION 'primary or inactive assignment cannot be revoked' USING ERRCODE = '42501';
  END IF;
  UPDATE public.patient_professional_assignments SET status = 'revoked', revoked_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = p_assignment_id RETURNING * INTO v_assignment;
  PERFORM private.record_organization_admin_event('patient_assignment_revoked', v_org, 'authenticated', auth.uid(), v_assignment.professional_id, NULL, NULL, NULL, NULL, 'active', 'revoked', NULL);
  RETURN jsonb_build_object('id', v_assignment.id, 'status', v_assignment.status);
END;
$$;

-- A tabela individual continua pessoal: os registros vinculados a uma clínica
-- não aparecem nas políticas pessoais. O acesso clínico passa pelos RPCs acima.
DROP POLICY IF EXISTS staging_patients_owner_all ON public.patients;
CREATE POLICY staging_patients_owner_all ON public.patients
  FOR ALL TO authenticated
  USING (professional_id = (SELECT auth.uid()) AND NOT private.is_organization_patient(id))
  WITH CHECK (professional_id = (SELECT auth.uid()) AND NOT private.is_organization_patient(id));

ALTER TABLE public.organization_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_professional_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_patients_no_client_access ON public.organization_patients;
CREATE POLICY organization_patients_no_client_access ON public.organization_patients
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS patient_assignments_no_client_access ON public.patient_professional_assignments;
CREATE POLICY patient_assignments_no_client_access ON public.patient_professional_assignments
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.organization_patients, public.patient_professional_assignments FROM PUBLIC, anon, authenticated;

ALTER TABLE private.organization_admin_events DROP CONSTRAINT IF EXISTS organization_admin_events_event_type_check;
ALTER TABLE private.organization_admin_events ADD CONSTRAINT organization_admin_events_event_type_check CHECK (event_type IN (
  'organization_created', 'organization_rollout_enabled', 'organization_rollout_disabled', 'owner_transferred',
  'member_suspended', 'member_reactivated', 'member_removed', 'member_role_changed',
  'member_clinical_access_enabled', 'member_clinical_access_disabled',
  'invitation_created', 'invitation_revoked', 'invitation_accepted', 'invitation_expired',
  'invitation_resent', 'invitation_delivery_sent', 'invitation_delivery_failed',
  'organization_patient_created', 'organization_patient_updated',
  'patient_assignment_created', 'patient_assignment_revoked'
));

REVOKE ALL ON FUNCTION private.is_organization_patient(uuid), private.can_assign_clinical_professional(uuid, uuid), private.can_access_organization_patient(uuid), private.can_edit_organization_patient(uuid), private.can_manage_organization_patient_assignments(uuid), private.assert_active_organization_patient_primary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_organization_patient(uuid, text, date, text, uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_organization_patients(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_organization_patient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_organization_patient(uuid, text, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_organization_patient_assignment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_organization_patient_assignment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_patient(uuid, text, date, text, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_patients(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_patient(uuid, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_organization_patient_assignment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_patient_assignment(uuid) TO authenticated;

COMMIT;
