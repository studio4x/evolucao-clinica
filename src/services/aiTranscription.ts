import { GoogleGenAI } from "@google/genai";
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

  const prompt = customPrompt || `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;
  const base64Audio = await blobToBase64(audioBlob);

  const attemptTranscription = async (): Promise<string> => {
    let keySource: 'firestore' | 'env' | 'none' = 'none';
    try {
      let apiKey = '';
      
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'gemini')
          .single();
        if (!error && data?.api_key) {
          apiKey = data.api_key;
          keySource = 'firestore';
          console.log("[AI-Service] Usando chave do Gemini configurada no Supabase.");
        }
      } catch (dbError) {
        console.warn("[AI-Service] Falha ao ler chave do Gemini do Supabase, usando fallback:", dbError);
      }

      if (!apiKey) {
        // Prioridade total para a chave de produção (REAL) conforme solicitado
        const mainKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        const backupKey = process.env.GEMINI_API_KEY_REAL || import.meta.env.VITE_GEMINI_API_KEY_REAL;
        
        // Inverte a lógica: Tenta primeiro a REAL (backupKey), se falhar ou não existir, usa a GRATUITA (mainKey)
        apiKey = backupKey ? backupKey : mainKey;
        if (apiKey) {
          keySource = 'env';
          console.log(`[AI-Service] Usando chave estática ${apiKey === backupKey ? 'SECUNDÁRIA (REAL)' : 'PRINCIPAL (GRATUITA)'}`);
        }
      }

      if (!apiKey) {
        console.error("[AI-Service] ERRO: Nenhuma chave da API Gemini encontrada.");
        throw new Error("Configuração de API ausente. Verifique as chaves.");
      }

      const keyLabel = keySource === 'firestore' 
        ? 'configurada no Painel Admin' 
        : 'estática do servidor';
      console.log(`[AI-Service] Usando chave ${keyLabel} - Tentativa ${retryCount + 1}`);

      const ai = new GoogleGenAI({ apiKey });
      
      // Timeout de 55 segundos para a chamada da IA
      const transcriptionPromise = ai.models.generateContent({
        model: "gemini-2.5-flash",
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

      // Captura e grava metadados de uso de tokens do Gemini
      const usageMetadata = geminiResponse.usageMetadata;
      if (usageMetadata) {
        const promptTokens = usageMetadata.promptTokenCount || 0;
        const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
        const totalTokens = usageMetadata.totalTokenCount || 0;
        
        // Custo Gemini 2.5 Flash:
        // Input: $0.30 / 1M tokens ($0.00000030 / token)
        // Output: $2.50 / 1M tokens ($0.00000250 / token)
        const costUsd = (promptTokens * 0.00000030) + (candidatesTokens * 0.00000250);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          
          await supabase.from('usage_logs').insert({
            professional_id: user?.id || 'unknown',
            model: "gemini-2.5-flash",
            prompt_tokens: promptTokens,
            candidates_tokens: candidatesTokens,
            total_tokens: totalTokens,
            cost_usd: costUsd,
            audio_duration_seconds: audioDuration || 0,
            created_at: new Date().toISOString()
          });
          console.log("[AI-Service] Log de consumo gravado no Supabase com sucesso.");
        } catch (dbError) {
          console.error("[AI-Service] Erro ao salvar log de consumo no Supabase:", dbError);
        }
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
      
      const sourceMsg = keySource === 'firestore' 
        ? 'Chave configurada no Painel Admin' 
        : 'Chave estática de fallback do servidor';
      
      const errorMessage = error.message || errorContent;
      throw new Error(`${errorMessage} (Origem da chave: ${sourceMsg})`);
    }
  };

  return attemptTranscription();
};
