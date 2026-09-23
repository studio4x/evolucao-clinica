const AUDIO_METADATA_TIMEOUT_MS = 5000;

const readUint64LE = (bytes: Uint8Array, offset: number): number => {
  let value = 0;
  for (let index = 7; index >= 0; index -= 1) {
    value = value * 256 + bytes[offset + index];
  }
  return value;
};

const readAscii = (bytes: Uint8Array, offset: number, length: number): string => {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
};

const readWavDuration = (bytes: Uint8Array): number => {
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') return 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ' && chunkStart + 12 <= bytes.length) {
      byteRate = view.getUint32(chunkStart + 8, true);
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, bytes.length - chunkStart);
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0;
};

const readMp3Frame = (bytes: Uint8Array, offset: number) => {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (bytes[offset + 1] >> 3) & 0x03;
  const layerBits = (bytes[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  const padding = (bytes[offset + 2] >> 1) & 0x01;

  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const layer = 4 - layerBits;
  const bitrateTables = {
    v1: {
      1: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
      2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
      3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    },
    v2: {
      1: [32, 48, 56, 64, 80, 96, 112, 128, 160, 176, 192, 224, 256],
      2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
      3: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    }
  } as const;
  const sampleRates = [44100, 48000, 32000];
  const version = versionBits === 3 ? 'v1' : 'v2';
  const bitrate = bitrateTables[version][layer as 1 | 2 | 3]?.[bitrateIndex - 1];
  let sampleRate = sampleRates[sampleRateIndex];

  if (!bitrate || !sampleRate) return null;
  if (versionBits === 2) sampleRate /= 2;
  if (versionBits === 0) sampleRate /= 4;

  const samplesPerFrame = layer === 1 ? 384 : (versionBits === 3 ? 1152 : 576);
  const frameLength = layer === 1
    ? Math.floor((12 * bitrate * 1000 / sampleRate + padding) * 4)
    : Math.floor(144 * bitrate * 1000 / sampleRate + padding) * (versionBits === 3 ? 1 : 0.5);

  const normalizedFrameLength = Math.floor(frameLength);
  if (normalizedFrameLength < 4 || offset + normalizedFrameLength > bytes.length) return null;

  return { frameLength: normalizedFrameLength, samplesPerFrame, sampleRate };
};

const readMp3Duration = (bytes: Uint8Array): number => {
  let offset = 0;
  if (readAscii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) {
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + tagSize + ((bytes[5] & 0x10) ? 10 : 0);
  }

  let totalSamples = 0;
  let sampleRate = 0;
  let frameCount = 0;

  while (offset + 4 <= bytes.length && frameCount < 100000) {
    const frame = readMp3Frame(bytes, offset);
    if (!frame) {
      offset += 1;
      continue;
    }
    totalSamples += frame.samplesPerFrame;
    sampleRate = frame.sampleRate;
    frameCount += 1;
    offset += frame.frameLength;
  }

  return frameCount > 0 && sampleRate > 0 ? totalSamples / sampleRate : 0;
};

const readOggDuration = (bytes: Uint8Array): number => {
  let offset = 0;
  let lastGranule = 0;
  let sampleRate = 48000;

  while (offset + 27 <= bytes.length) {
    if (readAscii(bytes, offset, 4) !== 'OggS') {
      offset += 1;
      continue;
    }

    const segmentCount = bytes[offset + 26];
    const segmentTableStart = offset + 27;
    const pageDataStart = segmentTableStart + segmentCount;
    if (pageDataStart > bytes.length) break;

    const pageDataSize = bytes.subarray(segmentTableStart, pageDataStart).reduce((sum, value) => sum + value, 0);
    const pageEnd = pageDataStart + pageDataSize;
    if (pageEnd > bytes.length) break;

    const granule = readUint64LE(bytes, offset + 6);
    if (granule < Number.MAX_SAFE_INTEGER / 2) lastGranule = Math.max(lastGranule, granule);

    for (let index = pageDataStart; index + 16 <= pageEnd; index += 1) {
      if (readAscii(bytes, index, 6) === 'vorbis') {
        const rateOffset = index + 11;
        if (rateOffset + 4 <= bytes.length) {
          sampleRate = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(rateOffset, true) || sampleRate;
        }
        break;
      }
    }

    offset = pageEnd;
  }

  return lastGranule > 0 && sampleRate > 0 ? lastGranule / sampleRate : 0;
};

const readMp4Duration = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta', 'ilst']);
  let duration = 0;

  const parseBoxes = (start: number, end: number, depth: number) => {
    if (depth > 8) return;

    let offset = start;
    while (offset + 8 <= end && offset + 8 <= bytes.length) {
      let boxSize = view.getUint32(offset, false);
      const boxType = readAscii(bytes, offset + 4, 4);
      let headerSize = 8;
      if (boxSize === 1 && offset + 16 <= bytes.length) {
        boxSize = readUint64BE(bytes, offset + 8);
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - offset;
      }

      if (boxSize < headerSize || offset + boxSize > end || offset + boxSize > bytes.length) break;

      if (boxType === 'mvhd' || boxType === 'mdhd') {
        const version = bytes[offset + headerSize];
        const timescaleOffset = offset + headerSize + (version === 1 ? 20 : 12);
        const durationOffset = offset + headerSize + (version === 1 ? 24 : 16);
        if (durationOffset + (version === 1 ? 8 : 4) <= bytes.length) {
          const timescale = view.getUint32(timescaleOffset, false);
          const boxDuration = version === 1
            ? readUint64BE(bytes, durationOffset)
            : view.getUint32(durationOffset, false);
          if (timescale > 0 && boxDuration > 0) {
            const seconds = boxDuration / timescale;
            duration = boxType === 'mvhd' ? seconds : Math.max(duration, seconds);
          }
        }
      }

      if (containers.has(boxType)) {
        const childStart = offset + headerSize + (boxType === 'meta' ? 4 : 0);
        parseBoxes(childStart, offset + boxSize, depth + 1);
      }
      offset += boxSize;
    }
  };

  parseBoxes(0, bytes.length, 0);
  return duration;
};

const readUint64BE = (bytes: Uint8Array, offset: number): number => {
  let value = 0;
  for (let index = 0; index < 8; index += 1) {
    value = value * 256 + bytes[offset + index];
  }
  return value;
};

type WebmVint = {
  length: number;
  value: number;
  unknown: boolean;
};

type WebmElement = {
  id: number;
  dataOffset: number;
  endOffset: number;
  sizeUnknown: boolean;
};

type WebmTimestampRange = {
  count: number;
  maximumSeconds: number;
  previousSeconds: number;
};

const WEBM_SEGMENT_ID = 0x18538067;
const WEBM_INFO_ID = 0x1549a966;
const WEBM_TIME_SCALE_ID = 0x2ad7b1;
const WEBM_DURATION_ID = 0x4489;
const WEBM_CLUSTER_ID = 0x1f43b675;
const WEBM_CLUSTER_TIMECODE_ID = 0xe7;
const WEBM_SIMPLE_BLOCK_ID = 0xa3;
const WEBM_BLOCK_GROUP_ID = 0xa0;
const WEBM_BLOCK_ID = 0xa1;
const WEBM_DEFAULT_TIMECODE_SCALE_NS = 1_000_000;

const readWebmVint = (bytes: Uint8Array, offset: number, preserveMarker: boolean): WebmVint | null => {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;

  const firstValue = preserveMarker ? first : first & (mask - 1);
  let value = BigInt(firstValue);
  let unknown = !preserveMarker && firstValue === mask - 1;

  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index];
    value = (value << 8n) | BigInt(byte);
    unknown = unknown && byte === 0xff;
  }

  // MediaRecorder usa frequentemente o marcador de tamanho desconhecido em
  // VINT de 8 bytes. Ele não é um tamanho numérico e deve ser aceito antes
  // da validação de Number.MAX_SAFE_INTEGER.
  if (unknown) return { length, value: 0, unknown: true };
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { length, value: Number(value), unknown: false };
};

