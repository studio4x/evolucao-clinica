import assert from 'node:assert/strict';
import { syncOfflineEvolutionItem } from '../src/services/offlineEvolutionSync';
import type { PendingEvolution } from '../src/services/offlineQueue';

const item: PendingEvolution = {
  id: 'evolution-offline-1',
  patientId: 'patient-1',
  patientName: 'Paciente',
  googleDocId: 'doc-1',
  sessionDate: '2026-09-17',
  sessionTime: '10:00',
  audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  source: 'new',
  createdAt: new Date().toISOString(),
  evolutionData: {
    id: 'evolution-offline-1',
    professional_id: 'professional-1',
    patient_id: 'patient-1',
    session_date: '2026-09-17',
    session_time: '10:00',
    transcription_status: 'processing',
    google_doc_append_status: 'pending',
  },
};

const buildDependencies = (events: string[], options: { failUpsert?: boolean; failTranscription?: boolean } = {}) => ({
  googleAccessToken: 'google-token',
  upsertEvolution: async (payload: Record<string, unknown>) => {
    events.push(`upsert:${String(payload.transcription_status)}:${String(payload.original_transcription_text || '')}`);
    return { error: options.failUpsert ? new Error('upsert failed') : null };
  },
  transcribeAudio: async (transcriptionOptions: { evolutionId: string; audioKey: string }) => {
    events.push(`transcribe:${transcriptionOptions.evolutionId}:${transcriptionOptions.audioKey}`);
    if (options.failTranscription) throw new Error('transcription failed');
    return 'transcrição offline';
  },
  convertEvolutionToTemplate: async (text: string) => text,
  appendToGoogleDoc: async () => {
    events.push('google-docs');
  },
});

const successEvents: string[] = [];
await syncOfflineEvolutionItem(item, buildDependencies(successEvents));
assert.equal(successEvents[0], 'upsert:processing:');
assert.equal(successEvents[1], 'transcribe:evolution-offline-1:evolution-offline-1:0');
assert.equal(successEvents.includes('google-docs'), true);

const upsertFailureEvents: string[] = [];
await assert.rejects(
  () => syncOfflineEvolutionItem(item, buildDependencies(upsertFailureEvents, { failUpsert: true })),
  /upsert failed/,
);
assert.deepEqual(upsertFailureEvents, ['upsert:processing:']);

const retryEvents: string[] = [];
await assert.rejects(
  () => syncOfflineEvolutionItem(item, buildDependencies(retryEvents, { failTranscription: true })),
  /transcription failed/,
);
await syncOfflineEvolutionItem(item, buildDependencies(retryEvents));
const retryTranscriptions = retryEvents.filter((event) => event.startsWith('transcribe:'));
assert.deepEqual(retryTranscriptions, [
  'transcribe:evolution-offline-1:evolution-offline-1:0',
  'transcribe:evolution-offline-1:evolution-offline-1:0',
]);

console.log('offline queue sync ordering/idempotency tests: ok');
