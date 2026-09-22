-- Fase 6F: corrigir o RPC de leitura clínica administrativa sem expor tabelas.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk.
-- Migration 36 já aplicada; esta migration é forward-only e não altera seu arquivo.
BEGIN;

DO $$
BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id = true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'Clinic admin read runtime fix requires staging';
  END IF;
END $$;

-- O lookup do contexto organizacional ocorre com privilégios da função, mas
-- toda decisão continua sendo derivada das autoridades existentes para o ator.
-- Usuários não autorizados recebem resposta neutra e não o organization_id.
CREATE OR REPLACE FUNCTION public.get_organization_evolution_access(
  p_organization_patient_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization_id uuid;
  v_professional_read boolean := false;
  v_admin_read boolean := false;
  v_can_create boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object(
      'organizationId', NULL,
      'canRead', false,
      'canCreate', false,
      'canReadAll', false,
      'readScope', 'none'
    );
  END IF;

  SELECT op.organization_id
    INTO v_organization_id
    FROM public.organization_patients AS op
   WHERE op.id = p_organization_patient_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'organizationId', NULL,
      'canRead', false,
      'canCreate', false,
      'canReadAll', false,
      'readScope', 'none'
    );
  END IF;

  v_professional_read := private.can_read_organization_evolution(p_organization_patient_id);
  v_admin_read := private.can_admin_read_organization_clinical_data(
    v_organization_id,
    p_organization_patient_id
  );

  IF NOT v_professional_read AND NOT v_admin_read THEN
    RETURN jsonb_build_object(
      'organizationId', NULL,
      'canRead', false,
      'canCreate', false,
      'canReadAll', false,
      'readScope', 'none'
    );
  END IF;

  v_can_create := private.can_create_organization_evolution(p_organization_patient_id);
  RETURN jsonb_build_object(
    'organizationId', v_organization_id,
    'canRead', true,
    'canCreate', v_can_create,
    'canReadAll', v_admin_read,
    'readScope', CASE WHEN v_admin_read THEN 'administrative' ELSE 'own' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_evolution_access(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_evolution_access(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_organization_evolution_access(uuid) IS
  'Returns organization evolution capabilities without exposing organization context to unauthorized actors; reads organization_patients through a pinned security-definer boundary.';

COMMIT;
