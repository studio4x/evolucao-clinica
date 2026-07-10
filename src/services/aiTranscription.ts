import { supabase } from "../supabaseClient";

export interface TranscriptionOptions {
  audioBlob: Blob;
  mimeType: string;
  onRetry?: (attempt: number, delay: number, isFallback: boolean) => void;
  audioDuration?: number; // em segundos
  customPrompt?: string;
}

const MAX_AUDIO_DURATION_SECONDS = 20 * 60;
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;
const DEFAULT_TRANSCRIPTION_PROMPT = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

const normalizeMimeType = (mimeType?: string): string => {
  let normalizedMimeType = mimeType || 'audio/webm';

  if (normalizedMimeType.includes(';')) {
    normalizedMimeType = normalizedMimeType.split(';')[0].trim();
  }

  if (normalizedMimeType === 'application/ogg' || normalizedMimeType === 'application/octet-stream') {
    return 'audio/ogg';
  }

  return normalizedMimeType;
};

const getAudioExtension = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('aac')) return 'aac';

  const subtype = normalized.includes('/') ? normalized.split('/')[1] : normalized;
  const sanitized = subtype.split(';')[0].replace(/[^a-z0-9]+/g, '');
  return sanitized || 'bin';
};

const buildTempAudioPath = (userId: string, mimeType: string): string => {
  const timestamp = Date.now();
  const randomPart = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || Math.random().toString(36).slice(2, 10);
  const extension = getAudioExtension(mimeType);

  return `${userId}/${timestamp}-${randomPart}.${extension}`;
};

const isBucketMissingError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('bucket not found') ||
    normalized.includes('nosuchbucket') ||
    normalized.includes('temp-audio')
  );
};

const isModelConfigurationError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('not found for api version') ||
    normalized.includes('not supported for generatecontent') ||
    normalized.includes('model') && normalized.includes('not found') ||
    normalized.includes('models/')
  );
};

const isHardLimitError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('(http 400)') ||
    normalized.includes('(http 403)') ||
    normalized.includes('limite máximo de 20 minutos') ||
    normalized.includes('tamanho máximo permitido de 20 mb') ||
    normalized.includes('muitas solicitações de transcrição') ||
    normalized.includes('limite mensal de transcrição de áudio atingido') ||
    normalized.includes('duração do áudio é obrigatória')
  );
};

export const transcribeAudio = async (options: TranscriptionOptions): Promise<string> => {
  const { audioBlob, mimeType, onRetry, audioDuration, customPrompt } = options;
  const maxRetries = 3;
  let retryCount = 0;
  const normalizedMimeType = normalizeMimeType(mimeType || audioBlob.type);
  const prompt = customPrompt || DEFAULT_TRANSCRIPTION_PROMPT;

  if (typeof audioDuration === 'number' && Number.isFinite(audioDuration) && audioDuration > MAX_AUDIO_DURATION_SECONDS) {
    throw new Error("O áudio excede o limite máximo de 20 minutos por evolução.");
  }

  if (audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
    throw new Error("O áudio excede o tamanho máximo permitido de 20 MB por evolução.");
  }

  const attemptTranscription = async (): Promise<string> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const userId = session?.user?.id;
      
      if (!token) {
        throw new Error("Usuário não autenticado. Faça login novamente.");
      }

      if (!userId) {
        throw new Error("Não foi possível identificar o usuário autenticado.");
      }

      const audioPath = buildTempAudioPath(userId, normalizedMimeType);

      console.log(`[AI-Service] Enviando áudio para transcrição via Storage + backend - Tentativa ${retryCount + 1}`);

      const { error: uploadError } = await supabase.storage.from('temp-audio').upload(audioPath, audioBlob, {
        contentType: normalizedMimeType,
        upsert: false,
        cacheControl: '60',
      });

      if (uploadError) {
        const uploadErrorMessage = uploadError.message || JSON.stringify(uploadError);
        if (isBucketMissingError(uploadErrorMessage)) {
          throw new Error(`Bucket temp-audio não encontrado no Supabase Storage. Aplique a migration do bucket antes de tentar transcrever.`);
        }
        throw uploadError;
      }

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          audioPath,
          mimeType: normalizedMimeType,
          prompt,
          audioDuration
        })
      });

      const responseText = await response.text();
      let data: any = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { error: responseText };
        }
      }

      if (!response.ok) {
        throw new Error(`${data.error || 'Erro do servidor'} (HTTP ${response.status})`);
      }

      if (!data.success || !data.transcription) {
        throw new Error("Resposta de transcrição inválida obtida do servidor.");
      }

      console.log("[AI-Service] Transcrição via backend concluída com sucesso.");
      return data.transcription;

    } catch (error: any) {
      const errorContent = error.message || JSON.stringify(error);
      const normalizedErrorContent = errorContent.toLowerCase();
      const isQuotaError = normalizedErrorContent.includes('quota') ||
                           normalizedErrorContent.includes('exhausted') ||
                           normalizedErrorContent.includes('resource_exhausted');
      const isBucketError = isBucketMissingError(errorContent);
      const isModelError = isModelConfigurationError(errorContent);
      const isPolicyError = isHardLimitError(errorContent);

      console.error("[AI-Service] Erro na transcrição:", errorContent);
      
      if (!isBucketError && !isModelError && !isPolicyError && retryCount < maxRetries) {
        retryCount++;
        // Se for erro de cota, aumenta o delay (mínimo 15 segundos)
        const delay = isQuotaError ? 15000 * retryCount : 2000 * retryCount;
        
        console.log(`[AI-Service] Tentando re-executar em ${delay}ms...`);
        
        if (onRetry) {
          onRetry(retryCount, delay, isQuotaError);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptTranscription();
      }
      
      if (isBucketError) {
        throw new Error(`${errorContent} (O bucket temp-audio precisa existir no Supabase Storage)`);
      }

      if (isModelError) {
        throw new Error(`${errorContent} (O modelo configurado para transcrição não é compatível com este endpoint)`);
      }

      throw new Error(`${errorContent} (Erro na comunicação com o backend de transcrição)`);
    }
  };

  return attemptTranscription();
};
