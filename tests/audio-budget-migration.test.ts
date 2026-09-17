import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260917120000_add_evolution_audio_budget.sql', import.meta.url), 'utf8');

assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS evolution_audio_budget_audio_key_idx/);
assert.match(migration, /status = 'pending'/);
assert.match(migration, /expires_at < timezone\('utc'::text, now\(\)\)/);
assert.match(migration, /complete_evolution_audio_reservation/);
assert.match(migration, /release_evolution_audio_seconds/);
assert.match(migration, /p_audio_key text/);

console.log('audio-budget migration concurrency/idempotency safeguards: ok');
