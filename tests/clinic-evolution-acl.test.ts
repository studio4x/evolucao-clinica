import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql=readFileSync("supabase/clinic-migrations/20260917_26_isolated_organization_evolutions.sql","utf8");
const revokes=sql.slice(sql.indexOf("-- Every helper"));
for (const name of ["private.can_read_organization_evolution(uuid)","private.can_create_organization_evolution(uuid)","public.create_organization_evolution(uuid,date,text,uuid,uuid)","public.get_organization_evolution_access(uuid)"]) {
  assert.ok(revokes.slice(0,revokes.indexOf("GRANT EXECUTE")).includes(name));
  assert.ok(revokes.slice(revokes.indexOf("GRANT EXECUTE")).includes(name));
}
assert.match(revokes,/FROM PUBLIC, anon, authenticated, service_role/);
assert.match(revokes,/TO authenticated;/);
assert.doesNotMatch(revokes,/TO anon|TO PUBLIC|TO service_role/);
assert.match(sql,/CREATE FUNCTION public.create_organization_evolution[\s\S]*LANGUAGE sql SECURITY INVOKER/);
assert.match(sql,/SET search_path = pg_catalog, private, public/);
// The synthetic runtime smoke additionally checks effective catalog ACL, including inherited PUBLIC.
const smoke=readFileSync("scripts/clinic-evolutions-staging-smoke.ts","utf8");
assert.match(smoke,/has_function_privilege\('authenticated'/);
assert.match(smoke,/has_function_privilege\('anon'/);
assert.match(smoke,/has_function_privilege\('service_role'/);
assert.match(smoke,/aclexplode/);
console.log("clinic evolution ACL: PASS");
