// Phase D runtime smoke. Synthetic fixture only; staging project only; one real Gemini call.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

assert.ok(process.argv.includes("--confirm-staging-only"), "Explicit staging-only flag required");

const ref = "hwkdwinfckmjoriqxbjk";
const supabaseUrl = `https://${ref}.supabase.co`;
const origin = process.env.PHASE_D_STAGING_ORIGIN || "https://staging.evolucaoclinica.app.br";
assert.equal(new URL(origin).hostname, "staging.evolucaoclinica.app.br", "Smoke origin must be staging");
const audioPath = process.env.PHASE_D_AUDIO_FILE;
assert.ok(audioPath && existsSync(audioPath), "PHASE_D_AUDIO_FILE must point to a synthetic audio file");

const envPath = process.env.SUPABASE_SMOKE_ENV_FILE || [
  ".env.local",
  "../evolucao-clinica/.env.local",
  "C:/PLATAFORMAS VS CODE/EVOLUÇÃO CLINICA/evolucao-clinica/.env.local",
].find((candidate) => existsSync(candidate));
assert.ok(envPath, "Staging smoke environment file not found");
const env = dotenv.parse(readFileSync(envPath, "utf8"));
assert.ok(env.SUPABASE_ACCESS_TOKEN, "Management credential required");

const keyResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
});
assert.ok(keyResponse.ok, `Could not load staging API keys (${keyResponse.status})`);
const keys = await keyResponse.json() as Array<{ name: string; api_key: string }>;
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
assert.ok(serviceKey && anonKey, "Staging service and anon keys required");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(supabaseUrl, serviceKey, options);
const anon = createClient(supabaseUrl, anonKey, options);
const run = randomUUID().slice(0, 8);
const audioBytes = readFileSync(audioPath);
const audioHash = createHash("sha256").update(audioBytes).digest("hex");
const users: string[] = [];
const patientIds: string[] = [];
const evolutionIds: string[] = [];
const assetIds: string[] = [];
const storagePaths: string[] = [];
const fixtures: Record<string, { id: string; token: string; client: SupabaseClient }> = {};
const checked = (result: any, label: string) => {
  if (result.error) throw new Error(`${label}_${result.error.code || result.error.message || "failed"}`);
  return result.data;
};