const readWebmElement = (bytes: Uint8Array, offset: number): WebmElement | null => {
  const id = readWebmVint(bytes, offset, true);
  if (!id) return null;

  const size = readWebmVint(bytes, offset + id.length, false);
  if (!size) return null;

  const dataOffset = offset + id.length + size.length;
  if (dataOffset > bytes.length) return null;

  const endOffset = size.unknown ? bytes.length : dataOffset + size.value;
  if (endOffset > bytes.length) return null;

  return { id: id.value, dataOffset, endOffset, sizeUnknown: size.unknown };
};

const readWebmUnsignedInteger = (bytes: Uint8Array, start: number, end: number): number | null => {
  const length = end - start;
  if (length <= 0 || length > 8 || end > bytes.length) return null;

  let value = 0n;
  for (let offset = start; offset < end; offset += 1) {
    value = (value << 8n) | BigInt(bytes[offset]);
  }

  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
};

const recordWebmTimestamp = (range: WebmTimestampRange, seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  range.count += 1;

  if (seconds > range.maximumSeconds) {
    range.previousSeconds = range.maximumSeconds;
    range.maximumSeconds = seconds;
  } else if (seconds < range.maximumSeconds && seconds > range.previousSeconds) {
    range.previousSeconds = seconds;
  }
};

