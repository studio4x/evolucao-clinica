import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProfessionalFunnelBoard,
  getProfessionalCommercialStatus,
  getProfessionalFunnelStage,
} from '../server/admin/professionalFunnel.js';

const createdAt = '2026-09-01T10:00:00.000Z';
const professional = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  full_name: `Profissional ${id}`,
  google_email: `${id}@example.com`,
  role: 'therapist',
  status: 'active',
  created_at: createdAt,
  subscription_plan: 'trial',
  subscription_status: 'trialing',
  trial_ends_at: '2026-09-20T00:00:00.000Z',
  ...patch,
});

const professionals = [
  professional('registered'),
  professional('whatsapp'),
  professional('choice', { onboarding_initial_mode: 'guided', onboarding_choice_at: '2026-09-01T10:10:00.000Z' }),
  professional('patient', { onboarding_initial_mode: 'explore' }),
  professional('record', { onboarding_initial_mode: 'guided' }),
  professional('evolution', { onboarding_initial_mode: 'guided' }),
  professional('returned', { onboarding_initial_mode: 'explore' }),
  professional('paid', { subscription_plan: 'monthly', subscription_status: 'active' }),
  professional('admin', { role: 'admin' }),
];

const states = [
  { user_id: 'patient', patients_count: 1, first_patient_at: '2026-09-01T11:00:00.000Z' },
  { user_id: 'record', patients_count: 1, linked_records_count: 1, first_record_linked_at: '2026-09-01T12:00:00.000Z' },
  { user_id: 'evolution', patients_count: 1, linked_records_count: 1, evolutions_count: 1, first_evolution_completed_at: '2026-09-01T13:00:00.000Z' },
  { user_id: 'returned', patients_count: 1, linked_records_count: 1, evolutions_count: 1, first_evolution_completed_at: '2026-09-01T13:00:00.000Z', usage_days_count: 2, last_activity_at: '2026-09-03T10:00:00.000Z' },
  { user_id: 'paid', usage_days_count: 3, subscription_started_at: '2026-09-04T10:00:00.000Z' },
];

const board = buildProfessionalFunnelBoard({
  professionals,
  states,
  otps: [{ user_id: 'whatsapp', verified_at: '2026-09-01T10:05:00.000Z' }],
  now: new Date('2026-09-10T00:00:00.000Z'),
});

assert.equal(board.total, 8, 'administradores não devem aparecer no quadro');
assert.equal(board.professionals.length, 8);
assert.equal(Object.values(board.stageCounts).reduce((total, count) => total + count, 0), board.total, 'cada profissional deve ocupar uma única coluna');
assert.deepEqual(board.stageCounts, {
  registered: 1,
  whatsapp_verified: 1,
  onboarding_choice: 1,
  first_patient: 1,
  linked_record: 1,
  first_evolution: 1,
  returned: 1,
  paid: 1,
});
assert.equal(board.professionals.find((item) => item.id === 'returned')?.stage, 'returned', 'a etapa mais avançada deve prevalecer');
assert.equal(board.professionals.find((item) => item.id === 'paid')?.stage, 'paid', 'assinatura ativa deve prevalecer sobre uso');
assert.equal(board.professionals.find((item) => item.id === 'choice')?.onboardingInitialMode, 'guided');

assert.equal(getProfessionalFunnelStage({ professional: professional('u1'), state: null, whatsappVerifiedAt: null }), 'registered');
assert.equal(getProfessionalCommercialStatus(professional('expired', { trial_ends_at: '2026-09-01T00:00:00.000Z' }), new Date('2026-09-10T00:00:00.000Z')), 'trial_expired');
assert.equal(getProfessionalCommercialStatus(professional('courtesy', { subscription_plan: 'courtesy', subscription_status: 'active' }), new Date('2026-09-10T00:00:00.000Z')), 'courtesy');

const serverSource = readFileSync('server.ts', 'utf8');
const routeStart = serverSource.indexOf('app.get("/api/admin/professional-funnel"');
const routeSource = serverSource.slice(routeStart, serverSource.indexOf('app.get("/api/lifecycle/continuity-feedback-link"', routeStart));
assert.ok(routeStart >= 0, 'endpoint administrativo do quadro deve existir');
assert.match(routeSource, /requireAuth, requireAdmin/);
assert.match(routeSource, /Cache-Control", "no-store/);

const adminSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
assert.match(adminSource, /\/admin\/professional-funnel/);
assert.match(adminSource, /Funil dos Profissionais/);
assert.match(adminSource, /<ProfessionalFunnelKanban/);

const componentSource = readFileSync('src/components/admin/ProfessionalFunnelKanban.tsx', 'utf8');
assert.match(componentSource, /Cada profissional aparece somente na etapa mais avançada/);
assert.match(componentSource, /ProfessionalDetailsModal/);
assert.match(componentSource, /Buscar por nome ou e-mail/);

console.log('professional-funnel.test.ts: OK');
