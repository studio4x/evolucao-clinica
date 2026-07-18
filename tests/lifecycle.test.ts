import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateActivationLevel, calculateTrialDaysRemaining, normalizeProfessionSegment } from '../server/lifecycle/lifecycleState.js';
import { chooseHighestPriority, evaluateKnownRule, getContextualActionPendingAt, getNextBestAction, getSubscriberNextBestAction, shouldSkipSequenceStep } from '../server/lifecycle/lifecycleRules.js';
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
assert.equal(renderLifecycleTemplate('{{resumo_progresso}}', { quantidade_pacientes: 0, quantidade_prontuarios: 2, quantidade_evolucoes: 0 }), 'vinculou 2 prontuários;');
assert.match(renderLifecycleTemplate('{{resumo_progresso}}', { quantidade_pacientes: 0, quantidade_prontuarios: 0, quantidade_evolucoes: 0 }), /Você já deu o primeiro passo/);
assert.equal(renderLifecycleTemplate('{{bloco_progresso_teste}}', { quantidade_pacientes: 2, quantidade_prontuarios: 0, quantidade_evolucoes: 3 }), 'Durante esse período, você já começou a organizar sua rotina na plataforma:\ncadastrou 2 pacientes;\nconcluiu 3 evoluções.');
assert.equal(renderLifecycleTemplate('{{bloco_progresso_teste}}', { quantidade_pacientes: 0, quantidade_prontuarios: 0, quantidade_evolucoes: 0 }), 'Você ainda tem alguns dias para experimentar o fluxo completo. Acesse sua conta e continue pela próxima etapa recomendada.');
assert.match(renderSafeLifecycleMarkdown('<script>alert(1)</script>\n\n**seguro**'), /&lt;script&gt;alert/);
assert.match(renderSafeLifecycleMarkdown('<script>alert(1)</script>\n\n**seguro**'), /<strong>seguro<\/strong>/);

assert.equal(normalizeProfessionSegment('Terapeuta Ocupacional'), 'occupational_therapy');
assert.equal(normalizeProfessionSegment('Fisioterapeuta'), 'physiotherapy');
assert.equal(calculateActivationLevel({ loggedIn: false, patientsCount: 0, linkedRecordsCount: 0, evolutionsCount: 0, usageDaysCount: 0, resourcesCount: 0 }), 0);
assert.equal(calculateActivationLevel({ loggedIn: true, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 3, usageDaysCount: 2, resourcesCount: 0 }), 5);
assert.equal(calculateActivationLevel({ loggedIn: true, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 3, usageDaysCount: 2, resourcesCount: 2 }), 6);
assert.equal(calculateTrialDaysRemaining('2026-07-20T12:00:00.000Z', now), 4);
assert.equal(calculateTrialDaysRemaining('2026-07-15T12:00:00.000Z', now), -1);

const withPatient = { ...baseState, patientsCount: 1, firstPatientAt: '2026-07-14T12:00:00.000Z' };
for (const removedRuleKey of ['logged_in_without_patient', 'patient_without_linked_record', 'linked_record_without_evolution', 'first_evolution_completed']) {
  assert.equal(evaluateKnownRule({ id: removedRuleKey, rule_key: removedRuleKey, name: removedRuleKey, rule_type: 'state', priority: 80, cooldown_hours: 96, delay_minutes: 0, enabled: true, message_config: {} }, baseState, now), null);
}
assert.equal(getContextualActionPendingAt(baseState), baseState.firstLoginAt);
assert.equal(getNextBestAction(baseState).label, 'Cadastrar primeiro paciente');
assert.equal(getNextBestAction(baseState).ctaLabel, 'Cadastrar paciente');
assert.equal(getNextBestAction({ ...baseState, patientsCount: 1 }).label, 'Criar ou vincular um prontuário');
assert.equal(getNextBestAction({ ...baseState, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 1 }).label, 'Consultar o histórico do paciente');
assert.equal(getSubscriberNextBestAction(baseState).label, 'Cadastre seu primeiro paciente');
assert.equal(getSubscriberNextBestAction({ ...baseState, patientsCount: 1, linkedRecordsCount: 1, evolutionsCount: 1 }).ctaLabel, 'Registrar atendimento');
assert.equal(getNextBestAction({ ...baseState, subscriptionStatus: 'canceled', trialEndsAt: '2026-07-15T12:00:00.000Z' }, now).label, 'Conhecer os planos disponíveis');
const trialRule: any = { id: 'rule-2', rule_key: 'trial_expiring_3d', name: 'Trial', rule_type: 'deadline', priority: 90, cooldown_hours: 24, delay_minutes: 0, enabled: true, message_config: {} };
assert.equal(evaluateKnownRule(trialRule, { ...baseState, trialEndsAt: '2026-07-17T12:00:00.000Z' }, now), null);
assert.equal(evaluateKnownRule(trialRule, { ...baseState, trialEndsAt: '2026-07-19T12:00:00.000Z' }, now)?.commercial, true);
assert.equal(evaluateKnownRule(trialRule, { ...baseState, subscriptionStatus: 'active', subscriptionPlan: 'monthly', trialEndsAt: '2026-07-19T12:00:00.000Z' }, now), null);
const contextualRule: any = { id: 'rule-context', rule_key: 'inactive_3d', name: 'Próxima ação', rule_type: 'inactivity', priority: 80, cooldown_hours: 96, delay_minutes: 0, condition_config: { days: 3, pending_hours: 72 }, enabled: true, message_config: {} };
assert.equal(evaluateKnownRule(contextualRule, { ...baseState, lastActivityAt: '2026-07-13T12:00:00.000Z', firstLoginAt: '2026-07-12T12:00:00.000Z' }, now)?.messageKey, 'conditional:inactive_3d');
assert.equal(evaluateKnownRule(contextualRule, { ...baseState, lastActivityAt: '2026-07-14T12:00:00.000Z', firstLoginAt: '2026-07-15T12:00:00.000Z' }, now), null);

