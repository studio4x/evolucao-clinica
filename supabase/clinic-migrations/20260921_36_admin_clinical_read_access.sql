-- Fase 6E: leitura clínica institucional por Owner/Manager.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não editar/reaplicar as migrations 23, 26, 27, 32, 33, 34 ou 35; não aplicar em produção.
BEGIN;

DO $$
BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id = true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'Clinic admin clinical read access requires staging';
  END IF;
END $$;

-- O ledger existente continua imutável e recebe somente referências operacionais.
-- Nenhum conteúdo clínico é persistido na auditoria.
ALTER TABLE private.organization_admin_events
  ADD COLUMN target_type text NULL,
  ADD COLUMN target_id uuid NULL,
  ADD COLUMN evolution_id uuid NULL REFERENCES public.evolutions(id) ON DELETE NO ACTION,
  ADD COLUMN author_professional_id uuid NULL REFERENCES public.professionals(id) ON DELETE NO ACTION;

ALTER TABLE private.organization_admin_events
  ADD CONSTRAINT organization_admin_events_clinical_target_check CHECK (
    target_type IS NULL OR target_type IN ('organization_patient', 'evolution')
  );

CREATE INDEX organization_admin_events_by_evolution
  ON private.organization_admin_events (evolution_id, created_at DESC, id DESC);

ALTER TABLE private.organization_admin_events
  DROP CONSTRAINT organization_admin_events_event_type_check;
ALTER TABLE private.organization_admin_events
  ADD CONSTRAINT organization_admin_events_event_type_check CHECK (event_type IN (
    'organization_created', 'organization_rollout_enabled', 'organization_rollout_disabled', 'owner_transferred',
    'member_suspended', 'member_reactivated', 'member_removed', 'member_role_changed',
    'member_clinical_access_enabled', 'member_clinical_access_disabled',
    'invitation_created', 'invitation_revoked', 'invitation_accepted', 'invitation_expired',
    'invitation_resent', 'invitation_delivery_sent', 'invitation_delivery_failed',
    'organization_patient_created', 'organization_patient_updated',
    'patient_assignment_created', 'patient_assignment_revoked',
    'organization_patient_archived', 'organization_patient_reactivated',
    'patient_primary_reassigned', 'patient_assignment_role_changed',
    'organization_patient_clinical_records_viewed',
    'organization_evolution_viewed',
    'organization_evolution_exported'
  ));

