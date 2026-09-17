import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAudioDurationSecondsFromBuffer } from '../server/audioDuration';

const wavHeader = Buffer.alloc(44 + 16000 * 2);
wavHeader.write('RIFF', 0, 'ascii');
wavHeader.writeUInt32LE(36 + 16000 * 2, 4);
wavHeader.write('WAVE', 8, 'ascii');
wavHeader.write('fmt ', 12, 'ascii');
wavHeader.writeUInt32LE(16, 16);
wavHeader.writeUInt16LE(1, 20);
wavHeader.writeUInt16LE(1, 22);
wavHeader.writeUInt32LE(8000, 24);
wavHeader.writeUInt32LE(16000, 28);
wavHeader.writeUInt16LE(2, 32);
wavHeader.writeUInt16LE(16, 34);
wavHeader.write('data', 36, 'ascii');
wavHeader.writeUInt32LE(16000 * 2, 40);

const duration = await getAudioDurationSecondsFromBuffer(wavHeader);
assert.equal(duration, 2);

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
assert.match(serverSource, /getAudioDurationSecondsFromBuffer\(audioBuffer\)/);
assert.match(serverSource, /p_duration_seconds: authoritativeAudioDurationSeconds/);
assert.match(serverSource, /audio_duration_seconds: authoritativeAudioDurationSeconds/);
assert.doesNotMatch(serverSource, /requestedAudioDurationSeconds/);
assert.doesNotMatch(serverSource, /const \{[^}]*\bplan\b[^}]*\} = req\.body/);
assert.match(serverSource, /from\("professionals"\)/);

console.log('audio-duration authority and spoof guard: ok');
