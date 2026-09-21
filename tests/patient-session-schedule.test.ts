import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260921213000_add_patient_session_schedule.sql', 'utf8');
const form = readFileSync('src/pages/PatientForm.tsx', 'utf8');
const detail = readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const sessions = readFileSync('src/pages/PatientSessions.tsx', 'utf8');
const scheduleUtils = readFileSync('src/utils/patientSessionSchedule.ts', 'utf8');
const server = readFileSync('server.ts', 'utf8');

assert.match(migration, /add column if not exists session_schedule jsonb/);
assert.match(migration, /evolution_reminder_delay_hours/);
assert.match(migration, /validate_patient_session_schedule/);
assert.match(form, /Dia da semana e Horário da sessão ou das sessões/);
assert.match(form, /Adicionar dia e horário/);
assert.match(form, /Ativar lembretes de evolução/);
assert.match(form, /Lembrar quantas horas após a sessão/);
assert.match(detail, /Agenda de sessões e lembretes/);
assert.match(sessions, /Sugestões da agenda/);
assert.match(sessions, /buildPatientSessionSuggestions/);
assert.match(scheduleUtils, /normalizePatientSessionSchedule/);
assert.match(scheduleUtils, /buildPatientSessionSuggestions/);
assert.match(server, /normalizePatientSessionScheduleServer/);
assert.match(server, /evolution_reminder_delay_hours/);
assert.match(server, /hasExactEvolution/);
assert.match(server, /notificationTitle/);

console.log('patient-session-schedule: ok');
