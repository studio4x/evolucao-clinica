import { parseBuffer } from "music-metadata";

const EBML_HEADER_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const TIMECODE_SCALE_ID = 0x2ad7b1;
const CLUSTER_ID = 0x1f43b675;
const CLUSTER_TIMECODE_ID = 0xe7;
const SIMPLE_BLOCK_ID = 0xa3;
const BLOCK_GROUP_ID = 0xa0;
const BLOCK_ID = 0xa1;
const DEFAULT_TIMECODE_SCALE_NS = 1_000_000;

type EbmlVint = {
  length: number;
  value: number;
  unknown: boolean;
};

type EbmlElement = {
  id: number;
  dataOffset: number;
  endOffset: number;
  sizeUnknown: boolean;
};

type TimestampRange = {
  count: number;
  maximumSeconds: number;
  previousSeconds: number;
};

function readEbmlVint(buffer: Buffer, offset: number, maxLength: number, preserveMarker: boolean): EbmlVint | null {
  const firstByte = buffer[offset];
  if (!firstByte) return null;

  let marker = 0x80;
  let length = 1;
  while ((firstByte & marker) === 0) {
    marker >>= 1;
    length += 1;
    if (!marker || length > maxLength) return null;
  }

  if (offset + length > buffer.byteLength) return null;

  const firstValue = preserveMarker ? firstByte : firstByte & (marker - 1);
  let value = BigInt(firstValue);
  let unknown = !preserveMarker && firstValue === marker - 1;

  for (let index = 1; index < length; index += 1) {
    const byte = buffer[offset + index];
    value = (value << 8n) | BigInt(byte);
    unknown = unknown && byte === 0xff;
  }

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { length, value: Number(value), unknown };
}

function readEbmlElement(buffer: Buffer, offset: number): EbmlElement | null {
  const id = readEbmlVint(buffer, offset, 4, true);
  if (!id) return null;

  const size = readEbmlVint(buffer, offset + id.length, 8, false);
  if (!size) return null;

  const dataOffset = offset + id.length + size.length;
  if (dataOffset > buffer.byteLength) return null;

  const endOffset = size.unknown ? buffer.byteLength : dataOffset + size.value;
  if (endOffset > buffer.byteLength) return null;

  return {
    id: id.value,
    dataOffset,
    endOffset,
    sizeUnknown: size.unknown,
  };
}

