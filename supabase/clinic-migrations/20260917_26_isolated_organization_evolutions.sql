-- Fase 4. Forward-only, staging hwkdwinfckmjoriqxbjk exclusively.
BEGIN;
DO $$ BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id=true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'Phase 4 requires staging';
  END IF;
END $$;

ALTER TABLE public.evolutions
  ADD COLUMN organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE NO ACTION,
  ADD COLUMN organization_patient_id uuid NULL REFERENCES public.organization_patients(id) ON DELETE NO ACTION;
ALTER TABLE public.organization_patients ADD CONSTRAINT organization_patients_context_unique
  UNIQUE (id, organization_id, patient_id);
ALTER TABLE public.evolutions ADD CONSTRAINT evolutions_complete_context CHECK (
  (organization_id IS NULL AND organization_patient_id IS NULL) OR
  (organization_id IS NOT NULL AND organization_patient_id IS NOT NULL)
);
ALTER TABLE public.evolutions ADD CONSTRAINT evolutions_organization_patient_context_fkey
  FOREIGN KEY (organization_patient_id, organization_id, patient_id)
  REFERENCES public.organization_patients(id, organization_id, patient_id) ON DELETE NO ACTION;
CREATE INDEX evolutions_organization_author_sessions
  ON public.evolutions (organization_patient_id, organization_id, patient_id, professional_id, session_date DESC, created_at DESC);
CREATE INDEX evolutions_by_organization ON public.evolutions (organization_id);
ALTER TABLE public.evolutions ADD CONSTRAINT evolutions_clinic_status CHECK (
  organization_id IS NULL OR (status IN ('draft','completed','signed') AND status IS NOT NULL
    AND transcription_status IN ('processing','completed','failed') AND transcription_status IS NOT NULL)
);

-- Replaces only the temporary Phase 3 capability constraint. No data is deleted.
ALTER TABLE public.patient_professional_assignments DROP CONSTRAINT patient_assignment_structural_evolution;
ALTER TABLE public.patient_professional_assignments ALTER COLUMN can_create_evolution SET DEFAULT true;
UPDATE public.patient_professional_assignments SET can_create_evolution=true WHERE status='active';
ALTER TABLE public.patient_professional_assignments ADD CONSTRAINT patient_assignment_no_shared_summary
  CHECK (can_view_shared_summary IS FALSE);

