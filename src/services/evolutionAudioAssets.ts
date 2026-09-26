import { supabase } from '../supabaseClient';

export const EVOLUTION_AUDIO_LOCAL_FEATURE_FLAG = 'VITE_AUDIO_RETENTION_ENABLED';

export interface PreparedEvolutionAudioUpload {
  audioId: string;
  status: 'uploading' | 'available';
  expiresAt: string;
  alreadyFinalized?: boolean;
  upload?: { path: string; token: string };
}

function parseCohort(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isEvolutionAudioRetentionClientEnabled(professionalId?: string): boolean {
  if (String(import.meta.env.VITE_AUDIO_RETENTION_ENABLED || '').toLowerCase() !== 'true') return false;
  const cohort = parseCohort(import.meta.env.VITE_AUDIO_RETENTION_PROFESSIONAL_IDS);
  return cohort.length === 0 || (!!professionalId && cohort.includes(professionalId.toLowerCase()));
}

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada. Entre novamente.');
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a operação de áudio.');
  return payload as T;
}

export async function prepareEvolutionAudioUpload(input: {
  professionalId: string;
  evolutionId: string;
  position: number;
  clientUploadKey: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PreparedEvolutionAudioUpload> {
  if (!isEvolutionAudioRetentionClientEnabled(input.professionalId)) {
    throw new Error('Nova arquitetura de áudio desabilitada.');
  }
  return authenticatedRequest('/api/evolution-audio-assets/prepare', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadPreparedEvolutionAudio(
  prepared: PreparedEvolutionAudioUpload,
  audio: Blob,
): Promise<void> {
  if (!prepared.upload) {
    if (prepared.status === 'available') return;
    throw new Error('Autorização de upload ausente.');
  }
  const { error } = await supabase.storage
    .from('evolution-audio-assets')
    .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, audio, {
      contentType: audio.type || 'audio/webm',
    });
  if (error) throw new Error('Não foi possível enviar o áudio para o armazenamento seguro.');
}

export async function finalizeEvolutionAudioUpload(audioId: string) {
  return authenticatedRequest<{ audioId: string; status: 'available'; expiresAt: string }>(
    `/api/evolution-audio-assets/${encodeURIComponent(audioId)}/finalize`,
    { method: 'POST', body: '{}' },
  );
}

export async function requestEvolutionAudioDeletion(audioId: string) {
  return authenticatedRequest<{ audioId: string; status: 'deleted' | 'deletion_pending' }>(
    `/api/evolution-audio-assets/${encodeURIComponent(audioId)}`,
    { method: 'DELETE' },
  );
}
