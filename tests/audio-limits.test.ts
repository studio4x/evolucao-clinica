import assert from 'node:assert/strict';
import { AUDIO_LIMITS, INLINE_AUDIO_MAX_RAW_BYTES, getAudioLimitPolicy, isAudioDurationAllowed, isAudioFileSizeAllowed } from '../src/utils/audioLimits';
import { transcribeGeminiAudio } from '../server/audioTranscriptionTransport';

const run = async () => {
  assert.equal(getAudioLimitPolicy('trial').maxDurationSeconds, 1200);
  assert.equal(getAudioLimitPolicy('monthly').maxDurationSeconds, 1200);
  assert.equal(getAudioLimitPolicy('yearly').maxDurationSeconds, 3600);
  assert.equal(getAudioLimitPolicy('unknown' as never).maxDurationSeconds, 1200);
  assert.equal(isAudioDurationAllowed(0, 1200, AUDIO_LIMITS.conservative), true);
  assert.equal(isAudioDurationAllowed(0, 1201, AUDIO_LIMITS.conservative), false);
  assert.equal(isAudioDurationAllowed(0, 3599, AUDIO_LIMITS.yearly), true);
  assert.equal(isAudioDurationAllowed(0, 3600, AUDIO_LIMITS.yearly), true);
  assert.equal(isAudioDurationAllowed(0, 3601, AUDIO_LIMITS.yearly), false);
  assert.equal(isAudioDurationAllowed(3000, 600, AUDIO_LIMITS.yearly), true);
  assert.equal(isAudioDurationAllowed(3000, 601, AUDIO_LIMITS.yearly), false);
  assert.equal(isAudioFileSizeAllowed(20 * 1024 * 1024, AUDIO_LIMITS.conservative), true);
  assert.equal(isAudioFileSizeAllowed(20 * 1024 * 1024 + 1, AUDIO_LIMITS.conservative), false);
  assert.equal(isAudioFileSizeAllowed(60 * 1024 * 1024, AUDIO_LIMITS.yearly), true);
  assert.equal(isAudioFileSizeAllowed(60 * 1024 * 1024 + 1, AUDIO_LIMITS.yearly), false);

  const logs: Record<string, unknown>[] = [];
  let uploadCalls = 0;
  let deleteCalls = 0;
  let receivedParts: Array<Record<string, unknown>> = [];
  const smallAi = {
    files: {
      async upload() { uploadCalls += 1; return { name: 'files/unused', uri: 'unused', mimeType: 'audio/webm' }; },
      async delete() { deleteCalls += 1; },
    },
    models: {
      async generateContent(input: any) { receivedParts = input.contents.parts; return { text: 'transcrição de teste' }; },
    },
  };
  const smallResult = await transcribeGeminiAudio(smallAi, {
    audioBuffer: Buffer.alloc(1024), mimeType: 'audio/webm', prompt: 'prompt', model: 'model', durationSeconds: 1,
  }, (event) => logs.push(event));
  assert.equal(smallResult.method, 'inline');
  assert.equal(uploadCalls, 0);
  assert.ok(receivedParts[1]?.inlineData);
  assert.equal(deleteCalls, 0);

  uploadCalls = 0;
  deleteCalls = 0;
  receivedParts = [];
  const largeAi = {
    files: {
      async upload() { uploadCalls += 1; return { name: 'files/temp', uri: 'https://temporary.invalid/file', mimeType: 'audio/mpeg' }; },
      async delete() { deleteCalls += 1; },
    },
    models: {
      async generateContent(input: any) { receivedParts = input.contents.parts; return { text: 'transcrição grande' }; },
    },
  };
  const largeResult = await transcribeGeminiAudio(largeAi, {
    audioBuffer: Buffer.alloc(INLINE_AUDIO_MAX_RAW_BYTES + 1), mimeType: 'audio/mpeg', prompt: 'prompt', model: 'model', durationSeconds: 2,
  }, (event) => logs.push(event));
  assert.equal(largeResult.method, 'files-api');
  assert.equal(uploadCalls, 1);
  assert.equal(deleteCalls, 1);
  assert.ok(receivedParts[1]?.fileData);
  assert.equal((receivedParts[1] as any).inlineData, undefined);

  let failedDelete = false;
  const deleteFailureAi = {
    files: {
      async upload() { return { name: 'files/temp', uri: 'https://temporary.invalid/file', mimeType: 'audio/mpeg' }; },
      async delete() { failedDelete = true; throw new Error('clinical prompt must not appear'); },
    },
    models: {
      async generateContent() { return { text: 'resultado preservado' }; },
    },
  };
  const resultWithDeleteFailure = await transcribeGeminiAudio(deleteFailureAi, {
    audioBuffer: Buffer.alloc(INLINE_AUDIO_MAX_RAW_BYTES + 1), mimeType: 'audio/mpeg', prompt: 'conteúdo clínico secreto', model: 'model', durationSeconds: 3,
  }, (event) => logs.push(event));
  assert.equal(failedDelete, true);
  assert.equal(resultWithDeleteFailure.transcription, 'resultado preservado');
  assert.equal(resultWithDeleteFailure.cleanupSucceeded, false);
  assert.equal(logs.some((event) => JSON.stringify(event).includes('conteúdo clínico secreto')), false);

  let failedPathDeleteCalls = 0;
  const failingModelAi = {
    files: {
      async upload() { return { name: 'files/failing', uri: 'https://temporary.invalid/failing', mimeType: 'audio/mpeg' }; },
      async delete() { failedPathDeleteCalls += 1; },
    },
    models: {
      async generateContent() { throw new Error('provider failure'); },
    },
  };
  await assert.rejects(() => transcribeGeminiAudio(failingModelAi, {
    audioBuffer: Buffer.alloc(INLINE_AUDIO_MAX_RAW_BYTES + 1), mimeType: 'audio/mpeg', prompt: 'prompt', model: 'model', durationSeconds: 4,
  }));
  assert.equal(failedPathDeleteCalls, 1);

  let emptyPathDeleteCalls = 0;
  const emptyModelAi = {
    files: {
      async upload() { return { name: 'files/empty', uri: 'https://temporary.invalid/empty', mimeType: 'audio/mpeg' }; },
      async delete() { emptyPathDeleteCalls += 1; },
    },
    models: {
      async generateContent() { return { text: '' }; },
    },
  };
  await assert.rejects(() => transcribeGeminiAudio(emptyModelAi, {
    audioBuffer: Buffer.alloc(INLINE_AUDIO_MAX_RAW_BYTES + 1), mimeType: 'audio/mpeg', prompt: 'prompt', model: 'model', durationSeconds: 5,
  }));
  assert.equal(emptyPathDeleteCalls, 1);

  console.log('audio-limits: ok');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