function readUnsignedInteger(buffer: Buffer, start: number, end: number): number | null {
  const length = end - start;
  if (length <= 0 || length > 8 || end > buffer.byteLength) return null;

  let value = 0n;
  for (let offset = start; offset < end; offset += 1) {
    value = (value << 8n) | BigInt(buffer[offset]);
  }

  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function recordTimestamp(range: TimestampRange, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  range.count += 1;

  if (seconds > range.maximumSeconds) {
    range.previousSeconds = range.maximumSeconds;
    range.maximumSeconds = seconds;
  } else if (seconds < range.maximumSeconds && seconds > range.previousSeconds) {
    range.previousSeconds = seconds;
  }
}

function readBlockTimestampSeconds(
  buffer: Buffer,
  start: number,
  end: number,
  clusterTimecode: number,
  timecodeScaleNs: number,
): number | null {
  const trackNumber = readEbmlVint(buffer, start, 8, false);
  if (!trackNumber) return null;

  const timecodeOffset = start + trackNumber.length;
  if (timecodeOffset + 3 > end) return null;

  const relativeTimecode = buffer.readInt16BE(timecodeOffset);
  const timestampUnits = clusterTimecode + relativeTimecode;
  if (timestampUnits < 0) return null;

  return timestampUnits * timecodeScaleNs / 1_000_000_000;
}

function parseBlockGroup(
  buffer: Buffer,
  start: number,
  end: number,
  clusterTimecode: number,
  timecodeScaleNs: number,
  timestamps: TimestampRange,
): void {
  let offset = start;
  while (offset < end) {
    const element = readEbmlElement(buffer, offset);
    if (!element || element.endOffset > end) return;

    if (element.id === BLOCK_ID) {
      const seconds = readBlockTimestampSeconds(
        buffer,
        element.dataOffset,
        element.endOffset,
        clusterTimecode,
        timecodeScaleNs,
      );
      if (seconds !== null) recordTimestamp(timestamps, seconds);
    }

    if (element.sizeUnknown || element.endOffset <= offset) return;
    offset = element.endOffset;
  }
}

function parseCluster(
  buffer: Buffer,
  start: number,
  end: number,
  timecodeScaleNs: number,
  timestamps: TimestampRange,
): void {
  let offset = start;
  let clusterTimecode = 0;

  while (offset < end) {
    const element = readEbmlElement(buffer, offset);
    if (!element || element.endOffset > end) return;

    if (element.id === CLUSTER_ID) {
      parseCluster(buffer, element.dataOffset, element.endOffset, timecodeScaleNs, timestamps);
      return;
    }

    if (element.id === CLUSTER_TIMECODE_ID) {
      clusterTimecode = readUnsignedInteger(buffer, element.dataOffset, element.endOffset) ?? clusterTimecode;
    } else if (element.id === SIMPLE_BLOCK_ID || element.id === BLOCK_ID) {
      const seconds = readBlockTimestampSeconds(
        buffer,
        element.dataOffset,
        element.endOffset,
        clusterTimecode,
        timecodeScaleNs,
      );
      if (seconds !== null) recordTimestamp(timestamps, seconds);
    } else if (element.id === BLOCK_GROUP_ID) {
      parseBlockGroup(
        buffer,
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
}

function findWebmSegment(buffer: Buffer): EbmlElement | null {
  let offset = 0;
  let hasEbmlHeader = false;

  while (offset < buffer.byteLength) {
    const element = readEbmlElement(buffer, offset);
    if (!element) return null;

    if (element.id === EBML_HEADER_ID) hasEbmlHeader = true;
    if (hasEbmlHeader && element.id === SEGMENT_ID) return element;

    if (element.sizeUnknown || element.endOffset <= offset) return null;
    offset = element.endOffset;
  }

  return null;
}

function readWebmTimecodeScale(buffer: Buffer, segment: EbmlElement): number {
  let offset = segment.dataOffset;

  while (offset < segment.endOffset) {
    const element = readEbmlElement(buffer, offset);
    if (!element || element.endOffset > segment.endOffset) break;

    if (element.id === INFO_ID) {
      let infoOffset = element.dataOffset;
      while (infoOffset < element.endOffset) {
        const infoElement = readEbmlElement(buffer, infoOffset);
        if (!infoElement || infoElement.endOffset > element.endOffset) break;
        if (infoElement.id === TIMECODE_SCALE_ID) {
          const scale = readUnsignedInteger(buffer, infoElement.dataOffset, infoElement.endOffset);
          if (scale && Number.isFinite(scale)) return scale;
        }
        if (infoElement.sizeUnknown || infoElement.endOffset <= infoOffset) break;
        infoOffset = infoElement.endOffset;
      }
    }

    if (element.id === CLUSTER_ID || element.sizeUnknown || element.endOffset <= offset) break;
    offset = element.endOffset;
  }

  return DEFAULT_TIMECODE_SCALE_NS;
}

/**
 * MediaRecorder gera WebM de streaming sem o campo Info/Duration. O parser de
 * metadata reconhece o contêiner, mas deixa a duração vazia. Neste caso,
 * calculamos a duração pelos timecodes dos blocos EBML, mantendo os bytes do
 * arquivo como autoridade sem confiar na duração informada pelo cliente.
 */
function getStreamingWebmDurationSeconds(buffer: Buffer): number {
  const segment = findWebmSegment(buffer);
  if (!segment) return 0;

  const timecodeScaleNs = readWebmTimecodeScale(buffer, segment);
  const timestamps: TimestampRange = {
    count: 0,
    maximumSeconds: -1,
    previousSeconds: -1,
  };
  let offset = segment.dataOffset;

  while (offset < segment.endOffset) {
    const element = readEbmlElement(buffer, offset);
    if (!element || element.endOffset > segment.endOffset) break;

    if (element.id === CLUSTER_ID) {
      parseCluster(buffer, element.dataOffset, element.endOffset, timecodeScaleNs, timestamps);
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
}

/**
 * Extrai duração dos bytes recebidos pelo backend usando o parser de metadata
 * Node. O MIME é apenas uma dica: se ele estiver incorreto, a leitura é
 * repetida sem MIME para que a assinatura dos bytes continue determinante.
 */
export async function getAudioDurationSecondsFromBuffer(audioBuffer: Buffer, mimeType?: string): Promise<number> {
  const bytes = new Uint8Array(audioBuffer);
  const parseOptions = { duration: true };
  try {
    const metadata = await parseBuffer(bytes, { mimeType, size: audioBuffer.byteLength }, parseOptions);
    const duration = metadata.format.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
  } catch {
    // A MIME declarado pode estar incorreto. Nesse caso, tenta novamente por
    // assinatura dos bytes antes de considerar a duração indisponível.
  }

  try {
    const metadata = await parseBuffer(bytes, { size: audioBuffer.byteLength }, parseOptions);
    const duration = metadata.format.duration;
    if (Number.isFinite(duration) && duration > 0) return duration;
  } catch {
    // Continua para o fallback de WebM de streaming abaixo.
  }

  return getStreamingWebmDurationSeconds(audioBuffer);
}
