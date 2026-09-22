import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTranscriptionErrorRetryable } from "../src/utils/aiTranscriptionPolicy";

const countAttempts = (errors: unknown[]) => {
  let attempts = 0;
  for (const error of errors) {
    attempts += 1;
    if (!isTranscriptionErrorRetryable(error)) break;
  }
  return attempts;
};

assert.equal(countAttempts([{ code: "integration_disabled", status: 503, message: "O processamento por IA está temporariamente desabilitado neste ambiente." }]), 1);
assert.equal(isTranscriptionErrorRetryable({ code: "environment_configuration_error", message: "configuração ausente" }), false);
assert.equal(isTranscriptionErrorRetryable({ code: "missing_gemini_api_key", message: "configuração ausente" }), false);
assert.equal(isTranscriptionErrorRetryable({ code: "feature_unavailable", status: 503 }), false);
assert.equal(countAttempts([{ status: 429, message: "quota" }, { status: 429, message: "quota" }, { status: 200 }]), 3);
assert.equal(countAttempts([{ status: 503, message: "temporário" }, { status: 200 }]), 2);
assert.equal(isTranscriptionErrorRetryable({ status: 500, message: "erro interno" }), false);

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const transcriptionRoute = serverSource.slice(serverSource.indexOf('app.post("/api/ai/transcribe"'));
assert.match(transcriptionRoute, /finally \{/);
assert.match(transcriptionRoute, /storageAdmin\.storage\.from\(TEMP_AUDIO_BUCKET\)\.remove\(\[audioPathToCleanup\]\)/);

console.log("ai transcription retry tests: ok");
