import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration36 = readFileSync("supabase/clinic-migrations/20260921_36_admin_clinical_read_access.sql", "utf8").replace(/\r\n/g, "\n");
const migration37 = readFileSync("supabase/clinic-migrations/20260922_37_fix_admin_read_access_runtime.sql", "utf8").replace(/\r\n/g, "\n");
const accessFunction = migration37.slice(migration37.indexOf("CREATE OR REPLACE FUNCTION public.get_organization_evolution_access"), migration37.indexOf("REVOKE ALL ON FUNCTION public.get_organization_evolution_access"));

assert.match(migration36, /CREATE OR REPLACE FUNCTION public\.get_organization_evolution_access[\s\S]+SECURITY INVOKER/);
assert.match(migration36, /FROM public\.organization_patients/);
assert.match(accessFunction, /SECURITY DEFINER/);
assert.match(accessFunction, /SET search_path = ''/);
assert.match(accessFunction, /auth\.uid\(\)/);
assert.match(accessFunction, /FROM public\.organization_patients/);
assert.match(accessFunction, /private\.can_read_organization_evolution\(p_organization_patient_id\)/);
assert.match(accessFunction, /private\.can_admin_read_organization_clinical_data\(/);
assert.match(accessFunction, /private\.can_create_organization_evolution\(p_organization_patient_id\)/);
assert.match(accessFunction, /'organizationId', NULL/);
assert.match(accessFunction, /'readScope', 'none'/);
assert.doesNotMatch(migration37, /GRANT SELECT ON (?:TABLE )?public\.organization_patients TO authenticated/i);
assert.doesNotMatch(migration37, /GRANT SELECT ON (?:TABLE )?public\.evolutions TO authenticated/i);
assert.doesNotMatch(migration37, /INSERT\s+INTO\s+supabase_migrations|UPDATE\s+supabase_migrations|DELETE\s+FROM\s+supabase_migrations/i);
assert.match(migration37, /REVOKE ALL ON FUNCTION public\.get_organization_evolution_access\(uuid\)[\s\S]+GRANT EXECUTE ON FUNCTION public\.get_organization_evolution_access\(uuid\)[\s\S]+TO authenticated/);
assert.match(migration37, /environment_name[\s\S]+staging/);

console.log("clinic admin read runtime hotfix contract: PASS");
