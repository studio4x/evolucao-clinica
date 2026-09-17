-- Fase 2C: correção ACL/RLS do helper de contexto organizacional.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- A função permanece privada; nenhuma policy ou lógica funcional é alterada.
BEGIN;

REVOKE ALL ON FUNCTION private.can_access_organization_workspace(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.can_access_organization_workspace(uuid)
  TO authenticated;

COMMENT ON FUNCTION private.can_access_organization_workspace(uuid) IS
  'RLS helper: authenticated needs EXECUTE because this SECURITY DEFINER function is invoked directly by TO authenticated workspace policies; authorization remains bound to auth.uid(), feature, entitlement, and active membership.';

COMMIT;
