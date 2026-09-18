import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260918193000_add_patient_session_control.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260918193100_harden_patient_session_control.sql', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const detail = readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const page = readFileSync('src/pages/PatientSessions.tsx', 'utf8');
const service = readFileSync('src/services/patientSessions.ts', 'utf8');
const signaturePad = readFileSync('src/components/patients/sessions/SessionSignaturePad.tsx', 'utf8');

assert.match(migration, /create table if not exists public\.patient_sessions/);
assert.match(migration, /create table if not exists public\.patient_session_signatures/);
assert.match(migration, /create table if not exists public\.patient_session_audit/);
assert.match(migration, /alter table public\.patient_sessions enable row level security/);
assert.match(migration, /session-signatures/);
assert.match(hardening, /guard_signed_patient_session_changes/);
assert.match(hardening, /validate_patient_session_signature/);
assert.match(app, /patients\/:id\/sessions/);
assert.match(detail, /PatientSessionsSummaryCard/);
assert.match(page, /Registrar sessão de hoje/);
assert.match(page, /Exportar PDF/);
assert.match(page, /Revogar assinatura/);
assert.match(service, /createSignedUrl/);
assert.match(service, /SHA-256/);
assert.match(service, /deleted_at/);
assert.match(signaturePad, /touch-none/);
assert.doesNotMatch(page, /validade jurídica/i);

console.log('patient-session-control: ok');
