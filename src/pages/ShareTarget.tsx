import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { transcribeAudio } from '../services/aiTranscription';
import { addPendingEvolution } from '../services/offlineQueue';
import { sendNotification } from '../services/notificationHelper';
import { appendToGoogleDoc, getGoogleDocContent, updateGoogleDocContent } from '../services/googleDocs';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import { Mic, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, X, Save, Eye, ExternalLink } from 'lucide-react';

// Simple IndexedDB wrapper for the shared file
const getSharedFile = (): Promise<File | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SharedFilesDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        resolve(null);
        return;
      }
      const transaction = db.transaction('files', 'readonly');
      const store = transaction.objectStore('files');
      const getRequest = store.get('shared-audio');
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
};

const clearSharedFileLocal = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SharedFilesDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        resolve();
        return;
      }
      const transaction = db.transaction('files', 'readwrite');
      const store = transaction.objectStore('files');
      const deleteRequest = store.delete('shared-audio');
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
};



export default function ShareTarget() {
  const navigate = useNavigate();
  const { user, googleAccessToken, googleGrantedScopes, setGoogleAccessToken } = useAuthStore();
  const hasClinicalAccess = Boolean(googleAccessToken) && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);
  
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionTime, setSessionTime] = useState(() => {
    const saved = localStorage.getItem('evolucao-clinica:default-session-time');
    if (saved) return saved;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const handleSessionTimeChange = (time: string) => {
    setSessionTime(time);
    localStorage.setItem('evolucao-clinica:default-session-time', time);
  };
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'processing' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  // Estados para visualização/edição do prontuário no modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalText, setModalText] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load patients
        let patientsData: any[] = [];
        if (user) {
          const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('professional_id', user.id)
            .order('full_name');
          if (error) throw error;
          patientsData = data || [];
        }
        setPatients(patientsData);

        // Load shared file
        const file = await getSharedFile();
        if (file) {
          setAudioFile(file);
          setAudioUrl(URL.createObjectURL(file));
          setStatus('idle');
        } else {
          setStatus('error');
          setErrorMessage('Nenhum áudio recebido. Tente compartilhar novamente a partir do WhatsApp.');
        }
      } catch (error: any) {
        console.error("Error loading shared file:", error);
        setStatus('error');
        setErrorMessage('Erro ao carregar: ' + (error?.message || error?.name || JSON.stringify(error)));
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl()
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauthentication error:", error);
      alert("Erro ao renovar autenticação. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleOpenModal = async () => {
    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient || !patient.google_doc_id || !hasClinicalAccess) return;
    setIsModalOpen(true);
    setModalLoading(true);
    setModalError('');
    try {
      const content = await getGoogleDocContent(googleAccessToken, patient.google_doc_id);
      setModalText(content);
    } catch (err: any) {
      console.error("Erro ao carregar prontuário:", err);
      let msg = err.message || "Erro desconhecido ao carregar prontuário.";
      if (msg.includes("UNAUTHENTICATED") || msg.includes("401")) {
        msg = "Sua sessão do Google expirou. Feche o modal e renove a autenticação.";
        setGoogleAccessToken(null);
      }
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveModalText = async () => {
    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient || !patient.google_doc_id || !hasClinicalAccess) return;
    setModalSaving(true);
    setModalError('');
    try {
      await updateGoogleDocContent(googleAccessToken, patient.google_doc_id, modalText);
      alert("Texto do prontuário atualizado com sucesso no Google Docs!");
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar prontuário:", err);
      let msg = err.message || "Erro desconhecido ao salvar prontuário.";
      if (msg.includes("UNAUTHENTICATED") || msg.includes("401")) {
        msg = "Sua sessão do Google expirou. Por favor, renove sua autenticação.";
        setGoogleAccessToken(null);
      }
      setModalError(msg);
    } finally {
      setModalSaving(false);
    }
  };

  const handleProcess = async () => {
    if (!audioFile || !selectedPatientId) return;

    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient || !patient.google_doc_id) {
      setErrorMessage('Paciente selecionado não possui um Google Doc vinculado.');
      setStatus('error');
      return;
    }

    if (!hasClinicalAccess) {
      setErrorMessage('Autenticação do Google ausente ou expirada.');
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage('');

    const evolutionId = uuidv4();
    
    const evolutionData = {
      id: evolutionId,
      professional_id: user?.id || '',
      patient_id: selectedPatientId,
      session_date: sessionDate,
      session_time: sessionTime,
      audio_url: '',
      transcription_status: 'processing',
      transcription_text: '',
      google_doc_append_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (!navigator.onLine) {
        throw new Error("offline");
      }

      setStatus('processing');
      setErrorMessage("Etapa 1/4: Salvando registro inicial...");

      // 1. Save initial state
      const { error: insertError } = await supabase
        .from('evolutions')
        .upsert(evolutionData);
      if (insertError) throw insertError;

      // 2. Transcribe with AI
      setErrorMessage("Etapa 2/4: Transcrevendo áudio com IA (Gemini 2.0)...");
      let mimeType = audioFile.type;
      
      if (!mimeType || mimeType === 'application/octet-stream') {
        mimeType = 'audio/ogg'; // WhatsApp PWA costuma vir com esse mimeType genérico
      }

      const transcription = await transcribeAudio({
        audioBlob: audioFile,
        mimeType,
        onRetry: (attempt, delay, isFallback) => {
          setErrorMessage(`Etapa 2/4: Retentativa IA ${attempt}/3 em ${Math.round(delay/1000)}s...`);
        }
      });

      if (!transcription) throw new Error("A IA retornou um texto vazio.");

      // 3. Append to Google Docs
      setErrorMessage("Etapa 3/4: Inserindo no prontuário (Google Docs)...");
      await appendToGoogleDoc(
        googleAccessToken,
        patient.google_doc_id,
        sessionDate,
        transcription,
        {
          sessionTime,
          evolutionId
        }
      );

      // 4. Update Supabase
      setErrorMessage("Etapa 4/4: Finalizando...");
      const { error: updateError } = await supabase
        .from('evolutions')
        .update({
          transcription_status: 'completed',
          transcription_text: transcription,
          google_doc_append_status: 'completed',
          google_doc_append_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', evolutionId);
      if (updateError) throw updateError;

      await clearSharedFileLocal().catch(e => console.warn("Erro ao limpar IDB:", e));
      setStatus('success');
      setErrorMessage('');

      // Dispara notificação in-app/push/email de sucesso para áudio compartilhado
      void sendNotification({
        title: "Áudio do WhatsApp Processado 🎙️",
        content: `A evolução do áudio compartilhado para ${patient?.full_name || 'Paciente'} foi criada e inserida no Google Docs com sucesso.`,
        type: "success",
        link: `/painel/patients/${selectedPatientId}`
      });

    } catch (error: any) {
      console.error("ERRO CRÍTICO NO SHARE TARGET:", error);
      let msg = error.message || "Erro desconhecido";
      
      if (msg === 'offline' || msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        try {
          await addPendingEvolution({
            id: evolutionId,
            patientId: selectedPatientId,
            patientName: patient?.full_name || 'Paciente',
            googleDocId: patient?.google_doc_id || '',
            sessionDate,
            audioBlob: audioFile,
            mimeType: audioFile.type || 'audio/ogg',
            source: 'share',
            createdAt: new Date().toISOString(),
            evolutionData
          });
          
          await clearSharedFileLocal().catch(e => console.warn("Erro IDB:", e));
          setStatus('success');
          setErrorMessage('');
          alert("Sem internet! O áudio do WhatsApp foi salvo na sua Fila Offline e será enviado quando a conexão retornar.");
          return;
        } catch (queueErr) {
          console.error("Erro ao salvar offline:", queueErr);
          msg = "Você está sem internet e ocorreu um erro ao guardar na fila local.";
        }
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Credentials')) {
        msg = "Sua sessão do Google expirou. Por favor, renove a autenticação abaixo.";
        setGoogleAccessToken(null);
      } else if (msg.includes('timeout') || msg.includes('55s')) {
        msg = "O Google demorou demais para responder. Tente um áudio mais curto ou tente novamente.";
      }
      
      setErrorMessage(msg);
      setStatus('error');

      // Dispara notificação de erro para áudio compartilhado
      void sendNotification({
        title: "Erro no Áudio Compartilhado ⚠️",
        content: `Falha ao processar áudio compartilhado para ${patient?.full_name || 'Paciente'}: ${msg}`,
        type: "error",
        link: `/painel/patients/${selectedPatientId}`
      });
      
      // Update Supabase with error if possible
      try {
        await supabase
          .from('evolutions')
          .update({
            transcription_status: 'error',
            error_message: msg,
            updated_at: new Date().toISOString()
          })
          .eq('id', evolutionId);
      } catch (f) {
        console.error("Falha ao salvar erro no Supabase:", f);
      }
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-brand-primary animate-spin" />
        <span className="ml-2 text-brand-text-muted">Carregando arquivo compartilhado...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-brand-border bg-brand-bg/50">
          <h2 className="text-xl font-display font-semibold text-brand-primary">Áudio Recebido</h2>
          <p className="text-sm text-brand-text-muted mt-1">
            Selecione o paciente para processar este áudio.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {status === 'success' ? (
            <div className="text-center py-8">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-brand-accent/20 mb-4">
                <CheckCircle className="h-6 w-6 text-brand-primary" />
              </div>
              <h3 className="text-lg font-display font-medium text-brand-text mb-2">Evolução Processada!</h3>
              <p className="text-brand-text-muted mb-6">O áudio foi transcrito e inserido no Google Docs com sucesso.</p>
              
              {(() => {
                const patient = patients.find(p => p.id === selectedPatientId);
                if (patient && patient.google_doc_id) {
                  return (
                    <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mt-4 mb-6 border-b border-brand-border/30 pb-6">
                      <a
                        href={`https://docs.google.com/document/d/${patient.google_doc_id}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white text-brand-primary border border-brand-primary/20 rounded-xl hover:bg-brand-primary/5 font-medium transition-colors text-sm w-full sm:w-auto"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Acessar Documento no Google Drive</span>
                      </a>
                      <button
                        onClick={handleOpenModal}
                        className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 font-medium transition-colors text-sm w-full sm:w-auto"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Ver/Editar Evolução</span>
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate(`/painel/patients/${selectedPatientId}`)}
                  className="btn-primary w-full sm:w-auto"
                >
                  Ver Perfil do Paciente
                </button>
                <button
                  onClick={() => navigate('/painel/dashboard')}
                  className="btn-outline w-full sm:w-auto"
                >
                  Ir para Home
                </button>
              </div>
            </div>
          ) : (
            <>
              {audioUrl && (
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-border">
                  <p className="text-sm font-medium text-brand-text mb-2">Áudio Compartilhado:</p>
                  <audio src={audioUrl} controls className="w-full" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">
                  Paciente
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="input-field p-2"
                  disabled={status === 'processing'}
                >
                  <option value="">Selecione um paciente...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">
                    Data da Sessão
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="input-field p-2"
                    disabled={status === 'processing'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">
                    Horário da Sessão
                  </label>
                  <input
                    type="time"
                    value={sessionTime}
                    onChange={(e) => handleSessionTimeChange(e.target.value)}
                    className="input-field p-2"
                    disabled={status === 'processing'}
                  />
                </div>
              </div>

              {status === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Erro no processamento</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{errorMessage}</p>
                      </div>
                      {errorMessage.includes('Sessão do Google expirou') && (
                        <button
                          onClick={handleReauthenticate}
                          disabled={isReauthenticating}
                          className="mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg text-red-700 bg-red-100 hover:bg-red-200 transition-colors"
                        >
                          {isReauthenticating ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                          )}
                          Renovar Autenticação do Google
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/painel/dashboard')}
                  disabled={status === 'processing'}
                  className="btn-outline disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProcess}
                  disabled={status === 'processing' || !selectedPatientId || !audioFile}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'processing' ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      {errorMessage || 'Processando...'}
                    </>
                  ) : (
                    <>
                      <Upload className="-ml-1 mr-2 h-4 w-4" />
                      Processar Evolução
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de visualização/edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-brand-border animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
              <div>
                <h3 className="text-lg font-bold font-display text-brand-primary">
                  Documento de Evolução (Google Docs)
                </h3>
                <p className="text-xs text-brand-text-muted mt-0.5">
                  {patients.find(p => p.id === selectedPatientId)?.full_name}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-brand-text-muted hover:bg-stone-100 hover:text-brand-text transition-colors"
                disabled={modalSaving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {modalLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                  <p className="text-sm font-medium text-brand-primary">Carregando prontuário do Google Docs...</p>
                </div>
              ) : modalError ? (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
                  <p className="text-sm text-red-700 font-medium">{modalError}</p>
                  {!hasClinicalAccess && (
                    <button
                      onClick={handleReauthenticate}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium transition-colors"
                    >
                      Renovar Autenticação
                    </button>
                  )}
                  {hasClinicalAccess && (
                    <button
                      onClick={handleOpenModal}
                      className="px-4 py-2 bg-stone-800 text-white rounded-xl hover:bg-stone-700 text-sm font-medium transition-colors"
                    >
                      Tentar Novamente
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-brand-text">
                    Texto Completo do Prontuário:
                  </label>
                  <textarea
                    value={modalText}
                    onChange={(e) => setModalText(e.target.value)}
                    rows={12}
                    className="w-full input-field p-3 font-mono text-sm leading-relaxed focus:ring-1 focus:ring-brand-primary border border-brand-border outline-none rounded-xl resize-y"
                    placeholder="Conteúdo do prontuário..."
                    disabled={modalSaving}
                  />
                  <p className="text-[11px] text-brand-text-muted">
                    Nota: Ao salvar, todo o conteúdo exibido acima substituirá o texto atual do documento no Google Docs.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!modalLoading && !modalError && (
              <div className="px-6 py-4 border-t border-brand-border flex items-center justify-end space-x-3 bg-stone-50 rounded-b-2xl">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white border border-brand-border rounded-xl text-sm font-medium text-brand-text hover:bg-stone-100 transition-colors"
                  disabled={modalSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveModalText}
                  className="flex items-center space-x-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
                  disabled={modalSaving}
                >
                  {modalSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando no Google Docs...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
