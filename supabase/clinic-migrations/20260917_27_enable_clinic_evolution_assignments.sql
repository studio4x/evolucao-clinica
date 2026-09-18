-- Fase 4. Staging hwkdwinfckmjoriqxbjk only. Replaces RPC bodies, preserves signatures and ACL.
BEGIN;
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
  VALUES (v_organization_patient.id, v_primary, 'primary', true, false, true, v_actor);
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
        'canCreateEvolution', a.can_create_evolution, 'assignedAt', a.assigned_at
      ) ORDER BY CASE a.assignment_role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END, prof.full_name)
      FROM public.patient_professional_assignments a
      JOIN public.professionals prof ON prof.id = a.professional_id
      WHERE a.organization_patient_id = p_organization_patient_id AND a.status = 'active'
    ), '[]'::jsonb),
    'canReadEvolutions', private.can_read_organization_evolution(p_organization_patient_id),
    'canCreateEvolution', private.can_create_organization_evolution(p_organization_patient_id),
    'currentAssignmentRole', (SELECT a.assignment_role FROM public.patient_professional_assignments a WHERE a.organization_patient_id = p_organization_patient_id AND a.professional_id = auth.uid() AND a.status = 'active' LIMIT 1)
  );
END;
$$;
COMMIT;