const readWebmBlockTimestampSeconds = (
  bytes: Uint8Array,
  start: number,
  end: number,
  clusterTimecode: number,
  timecodeScaleNs: number,
): number | null => {
  const trackNumber = readWebmVint(bytes, start, false);
  if (!trackNumber) return null;

  const timecodeOffset = start + trackNumber.length;
  if (timecodeOffset + 3 > end) return null;

  const relativeTimecode = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(timecodeOffset, false);
  const timestampUnits = clusterTimecode + relativeTimecode;
  return timestampUnits >= 0 ? timestampUnits * timecodeScaleNs / 1_000_000_000 : null;
};

const parseWebmBlockGroup = (
  bytes: Uint8Array,
  start: number,
  end: number,
  clusterTimecode: number,
  timecodeScaleNs: number,
  timestamps: WebmTimestampRange,
) => {
  let offset = start;
  while (offset < end) {
    const element = readWebmElement(bytes, offset);
    if (!element || element.endOffset > end) return;

    if (element.id === WEBM_BLOCK_ID) {
      const seconds = readWebmBlockTimestampSeconds(
        bytes,
        element.dataOffset,
        element.endOffset,
        clusterTimecode,
        timecodeScaleNs,
      );
      if (seconds !== null) recordWebmTimestamp(timestamps, seconds);
    }

    if (element.sizeUnknown || element.endOffset <= offset) return;
    offset = element.endOffset;
  }
};

const parseWebmCluster = (
  bytes: Uint8Array,
  start: number,
  end: number,
  timecodeScaleNs: number,
  timestamps: WebmTimestampRange,
) => {
  let offset = start;
  let clusterTimecode = 0;

  while (offset < end) {
    const element = readWebmElement(bytes, offset);
    if (!element || element.endOffset > end) return;

    if (element.id === WEBM_CLUSTER_ID) {
      parseWebmCluster(bytes, element.dataOffset, element.endOffset, timecodeScaleNs, timestamps);
      return;
    }

    if (element.id === WEBM_CLUSTER_TIMECODE_ID) {
      clusterTimecode = readWebmUnsignedInteger(bytes, element.dataOffset, element.endOffset) ?? clusterTimecode;
    } else if (element.id === WEBM_SIMPLE_BLOCK_ID || element.id === WEBM_BLOCK_ID) {
      const seconds = readWebmBlockTimestampSeconds(
        bytes,
        element.dataOffset,
        element.endOffset,
        clusterTimecode,
        timecodeScaleNs,
      );
      if (seconds !== null) recordWebmTimestamp(timestamps, seconds);
    } else if (element.id === WEBM_BLOCK_GROUP_ID) {
      parseWebmBlockGroup(
        bytes,
        element.dataOffset,
        element.endOffset,
        clusterTimecode,
        timecodeScaleNs,
        timestamps,
      );
    }

    if (element.sizeUnknown || element.endOffset <= offset) return;
    offset = element.endOffset;
  }
};

const findWebmSegment = (bytes: Uint8Array): WebmElement | null => {
  let offset = 0;
  let hasEbmlHeader = false;

  while (offset < bytes.length) {
    const element = readWebmElement(bytes, offset);
    if (!element) return null;

    if (element.id === 0x1a45dfa3) hasEbmlHeader = true;
    if (hasEbmlHeader && element.id === WEBM_SEGMENT_ID) return element;

    if (element.sizeUnknown || element.endOffset <= offset) return null;
    offset = element.endOffset;
  }

  return null;
};

