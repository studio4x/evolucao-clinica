import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildProfessionalClinicalMetrics,
  deriveProfessionalOnboardingEligibility
} from '../server/admin/professionalOverview.js';

const metrics = buildProfessionalClinicalMetrics(
  [
    { id: 'patient-b', full_name: 'Bruno', status: 'active' },
    { id: 'patient-a', full_name: 'Ana', status: 'active' }
  ],
  [
    { patient_id: 'patient-a', transcription_status: 'completed', audio_duration_seconds: 90 },
    { patient_id: 'patient-a', transcription_status: 'failed', audio_duration_seconds: 120 },
    { patient_id: 'patient-b', transcription_status: 'completed', audio_duration_seconds: 30 }
  ],
  [
    { audio_duration_seconds: 90 },
    { audio_duration_seconds: 30 }
  ]
);

assert.equal(metrics.patientCount, 2);
assert.equal(metrics.evolutionCount, 3);
assert.equal(metrics.transcribedSeconds, 120);
assert.deepEqual(metrics.patients.map(patient => patient.name), ['Ana', 'Bruno']);
assert.equal(metrics.patients[0].evolutionCount, 2);
assert.equal(metrics.patients[0].transcribedSeconds, 90);

const now = new Date('2026-08-20T12:00:00.000Z');
const canceledAt = '2026-08-16T10:00:00.000Z';
const eligibility = deriveProfessionalOnboardingEligibility({
  professionalStatus: 'active',
  preferences: {
    email_enabled: true,
    lifecycle_enabled: true,
    product_education_enabled: true,
    commercial_enabled: true
  },
  state: {
    userId: 'professional-1',
    fullName: 'Profissional',
    email: 'profissional@example.com',
    profession: '',
    professionSegment: 'other',
    activationLevel: 0,
    activationStatus: 'registered',
    registeredAt: '2026-08-16T09:00:00.000Z',
    firstLoginAt: null,
    lastLoginAt: null,
    lastActivityAt: null,
    usageDaysCount: 0,
    patientsCount: 0,
    linkedRecordsCount: 0,
    evolutionsCount: 0,
    processingEvolutionsCount: 0,
    failedEvolutionsCount: 0,
    audioEvolutionsCount: 0,
    reportsCount: 0,
    migrationsCount: 0,
    resourcesCount: 0,
    onboardingCompletedAt: null,
    subscriptionPlan: 'trial',
    subscriptionStatus: 'canceled',
    trialEndsAt: '2026-08-17T10:00:00.000Z',
    subscriptionStartedAt: null,
    subscriptionCancelledAt: canceledAt,
    lastRelationshipEmailAt: null,
    nextRelationshipEmailEligibleAt: null,
    firstEvolutionCompletedAt: null,
    latestEvolutionAt: null,
    firstPatientAt: null,
    firstRecordLinkedAt: null,
    distinctActivityDays: []
  },
  operational: {},
  campaigns: [
    { id: 'conditional-campaign', key: 'conditional_lifecycle_messages', name: 'Mensagens Condicionais', status: 'active' }
  ],
  steps: [{
    id: 'step-15',
    campaign_id: 'conditional-campaign',
    step_key: 'conditional_trial_canceled_reengagement_3d',
    eligibility_rule_key: 'trial_canceled_reengagement_3d',
    position: 15,
    wait_minutes: 4320,
    category: 'commercial',
    priority: 88,
    status: 'active',
    subject_template: 'Ganhe mais 7 dias para conhecer o Evolução Clínica',
    body_markdown: 'Mensagem',
    enabled: true
  }],
  rules: [{
    id: 'rule-15',
    rule_key: 'trial_canceled_reengagement_3d',
    name: 'Trial cancelado',
    rule_type: 'state',
    priority: 88,
    cooldown_hours: 168,
    delay_minutes: 0,
    condition_config: { minimum_hours: 72, bonus_days: 7 },
    message_config: {},
    enabled: true
  }],
  enrollments: [],
  dispatches: [{
    id: 'dispatch-15',
    step_id: 'step-15',
    rule_id: 'rule-15',
    message_key: 'conditional:trial_canceled_reengagement_3d',
    dedupe_key: `conditional:professional-1:conditional:trial_canceled_reengagement_3d:trial-canceled:${canceledAt}`,
    status: 'queued',
    scheduled_for: '2026-08-21T11:30:00.000Z',
    created_at: now.toISOString()
  }],
  now
});

assert.equal(eligibility.blockedReason, null);
assert.equal(eligibility.emails.length, 1);
assert.equal(eligibility.emails[0].stepPosition, 15);
assert.equal(eligibility.emails[0].status, 'scheduled');

const blocked = deriveProfessionalOnboardingEligibility({
  professionalStatus: 'active',
  preferences: { email_enabled: false },
  state: eligibility as any,
  operational: {},
  campaigns: [],
  steps: [],
  rules: [],
  enrollments: [],
  dispatches: [],
  now
});
assert.match(blocked.blockedReason || '', /e-mails está desativado/i);

const serverSource = readFileSync(resolve('server.ts'), 'utf8');
const modalSource = readFileSync(resolve('src/components/admin/ProfessionalDetailsModal.tsx'), 'utf8');
assert.match(serverSource, /getProfessionalClinicalMetrics/);
assert.match(serverSource, /getProfessionalOnboardingEligibility/);
assert.match(modalSource, /Elegível para os e-mails/);
assert.match(modalSource, /Pacientes e uso clínico/);
assert.match(modalSource, /Minutos transcritos/);
assert.match(modalSource, /professional-onboarding-eligibility/);
assert.match(modalSource, /professional-clinical-metrics/);
assert.match(serverSource, /onboarding_status, onboarding_mode, onboarding_current_step/);
assert.match(modalSource, /Forma escolhida para começar/);

console.log('Professional overview tests passed.');
