import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/clinic-migrations/20260918_28_clinic_ecosystem_operations.sql", "utf8");
const route = fs.readFileSync("server/clinic/clinicOperationalRoutes.ts", "utf8");
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = pg_catalog, private, public/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_organization_dashboard\(uuid\), public\.list_organization_admin_events/);
assert.match(route, /createUserScopedClient/);
assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE|service_role/i);
console.log("clinic-ecosystem-acl contract ok");
