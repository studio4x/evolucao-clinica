import { supabase } from "../supabaseClient";

export interface TranscriptionOptions {
  audioBlob: Blob;
  mimeType: string;
  onRetry?: (attempt: number, delay: number, isFallback: boolean) => void;
  audioDuration?: number; // em segundos
  customPrompt?: string;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const transcribeAudio = async (options: TranscriptionOptions): Promise<string> => {
  const { audioBlob, mimeType, onRetry, audioDuration, customPrompt } = options;
  const maxRetries = 3;
  let retryCount = 0;

  // Normalização de MIME type para compatibilidade com o Gemini
  let normalizedMimeType = mimeType || 'audio/webm';
  if (normalizedMimeType === 'application/ogg') {
    normalizedMimeType = 'audio/ogg';
  } else if (normalizedMimeType === 'application/octet-stream') {
    normalizedMimeType = 'audio/ogg';
  }

  const prompt = customPrompt || `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;
  const base64Audio = await blobToBase64(audioBlob);

  const attemptTranscription = async (): Promise<string> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        throw new Error("Usuário não autenticado. Faça login novamente.");
      }

      console.log(`[AI-Service] Enviando áudio para transcrição via backend - Tentativa ${retryCount + 1}`);

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: normalizedMimeType,
          prompt,
          audioDuration
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erro do servidor (HTTP ${response.status})`);
      }

      if (!data.success || !data.transcription) {
        throw new Error("Resposta de transcrição inválida obtida do servidor.");
      }

      console.log("[AI-Service] Transcrição via backend concluída com sucesso.");
      return data.transcription;

    } catch (error: any) {
      const errorContent = error.message || JSON.stringify(error);
      const isQuotaError = errorContent.includes('429') || 
                           errorContent.includes('exhausted') || 
                           errorContent.includes('RESOURCE_EXHAUSTED');

      console.error("[AI-Service] Erro na transcrição:", errorContent);
      
      if (retryCount < maxRetries) {
        retryCount++;
        // Se for erro de cota, aumenta o delay (mínimo 15 segundos)
        const delay = isQuotaError ? 15000 * retryCount : 2000 * retryCount;
        
        console.log(`[AI-Service] Tentando re-executar em ${delay}ms...`);
        
        if (onRetry) {
          onRetry(retryCount, delay, false);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptTranscription();
      }
      
      throw new Error(`${errorContent} (Erro na comunicação com o backend de transcrição)`);
    }
  };

  return attemptTranscription();
};
