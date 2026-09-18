import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/clinic-migrations/20260918_28_clinic_ecosystem_operations.sql", "utf8");
const lifecycleMigration = fs.readFileSync("supabase/clinic-migrations/20260918_29_remove_patient_lifecycle_parameter.sql", "utf8");
const route = fs.readFileSync("server/clinic/clinicPatientRoutes.ts", "utf8");
const page = fs.readFileSync("src/pages/ClinicPatients.tsx", "utf8");
assert.match(migration, /archive_organization_patient/);
assert.match(migration, /reactivate_organization_patient/);
assert.match(migration, /patient lifecycle requires a dedicated operation/);
assert.match(lifecycleMigration, /update_organization_patient\(uuid,text,date,text\)/);
assert.doesNotMatch(lifecycleMigration, /p_status/);
assert.doesNotMatch(route, /p_status/);
assert.match(page, /Ativos/);
assert.match(page, /Arquivados/);
console.log("clinic-patient-management contract ok");
