import { createHash } from 'node:crypto';

export function hashAudioBytes(audioBuffer: Uint8Array): string {
  return createHash('sha256').update(audioBuffer).digest('hex');
}

/**
 * Identifica tecnicamente um item de áudio sem persistir conteúdo clínico.
 * Os comprimentos tornam a composição não ambígua antes do hash final.
 */
export function buildAuthoritativeAudioKey(
  evolutionId: string,
  audioKey: string,
  audioBuffer: Uint8Array,
): string {
  const normalizedAudioKey = audioKey.trim();
  const audioHash = hashAudioBytes(audioBuffer);
  const identity = [evolutionId, normalizedAudioKey, audioHash]
    .map((part) => `${part.length}:${part}`)
    .join('|');

  return createHash('sha256').update(identity, 'utf8').digest('hex');
}
