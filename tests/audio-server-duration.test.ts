import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAudioDurationSecondsFromBuffer } from "../server/audioDuration";

const u16be = (buffer: Buffer, offset: number, value: number) => buffer.writeUInt16BE(value, offset);
const u32be = (buffer: Buffer, offset: number, value: number) => buffer.writeUInt32BE(value, offset);
const u32le = (buffer: Buffer, offset: number, value: number) => buffer.writeUInt32LE(value, offset);

function wavFixture(): Buffer {
  const dataBytes = 32000;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF");
  u32le(buffer, 4, buffer.length - 8);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  u32le(buffer, 16, 16);
  u16le(buffer, 20, 1);
  u16le(buffer, 22, 1);
  u32le(buffer, 24, 8000);
  u32le(buffer, 28, 16000);
  u16le(buffer, 32, 2);
  u16le(buffer, 34, 16);
  buffer.write("data", 36);
  u32le(buffer, 40, dataBytes);
  return buffer;
}

function u16le(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt16LE(value, offset);
}

function mp3Fixture(): Buffer {
  const frameLength = 417;
  const frame = Buffer.alloc(frameLength);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x64;
  return Buffer.concat(Array.from({ length: 80 }, () => frame));
}

function aacFixture(): Buffer {
  const frameLength = 500;
  const frames: Buffer[] = [];
  for (let index = 0; index < 12; index += 1) {
    const frame = Buffer.alloc(frameLength);
    frame[0] = 0xff;
    frame[1] = 0xf1;
    frame[2] = 0x50;
    frame[3] = (frameLength >> 11) & 0x03;
    frame[4] = (frameLength >> 3) & 0xff;
    frame[5] = ((frameLength & 0x07) << 5) | 0x1f;
    frame[6] = 0xfc;
    frames.push(frame);
  }
  return Buffer.concat(frames);
}

function mp4Atom(type: string, payload: Buffer): Buffer {
  const atom = Buffer.alloc(8 + payload.length);
  u32be(atom, 0, atom.length);
  atom.write(type, 4);
  payload.copy(atom, 8);
  return atom;
}

function mp4Fixture(): Buffer {
  const ftypPayload = Buffer.alloc(16);
  ftypPayload.write("M4A ", 0);
  ftypPayload.write("M4A ", 4);
  ftypPayload.write("isom", 8);
  ftypPayload.write("mp42", 12);

  const mvhdPayload = Buffer.alloc(100);
  u32be(mvhdPayload, 12, 1000);
  u32be(mvhdPayload, 16, 2000);
  u32be(mvhdPayload, 96, 2);

  const tkhdPayload = Buffer.alloc(84);
  tkhdPayload[3] = 7;
  u32be(tkhdPayload, 12, 1);
  u32be(tkhdPayload, 20, 2000);

  const mdhdPayload = Buffer.alloc(24);
  u32be(mdhdPayload, 12, 48000);
  u32be(mdhdPayload, 16, 96000);

  const hdlrPayload = Buffer.alloc(28);
  hdlrPayload.write("mhlr", 4);
  hdlrPayload.write("soun", 8);

  const sampleDescription = Buffer.alloc(20);
  u16be(sampleDescription, 0, 0);
  u16be(sampleDescription, 2, 0);
  u32be(sampleDescription, 4, 0);
  u16be(sampleDescription, 8, 2);
  u16be(sampleDescription, 10, 16);
  u16be(sampleDescription, 18, 48000);

  const sampleEntryPayload = Buffer.alloc(32);
  sampleEntryPayload.write("mp4a", 0);
  u16be(sampleEntryPayload, 10, 1);
  sampleDescription.copy(sampleEntryPayload, 12);
  const stsdPayload = Buffer.alloc(8 + 4 + sampleEntryPayload.length);
  u32be(stsdPayload, 4, 1);
  u32be(stsdPayload, 8, sampleEntryPayload.length + 4);
  sampleEntryPayload.copy(stsdPayload, 12);
  const stszPayload = Buffer.alloc(12);
  u32be(stszPayload, 4, 1024);
  u32be(stszPayload, 8, 1);

  const stbl = mp4Atom("stbl", Buffer.concat([mp4Atom("stsd", stsdPayload), mp4Atom("stsz", stszPayload)]));
  const minf = mp4Atom("minf", Buffer.concat([mp4Atom("smhd", Buffer.alloc(4)), stbl]));
  const mdia = mp4Atom("mdia", Buffer.concat([mp4Atom("mdhd", mdhdPayload), mp4Atom("hdlr", hdlrPayload), minf]));
  const trak = mp4Atom("trak", Buffer.concat([mp4Atom("tkhd", tkhdPayload), mdia]));
  return Buffer.concat([mp4Atom("ftyp", ftypPayload), mp4Atom("moov", Buffer.concat([mp4Atom("mvhd", mvhdPayload), trak]))]);
}

function ebmlElement(id: number[], payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id), Buffer.from([0x80 | payload.length]), payload]);
}

function webmFixture(): Buffer {
  const duration = Buffer.alloc(4);
  duration.writeFloatBE(2000, 0);
  const info = ebmlElement([0x15, 0x49, 0xa9, 0x66], Buffer.concat([
    ebmlElement([0x2a, 0xd7, 0xb1], Buffer.from([0x00, 0x0f, 0x42, 0x40])),
    ebmlElement([0x44, 0x89], duration),
  ]));
  const samplingFrequency = Buffer.alloc(8);
  samplingFrequency.writeDoubleBE(48000, 0);
  const audio = ebmlElement([0xe1], Buffer.concat([
    ebmlElement([0xb5], samplingFrequency),
    ebmlElement([0x9f], Buffer.from([0x82])),
  ]));
  const trackEntry = ebmlElement([0xae], Buffer.concat([
    ebmlElement([0xd7], Buffer.from([0x81])),
    ebmlElement([0x83], Buffer.from([0x02])),
    ebmlElement([0x86], Buffer.from("A_OPUS")),
    audio,
  ]));
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry);
  const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x88, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04]);
  return Buffer.concat([ebml, Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]), info, tracks]);
}