const operationalContext: any = {
  failedEvolution: { id: 'evolution-1', updatedAt: '2026-07-16T11:00:00.000Z' },
  notAddedEvolution: { id: 'evolution-2', updatedAt: '2026-07-16T11:30:00.000Z' },
  googleConnection: { updatedAt: '2026-07-16T10:00:00.000Z' },
  failedPayment: { id: 'transaction-1', updatedAt: '2026-07-16T09:00:00.000Z' }
};
for (const [ruleKey, messageKey, resourceId] of [
  ['evolution_processing_failed', 'conditional:evolution_processing_failed', 'evolution-1'],
  ['evolution_not_added_to_record', 'conditional:evolution_not_added_to_record', 'evolution-2'],
  ['google_connection_interrupted', 'conditional:google_connection_interrupted', 'user-1'],
  ['subscription_payment_failed', 'conditional:subscription_payment_failed', 'transaction-1']
] as const) {
  const candidate = evaluateKnownRule({ id: ruleKey, rule_key: ruleKey, name: ruleKey, rule_type: 'state', priority: 80, cooldown_hours: 96, delay_minutes: 0, enabled: true, message_config: {} }, baseState, now, operationalContext);
  assert.equal(candidate?.messageKey, messageKey);
  assert.equal(candidate?.resourceId, resourceId);
  assert.ok(candidate?.occurrenceId);
}

const sequenceStep: any = { id: 'step-2', campaign_id: 'campaign', step_key: 'day_02', position: 2, wait_minutes: 2880, category: 'activation', priority: 50, status: 'active', enabled: true, subject_template: 'x', body_markdown: 'x' };
assert.equal(shouldSkipSequenceStep(sequenceStep, withPatient), 'ação já concluída: paciente existente');
const low: any = { messageKey: 'low', priority: 50 };
const high: any = { messageKey: 'high', priority: 90 };
assert.equal(chooseHighestPriority([low, high])?.messageKey, 'high');

const claimSql = readFileSync('supabase/migrations/20260716101000_create_lifecycle_claim_functions.sql', 'utf8');
assert.match(claimSql, /FOR UPDATE SKIP LOCKED/);
assert.match(readFileSync('supabase/migrations/20260716100000_create_lifecycle_core.sql', 'utf8'), /dedupe_key text NOT NULL UNIQUE/);
assert.match(readFileSync('supabase/migrations/20260716100500_create_lifecycle_event_triggers.sql', 'utf8'), /CREATE TRIGGER lifecycle_evolutions_events/);
const finalConditionalMigration = readFileSync('supabase/migrations/20260718110000_finalize_conditional_message_lifecycle.sql', 'utf8');
assert.match(finalConditionalMigration, /conditional_message_removed_as_transactional_duplicate/);
assert.match(finalConditionalMigration, /'subscription_payment_failed', 14, 15/);
assert.match(finalConditionalMigration, /'inactive_3d', 10, 0/);

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
