import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AudioAssetProcessingError, processAudioAsset, type ProcessingAsset, type ProcessingRepository, type ProcessingRouteDependencies } from "../server/audioAssetProcessingRoutes.js";

const professionalId = "11111111-1111-4111-8111-111111111111";
const otherProfessionalId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";

const makeWav = (): Buffer => {
  const sampleRate = 8000;
  const dataSize = sampleRate * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
};

type HarnessOptions = {
  status?: string;
  evolutionStatus?: string | null;
  authorized?: boolean;
  budgetStatus?: string | null;
  monthlyUsage?: number;
  storage?: Buffer | null;
  durationSeconds?: number;
  existingReservationStatus?: "pending" | "completed";
};

function createHarness(options: HarnessOptions = {}) {
  const storage = options.storage === undefined ? makeWav() : options.storage;
  const contentHash = storage ? createHash("sha256").update(storage).digest("hex") : "0".repeat(64);
  const asset: ProcessingAsset = {
    id: assetId,
    evolutionId: "44444444-4444-4444-8444-444444444444",
    professionalId,
    organizationPatientId: null,
    evolutionStatus: options.evolutionStatus === undefined ? "draft" : options.evolutionStatus,
    transcriptionStatus: options.status || "pending",
    transcriptionText: options.status === "completed" ? "transcrição persistida" : null,
    durationSeconds: options.durationSeconds || 1,
    mimeType: "audio/wav",
    contentHash,
    storagePath: "synthetic/phase-d/audio.wav",
  };
  const calls = {
    reserve: 0,
    claim: 0,
    download: 0,
    gemini: 0,
    complete: 0,
    fail: 0,
    release: 0,
    increment: 0,
    recordUsage: 0,
  };
  let reservation: { reservationId: string; status: "pending" | "completed" } | null = options.existingReservationStatus
    ? { reservationId: "55555555-5555-4555-8555-555555555555", status: options.existingReservationStatus }
    : null;
  const repository: ProcessingRepository = {
    async readAsset() { return { ...asset }; },
    async reserveAsset(input) {
      calls.reserve += 1;
      if (options.budgetStatus) return { status: options.budgetStatus, reservation: null };
      if (reservation) return { status: reservation.status === "completed" ? "existing_completed" : "existing_pending", reservation: { ...reservation } };
      reservation = { reservationId: input.reservationId, status: "pending" };
      return { status: "reserved", reservation: { ...reservation } };
    },
    async claimAsset() {
      calls.claim += 1;
      if (asset.evolutionStatus === "signed") return "signed";
      if (asset.transcriptionStatus === "completed") return "already_completed";
      if (asset.transcriptionStatus === "processing") return "already_processing";
      asset.transcriptionStatus = "processing";
      return "claimed";
    },
    async downloadAsset() {
      calls.download += 1;
      if (!storage) throw new AudioAssetProcessingError("storage missing", "AUDIO_ASSET_STORAGE_MISSING", 404);
      return storage;
    },
    async completeAsset(input) {
      calls.complete += 1;
      asset.transcriptionStatus = "completed";
      asset.transcriptionText = input.transcription;
      if (reservation) reservation.status = "completed";
      return "completed";
    },
    async failAsset(input) {
      calls.fail += 1;
      asset.transcriptionStatus = "failed";
      asset.transcriptionText = null;
      if (reservation?.status === "pending" && (!input.reservationId || reservation.reservationId === input.reservationId)) reservation = null;
      return "failed";
    },
    async releaseReservation() {
      calls.release += 1;
      reservation = null;
      return true;
    },
  };
  const deps: ProcessingRouteDependencies = {
    repository,
    authorizeAsset: async () => {
      if (options.authorized === false) throw new AudioAssetProcessingError("not authorized", "AUDIO_ASSET_NOT_AUTHORIZED", 403);
    },
    resolveAudioPolicy: async () => ({ maxDurationSeconds: 60, maxFileBytes: 1024 * 1024 }),
    consumeRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
    getCurrentUsageMonth: () => "2026-09-01",
    getMonthlyUsageSeconds: async () => options.monthlyUsage || 0,
    incrementMonthlyUsageSeconds: async () => { calls.increment += 1; return 1; },
    monthlyLimitSeconds: 20 * 60 * 60,
    getGeminiSettings: async () => ({ apiKey: "synthetic-key", modelName: "gemini-3.5-flash" }),
    resolveTranscriptionModel: (model) => model,
    isQuotaRelatedError: (error) => /quota|429/i.test(String(error?.message || error)),
    createGeminiClient: () => ({ synthetic: true }),
    transcribeGeminiAudio: async () => {
      calls.gemini += 1;
      return { transcription: "transcrição sintética", method: "inline", cleanupSucceeded: true, usageMetadata: { totalTokenCount: 1 } };
    },
    recordUsage: async () => { calls.recordUsage += 1; },
  };
  return { asset, reservation: () => reservation, calls, deps };
}

