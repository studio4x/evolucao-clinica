import { PendingEvolution } from './offlineQueue';

export const getPendingEvolutionAudioBlobs = (item: PendingEvolution): Blob[] => {
  if (item.audioBlobs && item.audioBlobs.length > 0) {
    return item.audioBlobs;
  }

  if (item.audioBlob) {
    return [item.audioBlob];
  }

  return [];
};
