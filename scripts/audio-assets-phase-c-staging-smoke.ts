// Phase C runtime smoke. Synthetic fixtures only; staging only; no external providers.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

assert.ok(process.argv.includes("--confirm-staging-only"), "Explicit staging-only flag required");

const ref = "hwkdwinfckmjoriqxbjk";
const url = `https://${ref}.supabase.co`;
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
const admin = createClient(url, serviceKey, options);
const anon = createClient(url, anonKey, options);
const run = randomUUID().slice(0, 8);
const users: string[] = [];
const patientIds: string[] = [];
const evolutionIds: string[] = [];
const assetIds: string[] = [];
const reservationIds: string[] = [];
const fixtures: Record<string, { id: string; email: string; password: string; client: SupabaseClient; token: string }> = {};
const results: Record<string, string> = {};
let passed = false;

const checked = (result: any, label: string) => {
  if (result.error) throw new Error(`${label}_${result.error.code || "failed"}`);
  return result.data;
};

async function createFixture(name: string) {
  const email = `audio-c-${run}-${name}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const generated = checked(await admin.auth.admin.generateLink({ type: "signup", email, password }), "auth_create");
  const id = generated.user?.id as string;
  assert.ok(id);
  users.push(id);
  const client = createClient(url, anonKey!, options);
  const session = checked(await client.auth.verifyOtp({ token_hash: generated.properties?.hashed_token, type: "signup" }), "auth_verify");
  assert.ok(session.session?.access_token);
  fixtures[name] = { id, email, password, client, token: session.session.access_token };
}

async function createEvolution(name: string, status: string | null = "draft", legacyDuration?: number) {
  const professionalId = fixtures.owner.id;
  const patient = checked(await admin.from("patients").insert({
    professional_id: professionalId,
    full_name: `Paciente áudio sintético ${run} ${name}`,
  }).select("id").single(), "patient_create");
  patientIds.push(patient.id);
  const evolution = checked(await admin.from("evolutions").insert({
    professional_id: professionalId,
    patient_id: patient.id,
    session_date: "2026-09-23",
    session_time: "14:00",
    status,
    transcription_status: "processing",
    google_doc_append_status: "not_applicable",
    ...(legacyDuration === undefined ? {} : { audio_duration_seconds: legacyDuration }),
  }).select("id").single(), "evolution_create");
  evolutionIds.push(evolution.id);
  return evolution.id as string;
}

async function createAsset(evolutionId: string, name: string, durationSeconds: number) {
  const id = randomUUID();
  const hash = createHash("sha256").update(`${run}:${name}:${id}`).digest("hex");
  checked(await admin.from("audio_assets").insert({
    id,
    evolution_id: evolutionId,
    storage_path: `synthetic/phase-c/${run}/${id}.wav`,
    duration_seconds: durationSeconds,
    content_hash: hash,
    mime_type: "audio/wav",
    transcription_status: "pending",
    creation_request_id: `phase-c-${run}-${name}-${id}`,
  }), "asset_create");
  assetIds.push(id);
  return id;
}

async function reserve(assetId: string, professionalId: string, limitSeconds: number, label: string) {
  const reservationId = randomUUID();
  reservationIds.push(reservationId);
  const status = checked(await admin.rpc("reserve_evolution_audio_asset", {
    p_audio_asset_id: assetId,
    p_professional_id: professionalId,
    p_limit_seconds: limitSeconds,
    p_reservation_id: reservationId,
  }), label) as string;
  results[label] = status;
  return { reservationId, status };
}

async function assertReservation(reservationId: string, expected: Record<string, unknown> | null) {
  const row = checked(await admin.from("evolution_audio_budget_reservations").select("reservation_id,audio_asset_id,audio_key,duration_seconds,status").eq("reservation_id", reservationId).maybeSingle(), "reservation_read");
  if (expected === null) assert.equal(row, null);
  else for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value, key);
  return row;
}

try {
  await createFixture("owner");
  const professionalId = fixtures.owner.id;

  const simpleEvolution = await createEvolution("simple");
  const simpleAsset = await createAsset(simpleEvolution, "simple", 30);
  const simple = await reserve(simpleAsset, professionalId, 60, "simple_below");
  assert.equal(simple.status, "reserved");
  await assertReservation(simple.reservationId, { audio_asset_id: simpleAsset, audio_key: `asset:${simpleAsset}`, duration_seconds: 30, status: "pending" });
  results.server_duration_and_key = "PASS";

  const aboveEvolution = await createEvolution("above");
  const aboveAsset = await createAsset(aboveEvolution, "above", 61);
  const above = await reserve(aboveAsset, professionalId, 60, "first_above");
  assert.equal(above.status, "rejected");
  await assertReservation(above.reservationId, null);

  const multiEvolution = await createEvolution("multi");
  const multiA = await createAsset(multiEvolution, "multi-a", 20);
  const multiB = await createAsset(multiEvolution, "multi-b", 25);
  assert.equal((await reserve(multiA, professionalId, 60, "multi_a")).status, "reserved");
  assert.equal((await reserve(multiB, professionalId, 60, "multi_b")).status, "reserved");

  const crossingEvolution = await createEvolution("crossing");
  const crossingA = await createAsset(crossingEvolution, "crossing-a", 40);
  const crossingB = await createAsset(crossingEvolution, "crossing-b", 30);
  const crossing = await Promise.all([
    reserve(crossingA, professionalId, 60, "crossing_a"),
    reserve(crossingB, professionalId, 60, "crossing_b"),
  ]);
  assert.deepEqual(crossing.map((item) => item.status).sort(), ["rejected", "reserved"]);

  assert.equal((await reserve(simpleAsset, professionalId, 60, "same_asset_pending")).status, "existing_pending");
  assert.equal(checked(await admin.rpc("complete_evolution_audio_reservation", { p_reservation_id: simple.reservationId, p_professional_id: professionalId }), "complete_simple"), true);
  assert.equal((await reserve(simpleAsset, professionalId, 60, "same_asset_completed")).status, "existing_completed");

  const expiryEvolution = await createEvolution("expiry");
  const expiryAsset = await createAsset(expiryEvolution, "expiry", 10);
  const expired = await reserve(expiryAsset, professionalId, 60, "expiry_initial");
  checked(await admin.from("evolution_audio_budget_reservations").update({ expires_at: "2000-01-01T00:00:00Z" }).eq("reservation_id", expired.reservationId), "expire_pending");
  assert.equal((await reserve(expiryAsset, professionalId, 60, "expiry_replaced")).status, "reserved");

  assert.equal((await reserve(simpleAsset, randomUUID(), 60, "wrong_professional")).status, "not_authorized");
  assert.equal((await reserve(randomUUID(), professionalId, 60, "missing_asset")).status, "asset_not_found");

  const signedEvolution = await createEvolution("signed", "signed");
  assert.equal((await reserve(await createAsset(signedEvolution, "signed", 15), professionalId, 60, "signed_evolution")).status, "signed");

  const positiveLegacyEvolution = await createEvolution("positive-legacy", "draft", 10);
  assert.equal((await reserve(await createAsset(positiveLegacyEvolution, "positive-legacy", 15), professionalId, 60, "positive_legacy")).status, "legacy_unsupported");

  const ledgerLegacyEvolution = await createEvolution("ledger-legacy", "draft", 0);
  const ledgerLegacyAsset = await createAsset(ledgerLegacyEvolution, "ledger-legacy", 15);
  const legacyReservationId = randomUUID();
  reservationIds.push(legacyReservationId);
  checked(await admin.from("evolution_audio_budget_reservations").insert({
    reservation_id: legacyReservationId,
    evolution_id: ledgerLegacyEvolution,
    professional_id: professionalId,
    audio_key: `legacy:${run}:${legacyReservationId}`,
    duration_seconds: 5,
    status: "pending",
  }), "legacy_insert");
  assert.equal((await reserve(ledgerLegacyAsset, professionalId, 60, "ledger_legacy")).status, "legacy_unsupported");

  const releaseEvolution = await createEvolution("release");
  const release = await reserve(await createAsset(releaseEvolution, "release", 12), professionalId, 60, "release_pending");
  assert.equal(checked(await admin.rpc("release_evolution_audio_seconds", { p_reservation_id: release.reservationId, p_professional_id: professionalId }), "release_pending_rpc"), true);
  await assertReservation(release.reservationId, null);

  const completeEvolution = await createEvolution("complete");
  const completeAsset = await createAsset(completeEvolution, "complete", 13);
  const complete = await reserve(completeAsset, professionalId, 60, "complete_pending");
  assert.equal(checked(await admin.rpc("complete_evolution_audio_reservation", { p_reservation_id: complete.reservationId, p_professional_id: professionalId }), "complete_pending_rpc"), true);
  await assertReservation(complete.reservationId, { status: "completed", duration_seconds: 13 });
  assert.equal((await reserve(completeAsset, professionalId, 60, "complete_idempotent")).status, "existing_completed");

  const concurrencyEvolution = await createEvolution("concurrency");
  const concurrencyA = await createAsset(concurrencyEvolution, "concurrency-a", 700);
  const concurrencyB = await createAsset(concurrencyEvolution, "concurrency-b", 600);
  const concurrent = await Promise.all([
    reserve(concurrencyA, professionalId, 1200, "concurrency_a"),
    reserve(concurrencyB, professionalId, 1200, "concurrency_b"),
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), ["rejected", "reserved"]);
  const ledger = checked(await admin.from("evolution_audio_budget_reservations").select("duration_seconds").eq("evolution_id", concurrencyEvolution).eq("professional_id", professionalId).eq("status", "pending"), "concurrency_ledger");
  assert.ok(ledger.reduce((sum: number, row: { duration_seconds: number }) => sum + row.duration_seconds, 0) <= 1200);

  const signedClient = createClient(url, anonKey!, { ...options, global: { headers: { Authorization: `Bearer ${fixtures.owner.token}` } } });
  const deniedAnon = await anon.rpc("reserve_evolution_audio_asset", { p_audio_asset_id: randomUUID(), p_professional_id: professionalId, p_limit_seconds: 60, p_reservation_id: randomUUID() });
  const deniedAuthenticated = await signedClient.rpc("reserve_evolution_audio_asset", { p_audio_asset_id: randomUUID(), p_professional_id: professionalId, p_limit_seconds: 60, p_reservation_id: randomUUID() });
  assert.ok(deniedAnon.error, "anon must not execute the Phase C RPC");
  assert.ok(deniedAuthenticated.error, "authenticated must not execute the Phase C RPC");
  results.acl_anon_authenticated = "PASS";

  const cascadeEvolution = await createEvolution("cascade");
  const cascadeAsset = await createAsset(cascadeEvolution, "cascade", 14);
  const cascade = await reserve(cascadeAsset, professionalId, 60, "cascade_reservation");
  checked(await admin.from("audio_assets").delete().eq("id", cascadeAsset), "asset_delete_cascade");
  await assertReservation(cascade.reservationId, null);
  results.fk_cascade = "PASS";

  passed = true;
  console.log(JSON.stringify({ smoke: "PASS", run, statuses: results, service_role: "PASS", cleanup: "pending" }));
} finally {
  for (const table of ["evolution_audio_budget_reservations", "audio_assets", "evolutions", "patients"]) {
    const ids = table === "evolution_audio_budget_reservations" ? reservationIds : table === "audio_assets" ? assetIds : table === "evolutions" ? evolutionIds : patientIds;
    if (ids.length) {
      const result = await admin.from(table).delete().in("id", ids);
      if (result.error && table === "evolution_audio_budget_reservations") {
        const retry = await admin.from(table).delete().in("reservation_id", ids);
        if (retry.error) throw new Error(`cleanup_${table}`);
      } else if (result.error) throw new Error(`cleanup_${table}`);
    }
  }
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) throw new Error("cleanup_auth_users");
  }
  const remaining = {
    reservations: reservationIds.length ? (await admin.from("evolution_audio_budget_reservations").select("reservation_id").in("reservation_id", reservationIds)).data?.length || 0 : 0,
    assets: assetIds.length ? (await admin.from("audio_assets").select("id").in("id", assetIds)).data?.length || 0 : 0,
    evolutions: evolutionIds.length ? (await admin.from("evolutions").select("id").in("id", evolutionIds)).data?.length || 0 : 0,
    patients: patientIds.length ? (await admin.from("patients").select("id").in("id", patientIds)).data?.length || 0 : 0,
  };
  assert.deepEqual(remaining, { reservations: 0, assets: 0, evolutions: 0, patients: 0 });
  console.log(JSON.stringify({ cleanup: "PASS", fixture_counts: remaining }));
  if (!passed) throw new Error("audio_assets_phase_c_smoke_failed");
}
