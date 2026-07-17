import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateActivationLevel, calculateTrialDaysRemaining, normalizeProfessionSegment } from '../server/lifecycle/lifecycleState.js';
import { chooseHighestPriority, evaluateKnownRule, shouldSkipSequenceStep } from '../server/lifecycle/lifecycleRules.js';
import { renderLifecycleTemplate } from '../server/lifecycle/templates/tokenRegistry.js';
import { renderSafeLifecycleMarkdown } from '../server/lifecycle/lifecycleRenderer.js';
import { sanitizeLifecycleMetadata } from '../server/lifecycle/lifecycleRepository.js';

const now = new Date('2026-07-16T12:00:00.000Z');
const baseState: any = {
  userId: 'user-1', fullName: 'Maria Teste', email: 'maria@example.com', profession: 'Psicóloga', professionSegment: 'psychology',
  activationLevel: 1, activationStatus: 'profile_started', firstLoginAt: '2026-07-14T12:00:00.000Z', lastLoginAt: '2026-07-14T12:00:00.000Z', lastActivityAt: '2026-07-14T12:00:00.000Z', usageDaysCount: 1,
  patientsCount: 0, linkedRecordsCount: 0, evolutionsCount: 0, processingEvolutionsCount: 0, failedEvolutionsCount: 0, audioEvolutionsCount: 0, reportsCount: 0, migrationsCount: 0, resourcesCount: 0,
  onboardingCompletedAt: null, subscriptionPlan: 'trial', subscriptionStatus: 'trialing', trialEndsAt: '2026-07-20T12:00:00.000Z', subscriptionStartedAt: null, subscriptionCancelledAt: null,
  lastRelationshipEmailAt: null, nextRelationshipEmailEligibleAt: null, firstEvolutionCompletedAt: null, latestEvolutionAt: null, distinctActivityDays: []
};

assert.equal(renderLifecycleTemplate('Olá, {{primeiro_nome}}. Você tem {{quantidade_pacientes}} paciente(s). {{nao_permitido}}', { primeiro_nome: 'Ana', quantidade_pacientes: 2 }), 'Olá, Ana. Você tem 2 paciente(s). ');
assert.equal(renderLifecycleTemplate('{{primeiro_nome}} {{plano_atual}}', {}), 'Profissional seu plano atual');
assert.match(renderSafeLifecycleMarkdown('<script>alert(1)</script>\n\n**seguro**'), /&lt;script&gt;alert/);
assert.match(renderSafeLifecycleMarkdown('<script>alert(1)</script>\n\n**seguro**'), /<strong>seguro<\/strong>/);

assert.equal(normalizeProfessionSegment('Terapeuta Ocupacional'), 'occupational_therapy');
assert.equal(normalizeProfessionSegment('Fisioterapeuta'), 'physiotherapy');
assert.equal(calculateActivationLevel({ loggedIn: false, patientsCount: 0, linkedRecordsCount: 0, evolutionsCount: 0, usageDaysCount: 0, resourcesCount: 0 }), 0);
assert.equal(calculateActivationLevel({ loggedIn: true, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 3, usageDaysCount: 2, resourcesCount: 0 }), 5);
assert.equal(calculateActivationLevel({ loggedIn: true, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 3, usageDaysCount: 2, resourcesCount: 2 }), 6);
assert.equal(calculateTrialDaysRemaining('2026-07-20T12:00:00.000Z', now), 4);
assert.equal(calculateTrialDaysRemaining('2026-07-15T12:00:00.000Z', now), -1);

const noPatientRule: any = { id: 'rule-1', rule_key: 'logged_in_without_patient', name: 'Sem paciente', rule_type: 'state', priority: 80, cooldown_hours: 24, delay_minutes: 0, enabled: true, message_config: {} };
assert.equal(evaluateKnownRule(noPatientRule, baseState, now)?.messageKey, 'conditional:logged_in_without_patient');
const withPatient = { ...baseState, patientsCount: 1 };
assert.equal(evaluateKnownRule(noPatientRule, withPatient, now), null);
const trialRule: any = { id: 'rule-2', rule_key: 'trial_expiring_3d', name: 'Trial', rule_type: 'deadline', priority: 90, cooldown_hours: 24, delay_minutes: 0, enabled: true, message_config: {} };
assert.equal(evaluateKnownRule(trialRule, { ...baseState, trialEndsAt: '2026-07-17T12:00:00.000Z' }, now), null);
assert.equal(evaluateKnownRule(trialRule, { ...baseState, trialEndsAt: '2026-07-19T12:00:00.000Z' }, now)?.commercial, true);
assert.equal(evaluateKnownRule(trialRule, { ...baseState, subscriptionStatus: 'active', subscriptionPlan: 'monthly', trialEndsAt: '2026-07-19T12:00:00.000Z' }, now), null);

const sequenceStep: any = { id: 'step-2', campaign_id: 'campaign', step_key: 'day_02', position: 2, day_offset: 2, category: 'activation', priority: 50, status: 'active', enabled: true, subject_template: 'x', body_markdown: 'x' };
assert.equal(shouldSkipSequenceStep(sequenceStep, withPatient), 'ação já concluída: paciente existente');
const low: any = { messageKey: 'low', priority: 50 };
const high: any = { messageKey: 'high', priority: 90 };
assert.equal(chooseHighestPriority([low, high])?.messageKey, 'high');

const claimSql = readFileSync('supabase/migrations/20260716101000_create_lifecycle_claim_functions.sql', 'utf8');
assert.match(claimSql, /FOR UPDATE SKIP LOCKED/);
assert.match(readFileSync('supabase/migrations/20260716100000_create_lifecycle_core.sql', 'utf8'), /dedupe_key text NOT NULL UNIQUE/);
assert.match(readFileSync('supabase/migrations/20260716100500_create_lifecycle_event_triggers.sql', 'utf8'), /CREATE TRIGGER lifecycle_evolutions_events/);

// Testes de Auditoria de Segurança / Sanitização (HIPAA/LGPD)
const badPayload = {
  // Chaves proibidas que devem ser completamente excluídas
  patient_name: 'João da Silva',
  cpf: '123.456.789-00',
  evolution_text: 'Paciente queixando-se de dor lombar crônica sob CID-10 M54.5',
  clinical_notes: 'Encaminhado para neurologista.',
  
  // Chaves permitidas (whitelist), mas contendo dados sensíveis que devem ser limpos
  status: 'active with CPF 999.999.999-99 and ICD F32.9',
  result: 'email send to test@example.com success',
  count: 5,
  has_google_doc: true
};

const sanitized = sanitizeLifecycleMetadata(badPayload);

// 1. Chaves não autorizadas devem ter sido removidas
assert.equal(sanitized.patient_name, undefined);
assert.equal(sanitized.cpf, undefined);
assert.equal(sanitized.evolution_text, undefined);
assert.equal(sanitized.clinical_notes, undefined);

// 2. Chaves autorizadas devem permanecer
assert.equal(sanitized.count, 5);
assert.equal(sanitized.has_google_doc, true);

// 3. Padrões sensíveis (CPF, CID, Email) dentro de chaves autorizadas devem ter sido substituídos
assert.equal(sanitized.status, 'active with CPF [CPF_REDACTED] and ICD [CID_REDACTED]');
assert.equal(sanitized.result, 'email send to [EMAIL_REDACTED] success');

console.log('Lifecycle unit tests passed.');
