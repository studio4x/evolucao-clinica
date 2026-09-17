import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entitlementMigration = readFileSync(
  "supabase/clinic-migrations/20260916_11_organization_entitlements_and_seats.sql",
  "utf8",
);
const aclMigration = readFileSync(
  "supabase/clinic-migrations/20260916_22_restore_workspace_rls_execute.sql",
  "utf8",
);

assert.match(
  entitlementMigration,
  /CREATE OR REPLACE FUNCTION private\.can_access_organization_workspace\(p_organization_id uuid\)/,
);
assert.match(
  entitlementMigration,
  /CREATE POLICY organizations_select_entitled_member[\s\S]*private\.can_access_organization_workspace\(id\)/,
);
assert.match(
  entitlementMigration,
  /CREATE POLICY memberships_select_entitled_member[\s\S]*private\.can_access_organization_workspace\(organization_id\)/,
);
assert.match(
  entitlementMigration,
  /REVOKE ALL ON FUNCTION private\.can_access_organization_workspace\(uuid\) FROM PUBLIC, anon, authenticated/,
);
assert.doesNotMatch(
  entitlementMigration,
  /GRANT EXECUTE ON FUNCTION private\.can_access_organization_workspace\(uuid\)[\s\S]*TO authenticated/,
);

assert.match(
  aclMigration,
  /REVOKE ALL ON FUNCTION private\.can_access_organization_workspace\(uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
);
assert.match(
  aclMigration,
  /GRANT EXECUTE ON FUNCTION private\.can_access_organization_workspace\(uuid\)\s+TO authenticated;/,
);
assert.match(aclMigration, /COMMENT ON FUNCTION private\.can_access_organization_workspace\(uuid\)/);
assert.match(aclMigration, /RLS helper/);
assert.match(aclMigration, /auth\.uid\(\)/);
assert.doesNotMatch(aclMigration, /CREATE(?: OR REPLACE)? FUNCTION/);
assert.doesNotMatch(aclMigration, /CREATE POLICY|ALTER POLICY|DROP POLICY/);
assert.doesNotMatch(
  aclMigration,
  /GRANT\s+(?:ALL|EXECUTE)[\s\S]*TO\s+(?:PUBLIC|anon|service_role)/i,
);
assert.doesNotMatch(aclMigration, /ALL FUNCTIONS IN SCHEMA/i);

console.log("clinic workspace ACL tests: ok");
