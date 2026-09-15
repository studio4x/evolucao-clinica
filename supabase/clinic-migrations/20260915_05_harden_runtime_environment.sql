-- Fase 1B2.1: identidade privada e explícita do ambiente do banco.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.runtime_environment (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  environment_name text NOT NULL
    CHECK (environment_name IN ('staging', 'production')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Este artefato é aplicado conscientemente ao banco de staging.
-- Ausência da linha, inclusive em um banco futuro, deve significar ambiente inválido.
INSERT INTO private.runtime_environment (id, environment_name)
VALUES (true, 'staging')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE private.runtime_environment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runtime_environment_no_client_access
  ON private.runtime_environment;
CREATE POLICY runtime_environment_no_client_access
  ON private.runtime_environment
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE private.runtime_environment FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.runtime_environment TO service_role;

CREATE OR REPLACE FUNCTION private.is_clinic_global_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT COALESCE((
    SELECT c.enabled IS TRUE
       AND r.environment_name = c.allowed_environment
      FROM private.clinic_runtime_config AS c
      JOIN private.runtime_environment AS r
        ON r.id IS TRUE
     WHERE c.id IS TRUE
       AND r.id IS TRUE
  ), false);
$$;

REVOKE ALL ON FUNCTION private.is_clinic_global_enabled() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.runtime_environment IS
  'Conscious database environment binding. Missing or mismatched identity is invalid.';
COMMENT ON COLUMN private.runtime_environment.environment_name IS
  'Canonical environment identity for this database; never derived from a client payload.';

DROP POLICY IF EXISTS organization_invitations_select_manager
  ON public.organization_invitations;
CREATE POLICY organization_invitations_select_manager
  ON public.organization_invitations
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_clinic_feature_enabled(organization_id))
    AND (
      (SELECT private.has_organization_role(
        organization_id,
        ARRAY['owner']::text[]
      ))
      OR (
        intended_role = 'professional'
        AND (SELECT private.has_organization_role(
          organization_id,
          ARRAY['manager']::text[]
        ))
      )
    )
    AND (status <> 'pending' OR expires_at > now())
  );

COMMIT;