const expectCode = async (operation: () => Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: any) => error?.code === code);
};

const valid = createHarness();
const validResult = await processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, valid.deps);
assert.equal(validResult.cached, false);
assert.equal(valid.calls.gemini, 1);
assert.equal(valid.calls.complete, 1);
assert.equal(valid.calls.increment, 1);
assert.equal(valid.reservation()?.status, "completed");

const cached = createHarness({ status: "completed" });
const cachedResult = await processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, cached.deps);
assert.equal(cachedResult.cached, true);
assert.equal(cached.calls.reserve, 0);
assert.equal(cached.calls.gemini, 0);
assert.equal(cached.calls.increment, 0);

const signed = createHarness({ evolutionStatus: "signed" });
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, signed.deps), "EVOLUTION_SIGNED_IMMUTABLE");
assert.equal(signed.calls.reserve, 0);
assert.equal(signed.calls.gemini, 0);

const unauthorized = createHarness({ authorized: false });
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, unauthorized.deps), "AUDIO_ASSET_NOT_AUTHORIZED");
assert.equal(unauthorized.calls.gemini, 0);

const consultant = createHarness({ authorized: false });
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId: otherProfessionalId, authorizationHeader: "Bearer synthetic" }, consultant.deps), "AUDIO_ASSET_NOT_AUTHORIZED");

const missing = createHarness();
missing.deps.repository.readAsset = async () => null;
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, missing.deps), "AUDIO_ASSET_NOT_FOUND");

for (const budgetStatus of ["rejected", "legacy_unsupported"]) {
  const budget = createHarness({ budgetStatus });
  await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, budget.deps), budgetStatus === "rejected" ? "AUDIO_EVOLUTION_DURATION_LIMIT" : "AUDIO_ASSET_LEGACY_EVOLUTION_UNSUPPORTED");
  assert.equal(budget.calls.gemini, 0);
}

const monthly = createHarness({ monthlyUsage: 20 * 60 * 60 });
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, monthly.deps), "AUDIO_MONTHLY_QUOTA_LIMIT");
assert.equal(monthly.calls.reserve, 0);
assert.equal(monthly.calls.gemini, 0);

for (const failure of [
  { name: "storage", options: { storage: null }, code: "AUDIO_ASSET_STORAGE_MISSING" },
  { name: "hash", options: { storage: Buffer.from(makeWav()), durationSeconds: 1 }, code: "AUDIO_ASSET_INTEGRITY_MISMATCH" },
  { name: "mime", options: { storage: Buffer.from("not-audio"), durationSeconds: 1 }, code: "AUDIO_ASSET_MIME_UNSUPPORTED" },
]) {
  const harness = createHarness(failure.options);
  if (failure.name === "hash") harness.asset.contentHash = "f".repeat(64);
  await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, harness.deps), failure.code);
  assert.equal(harness.asset.transcriptionStatus, "failed");
  assert.equal(harness.reservation(), null);
  assert.equal(harness.calls.gemini, 0);
}

