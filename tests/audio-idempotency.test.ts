import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAuthoritativeAudioKey } from '../server/audioIdempotency';

const evolutionId = 'evolution-1';
const bytesA = new TextEncoder().encode('audio-a');
const bytesB = new TextEncoder().encode('audio-b');

const keyA1 = buildAuthoritativeAudioKey(evolutionId, 'A', bytesA);
assert.equal(keyA1, buildAuthoritativeAudioKey(evolutionId, 'A', bytesA));
assert.notEqual(keyA1, buildAuthoritativeAudioKey(evolutionId, 'A', bytesB));
assert.notEqual(keyA1, buildAuthoritativeAudioKey(evolutionId, 'B', bytesA));
assert.equal(keyA1.length, 64);

type ReservationStatus = 'pending' | 'completed';
const reservations = new Map<string, ReservationStatus>();
let accountedSeconds = 0;
const reserve = (key: string) => {
  const existing = reservations.get(key);
  if (existing === 'completed') return 'existing_completed';
  if (existing === 'pending') return 'existing_pending';
  reservations.set(key, 'pending');
  return 'reserved';
};
const complete = (key: string, durationSeconds: number) => {
  reservations.set(key, 'completed');
  accountedSeconds += durationSeconds;
};
const release = (key: string) => reservations.delete(key);

// Primeiro envio: A conclui; B falha antes da conclusão e libera sua reserva.
assert.equal(reserve(keyA1), 'reserved');
complete(keyA1, 10);
const keyB = buildAuthoritativeAudioKey(evolutionId, 'B', bytesB);
assert.equal(reserve(keyB), 'reserved');
release(keyB);
assert.equal(accountedSeconds, 10);

// Retry: A é replay seguro (sem nova reserva/quota); B volta como reserva nova.
assert.equal(reserve(keyA1), 'existing_completed');
assert.equal(reserve(keyB), 'reserved');
complete(keyB, 10);
assert.equal(accountedSeconds, 20);
assert.equal(reservations.get(keyA1), 'completed');
assert.equal(reservations.get(keyB), 'completed');

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/20260917120000_add_evolution_audio_budget.sql', import.meta.url), 'utf8');
assert.match(serverSource, /buildAuthoritativeAudioKey\(evolutionId, audioKey, audioBuffer\)/);
assert.match(serverSource, /p_audio_key: authoritativeAudioKey/);
assert.match(serverSource, /audioReservationMode = "replay"/);
assert.match(serverSource, /if \(audioReservationMode === "new"\)/);
assert.doesNotMatch(serverSource, /reservation === "existing_completed"\) \{\s*return res\.status\(409\)/);
assert.doesNotMatch(migrationSource, /transcription_text/);

console.log('audio idempotency replay and byte-binding tests: ok');