async function createFixture(name: string) {
  const email = `audio-d-${run}-${name}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const generated = checked(await admin.auth.admin.generateLink({ type: "signup", email, password }), "auth_create");
  const id = generated.user?.id as string;
  assert.ok(id);
  users.push(id);
  const client = createClient(supabaseUrl, anonKey!, options);
  const session = checked(await client.auth.verifyOtp({ token_hash: generated.properties?.hashed_token, type: "signup" }), "auth_verify");
  assert.ok(session.session?.access_token);
  fixtures[name] = { id, token: session.session.access_token, client };
}

async function createEvolution(name: string, status = "draft") {
  const patient = checked(await admin.from("patients").insert({
    professional_id: fixtures.owner.id,
    full_name: `Paciente áudio sintético ${run} ${name}`,
  }).select("id").single(), "patient_create");
  patientIds.push(patient.id);
  const evolution = checked(await admin.from("evolutions").insert({
    professional_id: fixtures.owner.id,
    patient_id: patient.id,
    session_date: "2026-09-23",
    session_time: "14:00",
    status,
    transcription_status: "processing",
    google_doc_append_status: "not_applicable",
  }).select("id,transcription_text,original_transcription_text,status,transcription_status").single(), "evolution_create");
  evolutionIds.push(evolution.id);
  return { id: evolution.id as string, before: evolution };
}

async function postJson(path: string, token: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function createDirectAsset(evolutionId: string, name: string, durationSeconds: number) {
  const id = randomUUID();
  const storagePath = `synthetic/phase-d/${run}/${name}-${id}.wav`;
  checked(await admin.from("audio_assets").insert({
    id,
    evolution_id: evolutionId,
    storage_path: storagePath,
    duration_seconds: durationSeconds,
    content_hash: createHash("sha256").update(`${run}:${name}:${id}`).digest("hex"),
    mime_type: "audio/wav",
    transcription_status: "pending",
    creation_request_id: `phase-d-${run}-${name}-${id}`,
  }), "asset_create");
  assetIds.push(id);
  storagePaths.push(storagePath);
  return id;
}

try {
  await createFixture("owner");
  const token = fixtures.owner.token;
  const evolution = await createEvolution("primary");
  const evolutionBefore = evolution.before;

  const prepared = await postJson("/api/ai/evolution-assets/prepare", token, {
    evolutionId: evolution.id,
    fileName: "phase-d-synthetic.wav",
    mimeType: "audio/wav",
    fileSize: audioBytes.length,
  }, { "Idempotency-Key": `phase-d-${run}-primary` });
  assert.equal(prepared.response.status, 200, JSON.stringify(prepared.payload));
  const upload = prepared.payload.upload;
  assert.ok(upload?.audioAssetId && upload?.token && upload?.bucket === "evolution-audio");
  const primaryAssetId = upload.audioAssetId as string;
  const primaryStoragePath = upload.path as string;
  assetIds.push(primaryAssetId);
  storagePaths.push(primaryStoragePath);

  const uploadResult = await anon.storage.from(upload.bucket).uploadToSignedUrl(
    upload.path,
    upload.token,
    new Blob([new Uint8Array(audioBytes)], { type: "audio/wav" }),
    { cacheControl: "31536000", contentType: "audio/wav" },
  );
  if (uploadResult.error) throw new Error(`signed_upload_${uploadResult.error.message}`);

  const finalized = await postJson(`/api/ai/evolution-assets/${primaryAssetId}/finalize`, token, {});
  assert.ok([200, 201].includes(finalized.response.status), JSON.stringify(finalized.payload));
  assert.equal(finalized.payload.asset?.transcription_status, "pending");

  const processed = await postJson(`/api/ai/evolution-assets/${primaryAssetId}/process`, token, {});
  assert.equal(processed.response.status, 200, JSON.stringify(processed.payload));
  assert.equal(processed.payload.cached, false);
  assert.equal(processed.payload.asset?.transcriptionStatus, "completed");
  assert.ok(String(processed.payload.asset?.transcriptionText || "").trim().length > 0);

  const primaryAsset = checked(await admin.from("audio_assets").select("id,evolution_id,duration_seconds,mime_type,transcription_status,transcription_text,content_hash,storage_path").eq("id", primaryAssetId).single(), "primary_asset_read");
  assert.equal(primaryAsset.transcription_status, "completed");
  assert.ok(String(primaryAsset.transcription_text || "").trim().length > 0);
  assert.equal(primaryAsset.content_hash, audioHash);
  const reservationsAfterFirst = checked(await admin.from("evolution_audio_budget_reservations").select("reservation_id,audio_asset_id,duration_seconds,status").eq("audio_asset_id", primaryAssetId), "primary_reservations_first");
  assert.equal(reservationsAfterFirst.length, 1);
  assert.equal(reservationsAfterFirst[0].status, "completed");

  const cachedRetry = await postJson(`/api/ai/evolution-assets/${primaryAssetId}/process`, token, {});
  assert.equal(cachedRetry.response.status, 200, JSON.stringify(cachedRetry.payload));
  assert.equal(cachedRetry.payload.cached, true);
  const reservationsAfterRetry = checked(await admin.from("evolution_audio_budget_reservations").select("reservation_id,status").eq("audio_asset_id", primaryAssetId), "primary_reservations_retry");
  assert.equal(reservationsAfterRetry.length, 1);
  assert.equal(reservationsAfterRetry[0].status, "completed");

  const evolutionAfter = checked(await admin.from("evolutions").select("transcription_text,original_transcription_text,status,transcription_status").eq("id", evolution.id).single(), "evolution_after");
  assert.deepEqual(evolutionAfter, {
    transcription_text: evolutionBefore.transcription_text,
    original_transcription_text: evolutionBefore.original_transcription_text,
    status: evolutionBefore.status,
    transcription_status: evolutionBefore.transcription_status,
  });

  const overLimitEvolution = await createEvolution("over-limit");
  const overLimitAsset = await createDirectAsset(overLimitEvolution.id, "over-limit", 999999);
  const overLimit = await postJson(`/api/ai/evolution-assets/${overLimitAsset}/process`, token, {});
  assert.equal(overLimit.response.status, 403, JSON.stringify(overLimit.payload));
  assert.equal(overLimit.payload.code, "AUDIO_EVOLUTION_DURATION_LIMIT");
  assert.equal((checked(await admin.from("evolution_audio_budget_reservations").select("reservation_id").eq("audio_asset_id", overLimitAsset), "over_limit_reservations")).length, 0);

  const signedEvolution = await createEvolution("signed", "signed");
  const signedAsset = await createDirectAsset(signedEvolution.id, "signed", 1);
  const signed = await postJson(`/api/ai/evolution-assets/${signedAsset}/process`, token, {});
  assert.equal(signed.response.status, 409, JSON.stringify(signed.payload));
  assert.equal(signed.payload.code, "EVOLUTION_SIGNED_IMMUTABLE");
  assert.equal((checked(await admin.from("evolution_audio_budget_reservations").select("reservation_id").eq("audio_asset_id", signedAsset), "signed_reservations")).length, 0);

  console.log(JSON.stringify({
    staging: ref,
    smoke: "PASS",
    upload: "PASS",
    finalize: "PASS",
    real_gemini: "PASS",
    cached_retry: "PASS",
    budget_reservation_count: 1,
    budget_completed_count: 1,
    evolution_fields_unchanged: "PASS",
    over_limit_without_gemini: "PASS",
    signed_without_gemini: "PASS",
    transcription_text: "redacted",
    run,
  }));
} finally {
  for (const path of storagePaths) {
    const result = await admin.storage.from("evolution-audio").remove([path]);
    if (result.error) throw new Error(`cleanup_storage_${result.error.message}`);
  }
  for (const table of ["audio_asset_upload_sessions", "evolution_audio_budget_reservations", "audio_assets", "evolutions", "patients"]) {
    const column = table === "audio_asset_upload_sessions" || table === "evolution_audio_budget_reservations" ? "audio_asset_id" : "id";
    const ids = table === "audio_asset_upload_sessions" || table === "evolution_audio_budget_reservations" || table === "audio_assets" ? assetIds : table === "evolutions" ? evolutionIds : patientIds;
    if (!ids.length) continue;
    const result = await admin.from(table).delete().in(column, ids);
    if (result.error) throw new Error(`cleanup_${table}_${result.error.code || "failed"}`);
  }
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) throw new Error("cleanup_auth_users");
  }
  const remaining = {
    assets: assetIds.length ? (await admin.from("audio_assets").select("id").in("id", assetIds)).data?.length || 0 : 0,
    evolutions: evolutionIds.length ? (await admin.from("evolutions").select("id").in("id", evolutionIds)).data?.length || 0 : 0,
    patients: patientIds.length ? (await admin.from("patients").select("id").in("id", patientIds)).data?.length || 0 : 0,
  };
  assert.deepEqual(remaining, { assets: 0, evolutions: 0, patients: 0 });
  console.log(JSON.stringify({ cleanup: "PASS", fixture_counts: remaining }));
}
