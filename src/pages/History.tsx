import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, AlertCircle, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { appendToGoogleDoc } from '../services/googleDocs';

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

export default function History() {
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [patientsMap, setPatientsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { user, googleAccessToken, setGoogleAccessToken } = useAuthStore();

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const { data: evos, error: evosError } = await supabase
        .from('evolutions')
        .select('*')
        .eq('professional_id', user.id)
        .order('created_at', { ascending: false });
      
      if (evosError) throw evosError;
      
      // Fetch patient details for each evolution
      const pMap: Record<string, any> = { ...patientsMap };
      const patientIds = [...new Set((evos || []).map(e => e.patient_id))];
      
      for (const pid of patientIds) {
        if (pMap[pid]) continue;
        const { data: pData, error: pError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', pid)
          .single();
        if (!pError && pData) {
          pMap[pid] = pData;
        }
      }
      
      setPatientsMap(pMap);
      setEvolutions(evos || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const handleReprocess = async (evo: any) => {
    if (!user) return;
    
    let currentToken = googleAccessToken;

    // 1. Check for Google Token
    if (!currentToken) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/documents',
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        return;
      } catch (error) {
        console.error("Re-auth error:", error);
        alert("Erro ao autenticar com o Google.");
        return;
      }
    }

    const patient = patientsMap[evo.patient_id];
    if (!patient || !patient.google_doc_id) {
      alert("Paciente ou prontuário não encontrado.");
      return;
    }

    setProcessingId(evo.id);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    const maxRetries = 2;
    let retryCount = 0;

    const attemptProcess = async () => {
      try {
        // 1. Fetch audio and transcribe with Gemini (Frontend)
        console.log("Iniciando transcrição no frontend...");
        
        let apiKey = '';
        
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('api_key')
            .eq('id', 'gemini')
            .single();
          if (!error && data?.api_key) {
            apiKey = data.api_key;
          }
        } catch (dbError) {
          console.warn("[AI-Service] Falha ao ler chave do Gemini do Supabase:", dbError);
        }

        if (!apiKey) {
          apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
        }

        if (!apiKey) {
          throw new Error("Chave da API Gemini não encontrada no ambiente ou banco de dados.");
        }

        const audioResponse = await fetch(evo.audio_url);
        if (!audioResponse.ok) throw new Error("Falha ao baixar áudio para reprocessamento.");
        const audioBlob = await audioResponse.blob();
        
        const ai = new GoogleGenAI({ apiKey });
        const base64Audio = await blobToBase64(audioBlob);
        
        const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Audio, mimeType: audioBlob.type || 'audio/webm' } }
            ]
          }
        });

        const transcription = geminiResponse.text;
        if (!transcription) {
          throw new Error("A IA não retornou nenhuma transcrição.");
        }

        console.log("Transcrição concluída. Inserindo no Google Docs...");

        // 2. Insert transcription to Google Docs directly from frontend
        await appendToGoogleDoc(
          currentToken!,
          patient.google_doc_id,
          evo.session_date,
          transcription
        );

        // Update Supabase with success
        const { error: updateError } = await supabase
          .from('evolutions')
          .update({
            transcription_status: 'completed',
            transcription_text: transcription,
            google_doc_append_status: 'completed',
            google_doc_append_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', evo.id);
        if (updateError) throw updateError;

        // Gravando log de uso no Supabase
        const usageMetadata = (geminiResponse as any).usageMetadata;
        if (usageMetadata) {
          const promptTokens = usageMetadata.promptTokenCount || 0;
          const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
          const totalTokens = usageMetadata.totalTokenCount || 0;
          const costUsd = (promptTokens * 0.00000030) + (candidatesTokens * 0.00000250);

          await supabase.from('usage_logs').insert({
            professional_id: user.id,
            model: "gemini-2.5-flash",
            prompt_tokens: promptTokens,
            candidates_tokens: candidatesTokens,
            total_tokens: totalTokens,
            cost_usd: costUsd,
            audio_duration_seconds: evo.audio_duration_seconds || 0,
            created_at: new Date().toISOString()
          });
        }

        clearTimeout(timeoutId);
        await fetchHistory();
        alert("Evolução reprocessada com sucesso!");
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          const abortError = new Error("O processamento demorou muito tempo ou foi cancelado pelo navegador.");
          abortError.name = 'AbortError';
          throw abortError;
        }

        if (retryCount < maxRetries && (error.message === 'Failed to fetch' || error.message?.includes('network'))) {
          retryCount++;
          console.log(`Retrying process-evolution... Attempt ${retryCount}`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          return attemptProcess();
        }
        throw error;
      }
    };

    try {
      // Update status to processing
      const { error: updateError } = await supabase
        .from('evolutions')
        .update({
          transcription_status: 'processing',
          google_doc_append_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', evo.id);
      if (updateError) throw updateError;

      await attemptProcess();
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Reprocessing error:", error);
      
      let msg = error.message || "Erro desconhecido";
      if (error.name === 'AbortError') {
        msg = "O processamento demorou muito tempo e foi cancelado.";
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        msg = "Sua sessão do Google expirou. Por favor, renove a autenticação clicando no botão 'Renovar Autenticação Google' no topo da página.";
        setGoogleAccessToken(null);
      }
      
      const { error: updateError } = await supabase
        .from('evolutions')
        .update({
          transcription_status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString()
        })
        .eq('id', evo.id);
      if (updateError) throw updateError;
      
      await fetchHistory();
      alert(`Erro ao reprocessar: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleClearEvolutions = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('evolutions')
        .delete()
        .eq('professional_id', user.id);
      if (error) throw error;
      setEvolutions([]);
      setShowClearConfirm(false);
    } catch (error) {
      console.error("Error clearing evolutions:", error);
      alert("Erro ao limpar evoluções.");
    } finally {
      setIsClearing(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="p-8 text-center">Carregando histórico...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-semibold text-brand-primary">Histórico de Evoluções</h1>
        {evolutions.length > 0 && (
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="text-red-600 hover:text-red-700 flex items-center space-x-1 text-sm font-medium transition-colors"
          >
            <Trash2 size={18} />
            <span>Limpar Histórico</span>
          </button>
        )}
      </div>

      {showClearConfirm && (
        <div className="bg-red-50 border rounded-2xl p-6 border-red-100 shadow-sm">
          <p className="text-red-900 font-medium mb-2">Deseja limpar todo o seu histórico de evoluções?</p>
          <p className="text-sm text-red-700 mb-4">
            Esta ação removerá o histórico de <strong>todos os pacientes</strong> apenas aqui na plataforma. 
            O conteúdo já inserido no Google Docs <strong>NÃO</strong> será afetado.
          </p>
          <div className="flex space-x-3">
            <button 
              onClick={handleClearEvolutions}
              disabled={isClearing}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              {isClearing && <Loader2 size={14} className="animate-spin" />}
              <span>Confirmar Limpeza</span>
            </button>
            <button 
              onClick={() => setShowClearConfirm(false)}
              className="btn-outline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="divide-y divide-brand-border">
          {evolutions.length === 0 ? (
            <div className="p-8 text-center text-brand-text-muted">
              Nenhuma evolução registrada.
            </div>
          ) : (
            evolutions.map((evo) => {
              const patient = patientsMap[evo.patient_id];
              return (
                <div key={evo.id} className="p-6 hover:bg-brand-bg transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Clock size={16} className="text-brand-text-muted" />
                        <span className="font-medium text-brand-text">{formatDateTime(evo.created_at)}</span>
                      </div>
                      <Link to={`/patients/${evo.patient_id}`} className="text-brand-primary hover:text-brand-primary-hover hover:underline font-medium">
                        {patient?.full_name || 'Paciente Desconhecido'}
                      </Link>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        {evo.transcription_status === 'completed' ? (
                          <span className="flex items-center text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full text-sm font-medium">
                            <CheckCircle size={16} className="mr-1" /> Sucesso
                          </span>
                        ) : evo.transcription_status === 'failed' ? (
                          <span className="flex items-center text-red-700 bg-red-100 px-3 py-1 rounded-full text-sm font-medium">
                            <AlertCircle size={16} className="mr-1" /> Falha
                          </span>
                        ) : (
                          <span className="flex items-center text-brand-secondary bg-brand-secondary/10 px-3 py-1 rounded-full text-sm font-medium">
                            <RefreshCw size={16} className="mr-1 animate-spin" /> Processando
                          </span>
                        )}
                      </div>
                      
                      {evo.transcription_status === 'failed' && evo.audio_url && (
                        <button 
                          onClick={() => handleReprocess(evo)}
                          disabled={processingId === evo.id}
                          className="btn-primary px-3 py-1.5 text-xs"
                        >
                          {processingId === evo.id ? (
                            <Loader2 size={14} className="animate-spin mr-1" />
                          ) : (
                            <RefreshCw size={14} className="mr-1" />
                          )}
                          <span>Reprocessar</span>
                        </button>
                      )}
                      
                      {evo.transcription_status === 'failed' && !evo.audio_url && (
                        <Link 
                          to={`/patients/${evo.patient_id}/evolutions/new`}
                          className="btn-outline px-3 py-1.5 text-xs"
                        >
                          Tentar Novamente
                        </Link>
                      )}
                    </div>
                  </div>
                  
                  {evo.error_message && (
                    <div className="mt-4 text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
                      <strong>Erro:</strong> {evo.error_message}
                    </div>
                  )}
                  
                  {evo.transcription_text && (
                    <div className="mt-4 text-sm text-brand-text-muted bg-brand-bg p-4 rounded-xl border border-brand-border">
                      <p className="line-clamp-2">{evo.transcription_text}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