const readWebmInfo = (bytes: Uint8Array, segment: WebmElement) => {
  let timecodeScaleNs = WEBM_DEFAULT_TIMECODE_SCALE_NS;
  let declaredDuration = 0;
  let offset = segment.dataOffset;

  while (offset < segment.endOffset) {
    const element = readWebmElement(bytes, offset);
    if (!element || element.endOffset > segment.endOffset) break;

    if (element.id === WEBM_INFO_ID) {
      let infoOffset = element.dataOffset;
      while (infoOffset < element.endOffset) {
        const infoElement = readWebmElement(bytes, infoOffset);
        if (!infoElement || infoElement.endOffset > element.endOffset) break;

        if (infoElement.id === WEBM_TIME_SCALE_ID) {
          const scale = readWebmUnsignedInteger(bytes, infoElement.dataOffset, infoElement.endOffset);
          if (scale && Number.isFinite(scale)) timecodeScaleNs = scale;
        } else if (infoElement.id === WEBM_DURATION_ID) {
          const length = infoElement.endOffset - infoElement.dataOffset;
          if (length === 4 || length === 8) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            declaredDuration = length === 4
              ? view.getFloat32(infoElement.dataOffset, false)
              : view.getFloat64(infoElement.dataOffset, false);
          }
        }

        if (infoElement.sizeUnknown || infoElement.endOffset <= infoOffset) break;
        infoOffset = infoElement.endOffset;
      }
    }

    if (element.id === WEBM_CLUSTER_ID || element.sizeUnknown || element.endOffset <= offset) break;
    offset = element.endOffset;
  }

  return { timecodeScaleNs, declaredDuration };
};

const readWebmDuration = (bytes: Uint8Array): number => {
  const segment = findWebmSegment(bytes);
  if (!segment) return 0;

  const { timecodeScaleNs, declaredDuration } = readWebmInfo(bytes, segment);
  if (Number.isFinite(declaredDuration) && declaredDuration > 0) {
    return declaredDuration * timecodeScaleNs / 1_000_000_000;
  }

  // Gravações interrompidas podem não ter Info/Duration. O player ainda
  // consegue reproduzi-las; nesses casos calculamos a duração pelos blocos.
  const timestamps: WebmTimestampRange = {
    count: 0,
    maximumSeconds: -1,
    previousSeconds: -1,
  };
  let offset = segment.dataOffset;

  while (offset < segment.endOffset) {
    const element = readWebmElement(bytes, offset);
    if (!element || element.endOffset > segment.endOffset) break;

    if (element.id === WEBM_CLUSTER_ID) {
      parseWebmCluster(bytes, element.dataOffset, element.endOffset, timecodeScaleNs, timestamps);
      if (element.sizeUnknown) break;
    }

    if (element.sizeUnknown || element.endOffset <= offset) break;
    offset = element.endOffset;
  }

  if (timestamps.count === 0 || timestamps.maximumSeconds < 0) return 0;
  const observedFrameSeconds = timestamps.previousSeconds >= 0
    ? timestamps.maximumSeconds - timestamps.previousSeconds
    : 0.02;
  const finalFrameSeconds = Math.min(1, Math.max(0.001, observedFrameSeconds || 0.02));
  return timestamps.maximumSeconds + finalFrameSeconds;
};

const getDurationFromBytes = (bytes: Uint8Array): number => {
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === 'RIFF') return readWavDuration(bytes);
  if (bytes.length >= 4 && readAscii(bytes, 0, 4) === 'OggS') return readOggDuration(bytes);
  if (bytes.length >= 12 && readAscii(bytes, 4, 4) === 'ftyp') return readMp4Duration(bytes);
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return readWebmDuration(bytes);
  return readMp3Duration(bytes);
};

/**
 * Lê a duração de uma URL de áudio, registrando os listeners antes de iniciar
 * o carregamento. Isso é importante no Android WebView, que pode disparar
 * `loadedmetadata` imediatamente para Blob URLs.
 */
export const getAudioDurationFromUrl = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;
    let seekRequested = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('durationchange', handleMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };

    const tryResolveDuration = () => {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }

      if (duration === Infinity && !seekRequested) {
        seekRequested = true;
        try {
          audio.currentTime = Number.MAX_SAFE_INTEGER;
        } catch {
          // O fallback binário ou o timeout finalizará a leitura.
        }
      }
    };

    const handleMetadata = () => tryResolveDuration();
    const handleTimeUpdate = () => tryResolveDuration();
    const handleError = () => finish(0);
    const timeoutId = window.setTimeout(() => finish(0), AUDIO_METADATA_TIMEOUT_MS);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('durationchange', handleMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);
    audio.src = url;
    audio.load();
  });
};

export const getAudioDurationFromBlob = async (blob: Blob): Promise<number> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const binaryDuration = getDurationFromBytes(bytes);
  if (binaryDuration > 0) return binaryDuration;

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await getAudioDurationFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
