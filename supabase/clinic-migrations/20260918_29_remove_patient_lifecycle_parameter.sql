-- Remove the legacy status argument. Lifecycle has dedicated operations.
BEGIN;
DROP FUNCTION IF EXISTS public.update_organization_patient(uuid,text,date,text,text);
CREATE OR REPLACE FUNCTION public.update_organization_patient(
  p_organization_patient_id uuid, p_full_name text DEFAULT NULL, p_birth_date date DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE v_op public.organization_patients; v_patient public.patients;
BEGIN
  IF NOT private.can_edit_organization_patient(p_organization_patient_id) THEN RAISE EXCEPTION 'organization patient update is not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.organization_patients WHERE id=p_organization_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization patient not found' USING ERRCODE='P0002'; END IF;
  IF p_full_name IS NOT NULL AND char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE='22023'; END IF;
  IF p_phone IS NOT NULL AND char_length(btrim(p_phone)) > 32 THEN RAISE EXCEPTION 'organization patient input is invalid' USING ERRCODE='22023'; END IF;
  UPDATE public.patients SET full_name=COALESCE(btrim(p_full_name),full_name), birth_date=COALESCE(p_birth_date,birth_date), phone=CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone),'') END, updated_at=clock_timestamp() WHERE id=v_op.patient_id RETURNING * INTO v_patient;
  PERFORM private.record_organization_admin_event('organization_patient_updated',v_op.organization_id,'authenticated',auth.uid(),NULL,NULL,NULL,NULL,NULL,v_op.status,v_op.status,NULL);
  RETURN jsonb_build_object('organizationPatientId',v_op.id,'patientId',v_patient.id,'status',v_op.status,'fullName',v_patient.full_name,'birthDate',v_patient.birth_date,'phone',v_patient.phone);
END; $$;
REVOKE ALL ON FUNCTION public.update_organization_patient(uuid,text,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_patient(uuid,text,date,text) TO authenticated;
COMMIT;
