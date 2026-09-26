import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EVOLUTION_AUDIO_BUCKET,
  calculateSignedAudioUrlTtl,
  detectAudioMimeType,
  isAudioExpired,
  isAudioRetentionEnabled,
  normalizePersistentAudioMimeType,
} from '../server/evolutionAudioPolicy';
import {
  LOCAL_AUDIO_RETENTION_MS,
  getLocalAudioRetentionStartedAt,
  isLocalAudioExpired,
} from '../src/services/offlineQueue';

const migration = await readFile(
  new URL('../supabase/migrations/20260926003329_audio_retention_foundation.sql', import.meta.url),
  'utf8',
);
const serverRoutes = await readFile(new URL('../server/evolutionAudioAssets.ts', import.meta.url), 'utf8');
const edgeFunction = await readFile(
  new URL('../supabase/functions/cleanup-evolution-audio-assets/index.ts', import.meta.url),
  'utf8',
);
const legacyTranscription = await readFile(new URL('../src/services/aiTranscription.ts', import.meta.url), 'utf8');

assert.equal(EVOLUTION_AUDIO_BUCKET, 'evolution-audio-assets');
assert.equal(isAudioRetentionEnabled({ AUDIO_RETENTION_ENABLED: 'false' }), false);
assert.equal(isAudioRetentionEnabled({ AUDIO_RETENTION_ENABLED: 'true' }, 'professional-a'), true);
assert.equal(isAudioRetentionEnabled({
  AUDIO_RETENTION_ENABLED: 'true',
  AUDIO_RETENTION_PROFESSIONAL_IDS: 'professional-b',
}, 'professional-a'), false);
assert.equal(isAudioRetentionEnabled({
  AUDIO_RETENTION_ENABLED: 'true',
  AUDIO_RETENTION_PROFESSIONAL_IDS: 'professional-a,professional-b',
}, 'professional-a'), true);

const expiresAt = '2026-09-28T12:00:00.000Z';
assert.equal(isAudioExpired(expiresAt, '2026-09-28T11:59:59.999Z'), false);
assert.equal(isAudioExpired(expiresAt, expiresAt), true);
assert.equal(isAudioExpired(expiresAt, '2026-09-28T12:00:00.001Z'), true);
assert.equal(calculateSignedAudioUrlTtl(900), 300);
assert.equal(calculateSignedAudioUrlTtl(42.9), 42);
assert.equal(calculateSignedAudioUrlTtl(0), 0);

assert.equal(normalizePersistentAudioMimeType('audio/x-m4a; codecs=aac'), 'audio/mp4');
assert.equal(normalizePersistentAudioMimeType('text/plain'), null);
assert.equal(detectAudioMimeType(Uint8Array.from([0x4f, 0x67, 0x67, 0x53])), 'audio/ogg');
assert.equal(detectAudioMimeType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), 'audio/webm');
assert.equal(detectAudioMimeType(Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])), 'audio/mp4');
assert.equal(detectAudioMimeType(new TextEncoder().encode('not audio')), null);

const localStartedAt = '2026-09-01T10:00:00.000Z';
const rewrittenAt = '2026-09-03T10:00:00.000Z';
const localItem = { createdAt: rewrittenAt, localAudioCreatedAt: localStartedAt };
assert.equal(getLocalAudioRetentionStartedAt(localItem), localStartedAt);
assert.equal(isLocalAudioExpired(localItem, new Date(localStartedAt).getTime() + LOCAL_AUDIO_RETENTION_MS - 1), false);
assert.equal(isLocalAudioExpired(localItem, new Date(localStartedAt).getTime() + LOCAL_AUDIO_RETENTION_MS), true);

assert.match(migration, /create table public\.evolution_audio_assets/i);
assert.match(migration, /new\.created_at := clock_timestamp\(\)/i);
assert.match(migration, /new\.expires_at := new\.created_at \+ interval '3 days'/i);
assert.match(migration, /position between 0 and 99/i);
assert.match(migration, /storage_path text not null unique/i);
assert.match(migration, /validate_evolution_audio_asset_ownership/i);
assert.match(migration, /evolution_audio_asset_created_at_is_immutable/i);
assert.match(migration, /evolution_audio_asset_expires_at_is_immutable/i);
assert.match(migration, /force row level security/i);
assert.match(migration, /grant select on table public\.evolution_audio_assets to authenticated/i);
assert.doesNotMatch(migration, /grant (insert|update|delete).*evolution_audio_assets.*authenticated/i);
assert.match(migration, /professional_id = \(select auth\.uid\(\)\)/i);
assert.match(migration, /for update skip locked/i);
assert.match(migration, /evolution_audio_deletion_retry_delay/i);
assert.match(migration, /cleanup-evolution-audio-assets-hourly/i);
assert.match(migration, /'17 \* \* \* \*'/i);
assert.match(migration, /audio_retention_cleanup_secret/i);
assert.match(migration, /insert into storage\.buckets[\s\S]*'evolution-audio-assets'[\s\S]*false/i);
assert.doesNotMatch(migration, /(?:insert into|update|delete from) storage\.(?:buckets|objects)[\s\S]{0,120}'temp-audio'/i);

assert.match(serverRoutes, /\/api\/evolution-audio-assets\/prepare/);
assert.match(serverRoutes, /createSignedUploadUrl\(asset\.storage_path, \{ upsert: false \}\)/);
assert.match(serverRoutes, /authorizeAudioAsset/);
assert.match(serverRoutes, /calculateSignedAudioUrlTtl/);
assert.match(serverRoutes, /\/api\/evolution-audio-assets\/:audioId\/finalize/);
assert.match(serverRoutes, /app\.delete\("\/api\/evolution-audio-assets\/:audioId"/);
assert.match(serverRoutes, /p_increment_attempt: true/);
assert.match(serverRoutes, /storage_missing/);
assert.match(edgeFunction, /AUDIO_RETENTION_CLEANUP_SECRET/);
assert.match(edgeFunction, /claim_evolution_audio_asset_cleanup/);
assert.match(edgeFunction, /complete_evolution_audio_asset_deletion/);
assert.match(edgeFunction, /fail_evolution_audio_asset_deletion/);
assert.match(edgeFunction, /\.remove\(\[asset\.storage_path\]\)/);
assert.doesNotMatch(edgeFunction, /console\.(?:log|error|warn)/);

// The feature remains parallel in Phase 1: the currently published Gemini flow
// continues to use only the legacy temporary bucket until a later rollout.
assert.match(legacyTranscription, /temp-audio/);
assert.doesNotMatch(legacyTranscription, /evolution-audio-assets/);

console.log('audio retention foundation policy, lifecycle and isolation tests: ok');
