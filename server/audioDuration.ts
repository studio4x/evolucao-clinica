import { parseBuffer } from "music-metadata";

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
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}
