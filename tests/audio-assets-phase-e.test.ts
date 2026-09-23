import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const newEvolution = await readFile(new URL("../src/pages/NewEvolution.tsx", import.meta.url), "utf8");
const uploadService = await readFile(new URL("../src/services/evolutionAudioAssetUpload.ts", import.meta.url), "utf8");
const queue = await readFile(new URL("../src/services/offlineQueue.ts", import.meta.url), "utf8");
const queueMonitor = await readFile(new URL("../src/components/layout/OfflineQueueMonitor.tsx", import.meta.url), "utf8");
const shareTarget = await readFile(new URL("../src/pages/ShareTarget.tsx", import.meta.url), "utf8");
const legacyTranscription = await readFile(new URL("../src/services/aiTranscription.ts", import.meta.url), "utf8");

const cases: Array<[string, () => void]> = [
  ["personal audio imports asset pipeline", () => assert.match(newEvolution, /processEvolutionAudioAsset/)],
  ["NewEvolution does not call legacy transcribeAudio", () => assert.doesNotMatch(newEvolution, /\btranscribeAudio\s*\(/)],
  ["prepare endpoint remains in upload service", () => assert.match(uploadService, /evolution-assets\/prepare/)],
  ["finalize endpoint remains in upload service", () => assert.match(uploadService, /evolution-assets\/.*\/finalize/)],
  ["process endpoint is called by the asset helper", () => assert.match(uploadService, /evolution-assets\/.*\/process/)],
  ["client error preserves code", () => assert.match(uploadService, /class AudioAssetClientError[\s\S]*public readonly code/)],
  ["client error preserves HTTP status", () => assert.match(uploadService, /class AudioAssetClientError[\s\S]*public readonly status/)],
  ["backend JSON code is parsed", () => assert.match(uploadService, /body\.code/)],
  ["processing retry recognizes in-progress", () => assert.match(uploadService, /AUDIO_ASSET_PROCESSING_IN_PROGRESS/)],
  ["processing retry is bounded", () => assert.match(uploadService, /Math\.min\(5, input\.maxProcessAttempts/)],
  ["retry uses the same asset id", () => assert.match(uploadService, /processAudioAsset\(audioAssetId, token\)/)],
  ["retry uses a finite wait", () => assert.match(uploadService, /await sleep\(Math\.min\(5000/)],
  ["idempotency key is passed to upload", () => assert.match(newEvolution, /idempotencyKey: `new-evolution:\$\{evolutionId\}:\$\{item\.audioKey\}`/)],
  ["offline queue persists audio keys", () => assert.match(queue, /audioKeys\?: string\[\]/)],
  ["offline queue persists audio names", () => assert.match(queue, /audioNames\?: string\[\]/)],
  ["offline queue has pipeline marker", () => assert.match(queue, /audioPipeline\?: 'legacy' \| 'asset'/)],
  ["draft persists keys", () => assert.match(newEvolution, /audioKeys,/)],
  ["draft persists names", () => assert.match(newEvolution, /audioNames,/)],
  ["new audio draft is asset pipeline", () => assert.match(newEvolution, /audioPipeline: draftBlobs\.length > 0 \? 'asset'/)],
  ["initial evolution duration is zero", () => assert.match(newEvolution, /audio_duration_seconds: 0/)],
  ["server duration is accumulated", () => assert.match(newEvolution, /authoritativeTotalDuration \+= processed\.durationSeconds/)],
  ["personal projection is final-only", () => assert.match(newEvolution, /audio_duration_seconds: authoritativeTotalDuration/)],
  ["clinic does not receive the personal projection", () => assert.match(newEvolution, /!isClinic \? \{ audio_duration_seconds: authoritativeTotalDuration \}/)],
  ["typed text precedes transcriptions", () => assert.match(newEvolution, /const transcriptionParts: string\[\] = typedText \? \[typedText\] : \[\]/)],
  ["audio order is sequential", () => assert.match(newEvolution, /for \(let index = 0; index < items\.length; index \+= 1\)/)],
  ["template conversion remains after composition", () => assert.match(newEvolution, /convertEvolutionToTemplate\(originalTranscription, selectedTemplateId\)/)],
  ["Google Docs append remains after processing", () => assert.match(newEvolution, /appendToGoogleDoc\(/)],
  ["evolution started event remains", () => assert.match(newEvolution, /trackEvent\('evolution_started'/)],
  ["evolution completed event remains", () => assert.match(newEvolution, /trackEvent\('evolution_completed'/)],
  ["audio completed event remains", () => assert.match(newEvolution, /trackEvent\('audio_evolution_completed'/)],
  ["asset queue is visible to monitor", () => assert.match(queueMonitor, /item\.audioPipeline === 'asset'/)],
  ["asset queue uses the asset helper", () => assert.match(queueMonitor, /processEvolutionAudioAsset\(/)],
  ["asset queue does not use legacy transcription in its branch", () => assert.match(queueMonitor, /if \(item\.audioPipeline === 'asset'\)/)],
  ["legacy queue still calls legacy transcription", () => assert.match(queueMonitor, /transcribeAudio\(/)],
  ["legacy queue defaults by omission", () => assert.match(queueMonitor, /item\.audioPipeline === 'asset'/)],
  ["ShareTarget was not migrated", () => assert.doesNotMatch(shareTarget, /audioPipeline:\s*['"]asset['"]|processEvolutionAudioAsset/)],
  ["legacy service remains available", () => assert.match(legacyTranscription, /export const transcribeAudio/)],
  ["quota message is preserved", () => assert.match(newEvolution, /AUDIO_MONTHLY_QUOTA_LIMIT/)],
  ["duration message is preserved", () => assert.match(newEvolution, /AUDIO_EVOLUTION_DURATION_LIMIT/)],
  ["rate limit message is preserved", () => assert.match(newEvolution, /AUDIO_TRANSCRIPTION_RATE_LIMIT/)],
  ["signed error does not fallback", () => assert.match(newEvolution, /EVOLUTION_SIGNED_IMMUTABLE/)],
  ["offline asset item retains same evolution id", () => assert.match(queueMonitor, /id: item\.id/)],
  ["offline asset projection uses authoritative durations", () => assert.match(queueMonitor, /audio_duration_seconds: authoritativeTotalDuration/)],
  ["offline asset queue completes only after final save", () => assert.match(queueMonitor, /await removePendingEvolution\(item\.id\)/)],
];

for (const [, test] of cases) test();
assert.equal(cases.length, 44);
console.log(`audio assets phase E contract tests: ${cases.length} cases ok`);
