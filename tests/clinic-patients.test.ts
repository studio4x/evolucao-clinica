import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/clinic-migrations/20260916_23_shared_clinic_patients.sql", "utf8");
const route = readFileSync("server/clinic/clinicPatientRoutes.ts", "utf8");
const service = readFileSync("src/services/clinicPatients.ts", "utf8");
const listPage = readFileSync("src/pages/ClinicPatients.tsx", "utf8");
const detailPage = readFileSync("src/pages/ClinicPatientDetail.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

for (const name of ["organization_patients", "patient_professional_assignments", "create_organization_patient", "list_organization_patients", "get_organization_patient", "update_organization_patient", "add_organization_patient_assignment", "revoke_organization_patient_assignment"]) assert.match(migration, new RegExp(name));
assert.match(migration, /UNIQUE \(organization_id, patient_id\)/);
assert.match(migration, /patient_assignments_one_active_professional/);
assert.match(migration, /patient_assignments_one_active_primary/);
assert.match(migration, /active organization patient requires an active primary assignment/);
assert.match(migration, /can_create_evolution IS FALSE/);
assert.match(migration, /private\.can_expand_organization/);
assert.match(migration, /clinical_access_enabled IS TRUE/);
assert.match(migration, /private\.is_organization_patient\(id\)/);
assert.match(migration, /organization_patient_created/);
assert.match(migration, /patient_assignment_revoked/);
assert.match(migration, /REVOKE ALL ON TABLE public\.organization_patients, public\.patient_professional_assignments/);

for (const endpoint of ["/api/clinic/patients", "/api/clinic/patients/:organizationPatientId", "/assignments"]) assert.match(route, new RegExp(endpoint.replace(/[/:]/g, "\\$&")));
assert.match(route, /createUserScopedClient/);
assert.doesNotMatch(route, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/);
for (const forbidden of ["plan", "billingInterval", "createdBy", "actorProfessionalId", "evolutions", "clinicalText"]) assert.doesNotMatch(route, new RegExp(forbidden, "i"));
assert.match(route, /onlyAllowedKeys/);
assert.match(route, /Cache-Control/);
assert.match(route, /Vary.*Authorization/);
for (const fn of ["fetchClinicPatients", "fetchClinicPatient", "createClinicPatient", "updateClinicPatient", "addClinicPatientAssignment", "revokeClinicPatientAssignment"]) assert.match(service, new RegExp(fn));
assert.match(listPage, /Novo paciente/);
assert.match(detailPage, /Primary/);
assert.match(detailPage, /Secondary/);
assert.match(detailPage, /Consultor/);
assert.match(detailPage, /patient.canReadEvolutions && <ClinicPatientEvolutions/);
assert.match(app, /clinica\/pacientes/);
assert.match(app, /clinica\/pacientes\/new/);
assert.match(app, /organizationPatientId/);

console.log("clinic patients tests: ok");
