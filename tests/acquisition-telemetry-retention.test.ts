import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260826093000_schedule_acquisition_telemetry_retention.sql', import.meta.url),
  'utf8'
);

assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/i);
assert.match(migration, /jobname = 'acquisition-telemetry-retention'/i);
assert.match(migration, /cron\.unschedule\(existing_job\.jobid\)/i);
assert.match(migration, /cron\.schedule\(/i);
assert.match(migration, /DELETE FROM public\.acquisition_telemetry_events/i);
assert.match(migration, /created_at < now\(\) - interval '90 days'/i);
assert.doesNotMatch(migration, /DELETE FROM public\.(?!acquisition_telemetry_events)/i);
const executableSql = migration.replace(/--.*$/gm, '');
assert.doesNotMatch(executableSql, /patients|professionals|meta_registration|analytics_event_deliveries|clinical|purchase/i);
console.log('acquisition-telemetry-retention.test.ts: OK');