const geminiFailure = createHarness();
geminiFailure.deps.transcribeGeminiAudio = async () => { geminiFailure.calls.gemini += 1; throw new Error("provider failure"); };
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, geminiFailure.deps), "AUDIO_ASSET_PROCESSING_FAILED");
assert.equal(geminiFailure.asset.transcriptionStatus, "failed");
assert.equal(geminiFailure.reservation(), null);

const inProgress = createHarness({ status: "processing" });
await expectCode(() => processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, inProgress.deps), "AUDIO_ASSET_PROCESSING_IN_PROGRESS");
assert.equal(inProgress.calls.gemini, 0);

const retry = createHarness({ status: "failed" });
const retryResult = await processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, retry.deps);
assert.equal(retryResult.cached, false);
assert.equal(retry.calls.gemini, 1);

const existingCompleted = createHarness({ status: "failed", existingReservationStatus: "completed" });
await processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, existingCompleted.deps);
assert.equal(existingCompleted.calls.reserve, 1);
assert.equal(existingCompleted.calls.gemini, 1);
assert.equal(existingCompleted.calls.release, 0);

const concurrent = createHarness();
const concurrentResults = await Promise.allSettled([
  processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, concurrent.deps),
  processAudioAsset({ audioAssetId: assetId, professionalId, authorizationHeader: "Bearer synthetic" }, concurrent.deps),
]);
assert.equal(concurrent.calls.gemini, 1);
assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrentResults.filter((result) => result.status === "rejected").length, 1);

const multiA = createHarness();
const multiB = createHarness();
multiB.asset.id = "66666666-6666-4666-8666-666666666666";
multiB.asset.evolutionId = multiA.asset.evolutionId;
await processAudioAsset({ audioAssetId: multiA.asset.id, professionalId, authorizationHeader: "Bearer synthetic" }, multiA.deps);
await processAudioAsset({ audioAssetId: multiB.asset.id, professionalId, authorizationHeader: "Bearer synthetic" }, multiB.deps);
assert.equal(multiA.calls.gemini, 1);
assert.equal(multiB.calls.gemini, 1);

const route = await readFile(new URL("../server/audioAssetProcessingRoutes.ts", import.meta.url), "utf8");
const server = await readFile(new URL("../server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923153946_add_audio_asset_processing_lifecycle.sql", import.meta.url), "utf8");
assert.match(route, /evolution-assets\/:audioAssetId\/process/);
assert.match(route, /deps\.requireAuth/);
assert.match(route, /evolutionStatus === "signed"/);
assert.match(route, /reserve_evolution_audio_asset/);
assert.match(route, /storagePath/);
assert.match(route, /createHash\("sha256"\)/);
assert.match(route, /transcribeGeminiAudio/);
assert.match(route, /monthlyLimitSeconds/);
assert.match(route, /cached/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_audio_asset_processing/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_audio_asset_processing/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fail_audio_asset_processing/);
assert.match(migration, /SECURITY INVOKER/g);
assert.match(migration, /SET search_path = pg_catalog, public/g);
assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated/g);
assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/g);
const legacyRoute = server.slice(server.indexOf('app.post("/api/ai/transcribe"'), server.indexOf('app.get("/api/ai/convert-evolution-template"'));
assert.match(legacyRoute, /reserve_evolution_audio_seconds/);
assert.match(legacyRoute, /transcribeGeminiAudio/);
assert.doesNotMatch(legacyRoute, /reserve_evolution_audio_asset/);
assert.doesNotMatch(legacyRoute, /audio_assets/);
assert.doesNotMatch(route, /evolutions\.transcription_text|original_transcription_text|evolutions\.status/);

console.log("audio assets phase D contract and mock processing tests: ok");
