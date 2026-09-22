import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/clinic-migrations/20260918_28_clinic_ecosystem_operations.sql", "utf8");
const page = fs.readFileSync("src/pages/ClinicAudit.tsx", "utf8");
assert.match(migration, /list_organization_admin_events/);
assert.match(migration, /created_at DESC, id DESC/);
assert.match(migration, /v_role IN \('owner', 'manager'\)/);
assert.match(page, /Carregar mais/);
assert.match(page, /organization_evolution_viewed/);
assert.match(page, /organization_evolution_exported/);
assert.match(page, /sem conteúdo clínico/);
assert.doesNotMatch(page, /transcription_text|original_transcription_text|embedding|audio|payload completo|tokens/i);
console.log("clinic-audit contract ok");
