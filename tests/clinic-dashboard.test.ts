import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/clinic-migrations/20260918_28_clinic_ecosystem_operations.sql", "utf8");
const page = fs.readFileSync("src/pages/ClinicShell.tsx", "utf8");
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_organization_dashboard/);
assert.match(migration, /myPatients/);
assert.doesNotMatch(migration, /evolution_count|evolutions_count|pdi|embedding/i);
assert.match(page, /Pacientes ativos/);
assert.match(page, /Resumo operacional sem conteúdo clínico agregado/);
console.log("clinic-dashboard contract ok");
