import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readClinicPatientUuid } from "../server/clinic/clinicPatientRoutes.js";

const migration = readFileSync("supabase/clinic-migrations/20260916_23_shared_clinic_patients.sql", "utf8");
const route = readFileSync("server/clinic/clinicPatientRoutes.ts", "utf8");
const personalCore = readFileSync("supabase/staging-baseline/20260914_individual_core.sql", "utf8");

assert.equal(readClinicPatientUuid("6aba1e49-076b-400f-a16b-cce801d704e5"), "6aba1e49-076b-400f-a16b-cce801d704e5");
assert.equal(readClinicPatientUuid("not-a-uuid"), null);
assert.equal(readClinicPatientUuid(null), null);

// The authorization matrix is deliberately encoded in the database helpers:
// owner/manager have organization read/write, Primary has read/write, and
// Secondary/Consultant have read only. Eligibility additionally requires an
// active membership with clinical access.
assert.match(migration, /has_organization_role\(op\.organization_id, ARRAY\['owner', 'manager'\]/);
assert.match(migration, /a\.assignment_role = 'primary'/);
assert.match(migration, /a\.assignment_role = 'primary' AND a\.status = 'active'/);
assert.match(migration, /a\.status = 'active'/);
assert.match(migration, /m\.status = 'active'/);
assert.match(migration, /m\.clinical_access_enabled IS TRUE/);
assert.match(migration, /assignment_role NOT IN \('secondary', 'consultant'\)/);
assert.match(migration, /organization patient update is not authorized/);
assert.match(migration, /assignment is not authorized/);
assert.match(migration, /primary or inactive assignment cannot be revoked/);

// Cross-tenant denial is enforced by the org-patient id lookup plus the
// workspace helper; no request field can replace the server-resolved org.
assert.match(migration, /op\.organization_id = p_organization_id/);
assert.match(migration, /op\.id = p_organization_patient_id/);
assert.match(route, /organizationId = readClinicPatientUuid\(req\.query\?\.organizationId\)/);
assert.match(route, /p_organization_patient_id: organizationPatientId/);

// Personal tables keep their original owner model and add only the exclusion
// for rows linked to an organization patient. Evolutions remain untouched.
assert.match(personalCore, /professional_id uuid NOT NULL/);
assert.doesNotMatch(migration, /ALTER TABLE public\.evolutions/);
assert.doesNotMatch(migration, /organization_id.*evolutions/i);
assert.match(migration, /NOT private\.is_organization_patient\(id\)/);

console.log("clinic patient authorization tests: ok");
