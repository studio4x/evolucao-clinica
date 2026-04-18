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

      console.log(`[AI-Service] Tentativa ${retryCount + 1} usando ${apiKey === backupKey ? 'Chave Reserva' : 'Chave Principal'}`);

      const ai = new GoogleGenAI({ apiKey });
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Audio, mimeType } }
          ]
        }
      });

      const transcription = geminiResponse.text;
      if (!transcription) {
        throw new Error("A IA não retornou nenhuma transcrição.");
      }

      return transcription;
    } catch (error: any) {
      const isQuotaError = error.message?.includes('429') || error.message?.includes('exhausted');
      
      if (retryCount < maxRetries && (error.message === 'Failed to fetch' || isQuotaError)) {
        retryCount++;
        const isFallbackActive = !!(((process as any).env?.GEMINI_API_KEY_REAL || (import.meta as any).env?.VITE_GEMINI_API_KEY_REAL) && retryCount > 0);
        const delay = isQuotaError ? 10000 * retryCount : 2000 * retryCount;
        
        if (onRetry) onRetry(retryCount, delay, isFallbackActive);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptTranscription();
      }
      throw error;
    }
  };

  return attemptTranscription();
};
