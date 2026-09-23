import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAudioDurationFromBlob } from '../src/utils/audioDuration';

function ebmlElement(id: number[], payload: Uint8Array): Uint8Array {
  return Uint8Array.from([...id, 0x80 | payload.length, ...payload]);
}

function streamingWebmFixture(): Uint8Array {
  const unknownSize8 = Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const info = ebmlElement(
    [0x15, 0x49, 0xa9, 0x66],
    ebmlElement([0x2a, 0xd7, 0xb1], Uint8Array.from([0x00, 0x0f, 0x42, 0x40])),
  );
  const simpleBlock = (relativeTimecode: number) => {
    const payload = new Uint8Array(8);
    payload[0] = 0x81;
    new DataView(payload.buffer).setInt16(1, relativeTimecode, false);
    payload[3] = 0x80;
    payload[4] = 0xf8;
    return ebmlElement([0xa3], payload);
  };
  const cluster = Uint8Array.from([
    0x1f, 0x43, 0xb6, 0x75,
    ...unknownSize8,
    ...ebmlElement([0xe7], Uint8Array.from([0x00])),
    ...simpleBlock(0),
    ...simpleBlock(1960),
    ...simpleBlock(1980),
  ]);
  const ebml = Uint8Array.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x88, 0x42, 0x86, 0x81, 0x01,
    0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
  ]);

  return Uint8Array.from([
    ...ebml,
    0x18, 0x53, 0x80, 0x67,
    ...unknownSize8,
    ...info,
    ...cluster,
  ]);
}

const recoveredRecording = new Blob([streamingWebmFixture()], { type: 'audio/webm' });
const duration = await getAudioDurationFromBlob(recoveredRecording);

assert.ok(
  duration >= 1.99 && duration <= 2.05,
  `recovered streaming WebM should use block timecodes, got ${duration}`,
);

const transcriptionServiceSource = await readFile(
  new URL('../src/services/aiTranscription.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  transcriptionServiceSource,
  /Não foi possível identificar a duração do áudio\. Reproduza/,
  'unknown client metadata must defer to authoritative server validation',
);
assert.match(transcriptionServiceSource, /backend baixa os bytes e valida a duração autoritativa/);

console.log('client recovered-audio duration fallback: ok');
