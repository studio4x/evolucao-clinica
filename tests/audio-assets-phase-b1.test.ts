import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../server/audioAssetRoutes.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../src/services/evolutionAudioAssetUpload.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923141509_create_audio_asset_upload_sessions.sql", import.meta.url), "utf8");

// 1-3. Authentication and the old Vercel multipart contract are closed.
assert.match(route, /deps\.requireAuth/);
assert.match(route, /AUDIO_ASSET_MULTIPART_DEPRECATED/);
assert.doesNotMatch(route, /multer|uploadMiddleware|req\.file/);

// 4-7. Prepare is JSON-only, server-owned, and persistently idempotent.
assert.match(route, /evolution-assets\/prepare/);
assert.match(route, /Idempotency-Key/);
assert.match(route, /audio_asset_upload_sessions/);
assert.match(migration, /UNIQUE \(evolution_id, creation_request_id\)/);
assert.match(route, /buildAudioAssetStoragePath\(req\.user\.id, evolution\.id, audioAssetId/);

// 8-10. Signed upload is direct-to-Storage and never exposes privileged keys.
assert.match(route, /createSignedUploadUrl/);
assert.match(route, /upsert: false/);
assert.match(route, /tusEndpoint/);
assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE_ROLE_KEY|base64/);
assert.doesNotMatch(client, /service_role|SUPABASE_SERVICE_ROLE_KEY/);

// 11-13. The browser transport bypasses Vercel and supports TUS above 6 MiB.
assert.match(client, /uploadToSignedUrl/);
assert.match(route, /storage\.supabase\.co/);
assert.match(route, /storage\/v1\/upload\/resumable/);
assert.match(client, /upload\.tusEndpoint/);
assert.match(client, /x-signature/);
assert.match(client, /6 \* 1024 \* 1024/);

// 14-18. Finalize reads the stored object and validates authoritative bytes.
assert.match(route, /:audioAssetId\/finalize/);
assert.match(route, /storage\.from\(AUDIO_ASSET_BUCKET\)\.download\(session\.storage_path\)/);
assert.match(route, /audioBuffer\.length > audioPolicy\.maxFileBytes/);
assert.match(route, /resolveAudioAssetMimeType/);
assert.match(route, /createHash\("sha256"\)/);
assert.match(route, /getAudioDurationFromBytes/);

// 19-22. Invalid, duplicate, and repeated finalization paths are bounded.
assert.match(route, /invalidateUploadedSession/);
assert.match(route, /status: "reused"/);
assert.match(route, /AUDIO_ASSET_IDEMPOTENCY_CONFLICT/);
assert.match(route, /resolved_asset_id/);

// 23-25. Phase C and unrelated side effects remain out of scope.
assert.doesNotMatch(route, /transcribe|Gemini|reserve_evolution_audio_seconds|usage_tracking|evolution_audio_budget_reservations/);
assert.doesNotMatch(client, /\/api\/ai\/transcribe|Gemini|reserve_evolution_audio_seconds|usage_tracking/);
assert.match(migration, /ALTER TABLE public\.audio_asset_upload_sessions ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.audio_asset_upload_sessions FROM PUBLIC, anon, authenticated/);

console.log("audio assets phase B.1 contract tests: ok");
