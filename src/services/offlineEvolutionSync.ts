import type { PendingEvolution } from './offlineQueue';
import { getPendingEvolutionAudioBlobs } from './evolutionAudio';
import type { AudioSubscriptionPlan } from '../utils/audioLimits';

type EvolutionWriteResult = { error: unknown | null };

export type OfflineEvolutionSyncProgress =
  | { phase: 'transcription'; index: number; total: number }
  | { phase: 'google-docs' }
  | { phase: 'saving' };

export type OfflineEvolutionSyncDependencies = {
  subscriptionPlan?: AudioSubscriptionPlan;
  googleAccessToken: string;
  upsertEvolution: (payload: Record<string, unknown>) => Promise<EvolutionWriteResult>;
  transcribeAudio: (options: {
    audioBlob: Blob;
    mimeType: string;
    subscriptionPlan?: AudioSubscriptionPlan;
    evolutionId: string;
    audioKey: string;
    onRetry?: (attempt: number) => void;
  }) => Promise<string>;
  convertEvolutionToTemplate: (text: string, templateId: string) => Promise<string>;
  appendToGoogleDoc: (
    accessToken: string,
    googleDocId: string,
    sessionDate: string,
    text: string,
    options: { sessionTime?: string; evolutionId: string },
  ) => Promise<void>;
  onProgress?: (progress: OfflineEvolutionSyncProgress) => void;
};

const ensureEvolutionData = (item: PendingEvolution) => {
  const data = item.evolutionData;
  if (
    !data ||
    data.id !== item.id ||
    typeof data.professional_id !== 'string' ||
    typeof data.patient_id !== 'string'
  ) {
    throw new Error('A evolução offline não possui os metadados necessários para sincronização.');
  }
  return data as Record<string, unknown>;
};

export async function syncOfflineEvolutionItem(
  item: PendingEvolution,
  dependencies: OfflineEvolutionSyncDependencies,
): Promise<{ originalTranscription: string; evolutionText: string }> {
  const evolutionData = ensureEvolutionData(item);
  const audioBlobs = getPendingEvolutionAudioBlobs(item);
  if (audioBlobs.length === 0) {
    throw new Error('Nenhum áudio encontrado para sincronizar.');
  }

  // A evolução precisa existir antes do primeiro POST de transcrição, pois o
  // backend valida ownership de evolutionId antes de baixar o áudio.
  const { error: initialUpsertError } = await dependencies.upsertEvolution({
    ...evolutionData,
    id: item.id,
    transcription_status: 'processing',
    transcription_text: '',
    original_transcription_text: '',
    google_doc_append_status: 'pending',
    updated_at: new Date().toISOString(),
  });
  if (initialUpsertError) throw initialUpsertError;

  const transcriptions: string[] = [];
  for (let index = 0; index < audioBlobs.length; index += 1) {
    const blob = audioBlobs[index];
    dependencies.onProgress?.({ phase: 'transcription', index, total: audioBlobs.length });

    let mime = blob.type || item.mimeType;
    if (!mime || mime === 'application/octet-stream') mime = 'audio/ogg';

    const transcription = await dependencies.transcribeAudio({
      audioBlob: blob,
      mimeType: mime,
      subscriptionPlan: dependencies.subscriptionPlan,
      evolutionId: item.id,
      audioKey: `${item.id}:${index}`,
    });
    if (!transcription) throw new Error('A IA retornou um texto vazio.');
    transcriptions.push(transcription.trim());
  }

  const originalTranscription = transcriptions.join('\n\n');
  const { error: originalSaveError } = await dependencies.upsertEvolution({
    ...evolutionData,
    id: item.id,
    transcription_status: 'processing',
    transcription_text: '',
    original_transcription_text: originalTranscription,
    google_doc_append_status: 'pending',
    updated_at: new Date().toISOString(),
  });
  if (originalSaveError) throw originalSaveError;

  const templateId = typeof evolutionData.template_id === 'string' && evolutionData.template_id
    ? evolutionData.template_id
    : null;
  const evolutionText = templateId
    ? await dependencies.convertEvolutionToTemplate(originalTranscription, templateId)
    : originalTranscription;

  dependencies.onProgress?.({ phase: 'google-docs' });
  await dependencies.appendToGoogleDoc(
    dependencies.googleAccessToken,
    item.googleDocId,
    item.sessionDate,
    evolutionText,
    {
      sessionTime: item.sessionTime || (typeof evolutionData.session_time === 'string' ? evolutionData.session_time : undefined),
      evolutionId: item.id,
    },
  );

  dependencies.onProgress?.({ phase: 'saving' });
  const { error: finalUpsertError } = await dependencies.upsertEvolution({
    ...evolutionData,
    id: item.id,
    transcription_status: 'completed',
    transcription_text: evolutionText,
    original_transcription_text: originalTranscription,
    google_doc_append_status: 'completed',
    google_doc_append_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (finalUpsertError) throw finalUpsertError;

  return { originalTranscription, evolutionText };
}
