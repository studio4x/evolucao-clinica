import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildAudioAssetStoragePath, resolveAudioAssetMimeType, sanitizeCreationRequestId } from "../server/audioAssetRoutes.js";
import { getAudioDurationFromBytes } from "../src/utils/audioDuration.js";

const migration = await readFile(new URL("../supabase/migrations/20260923133607_create_evolution_audio_assets.sql", import.meta.url), "utf8");
const route = await readFile(new URL("../server/audioAssetRoutes.ts", import.meta.url), "utf8");

const wav = Buffer.alloc(44 + 8000);
wav.write("RIFF", 0, "ascii");
wav.writeUInt32LE(36 + 8000, 4);
wav.write("WAVE", 8, "ascii");
wav.write("fmt ", 12, "ascii");
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(8000, 28);
wav.writeUInt16LE(1, 32);
wav.writeUInt16LE(8, 34);
wav.write("data", 36, "ascii");
wav.writeUInt32LE(8000, 40);

// 1. Unauthorized requests are protected by the existing auth middleware.
assert.match(route, /deps\.requireAuth, parseUpload/);
// 2. Unknown evolutions are rejected.
assert.match(route, /EVOLUTION_NOT_FOUND/);
// 3. Other professionals are rejected.
assert.match(route, /evolution\.professional_id !== req\.user\.id/);
// 4. Signed evolutions are immutable.
assert.match(route, /EVOLUTION_SIGNED_IMMUTABLE/);
// 5. A valid asset produces a database insert.
assert.match(route, /\.from\("audio_assets"\)/);
// 6. The path is generated from server-side identities.
assert.equal(buildAudioAssetStoragePath("pro", "evo", "asset", "audio/wav"), "pro/evo/asset/original.wav");
// 7. SHA-256 is server-side and canonical lowercase hex.
const expectedHash = createHash("sha256").update(wav).digest("hex");
assert.equal(expectedHash, createHash("sha256").update(wav).digest("hex"));
assert.match(route, /createHash\("sha256"\)/);
// 8. Client-supplied content_hash is not read as an input.
assert.doesNotMatch(route, /req\.body\??\.contentHash/);
// 9. Client-supplied storage_path is not read as an input.
assert.doesNotMatch(route, /req\.body\??\.storagePath/);
// 10. Unreadable duration is rejected.
assert.equal(getAudioDurationFromBytes(new Uint8Array([1, 2, 3, 4])), 0);
assert.match(route, /AUDIO_ASSET_DURATION_UNREADABLE/);
// 11. Both multipart and subscription file limits are enforced.
assert.match(route, /LIMIT_FILE_SIZE/);
assert.match(route, /audioPolicy\.maxFileBytes/);
// 12. Duplicate bytes in one evolution are unique.
assert.match(migration, /UNIQUE \(evolution_id, content_hash\)/);
// 13. Repeating the same logical request is unique.
assert.match(migration, /creation_request_id text NOT NULL/);
assert.match(migration, /UNIQUE \(evolution_id, creation_request_id\)/);
// 14. Reusing one key for different bytes is rejected.
assert.match(route, /AUDIO_ASSET_IDEMPOTENCY_CONFLICT/);
// 15. Failed persistence removes the object.
assert.match(route, /finally \{/);
assert.match(route, /storage\.from\(AUDIO_ASSET_BUCKET\)\.remove\(\[storagePath\]\)/);
// 16-18. Clinic owner/manager and consultant cannot bypass author/canCreate checks.
assert.match(route, /get_organization_evolution_access/);
assert.match(route, /!access\.data\?\.canCreate/);
assert.match(route, /EVOLUTION_NOT_AUTHORIZED/);
// 19. The table has no direct client write access.
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.audio_assets FROM PUBLIC, anon, authenticated/);
// 20. Storage is private and has no public policy in this migration.
assert.match(migration, /'evolution-audio',[\s\S]*false/);
assert.doesNotMatch(migration, /CREATE POLICY/);

assert.equal(resolveAudioAssetMimeType("audio/wav", wav), "audio/wav");
assert.equal(Math.ceil(getAudioDurationFromBytes(new Uint8Array(wav))), 1);
assert.equal(sanitizeCreationRequestId(" phase-ab-test "), "phase-ab-test");
assert.throws(() => sanitizeCreationRequestId(""), /Idempotency-Key/);

console.log("audio assets phase A/B contract tests: ok");
