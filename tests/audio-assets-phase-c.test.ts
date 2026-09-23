import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260923151114_add_audio_asset_budget_reservations.sql", import.meta.url), "utf8");
const legacyMigration = await readFile(new URL("../supabase/migrations/20260922191840_add_evolution_audio_budget_forward.sql", import.meta.url), "utf8");

// 1-4. Forward-only schema change and preservation of the legacy key contract.
assert.match(migration, /ALTER TABLE public\.evolution_audio_budget_reservations[\s\S]+ADD COLUMN audio_asset_id uuid NULL/);
assert.match(migration, /REFERENCES public\.audio_assets\(id\) ON DELETE CASCADE/);
assert.match(migration, /CREATE UNIQUE INDEX evolution_audio_budget_asset_key_idx[\s\S]+WHERE audio_asset_id IS NOT NULL/);
assert.match(migration, /CREATE UNIQUE INDEX|evolution_audio_budget_audio_key_idx/);
assert.match(migration, /'asset:' \|\| p_audio_asset_id::text/);

// 5-9. The new RPC uses only the persistent asset and server-side duration.
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reserve_evolution_audio_asset\(\s*p_audio_asset_id uuid,\s*p_professional_id uuid,\s*p_limit_seconds integer,\s*p_reservation_id uuid/s);
assert.doesNotMatch(migration, /p_duration_seconds|p_audio_key/);
assert.match(migration, /FROM public\.audio_assets AS asset\s+JOIN public\.evolutions AS evolution/s);
assert.match(migration, /asset\.duration_seconds/);
assert.doesNotMatch(migration, /v_legacy_duration_seconds \+|audio_duration_seconds[\s\S]{0,160}SUM|processed_seconds/);

// 10-14. Authorization, signed and both legacy guards are deterministic.
assert.match(migration, /v_evolution_professional_id IS DISTINCT FROM p_professional_id/);
assert.match(migration, /RETURN 'asset_not_found'/);
assert.match(migration, /RETURN 'not_authorized'/);
assert.match(migration, /v_legacy_duration_seconds > 0[\s\S]+RETURN 'legacy_unsupported'/);
assert.match(migration, /audio_asset_id IS NULL[\s\S]+RETURN 'legacy_unsupported'/);
assert.match(migration, /v_evolution_status = 'signed'[\s\S]+RETURN 'signed'/);

// 15-18. Lock, expiry, idempotency, insert and aggregate limit are explicit.
assert.match(migration, /pg_advisory_xact_lock\(\s*hashtextextended\(p_professional_id::text \|\| ':' \|\| v_evolution_id::text/s);
assert.match(migration, /status = 'pending'[\s\S]+expires_at < timezone\('utc'::text, now\(\)\)/);
assert.match(migration, /audio_asset_id = p_audio_asset_id[\s\S]+RETURN 'existing_' \|\| v_existing_status/);
assert.match(migration, /status\s*\)\s*VALUES \([\s\S]+'pending'/);
assert.match(migration, /audio_asset_id IS NOT NULL[\s\S]+status = 'completed'[\s\S]+expires_at >= timezone/);
assert.match(migration, /DELETE FROM public\.evolution_audio_budget_reservations[\s\S]+RETURN 'rejected'/);

// 19-22. Stable result contract and compatibility functions are protected.
for (const status of ["reserved", "rejected", "existing_pending", "existing_completed", "legacy_unsupported", "signed"]) {
  assert.ok(status === "existing_pending" || status === "existing_completed"
    ? migration.includes("'existing_' || v_existing_status")
    : migration.includes(`'${status}'`), `missing status ${status}`);
}
assert.match(migration, /COMMENT ON FUNCTION public\.reserve_evolution_audio_asset/);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.reserve_evolution_audio_seconds/);
assert.match(legacyMigration, /CREATE OR REPLACE FUNCTION public\.reserve_evolution_audio_seconds/);
assert.match(legacyMigration, /CREATE OR REPLACE FUNCTION public\.complete_evolution_audio_reservation/);
assert.match(legacyMigration, /CREATE OR REPLACE FUNCTION public\.release_evolution_audio_seconds/);

// 23-25. Service-role-only security and no frontend integration.
assert.match(migration, /SECURITY INVOKER/);
assert.match(migration, /SET search_path = pg_catalog, public/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_evolution_audio_asset\(uuid, uuid, integer, uuid\) FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_evolution_audio_asset\(uuid, uuid, integer, uuid\) TO service_role/);

console.log("audio assets phase C contract tests: ok");