-- Clinical write has its own meaning, independent of seat expansion.
-- organization_entitlement_mode already includes past_due grace and operational restriction.
CREATE FUNCTION private.can_write_organization_clinical(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
  SELECT private.can_access_organization_workspace(p_organization_id)
     AND private.organization_entitlement_mode(p_organization_id) = 'full';
$$;
CREATE FUNCTION private.can_read_organization_evolution(p_organization_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_patients op
    JOIN public.patient_professional_assignments a ON a.organization_patient_id=op.id
    JOIN public.organization_memberships m ON m.organization_id=op.organization_id AND m.professional_id=a.professional_id
    WHERE op.id=p_organization_patient_id AND a.professional_id=(SELECT auth.uid())
      AND a.status='active' AND m.status='active' AND m.clinical_access_enabled IS TRUE
      AND private.can_access_organization_workspace(op.organization_id)
  );
$$;
CREATE FUNCTION private.can_create_organization_evolution(p_organization_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
  SELECT private.can_read_organization_evolution(p_organization_patient_id) AND EXISTS (
    SELECT 1 FROM public.organization_patients op
    JOIN public.patient_professional_assignments a ON a.organization_patient_id=op.id
    WHERE op.id=p_organization_patient_id AND op.status='active'
      AND a.professional_id=(SELECT auth.uid()) AND a.status='active' AND a.can_create_evolution IS TRUE
      AND private.can_write_organization_clinical(op.organization_id)
  );
$$;

-- Private SECURITY DEFINER is necessary to insert while direct clinical INSERT
-- is denied by RLS. Exposed RPC is an invoker wrapper; all authority comes from auth.uid().
CREATE FUNCTION private.create_organization_evolution(
  p_organization_patient_id uuid, p_session_date date,
  p_session_time text DEFAULT NULL, p_template_id uuid DEFAULT NULL,
  p_evolution_id uuid DEFAULT gen_random_uuid()
) RETURNS public.evolutions LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
DECLARE v_op public.organization_patients; v_evo public.evolutions;
BEGIN
  IF NOT private.can_create_organization_evolution(p_organization_patient_id) THEN
    RAISE EXCEPTION 'clinical creation not authorized' USING ERRCODE='42501';
  END IF;
  IF p_session_date IS NULL OR p_evolution_id IS NULL OR
     (p_session_time IS NOT NULL AND p_session_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'invalid evolution input' USING ERRCODE='22023';
  END IF;
  IF p_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.evolution_templates t WHERE t.id=p_template_id
      AND (t.professional_id IS NULL OR t.professional_id=auth.uid())
  ) THEN RAISE EXCEPTION 'template not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.organization_patients WHERE id=p_organization_patient_id FOR SHARE;
  INSERT INTO public.evolutions(id, professional_id, patient_id, organization_id, organization_patient_id,
    session_date, session_time, template_id, status, transcription_status, google_doc_append_status)
  VALUES(p_evolution_id, auth.uid(), v_op.patient_id, v_op.organization_id, v_op.id,
    p_session_date, p_session_time, p_template_id, 'draft', 'processing', 'not_applicable')
  ON CONFLICT(id) DO NOTHING RETURNING * INTO v_evo;
  IF NOT FOUND THEN
    SELECT * INTO v_evo FROM public.evolutions WHERE id=p_evolution_id
      AND professional_id=auth.uid() AND organization_patient_id=v_op.id
      AND organization_id=v_op.organization_id AND patient_id=v_op.patient_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'evolution id not authorized' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN v_evo;
END;
$$;
CREATE FUNCTION public.create_organization_evolution(
  p_organization_patient_id uuid, p_session_date date,
  p_session_time text DEFAULT NULL, p_template_id uuid DEFAULT NULL,
  p_evolution_id uuid DEFAULT gen_random_uuid()
) RETURNS public.evolutions LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog, private, public AS $$
  SELECT private.create_organization_evolution(p_organization_patient_id, p_session_date, p_session_time, p_template_id, p_evolution_id);
$$;
CREATE FUNCTION public.get_organization_evolution_access(p_organization_patient_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, private, public AS $$
  SELECT jsonb_build_object('canRead', private.can_read_organization_evolution(p_organization_patient_id),
    'canCreate', private.can_create_organization_evolution(p_organization_patient_id));
$$;

CREATE FUNCTION private.protect_evolution_context_and_clinic_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private, public AS $$
DECLARE v_name text; v_register text; v_ip text; v_hash_input text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
       NEW.organization_patient_id IS DISTINCT FROM OLD.organization_patient_id OR
       (OLD.organization_id IS NOT NULL AND (NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id)) THEN
      RAISE EXCEPTION 'evolution context is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF OLD.organization_id IS NOT NULL THEN
    -- A signed clinical record is closed. A technical embedding-only update remains possible.
    IF OLD.status='signed' AND (TG_OP='DELETE' OR
      (to_jsonb(NEW)-'embedding'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'embedding'-'updated_at')) THEN
      RAISE EXCEPTION 'signed evolution is immutable' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
      IF NEW.template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.evolution_templates t WHERE t.id=NEW.template_id
          AND (t.professional_id IS NULL OR t.professional_id=OLD.professional_id)
      ) THEN RAISE EXCEPTION 'template not authorized' USING ERRCODE='42501'; END IF;
      IF NEW.status='signed' AND OLD.status IS DISTINCT FROM 'signed' THEN
        IF auth.uid() IS DISTINCT FROM OLD.professional_id OR NOT private.can_create_organization_evolution(OLD.organization_patient_id) THEN
          RAISE EXCEPTION 'signature not authorized' USING ERRCODE='42501';
        END IF;
        IF NEW.transcription_status IS DISTINCT FROM 'completed' OR nullif(btrim(NEW.transcription_text),'') IS NULL THEN
          RAISE EXCEPTION 'completed content required for signing' USING ERRCODE='23514';
        END IF;
        SELECT full_name, professional_register INTO v_name,v_register FROM public.professionals WHERE id=OLD.professional_id;
        BEGIN v_ip:=current_setting('request.headers',true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN v_ip:='127.0.0.1'; END;
        NEW.signature_date:=now(); NEW.signature_ip:=coalesce(v_ip,'127.0.0.1');
        NEW.signed_by_name:=coalesce(v_name,'Profissional de Saúde');
        NEW.signed_by_register:=coalesce(v_register,'Registro não informado'); NEW.signature_method:='app_key';
        -- Same hash composition as the existing individual signing function.
        v_hash_input:=NEW.id::text||'|'||coalesce(NEW.transcription_text,'')||'|'||NEW.signature_date::text||'|'||NEW.signature_ip||'|'||NEW.signed_by_name||'|'||NEW.signed_by_register;
        NEW.signature_hash:=encode(extensions.digest(v_hash_input,'sha256'),'hex');
      ELSIF OLD.status IS DISTINCT FROM 'signed' AND (
        NEW.signature_hash IS DISTINCT FROM OLD.signature_hash OR NEW.signature_date IS DISTINCT FROM OLD.signature_date OR
        NEW.signature_method IS DISTINCT FROM OLD.signature_method OR NEW.signature_ip IS DISTINCT FROM OLD.signature_ip OR
        NEW.signed_by_name IS DISTINCT FROM OLD.signed_by_name OR NEW.signed_by_register IS DISTINCT FROM OLD.signed_by_register
      ) THEN RAISE EXCEPTION 'signature fields are server managed' USING ERRCODE='23514'; END IF;
      IF NEW.google_doc_append_status IS DISTINCT FROM 'not_applicable' OR NEW.google_doc_append_at IS NOT NULL THEN
        RAISE EXCEPTION 'clinic Google Docs unavailable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER evolutions_protect_context BEFORE UPDATE OR DELETE ON public.evolutions
  FOR EACH ROW EXECUTE FUNCTION private.protect_evolution_context_and_clinic_signature();

-- Explicit personal/clinical policies. Administrative roles are never clinical authority.
DROP POLICY staging_evolutions_owner_all ON public.evolutions;
CREATE POLICY evolutions_author_select ON public.evolutions FOR SELECT TO authenticated USING (
  professional_id=(SELECT auth.uid()) AND (
    (organization_id IS NULL AND organization_patient_id IS NULL) OR
    (organization_id IS NOT NULL AND organization_patient_id IS NOT NULL AND private.can_read_organization_evolution(organization_patient_id))
  )
);
CREATE POLICY evolutions_personal_insert ON public.evolutions FOR INSERT TO authenticated WITH CHECK (
  professional_id=(SELECT auth.uid()) AND organization_id IS NULL AND organization_patient_id IS NULL
  AND NOT private.is_organization_patient(patient_id)
);
CREATE POLICY evolutions_author_update ON public.evolutions FOR UPDATE TO authenticated
  USING (professional_id=(SELECT auth.uid()) AND (
    (organization_id IS NULL AND organization_patient_id IS NULL) OR
    (organization_id IS NOT NULL AND organization_patient_id IS NOT NULL AND private.can_create_organization_evolution(organization_patient_id))))
  WITH CHECK (professional_id=(SELECT auth.uid()) AND (
    (organization_id IS NULL AND organization_patient_id IS NULL AND NOT private.is_organization_patient(patient_id)) OR
    (organization_id IS NOT NULL AND organization_patient_id IS NOT NULL AND private.can_create_organization_evolution(organization_patient_id))));
CREATE POLICY evolutions_author_delete ON public.evolutions FOR DELETE TO authenticated
  USING (professional_id=(SELECT auth.uid()) AND (
    (organization_id IS NULL AND organization_patient_id IS NULL) OR
    (organization_id IS NOT NULL AND organization_patient_id IS NOT NULL AND status IS DISTINCT FROM 'signed' AND private.can_create_organization_evolution(organization_patient_id))));
DROP POLICY staging_reports_owner_all ON public.patient_reports;
CREATE POLICY reports_personal_owner ON public.patient_reports FOR ALL TO authenticated
  USING (professional_id=(SELECT auth.uid()) AND NOT private.is_organization_patient(patient_id))
  WITH CHECK (professional_id=(SELECT auth.uid()) AND NOT private.is_organization_patient(patient_id));

-- Every helper invoked directly by a policy/wrapper has an effective authenticated ACL.
REVOKE ALL ON FUNCTION private.can_write_organization_clinical(uuid), private.can_read_organization_evolution(uuid),
  private.can_create_organization_evolution(uuid), private.create_organization_evolution(uuid,date,text,uuid,uuid),
  public.create_organization_evolution(uuid,date,text,uuid,uuid), public.get_organization_evolution_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_write_organization_clinical(uuid), private.can_read_organization_evolution(uuid),
  private.can_create_organization_evolution(uuid), private.create_organization_evolution(uuid,date,text,uuid,uuid),
  public.create_organization_evolution(uuid,date,text,uuid,uuid), public.get_organization_evolution_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.protect_evolution_context_and_clinic_signature() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
