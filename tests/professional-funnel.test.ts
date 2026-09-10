import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProfessionalFunnelBoard,
  getProfessionalCommercialStatus,
  getProfessionalFunnelStage,
} from '../server/admin/professionalFunnel.js';
import {
  buildProfessionalFunnelMessage,
  buildProfessionalWhatsAppUrl,
} from '../src/utils/professionalFunnelMessages.js';

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
  preferences: [{ user_id: 'whatsapp', whatsapp_number: '+55 (11) 99999-9999', whatsapp_opt_in: true }],
  contactLogs: [
    { target_id: 'whatsapp', metadata: { channel: 'whatsapp', sent: true }, created_at: '2026-09-02T10:00:00.000Z' },
    { target_id: 'whatsapp', metadata: { channel: 'whatsapp', sent: false }, created_at: '2026-09-01T10:00:00.000Z' },
    { target_id: 'choice', metadata: { channel: 'email', sent: true }, created_at: '2026-09-02T11:00:00.000Z' },
  ],
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
assert.equal(board.professionals.find((item) => item.id === 'whatsapp')?.whatsappNumber, '5511999999999');
assert.equal(board.professionals.find((item) => item.id === 'whatsapp')?.whatsappOptIn, true);
assert.equal(board.professionals.find((item) => item.id === 'whatsapp')?.whatsappSentAt, '2026-09-02T10:00:00.000Z');
assert.equal(board.professionals.find((item) => item.id === 'choice')?.emailSentAt, '2026-09-02T11:00:00.000Z');

assert.equal(getProfessionalFunnelStage({ professional: professional('u1'), state: null, whatsappVerifiedAt: null }), 'registered');
assert.equal(getProfessionalCommercialStatus(professional('expired', { trial_ends_at: '2026-09-01T00:00:00.000Z' }), new Date('2026-09-10T00:00:00.000Z')), 'trial_expired');
assert.equal(getProfessionalCommercialStatus(professional('courtesy', { subscription_plan: 'courtesy', subscription_status: 'active' }), new Date('2026-09-10T00:00:00.000Z')), 'courtesy');

const expiredTrialMessage = buildProfessionalFunnelMessage({
  fullName: 'Ana Souza',
  stage: 'returned',
  commercialStatus: 'trial_expired',
});
assert.match(expiredTrialMessage.subject, /progresso continua salvo/i);
assert.equal(expiredTrialMessage.actionPath, '/painel/subscription');
assert.match(expiredTrialMessage.whatsappText, /Olá, Ana!/);
assert.match(expiredTrialMessage.whatsappText, /https:\/\/www\.evolucaoclinica\.app\.br\/painel\/subscription/);

const expiredEarlyStageMessage = buildProfessionalFunnelMessage({
  fullName: 'Marina Alves',
  stage: 'onboarding_choice',
  commercialStatus: 'trial_expired',
});
assert.equal(expiredEarlyStageMessage.actionPath, '/painel/subscription', 'trial esgotado não deve apontar para uma rota bloqueada');
assert.match(expiredEarlyStageMessage.paragraphs.join(' '), /cadastrar seu primeiro paciente/);

const courtesyMessage = buildProfessionalFunnelMessage({
  fullName: 'João Lima',
  stage: 'returned',
  commercialStatus: 'courtesy',
});
assert.equal(courtesyMessage.actionPath, '/painel/dashboard', 'cortesia não deve receber CTA de contratação');
assert.doesNotMatch(courtesyMessage.paragraphs.join(' '), /assinar|plano disponível/i);
assert.match(buildProfessionalWhatsAppUrl('5511999999999', 'Olá!') || '', /^https:\/\/web\.whatsapp\.com\/send\?phone=5511999999999&text=/);
assert.match(buildProfessionalWhatsAppUrl('5511999999999', 'Olá!', 'desktop') || '', /^whatsapp:\/\/send\?phone=5511999999999&text=/);
assert.equal(buildProfessionalWhatsAppUrl('123', 'Olá!'), null);

const serverSource = readFileSync('server.ts', 'utf8');
const routeStart = serverSource.indexOf('app.get("/api/admin/professional-funnel"');
const routeSource = serverSource.slice(routeStart, serverSource.indexOf('app.get("/api/lifecycle/continuity-feedback-link"', routeStart));
assert.ok(routeStart >= 0, 'endpoint administrativo do quadro deve existir');
assert.match(routeSource, /requireAuth, requireAdmin/);
assert.match(routeSource, /Cache-Control", "no-store/);

const emailRouteStart = serverSource.indexOf('app.post("/api/admin/professional-funnel/email"');
const emailRouteSource = serverSource.slice(emailRouteStart, serverSource.indexOf('app.get("/api/lifecycle/continuity-feedback-link"', emailRouteStart));
assert.ok(emailRouteStart >= 0, 'endpoint administrativo de e-mail do funil deve existir');
assert.match(emailRouteSource, /requireAuth, requireAdmin/);
assert.match(emailRouteSource, /buildProfessionalFunnelMessage/);
assert.match(emailRouteSource, /source: "funnel-stage"/);
assert.match(emailRouteSource, /sendTransactionalEmail/);
assert.doesNotMatch(emailRouteSource, /req\.body\?\.(subject|content|recipientEmail)/, 'destinatário e conteúdo devem ser definidos no servidor');

const contactRouteStart = serverSource.indexOf('app.post("/api/admin/professional-funnel/contact-status"');
const contactRouteSource = serverSource.slice(contactRouteStart, emailRouteStart);
assert.ok(contactRouteStart >= 0, 'endpoint administrativo de marcação de contato deve existir');
assert.match(contactRouteSource, /requireAuth, requireAdmin/);
assert.match(contactRouteSource, /recordProfessionalFunnelContactStatus/);
assert.match(serverSource, /\.from\("admin_audit_logs"\)/);
assert.match(serverSource, /event_type: "professional_funnel_contact_status"/);

const adminSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
assert.match(adminSource, /\/admin\/professional-funnel/);
assert.match(adminSource, /Funil dos Profissionais/);
assert.match(adminSource, /<ProfessionalFunnelKanban/);

const componentSource = readFileSync('src/components/admin/ProfessionalFunnelKanban.tsx', 'utf8');
assert.match(componentSource, /Cada profissional aparece somente na etapa mais avançada/);
assert.match(componentSource, /ProfessionalDetailsModal/);
assert.match(componentSource, /Buscar por nome ou e-mail/);
assert.match(componentSource, /Preparar WhatsApp para/);
assert.match(componentSource, /Preparar e-mail para/);
assert.match(componentSource, /Revisar e enviar/);
assert.match(componentSource, /Enviar e-mail/);
assert.match(componentSource, /role="switch"/);
assert.match(componentSource, /readProfessionalWhatsAppTarget/);
assert.match(componentSource, /persistProfessionalWhatsAppTarget/);
assert.match(componentSource, /Marcar WhatsApp enviado/);
assert.match(componentSource, /Marcar e-mail enviado/);
assert.match(componentSource, /contact-status/);

console.log('professional-funnel.test.ts: OK');