-- Autoridade administrativa de leitura é independente de seat e assignment.
-- Ela exige os dois vínculos organizacionais explícitos e preserva leitura em
-- full/restricted, sem conceder qualquer autoridade de escrita.
CREATE FUNCTION private.can_admin_read_organization_clinical_data(
  p_organization_id uuid,
  p_organization_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND private.organization_entitlement_mode(p_organization_id) IN ('full', 'restricted')
     AND EXISTS (
       SELECT 1
         FROM public.organization_patients AS op
         JOIN public.organizations AS o
           ON o.id = op.organization_id
         JOIN public.organization_memberships AS m
           ON m.organization_id = op.organization_id
          AND m.professional_id = (SELECT auth.uid())
        WHERE op.id = p_organization_patient_id
          AND op.organization_id = p_organization_id
          AND o.operational_status <> 'archived'
          AND m.status = 'active'
          AND m.membership_role IN ('owner', 'manager')
          AND private.can_access_organization_workspace(op.organization_id)
     );
$$;

-- SELECT ganha um ramo administrativo; personal e profissional continuam
-- author-only. UPDATE/DELETE/INSERT permanecem exatamente como na migration 26.
DROP POLICY evolutions_author_select ON public.evolutions;
CREATE POLICY evolutions_author_select
ON public.evolutions
FOR SELECT
TO authenticated
USING (
  (
    professional_id = (SELECT auth.uid())
    AND organization_id IS NULL
    AND organization_patient_id IS NULL
  )
  OR
  (
    organization_id IS NOT NULL
    AND organization_patient_id IS NOT NULL
    AND (
      (
        professional_id = (SELECT auth.uid())
        AND private.can_read_organization_evolution(organization_patient_id)
      )
      OR private.can_admin_read_organization_clinical_data(organization_id, organization_patient_id)
    )
  )
);

CREATE OR REPLACE FUNCTION public.get_organization_evolution_access(
  p_organization_patient_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'organizationId', op.organization_id,
    'canRead',
      private.can_read_organization_evolution(op.id)
      OR private.can_admin_read_organization_clinical_data(op.organization_id, op.id),
    'canCreate', private.can_create_organization_evolution(op.id),
    'canReadAll', private.can_admin_read_organization_clinical_data(op.organization_id, op.id),
    'readScope', CASE
      WHEN private.can_admin_read_organization_clinical_data(op.organization_id, op.id) THEN 'administrative'
      ELSE 'own'
    END
  )
  FROM public.organization_patients AS op
  WHERE op.id = p_organization_patient_id;
$$;

-- Mantém o contrato do detalhe do paciente e passa a anunciar a leitura
-- institucional sem misturá-la com a capacidade de criação profissional.
CREATE OR REPLACE FUNCTION public.get_organization_patient(p_organization_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_patient record;
  v_admin_read boolean;
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
  v_admin_read := private.can_admin_read_organization_clinical_data(v_patient.organization_id, v_patient.organization_patient_id);
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
    'canReadEvolutions', private.can_read_organization_evolution(p_organization_patient_id) OR v_admin_read,
    'canCreateEvolution', private.can_create_organization_evolution(p_organization_patient_id),
    'evolutionReadScope', CASE WHEN v_admin_read THEN 'administrative' ELSE 'own' END,
    'currentAssignmentRole', (SELECT a.assignment_role FROM public.patient_professional_assignments a WHERE a.organization_patient_id = p_organization_patient_id AND a.professional_id = auth.uid() AND a.status = 'active' LIMIT 1)
  );
END;
$$;

-- Projeção profissional mínima para identificação legítima do autor no
-- prontuário/PDF. Não retorna conta, contato, assinatura pessoal ou tokens.
CREATE FUNCTION public.get_organization_evolution_author_profiles(
  p_organization_patient_id uuid
)
RETURNS TABLE (
  professional_id uuid,
  full_name text,
  professional_title text,
  professional_register text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization_id uuid;
  v_admin_read boolean;
  v_professional_read boolean;
BEGIN
  SELECT op.organization_id
    INTO v_organization_id
    FROM public.organization_patients AS op
   WHERE op.id = p_organization_patient_id;

  IF NOT FOUND OR v_actor IS NULL THEN
    RAISE EXCEPTION 'organization evolution authors are not authorized' USING ERRCODE = '42501';
  END IF;

  v_admin_read := private.can_admin_read_organization_clinical_data(v_organization_id, p_organization_patient_id);
  v_professional_read := private.can_read_organization_evolution(p_organization_patient_id);
  IF NOT v_admin_read AND NOT v_professional_read THEN
    RAISE EXCEPTION 'organization evolution authors are not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name, p.professional_title, p.professional_register
    FROM public.evolutions AS e
    JOIN public.professionals AS p ON p.id = e.professional_id
   WHERE e.organization_id = v_organization_id
     AND e.organization_patient_id = p_organization_patient_id
     AND (v_admin_read OR e.professional_id = v_actor)
   ORDER BY p.full_name, p.id;
END;
$$;

CREATE FUNCTION public.record_organization_clinical_read(
  p_organization_patient_id uuid,
  p_evolution_id uuid DEFAULT NULL,
  p_action text DEFAULT 'organization_patient_clinical_records_viewed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization_id uuid;
  v_author_professional_id uuid;
  v_event_id uuid;
BEGIN
  IF p_action NOT IN (
    'organization_patient_clinical_records_viewed',
    'organization_evolution_viewed',
    'organization_evolution_exported'
  ) THEN
    RAISE EXCEPTION 'organization clinical audit action is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT op.organization_id
    INTO v_organization_id
    FROM public.organization_patients AS op
   WHERE op.id = p_organization_patient_id;

  IF NOT FOUND OR v_actor IS NULL
     OR NOT private.can_admin_read_organization_clinical_data(v_organization_id, p_organization_patient_id) THEN
    RAISE EXCEPTION 'organization clinical read is not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_evolution_id IS NULL THEN
    IF p_action <> 'organization_patient_clinical_records_viewed' THEN
      RAISE EXCEPTION 'organization evolution audit target is required' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_action = 'organization_patient_clinical_records_viewed' THEN
      RAISE EXCEPTION 'organization patient audit target is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT e.professional_id
      INTO v_author_professional_id
      FROM public.evolutions AS e
     WHERE e.id = p_evolution_id
       AND e.organization_id = v_organization_id
       AND e.organization_patient_id = p_organization_patient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'organization evolution audit target is not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO private.organization_admin_events (
    event_type, organization_id, actor_type, actor_professional_id,
    subject_professional_id, organization_patient_id,
    target_type, target_id, evolution_id, author_professional_id
  ) VALUES (
    p_action, v_organization_id, 'authenticated', v_actor,
    v_author_professional_id, p_organization_patient_id,
    CASE WHEN p_evolution_id IS NULL THEN 'organization_patient' ELSE 'evolution' END,
    COALESCE(p_evolution_id, p_organization_patient_id),
    p_evolution_id, v_author_professional_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION private.can_admin_read_organization_clinical_data(uuid,uuid),
  public.get_organization_evolution_author_profiles(uuid),
  public.record_organization_clinical_read(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_admin_read_organization_clinical_data(uuid,uuid),
  public.get_organization_evolution_author_profiles(uuid),
  public.record_organization_clinical_read(uuid,uuid,text)
  TO authenticated;

-- Reafirma o ACL da função substituída sem conceder acesso a anon/service_role.
REVOKE ALL ON FUNCTION public.get_organization_evolution_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_evolution_access(uuid) TO authenticated;

COMMENT ON FUNCTION private.can_admin_read_organization_clinical_data(uuid,uuid) IS
  'Todo artefato clínico explicitamente vinculado a organization_patient pode ser lido por Owner/Manager da própria organização, preservando autoria e imutabilidade; dados pessoais não são herdados pela clínica.';

COMMIT;
