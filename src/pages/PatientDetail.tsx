import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { FileText, Plus, ExternalLink, Clock, RefreshCw, Loader2, Trash2, Bell, Sparkles, Copy, Check, Mail, Send, X } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { appendToGoogleDoc, appendTextToGoogleDoc } from '../services/googleDocs';
import { sendNotification } from '../services/notificationHelper';

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

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user, googleAccessToken, setGoogleAccessToken } = useAuthStore();

  // Estados para as configurações de lembretes
  const [reminderActive, setReminderActive] = useState(false);
  const [sessionDays, setSessionDays] = useState<number[]>([]);
  const [sessionTime, setSessionTime] = useState('');
  const [savingReminders, setSavingReminders] = useState(false);
  
  // Estados para Relatórios e PDI por IA
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiReportType, setAiReportType] = useState<'evolution_report' | 'pdi_draft'>('evolution_report');
  const [aiPeriod, setAiPeriod] = useState<'3_months' | '6_months' | 'custom'>('3_months');
  const [aiStartDate, setAiStartDate] = useState('');
  const [aiEndDate, setAiEndDate] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [aiError, setAiError] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  
  // Estados para exportação e e-mail
  const [exportingDoc, setExportingDoc] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (patient) {
      setReminderActive(patient.evolution_reminder_active ?? false);
      setSessionDays(patient.session_days || []);
      setSessionTime(patient.session_time ? patient.session_time.substring(0, 5) : '');
    }
  }, [patient]);

  const handleSaveReminders = async () => {
    setSavingReminders(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          evolution_reminder_active: reminderActive,
          session_days: reminderActive ? sessionDays : [],
          session_time: (reminderActive && sessionTime) ? sessionTime : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setPatient((prev: any) => ({
        ...prev,
        evolution_reminder_active: reminderActive,
        session_days: reminderActive ? sessionDays : [],
        session_time: reminderActive ? sessionTime : null
      }));

      // Dispara uma notificação interna no frontend para avisar o usuário
      void sendNotification({
        title: 'ℹ️ Configurações de Lembrete Salvas',
        content: `As configurações de lembrete de evolução de ${patient?.full_name} foram atualizadas com sucesso.`,
        type: 'info',
        link: `/painel/patients/${id}`
      });

      alert("Configurações de lembrete atualizadas com sucesso!");
    } catch (err: any) {
      console.error("Error saving reminders:", err);
      alert("Erro ao salvar configurações de lembrete: " + (err.message || err));
    } finally {
      setSavingReminders(false);
    }
  };

  const handleSendTestReminder = async () => {
    try {
      await sendNotification({
        title: `🔔 Lembrete de Evolução (Teste): ${patient?.full_name}`,
        content: `Este é um lembrete de teste para o(a) paciente ${patient?.full_name}. Quando ativo, você receberá notificações semelhantes após o horário de atendimento configurado nos dias selecionados.`,
        type: 'warning',
        link: `/painel/patients/${id}`
      });
      alert("Lembrete de teste enviado com sucesso! Verifique a página de notificações, e-mail ou push.");
    } catch (err: any) {
      console.error("Error sending test reminder:", err);
      alert("Erro ao enviar lembrete de teste: " + (err.message || err));
    }
  };

  const fetchData = async () => {
    if (!id || !user) return;
    try {
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();
      if (patientError) throw patientError;
      setPatient(patientData);

      const { data: evosData, error: evosError } = await supabase
        .from('evolutions')
        .select('*')
        .eq('patient_id', id)
        .eq('professional_id', user.id)
        .order('created_at', { ascending: false });
      if (evosError) throw evosError;
      setEvolutions(evosData || []);
    } catch (error) {
      console.error("Error fetching patient details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, user]);

  const handleGenerateAiReport = async () => {
    setAiGenerating(true);
    setAiError('');
    setGeneratedReport('');
    setIsCopied(false);
    setShowEmailInput(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const response = await fetch(`/api/patients/${id}/ai-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          period: aiPeriod,
          startDate: aiPeriod === 'custom' ? aiStartDate : undefined,
          endDate: aiPeriod === 'custom' ? aiEndDate : undefined,
          type: aiReportType
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao gerar o relatório por IA.");
      }

      setGeneratedReport(result.report);
      const docLabel = aiReportType === 'evolution_report' ? 'Relatório de Evolução' : 'Plano de Desenvolvimento Individual (PDI)';
      setEmailSubject(`[Evolução Clínica] ${docLabel} - ${patient?.full_name}`);
    } catch (err: any) {
      console.error("Erro na geração de relatório por IA:", err);
      setAiError(err.message || "Erro desconhecido");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!generatedReport) return;
    navigator.clipboard.writeText(generatedReport)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Erro ao copiar:", err);
        alert("Falha ao copiar para a área de transferência.");
      });
  };

  const handleExportToGoogleDoc = async () => {
    if (!generatedReport || !patient?.google_doc_id) return;
    setExportingDoc(true);
    try {
      let currentToken = googleAccessToken;
      
      if (!currentToken) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events.readonly',
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        return;
      }

      const docLabel = aiReportType === 'evolution_report' ? 'Relatório de Evolução por IA' : 'Plano de Desenvolvimento Individual (PDI) por IA';
      const now = new Date().toLocaleDateString('pt-BR');
      const textToAppend = `=== ${docLabel} ===\nGerado em: ${now}\n\n${generatedReport}`;

      await appendTextToGoogleDoc(currentToken, patient.google_doc_id, textToAppend);
      alert("Relatório adicionado com sucesso no início do seu Google Docs!");
    } catch (err: any) {
      console.error("Erro ao exportar:", err);
      let msg = err.message || "Erro desconhecido";
      if (msg.includes('401') || msg.includes('UNAUTHENTICATED')) {
        alert("Sua sessão do Google expirou. Por favor, reautentique no painel.");
        setGoogleAccessToken(null);
      } else {
        alert("Erro ao exportar para o Google Docs: " + msg);
      }
    } finally {
      setExportingDoc(false);
    }
  };

  const handleSendReportEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !generatedReport) return;
    setSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Sessão expirada.");
      }

      const response = await fetch(`/api/patients/${id}/send-report-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          toEmail: recipientEmail,
          subject: emailSubject,
          textContent: generatedReport
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar o e-mail.");
      }

      alert("E-mail enviado com sucesso!");
      setShowEmailInput(false);
    } catch (err: any) {
      console.error("Erro ao enviar e-mail:", err);
      alert("Erro ao enviar e-mail: " + (err.message || err));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleReprocess = async (evo: any) => {
    if (!user) return;
    
    let currentToken = googleAccessToken;

    // 1. Check for Google Token
    if (!currentToken) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events.readonly',
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

    if (!patient || !patient.google_doc_id) {
      alert("Prontuário não encontrado.");
      return;
    }

    setProcessingId(evo.id);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    // Call backend
    const formData = new FormData();
    formData.append('audioUrl', evo.audio_url);
    formData.append('googleAccessToken', currentToken!);
    formData.append('googleDocId', patient.google_doc_id);
    formData.append('patientName', patient.full_name);
    formData.append('sessionDate', evo.session_date);

    const maxRetries = 2;
    let retryCount = 0;

    const attemptProcess = async () => {
      try {
        // 1. Fetch audio and transcribe with Gemini (Frontend)
        console.log("Iniciando transcrição no frontend...");
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("Chave da API Gemini não encontrada no ambiente.");
        }

        const audioResponse = await fetch(evo.audio_url);
        if (!audioResponse.ok) throw new Error("Falha ao baixar áudio para reprocessamento.");
        const audioBlob = await audioResponse.blob();
        
        const ai = new GoogleGenAI({ apiKey });
        const base64Audio = await blobToBase64(audioBlob);
        
        const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
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

        clearTimeout(timeoutId);
        await fetchData();
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
      await fetchData();
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
        .eq('patient_id', id)
        .eq('professional_id', user!.id);
      if (error) throw error;
      setEvolutions([]);
      setShowClearConfirm(false);
      // Notifica o terapeuta sobre a exclusão das evoluções
      void sendNotification({
        title: '🗑️ Evoluções Excluídas',
        content: `Todas as evoluções do prontuário do paciente ${patient?.full_name || 'desconhecido'} foram removidas permanentemente.`,
        type: 'warning',
        link: `/painel/patients/${id}`
      });
    } catch (error) {
      console.error("Error clearing evolutions:", error);
      alert("Erro ao limpar evoluções.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleDeletePatient = async () => {
    setIsDeleting(true);
    try {
      // Deleta primeiro as evoluções para evitar qualquer erro de integridade referencial
      const { error: evolutionsError } = await supabase
        .from('evolutions')
        .delete()
        .eq('patient_id', id);
      if (evolutionsError) throw evolutionsError;

      // Deleta o paciente
      const { error: patientError } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);
      if (patientError) throw patientError;

      // Notifica
      void sendNotification({
        title: '🗑️ Paciente Excluído',
        content: `O paciente ${patient?.full_name || 'desconhecido'} foi excluído permanentemente da plataforma.`,
        type: 'warning',
        link: '/painel/patients'
      });

      // Redireciona
      navigate('/painel/patients');
    } catch (error: any) {
      console.error("Error deleting patient:", error);
      alert(`Erro ao excluir paciente: ${error.message || error}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
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

  if (loading) return <div>Carregando...</div>;
  if (!patient) return <div>Paciente não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-primary">{patient.full_name}</h1>
          <div className="flex items-center space-x-2 mt-2">
            <span className={`px-2 py-1 text-xs rounded-full ${patient.status === 'active' ? 'bg-brand-accent/20 text-brand-primary' : 'bg-gray-100 text-gray-700'}`}>
              {patient.status === 'active' ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-outline border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={18} className="mr-1.5" />
            <span>Excluir</span>
          </button>
          <Link 
            to={`/painel/patients/${id}/edit`}
            className="btn-outline"
          >
            Editar
          </Link>
          <Link 
            to={`/painel/patients/${id}/evolutions/new`}
            className="btn-primary"
          >
            <Plus size={20} className="mr-2" />
            <span>Nova Evolução</span>
          </Link>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl shadow-sm space-y-3">
          <p className="text-red-900 font-semibold text-lg flex items-center gap-2">
            <Trash2 size={20} className="text-red-600" />
            Deseja realmente excluir este paciente?
          </p>
          <p className="text-sm text-red-700 leading-relaxed">
            Esta ação é irreversível. O cadastro do paciente e todas as <strong>{evolutions.length} evoluções</strong> registradas nesta plataforma serão removidas permanentemente.
            O documento no Google Docs <strong>NÃO</strong> será afetado.
          </p>
          <div className="flex space-x-3 pt-2">
            <button 
              onClick={handleDeletePatient}
              disabled={isDeleting}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              {isDeleting && <Loader2 size={14} className="animate-spin" />}
              <span>Confirmar Exclusão</span>
            </button>
            <button 
              onClick={() => setShowDeleteConfirm(false)}
              className="btn-outline bg-white border-brand-border"
              disabled={isDeleting}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="card p-6">
            <h3 className="font-semibold text-brand-text mb-4">Prontuário Vinculado</h3>
            {patient.google_doc_id ? (
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <FileText className="text-brand-primary mt-1 flex-shrink-0" size={20} />
                  <p className="text-sm font-medium text-brand-text break-words">{patient.google_doc_name}</p>
                </div>
                <a 
                  href={patient.google_doc_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 transition-colors text-sm font-medium"
                >
                  <ExternalLink size={16} />
                  <span>Abrir no Google Docs</span>
                </a>
              </div>
            ) : (
              <div className="text-sm text-brand-text-muted text-center py-4">
                Nenhum documento vinculado. <Link to={`/painel/patients/${id}/edit`} className="text-brand-primary hover:underline">Vincular agora</Link>.
              </div>
            )}
          </div>

          <div className="card p-6 border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 transition-all duration-200">
            <div className="flex items-center space-x-2 text-brand-primary mb-3">
              <Sparkles size={20} className="animate-pulse" />
              <h3 className="font-semibold text-brand-text mb-0">Relatórios & PDI por IA</h3>
            </div>
            <p className="text-xs text-brand-text-muted mb-4 leading-relaxed">
              Analise o histórico do paciente nos últimos meses e gere relatórios estruturados ou rascunhos de PDI instantaneamente com Inteligência Artificial.
            </p>
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="w-full btn-primary py-2.5 text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm shadow-brand-primary/10"
            >
              <Sparkles size={13} />
              <span>Gerar Relatório / PDI</span>
            </button>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center space-x-2 text-brand-primary">
              <Bell size={20} className="text-brand-primary" />
              <h3 className="font-semibold text-brand-text mb-0">Lembretes de Evolução</h3>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center space-x-2 text-sm text-brand-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderActive}
                  onChange={(e) => setReminderActive(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                />
                <span className="font-medium">Ativar lembretes</span>
              </label>

              {reminderActive && (
                <div className="space-y-3 pt-2 border-t border-brand-border/50">
                  <div>
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-2">
                      Dias da Semana
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { val: 1, label: 'S' },
                        { val: 2, label: 'T' },
                        { val: 3, label: 'Q' },
                        { val: 4, label: 'Q' },
                        { val: 5, label: 'S' },
                        { val: 6, label: 'S' },
                        { val: 0, label: 'D' }
                      ].map((day, idx) => {
                        const isSelected = sessionDays.includes(day.val);
                        const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                        return (
                          <button
                            key={idx}
                            type="button"
                            title={weekdayNames[day.val]}
                            onClick={() => {
                              setSessionDays(prev => 
                                prev.includes(day.val) 
                                  ? prev.filter(d => d !== day.val) 
                                  : [...prev, day.val].sort()
                              );
                            }}
                            className={`w-8 h-8 text-xs font-semibold rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-brand-primary text-white shadow-sm border border-brand-primary'
                                : 'bg-brand-bg text-brand-text-muted hover:bg-brand-border border border-brand-border'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-1">
                      Horário do Atendimento
                    </label>
                    <input
                      type="time"
                      value={sessionTime}
                      onChange={(e) => setSessionTime(e.target.value)}
                      className="input-field p-2"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/50">
                <button
                  type="button"
                  onClick={handleSaveReminders}
                  disabled={savingReminders}
                  className="w-full btn-primary py-2 text-xs flex items-center justify-center space-x-1 cursor-pointer"
                >
                  {savingReminders ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Lembrete</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendTestReminder}
                  className="w-full btn-outline py-2 text-xs flex items-center justify-center space-x-1 cursor-pointer border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5"
                >
                  <span>Enviar Lembrete de Teste</span>
                </button>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-brand-text mb-2">Observações</h3>
            <p className="text-sm text-brand-text-muted whitespace-pre-wrap">
              {patient.notes || 'Nenhuma observação registrada.'}
            </p>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="card">
            <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
              <h2 className="text-lg font-display font-semibold text-brand-primary">Histórico de Evoluções</h2>
              {evolutions.length > 0 && (
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="text-red-600 hover:text-red-700 flex items-center space-x-1 text-sm font-medium transition-colors"
                >
                  <Trash2 size={16} />
                  <span>Limpar Tudo</span>
                </button>
              )}
            </div>

            {showClearConfirm && (
              <div className="p-6 bg-red-50 border-b border-red-100">
                <p className="text-red-900 font-medium mb-2">Deseja limpar todas as evoluções?</p>
                <p className="text-sm text-red-700 mb-4">
                  Esta ação removerá o histórico apenas aqui na plataforma. 
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

            <div className="divide-y divide-brand-border">
              {evolutions.length === 0 ? (
                <div className="p-8 text-center text-brand-text-muted">
                  Nenhuma evolução registrada para este paciente.
                </div>
              ) : (
                evolutions.map((evo) => (
                  <div key={evo.id} className="p-6 hover:bg-brand-bg transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-brand-text-muted" />
                        <span className="font-medium text-brand-text">{formatDateTime(evo.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {evo.transcription_status === 'failed' && evo.audio_url && (
                          <button 
                            onClick={() => handleReprocess(evo)}
                            disabled={processingId === evo.id}
                            className="flex items-center space-x-1 text-xs btn-primary px-2 py-1 mr-2"
                          >
                            {processingId === evo.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            <span>Reprocessar</span>
                          </button>
                        )}
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          evo.transcription_status === 'completed' ? 'bg-brand-primary/10 text-brand-primary' : 
                          evo.transcription_status === 'failed' ? 'bg-red-100 text-red-700' : 
                          'bg-brand-secondary/10 text-brand-secondary'
                        }`}>
                          {evo.transcription_status === 'completed' ? 'Concluído' : 
                           evo.transcription_status === 'failed' ? 'Falha' : 'Processando'}
                        </span>
                      </div>
                    </div>
                    {evo.transcription_text && (
                      <div className="mt-4 text-sm text-brand-text-muted bg-brand-bg p-4 rounded-xl border border-brand-border">
                        <p className="line-clamp-3">{evo.transcription_text}</p>
                      </div>
                    )}
                    {evo.error_message && (
                      <div className="mt-2 text-sm text-red-600">
                        Erro: {evo.error_message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] border border-brand-border">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50 rounded-t-2xl">
              <div className="flex items-center space-x-2 text-brand-primary">
                <Sparkles size={20} className="text-brand-primary animate-pulse" />
                <h3 className="text-lg font-display font-semibold text-brand-primary mb-0">Relatórios & PDI por IA</h3>
              </div>
              <button 
                onClick={() => {
                  setShowAiModal(false);
                  setGeneratedReport('');
                  setAiError('');
                }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors p-1"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!generatedReport && !aiGenerating && (
                <div className="space-y-5">
                  <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10">
                    <p className="text-sm text-brand-primary font-medium mb-1">Como funciona?</p>
                    <p className="text-xs text-brand-text-muted leading-relaxed">
                      A Inteligência Artificial irá varrer as evoluções clínicas concluídas deste paciente no período selecionado, analisando progressos, dificuldades e combinando com as observações do prontuário para redigir o documento clínico final.
                    </p>
                  </div>

                  {/* Seleção do Tipo */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-2">
                      Tipo de Documento
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setAiReportType('evolution_report')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          aiReportType === 'evolution_report'
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary shadow-sm'
                            : 'border-brand-border hover:bg-brand-bg text-brand-text'
                        }`}
                      >
                        <p className="font-semibold text-sm mb-1">Relatório de Evolução</p>
                        <p className="text-xs text-brand-text-muted">Compilado trimestral/periódico de progressos.</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiReportType('pdi_draft')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          aiReportType === 'pdi_draft'
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary shadow-sm'
                            : 'border-brand-border hover:bg-brand-bg text-brand-text'
                        }`}
                      >
                        <p className="font-semibold text-sm mb-1">Rascunho de PDI</p>
                        <p className="text-xs text-brand-text-muted">Plano de Desenvolvimento Individual sugerido.</p>
                      </button>
                    </div>
                  </div>

                  {/* Seleção do Período */}
                  <div>
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-2">
                      Período de Análise
                    </label>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { val: '3_months', label: 'Últimos 3 meses' },
                        { val: '6_months', label: 'Últimos 6 meses' },
                        { val: 'custom', label: 'Personalizado' }
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setAiPeriod(item.val as any)}
                          className={`py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer transition-all duration-200 ${
                            aiPeriod === item.val
                              ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                              : 'border-brand-border hover:bg-brand-bg text-brand-text-muted'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {aiPeriod === 'custom' && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-brand-bg rounded-xl border border-brand-border">
                        <div>
                          <label className="block text-[10px] font-semibold text-brand-text-muted uppercase mb-1">
                            Data Inicial
                          </label>
                          <input
                            type="date"
                            value={aiStartDate}
                            onChange={(e) => setAiStartDate(e.target.value)}
                            className="input-field py-1.5 px-3 text-xs w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-brand-text-muted uppercase mb-1">
                            Data Final (Opcional)
                          </label>
                          <input
                            type="date"
                            value={aiEndDate}
                            onChange={(e) => setAiEndDate(e.target.value)}
                            className="input-field py-1.5 px-3 text-xs w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Indicador de Carregamento */}
              {aiGenerating && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
                    <Sparkles className="absolute inset-0 m-auto text-brand-primary animate-pulse" size={24} />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-brand-text">Gerando relatório com Gemini IA...</p>
                    <p className="text-xs text-brand-text-muted max-w-sm">
                      Analisando os relatos das evoluções clínicas e consolidando os marcos terapêuticos. Isso pode levar alguns segundos.
                    </p>
                  </div>
                </div>
              )}

              {/* Erro */}
              {aiError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-2 text-center">
                  <p className="text-sm font-semibold text-red-900">Falha ao gerar documento</p>
                  <p className="text-xs text-red-700 leading-relaxed">{aiError}</p>
                  <button
                    onClick={() => setAiError('')}
                    className="text-xs text-brand-primary font-medium hover:underline mt-1 cursor-pointer block mx-auto"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}

              {/* Visualizador de Resultado */}
              {generatedReport && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-2">
                      Documento Gerado (Você pode editar diretamente)
                    </label>
                    <textarea
                      value={generatedReport}
                      onChange={(e) => setGeneratedReport(e.target.value)}
                      rows={14}
                      className="w-full input-field font-sans text-sm p-4 leading-relaxed border border-brand-border focus:border-brand-primary rounded-xl focus:ring-1 focus:ring-brand-primary resize-y"
                    />
                  </div>

                  {/* Formulário de E-mail Opcional */}
                  {showEmailInput && (
                    <form onSubmit={handleSendReportEmail} className="p-4 bg-brand-bg rounded-xl border border-brand-border space-y-3">
                      <p className="text-xs font-bold text-brand-text uppercase tracking-wider">Enviar Relatório por E-mail</p>
                      <div className="space-y-2">
                        <input
                          type="email"
                          placeholder="E-mail do destinatário (ex: pais, médico)"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          required
                          className="input-field p-2 text-xs w-full"
                        />
                        <input
                          type="text"
                          placeholder="Assunto"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          required
                          className="input-field p-2 text-xs w-full"
                        />
                      </div>
                      <div className="flex space-x-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowEmailInput(false)}
                          className="px-3 py-1.5 border border-brand-border text-xs rounded-lg hover:bg-gray-100 text-brand-text-muted transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={sendingEmail}
                          className="px-4 py-1.5 btn-primary text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer"
                        >
                          {sendingEmail ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              <span>Enviando...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>Enviar E-mail</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Ações do Relatório */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-brand-border">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyToClipboard}
                        className="btn-outline py-2 px-3 text-xs flex items-center space-x-1 cursor-pointer border-brand-border bg-white text-brand-text"
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} className="text-green-600" />
                            <span className="text-green-600 font-semibold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copiar Texto</span>
                          </>
                        )}
                      </button>

                      {patient?.google_doc_id && (
                        <button
                          type="button"
                          onClick={handleExportToGoogleDoc}
                          disabled={exportingDoc}
                          className="btn-outline py-2 px-3 text-xs flex items-center space-x-1 cursor-pointer border-brand-primary/30 text-brand-primary bg-white hover:bg-brand-primary/5"
                        >
                          {exportingDoc ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Salvando no Drive...</span>
                            </>
                          ) : (
                            <>
                              <FileText size={14} />
                              <span>Salvar no Google Docs</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setShowEmailInput(true);
                        }}
                        className="btn-outline py-2 px-3 text-xs flex items-center space-x-1 cursor-pointer border-brand-border bg-white text-brand-text hover:bg-gray-50"
                      >
                        <Mail size={14} />
                        <span>Enviar por E-mail</span>
                      </button>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setShowAiModal(false);
                        setGeneratedReport('');
                        setAiError('');
                      }}
                      className="btn-primary py-2 px-4 text-xs cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (apenas na etapa de configuração) */}
            {!generatedReport && !aiGenerating && (
              <div className="px-6 py-4 border-t border-brand-border flex justify-end space-x-3 bg-brand-bg/20 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="btn-outline border-brand-border bg-white text-brand-text cursor-pointer hover:bg-gray-50 text-xs px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAiReport}
                  className="btn-primary flex items-center space-x-1.5 cursor-pointer text-xs px-4 py-2"
                >
                  <Sparkles size={13} />
                  <span>Gerar com Gemini IA</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
