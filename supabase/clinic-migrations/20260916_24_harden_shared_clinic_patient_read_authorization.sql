-- Fase 3 hardening: listagem também exige clinical_access para atribuições.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_organization_patients(
  p_organization_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  organization_patient_id uuid, patient_id uuid, full_name text, birth_date date,
  phone text, status text, primary_professional_id uuid,
  primary_professional_name text, current_assignment_role text,
  assignment_count bigint, created_at timestamptz, updated_at timestamptz
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
    AND private.can_access_organization_patient(op.id)
    AND (p_search IS NULL OR btrim(p_search) = '' OR p.full_name ILIKE '%' || btrim(p_search) || '%')
  GROUP BY op.id, p.id, primary_assignment.professional_id, primary_professional.full_name, current_assignment.assignment_role
  ORDER BY op.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_organization_patients(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_patients(uuid, text) TO authenticated;

COMMIT;
