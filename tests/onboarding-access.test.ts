import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canAccessApplicationDuringOnboarding,
  classifyOnboardingError,
  getNextOnboardingTarget,
  getOnboardingDestinationForState,
  hasCompletedEssentialOnboardingSteps,
  hydrateOnboardingState,
  isOnboardingChoiceRequired,
  normalizeOnboardingState,
} from '../src/utils/onboardingState.js';

const initial = normalizeOnboardingState({ step: 'intro' });
assert.equal(initial.status, 'not_started');
assert.equal(isOnboardingChoiceRequired(initial), true);
assert.equal(canAccessApplicationDuringOnboarding(initial), false);

const legacyPatient = normalizeOnboardingState({ step: 'patient', patientId: 'patient-1' });
assert.equal(legacyPatient.status, 'not_started');
assert.equal(isOnboardingChoiceRequired(legacyPatient), true);
assert.equal(hydrateOnboardingState(legacyPatient, {
  onboarding_completed: false,
  onboarding_status: 'not_started',
  onboarding_current_step: 'intro',
}).patientId, 'patient-1');

const guided = normalizeOnboardingState({ step: 'patient', status: 'in_progress', mode: 'guided' });
assert.equal(canAccessApplicationDuringOnboarding(guided), false);

const deferred = normalizeOnboardingState({ step: 'patient', status: 'deferred', mode: 'explore', patientId: 'patient-1' });
assert.equal(canAccessApplicationDuringOnboarding(deferred), true);
assert.equal(getOnboardingDestinationForState(deferred), '/painel/dashboard');

assert.equal(
  getOnboardingDestinationForState(normalizeOnboardingState({ step: 'patient', status: 'in_progress', mode: 'guided' })),
  '/painel/patients/new?onboarding=1'
);
assert.equal(
  getOnboardingDestinationForState(normalizeOnboardingState({ step: 'patient', status: 'in_progress', mode: 'guided', patientId: 'patient-1' })),
  '/painel/patients/patient-1/edit?onboarding=1'
);
assert.equal(
  getOnboardingDestinationForState(normalizeOnboardingState({ step: 'evolution', status: 'in_progress', mode: 'guided', patientId: 'patient-1' })),
  '/painel/patients/patient-1/evolutions/new?onboarding=1'
);
assert.equal(
  getOnboardingDestinationForState(normalizeOnboardingState({ step: 'agenda', status: 'in_progress', mode: 'guided' })),
  '/onboarding?step=agenda'
);

const remoteDeferred = hydrateOnboardingState(initial, {
  onboarding_completed: false,
  onboarding_status: 'deferred',
  onboarding_mode: 'explore',
  onboarding_current_step: 'intro',
});
assert.equal(remoteDeferred.status, 'deferred');
assert.equal(remoteDeferred.mode, 'explore');

const remoteComplete = hydrateOnboardingState(initial, {
  onboarding_completed: true,
  onboarding_status: 'completed',
});
assert.equal(remoteComplete.status, 'completed');
assert.equal(remoteComplete.step, 'complete');

assert.equal(classifyOnboardingError(new Error('INSUFFICIENT_SCOPES')), 'google_insufficient_scopes');
assert.equal(classifyOnboardingError(new Error('Google Drive API error: 401')), 'google_unauthenticated');
assert.equal(classifyOnboardingError(new Error('Failed to fetch')), 'network_unavailable');
assert.equal(classifyOnboardingError(new Error('unexpected'), 'operation_failed'), 'operation_failed');

const profileOnlyProgress = {
  profileReady: true,
  patients: [],
  evolutionsCount: 0,
};
assert.deepEqual(getNextOnboardingTarget(profileOnlyProgress), { step: 'patient' });
assert.equal(
  getOnboardingDestinationForState(normalizeOnboardingState({
    ...getNextOnboardingTarget(profileOnlyProgress),
    status: 'in_progress',
    mode: 'guided',
  })),
  '/painel/patients/new?onboarding=1',
);
assert.deepEqual(getNextOnboardingTarget({
  profileReady: true,
  patients: [{ id: 'patient-1', google_doc_id: null }],
  evolutionsCount: 0,
}), { step: 'patient', patientId: 'patient-1' });
assert.deepEqual(getNextOnboardingTarget({
  profileReady: true,
  patients: [{ id: 'patient-1', google_doc_id: 'doc-1' }],
  evolutionsCount: 0,
}), { step: 'evolution', patientId: 'patient-1' });
assert.equal(hasCompletedEssentialOnboardingSteps({
  profileReady: true,
  patients: [{ id: 'patient-1', google_doc_id: 'doc-1' }],
  evolutionsCount: 1,
}), true);

const appSource = readFileSync('src/App.tsx', 'utf8');
const onboardingSource = readFileSync('src/pages/Onboarding.tsx', 'utf8');
const progressCardSource = readFileSync('src/components/onboarding/OnboardingProgressCard.tsx', 'utf8');
const patientFormSource = readFileSync('src/pages/PatientForm.tsx', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260826150000_add_onboarding_entry_choice.sql', 'utf8');

assert.match(appSource, /!canAccessApplication\(user\.id\)/);
assert.match(appSource, /hydrateOnboardingFromProfile\(session\.user\.id, profileData\)/);
assert.match(onboardingSource, /Como você prefere começar\?/);
assert.match(onboardingSource, /Iniciar configuração guiada/);
assert.match(onboardingSource, /Explorar o aplicativo/);
assert.match(progressCardSource, /Prepare seu espaço clínico no seu ritmo/);
assert.match(progressCardSource, /Google Agenda/);
assert.match(progressCardSource, /\(opcional\)/);
assert.match(progressCardSource, /Recolher configuração flexível/);
assert.match(progressCardSource, /Expandir configuração flexível/);
assert.match(progressCardSource, /hasCompletedEssentialOnboardingSteps\(snapshot\)/);
assert.doesNotMatch(progressCardSource, /handleDismiss|sessionStorage|Ocultar checklist/);
assert.match(patientFormSource, /await deferOnboarding\(user\.id, 'patient'\)/);
assert.match(migrationSource, /'not_started', 'in_progress', 'deferred', 'completed'/);
assert.match(migrationSource, /enforce_professional_onboarding_state_trigger/);

console.log('Onboarding access tests passed.');
