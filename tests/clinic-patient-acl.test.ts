import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const previous = readFileSync("supabase/clinic-migrations/20260916_23_shared_clinic_patients.sql", "utf8");
const migration = readFileSync("supabase/clinic-migrations/20260916_25_restore_personal_patient_policy_helper_execute.sql", "utf8");

assert.match(previous, /REVOKE ALL ON FUNCTION private\.is_organization_patient\(uuid\)/);
assert.match(migration, /REVOKE ALL ON FUNCTION private\.is_organization_patient\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.is_organization_patient\(uuid\)[\s\S]*TO authenticated/);
assert.doesNotMatch(migration, /TO PUBLIC|TO anon|TO service_role/);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION|CREATE FUNCTION/);
assert.doesNotMatch(migration, /CREATE POLICY|DROP POLICY|ALTER POLICY/);
assert.doesNotMatch(migration, /GRANT .* ON TABLE|organization_patients|patient_professional_assignments/);
assert.match(migration, /policy RLS de public\.patients invoca diretamente/i);
assert.match(migration, /auth\.uid\(\)/);

console.log("clinic patient ACL tests: ok");
