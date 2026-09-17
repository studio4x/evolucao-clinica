import { getAudioDurationFromBlob } from "../src/utils/audioDuration.js";

/**
 * Extrai duração dos bytes recebidos pelo backend. O parser binário compartilhado
 * cobre WAV, Ogg/Opus, MP4/M4A, WebM e MP3; o fallback DOM não é usado em Node.
 */
export async function getAudioDurationSecondsFromBuffer(audioBuffer: Buffer): Promise<number> {
  try {
    const duration = await getAudioDurationFromBlob(new Blob([new Uint8Array(audioBuffer)]));
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}
