-- Fase 3 ACL hardening: a policy RLS de public.patients invoca diretamente
-- este helper privado. Aplicar exclusivamente no staging
-- hwkdwinfckmjoriqxbjk; não alterar o corpo da função nem as policies.

BEGIN;

REVOKE ALL ON FUNCTION private.is_organization_patient(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_organization_patient(uuid)
  TO authenticated;

COMMENT ON FUNCTION private.is_organization_patient(uuid) IS
  'Private helper invoked directly by the RLS policy of public.patients. EXECUTE is granted to authenticated so the policy can evaluate it; authorization remains enforced by the policy and auth.uid(). No direct access to enterprise tables is granted.';

COMMIT;
