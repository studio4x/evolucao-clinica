import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260923153914_force_delete_professional_session_cleanup.sql',
  'utf8',
);
const server = readFileSync('server.ts', 'utf8');
const profile = readFileSync('src/pages/Profile.tsx', 'utf8');
const monthClosure = readFileSync(
  'supabase/migrations/20260921190000_add_patient_session_month_closure_signing.sql',
  'utf8',
);

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.force_delete_professional\(target_user_id uuid\)/i);
assert.match(migration, /SECURITY DEFINER/i);
assert.match(migration, /SET search_path = pg_catalog, public, extensions/i);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.force_delete_professional\(uuid\) FROM public, anon, authenticated/i);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.force_delete_professional\(uuid\) TO service_role/i);

for (const table of [
  'patient_session_signatures',
  'patient_session_audit',
  'patient_session_month_closures',
  'patient_sessions',
  'patient_session_packages',
  'patient_anamneses',
  'patient_anamnesis_revisions',
  'patient_files',
  'evolutions',
  'patient_reports',
  'patients',
  'professionals',
]) {
  assert.match(migration, new RegExp(`DELETE FROM public\\.${table}`, 'i'));
}

for (const table of [
  'evolutions',
  'patient_reports',
  'patient_sessions',
  'patient_session_signatures',
  'patient_session_month_closures',
]) {
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} DISABLE TRIGGER USER`, 'i'));
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE TRIGGER USER`, 'i'));
}

assert.match(migration, /WHEN OTHERS THEN[\s\S]*ALTER TABLE public\.patient_sessions ENABLE TRIGGER USER[\s\S]*RAISE;/i);
assert.match(server, /listStorageFilesRecursively\("session-signatures", targetUserId\)/);
assert.match(server, /removeProfessionalSessionSignatureFiles\(targetUserId\)/);
assert.match(server, /supabaseAdmin\.auth\.admin\.deleteUser\(targetUserId\)/);
assert.match(server, /app\.post\("\/api\/account\/delete"/);
assert.match(profile, /deleteConfirmationText\.trim\(\)\.toUpperCase\(\) !== 'EXCLUIR'/);
assert.match(monthClosure, /patient_session_month_closure_immutable_update/);
assert.match(monthClosure, /patient_sessions_guard_closed_month/);
assert.match(monthClosure, /Este mês está fechado e assinado/);

console.log('Account deletion contract tests passed.');
