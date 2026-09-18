import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/clinic-migrations/20260918_28_clinic_ecosystem_operations.sql", "utf8");
const route = fs.readFileSync("server/clinic/clinicOperationalRoutes.ts", "utf8");
const page = fs.readFileSync("src/pages/ClinicPatientDetail.tsx", "utf8");
assert.match(migration, /reassign_organization_patient_primary/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /keep_previous_as_secondary/);
assert.match(route, /reassign-primary/);
assert.match(page, /Manter o Primary anterior como Secondary/);
console.log("clinic-primary-reassignment contract ok");
