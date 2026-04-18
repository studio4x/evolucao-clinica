import { GoogleGenAI } from "@google/genai";

export interface TranscriptionOptions {
  audioBlob: Blob;
  mimeType: string;
  onRetry?: (attempt: number, delay: number, isFallback: boolean) => void;
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
  const { audioBlob, mimeType, onRetry } = options;
  const maxRetries = 3;
  let retryCount = 0;

  const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;
  const base64Audio = await blobToBase64(audioBlob);

  const attemptTranscription = async (): Promise<string> => {
    try {
      // Prioridade: literais diretos para o Vite substituir estaticamente
      const mainKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      const backupKey = process.env.GEMINI_API_KEY_REAL || import.meta.env.VITE_GEMINI_API_KEY_REAL;
      
      // Lógica de Contingência: Na falha (retryCount > 0), prioriza a chave REAL se disponível
      const apiKey = (retryCount > 0 && backupKey) ? backupKey : (mainKey || backupKey);

      if (!apiKey) {
        console.error("[AI-Service] ERRO: Chave da API Gemini não encontrada. Verifique as variáveis de ambiente.");
        throw new Error("Configuração de API pendente. Contate o suporte.");
      }

      console.log(`[AI-Service] Iniciando geração de conteúdo (Tentativa ${retryCount + 1})...`);

      const ai = new GoogleGenAI({ apiKey });
      
      // Timeout de 55 segundos para a chamada da IA
      const transcriptionPromise = ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Audio, mimeType } }
          ]
        }
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: A IA demorou muito para responder (55s).")), 55000)
      );

      const geminiResponse = await Promise.race([transcriptionPromise, timeoutPromise]) as any;

      const transcription = geminiResponse.text;
      if (!transcription) {
        throw new Error("A IA não retornou nenhuma transcrição.");
      }

      console.log("[AI-Service] Transcrição concluída com sucesso.");
      return transcription;
    } catch (error: any) {
      // Detecção aprimorada de erro de cota (429)
      const errorContent = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      const isQuotaError = errorContent.includes('429') || 
                           errorContent.includes('exhausted') || 
                           errorContent.includes('RESOURCE_EXHAUSTED') ||
                           error.status === 429;

      console.error("[AI-Service] Erro detectado:", errorContent);
      
      if (retryCount < maxRetries && (error.message === 'Failed to fetch' || isQuotaError)) {
        retryCount++;
        const backupKey = process.env.GEMINI_API_KEY_REAL || import.meta.env.VITE_GEMINI_API_KEY_REAL;
        const isFallbackNext = !!(backupKey && retryCount > 0);
        
        // Aumenta o delay significativamente para erros de cota (mínimo 15 segundos)
        const delay = isQuotaError ? 15000 * retryCount : 2000 * retryCount;
        
        console.log(`[AI-Service] Retrying in ${delay}ms... (Next is Fallback: ${isFallbackNext})`);
        
        if (onRetry) onRetry(retryCount, delay, isFallbackNext);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptTranscription();
      }
      throw error;
    }
  };

  return attemptTranscription();
};