function streamingWebmFixture(): Buffer {
  const info = ebmlElement([0x15, 0x49, 0xa9, 0x66],
    ebmlElement([0x2a, 0xd7, 0xb1], Buffer.from([0x00, 0x0f, 0x42, 0x40])));
  const simpleBlock = (relativeTimecode: number) => {
    const payload = Buffer.alloc(8);
    payload[0] = 0x81;
    payload.writeInt16BE(relativeTimecode, 1);
    payload[3] = 0x80;
    payload[4] = 0xf8;
    return ebmlElement([0xa3], payload);
  };
  const cluster = Buffer.concat([
    Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0xff]),
    ebmlElement([0xe7], Buffer.from([0x00])),
    simpleBlock(0),
    simpleBlock(1960),
    simpleBlock(1980),
  ]);
  const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x88, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04]);
  return Buffer.concat([
    ebml,
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]),
    info,
    cluster,
  ]);
}

function oggOpusFixture(): Buffer {
  const page = (headerType: number, granule: number, sequence: number, payload: Buffer): Buffer => {
    const header = Buffer.alloc(27);
    header.write("OggS", 0);
    header[5] = headerType;
    header.writeBigUInt64LE(BigInt(granule), 6);
    header.writeUInt32LE(0x12345678, 14);
    header.writeUInt32LE(sequence, 18);
    header[26] = 1;
    return Buffer.concat([header, Buffer.from([payload.length]), payload]);
  };
  const opusHead = Buffer.alloc(19);
  opusHead.write("OpusHead", 0);
  opusHead[8] = 1;
  opusHead[9] = 2;
  opusHead.writeUInt16LE(312, 10);
  opusHead.writeUInt32LE(48000, 12);
  return Buffer.concat([page(2, 0, 0, opusHead), page(4, 96000, 1, Buffer.from("OpusTags"))]);
}

const fixtures: Array<[string, Buffer, string, number]> = [
  ["WAV", wavFixture(), "audio/wav", 2],
  ["MP3", mp3Fixture(), "audio/mpeg", 2],
  ["Ogg/Opus", oggOpusFixture(), "audio/ogg", 2],
  ["WebM/Opus", webmFixture(), "audio/webm", 2],
  ["MP4/M4A", mp4Fixture(), "audio/mp4", 2],
  ["AAC/ADTS", aacFixture(), "audio/aac", 0.25],
];

for (const [label, bytes, mimeType, expectedMinimum] of fixtures) {
  const duration = await getAudioDurationSecondsFromBuffer(bytes, mimeType);
  assert.ok(duration >= expectedMinimum * 0.8, `${label} duration should be positive, got ${duration}`);
}

assert.equal(await getAudioDurationSecondsFromBuffer(Buffer.from([0, 1, 2, 3, 4]), "audio/aac"), 0);
assert.ok(await getAudioDurationSecondsFromBuffer(wavFixture(), "audio/aac") > 0, "bytes must remain authoritative over a misleading MIME");
const streamingWebmDuration = await getAudioDurationSecondsFromBuffer(streamingWebmFixture(), "audio/webm");
assert.ok(
  streamingWebmDuration >= 1.99 && streamingWebmDuration <= 2.05,
  `MediaRecorder WebM without Info/Duration should use block timecodes, got ${streamingWebmDuration}`,
);

const serverDurationSource = await readFile(new URL("../server/audioDuration.ts", import.meta.url), "utf8");
assert.doesNotMatch(serverDurationSource, /document|window|createObjectURL|HTMLAudioElement|getAudioDurationFromBlob/);

const routeSource = await readFile(new URL("../server.ts", import.meta.url), "utf8");
const transcriptionServiceSource = await readFile(new URL("../src/services/aiTranscription.ts", import.meta.url), "utf8");
const sizeGuardIndex = routeSource.indexOf("audioBuffer.byteLength > audioPolicy.maxFileBytes");
const parserIndex = routeSource.indexOf("getAudioDurationSecondsFromBuffer(audioBuffer, normalizedMimeType)");
const reservationIndex = routeSource.indexOf("buildAuthoritativeAudioKey(evolutionId, audioKey, audioBuffer)");
const durationUnavailableIndex = routeSource.indexOf('code: "AUDIO_DURATION_UNAVAILABLE"');
const geminiIndex = routeSource.indexOf("transcribeGeminiAudio(");
assert.ok(sizeGuardIndex >= 0 && sizeGuardIndex < parserIndex, "oversized files must be rejected before duration parsing");
assert.ok(parserIndex < reservationIndex, "duration parsing must precede reservation");
assert.ok(durationUnavailableIndex >= 0 && durationUnavailableIndex < reservationIndex, "malformed files must fail before reservation");
assert.ok(durationUnavailableIndex < geminiIndex, "malformed files must fail before Gemini");
assert.match(routeSource, /code: "AUDIO_DURATION_UNAVAILABLE"/);
assert.match(routeSource, /Duração de áudio indisponível/);
assert.match(routeSource, /code: "AUDIO_FILE_SIZE_LIMIT"/);
assert.match(routeSource, /p_audio_key: authoritativeAudioKey/);
assert.match(transcriptionServiceSource, /extension === 'aac'/);
assert.match(transcriptionServiceSource, /audio\/aac/);

console.log("server-side audio duration fixtures and guard ordering: ok");
