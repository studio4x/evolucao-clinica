import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { Mic, Square, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, Trash2, ExternalLink, Eye, X, Save, ArrowLeft, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { appendToGoogleDoc, getGoogleDocContent, updateGoogleDocContent } from '../services/googleDocs';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';

import { transcribeAudio } from '../services/aiTranscription';
import { addPendingEvolution, getDraftEvolutions, getPendingEvolutionById, removePendingEvolution, PendingEvolution } from '../services/offlineQueue';
import { getPendingEvolutionAudioBlobs } from '../services/evolutionAudio';
import { sendNotification } from '../services/notificationHelper';
import { setOnboardingState, completeOnboarding } from '../utils/onboarding';

type AudioEvolutionItem = {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  source: 'recording' | 'upload' | 'draft';
  name: string;
};

const AUTH_REAUTH_RECOVERY_KEY = 'new-evolution:resume-after-auth';

export default function NewEvolution() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, googleAccessToken, googleGrantedScopes, setGoogleAccessToken, isAuthReady } = useAuthStore();
  const hasGoogleSession = Boolean(googleAccessToken);
  const hasClinicalAccess = hasGoogleSession && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);
  const isOnboardingMode = searchParams.get('onboarding') === '1';
  
  const [patient, setPatient] = useState<any>(null);
  const dateParam = searchParams.get('date');
  const [sessionDate, setSessionDate] = useState(dateParam || new Date().toISOString().split('T')[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioItems, setAudioItems] = useState<AudioEvolutionItem[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isOnboardingGateModalOpen, setIsOnboardingGateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Estados para visualização/edição do prontuário no modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalText, setModalText] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Recuperação de rascunho interrompido
  const [recoveredDraft, setRecoveredDraft] = useState<PendingEvolution | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const recordingTimeRef = useRef<number>(0);
  const audioItemsRef = useRef<AudioEvolutionItem[]>([]);
  const autoRestoreAfterAuthRef = useRef(false);
  const onboardingGateShownRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isDiscardingRef = useRef(false);

  useEffect(() => {
    audioItemsRef.current = audioItems;
  }, [audioItems]);

  const getTotalAudioDuration = (items: AudioEvolutionItem[]) => {
    return items.reduce((total, item) => total + (item.duration || 0), 0);
  };

  const getAudioDurationFromUrl = (url: string) => {
    return new Promise<number>((resolve) => {
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
          resolve(audio.duration);
          return;
        }

        audio.currentTime = 1e101;
        audio.ontimeupdate = function() {
          this.ontimeupdate = () => {};
          audio.currentTime = 0;
          resolve(audio.duration && audio.duration !== Infinity && !isNaN(audio.duration) ? audio.duration : 0);
        };
      });
      audio.addEventListener('error', () => resolve(0));
    });
  };

  const createAudioItem = async (blob: Blob, source: AudioEvolutionItem['source'], name: string) => {
    const url = URL.createObjectURL(blob);
    const duration = await getAudioDurationFromUrl(url);

    return {
      id: uuidv4(),
      blob,
      url,
      duration: Number.isFinite(duration) ? duration : 0,
      source,
      name
    } as AudioEvolutionItem;
  };

  const persistDraft = async (items: AudioEvolutionItem[], currentRecordingBlob?: Blob) => {
    if (!patient || !user) return;

    try {
      const draftId = draftIdRef.current || uuidv4();
      draftIdRef.current = draftId;

      const draftBlobs = [...items.map(item => item.blob)];
      if (currentRecordingBlob) {
        draftBlobs.push(currentRecordingBlob);
      }

      if (draftBlobs.length === 0) {
        return;
      }

      const duration = getTotalAudioDuration(items) + (currentRecordingBlob ? recordingTimeRef.current : 0);

      const draftItem: PendingEvolution = {
        id: draftId,
        patientId: patient.id,
        patientName: patient.full_name,
        googleDocId: patient.google_doc_id,
        sessionDate,
        audioBlob: draftBlobs[0],
        audioBlobs: draftBlobs,
        mimeType: draftBlobs[0].type || 'audio/webm',
        source: 'new',
        createdAt: new Date().toISOString(),
        status: 'draft',
        recordingTime: duration,
        evolutionData: {
          id: draftId,
          professional_id: user.id,
          patient_id: patient.id,
          session_date: sessionDate,
          transcription_status: 'processing',
          google_doc_append_status: 'pending',
          audio_duration_seconds: duration,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };

      await addPendingEvolution(draftItem);
    } catch (err) {
      console.warn("Falha ao salvar rascunho de gravação:", err);
    }
  };

  const updateAudioItems = (nextItems: AudioEvolutionItem[]) => {
    audioItemsRef.current = nextItems;
    setAudioItems(nextItems);
  };

  const clearAuthRecoveryFlag = () => {
    sessionStorage.removeItem(AUTH_REAUTH_RECOVERY_KEY);
    autoRestoreAfterAuthRef.current = false;
  };

  const reorderAudioItem = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= audioItemsRef.current.length) return;

    const nextItems = [...audioItemsRef.current];
    const [movedItem] = nextItems.splice(index, 1);
    if (!movedItem) return;
    nextItems.splice(nextIndex, 0, movedItem);

    updateAudioItems(nextItems);
    await persistDraft(nextItems);
  };

  const clearAllAudioItems = async () => {
    audioItemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
    audioItemsRef.current = [];
    setAudioItems([]);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    clearAuthRecoveryFlag();

    if (draftIdRef.current) {
      await removePendingEvolution(draftIdRef.current);
      draftIdRef.current = null;
    }
  };

  useEffect(() => {
    const fetchTemplatesAndPatient = async () => {
      if (!id) return;
      try {
        const { data: templatesData, error: templatesError } = await supabase
          .from('evolution_templates')
          .select('*')
          .order('name');
        if (!templatesError && templatesData) {
          setTemplates(templatesData);
        }

        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', id)
          .single();
        if (!patientError && patientData) {
          setPatient(patientData);
          setSelectedTemplateId(patientData.default_template_id || '');
        }
      } catch (err) {
        console.error("Erro ao carregar dados iniciais:", err);
      }
    };
    fetchTemplatesAndPatient();
  }, [id]);

  useEffect(() => {
    if (!isOnboardingMode || !patient?.id || hasGoogleSession || onboardingGateShownRef.current) {
      return;
    }

    onboardingGateShownRef.current = true;
    setIsOnboardingGateModalOpen(true);
  }, [hasGoogleSession, isOnboardingMode, patient?.id]);

  // Efeito para verificar rascunhos não finalizados
  useEffect(() => {
    const checkForDrafts = async () => {
      if (!id) return;
      const draftId = searchParams.get('draftId');
      try {
        if (draftId) {
          const draft = await getPendingEvolutionById(draftId);
          if (draft && draft.status === 'draft') {
            setRecoveredDraft(draft);
          }
        } else {
          const drafts = await getDraftEvolutions();
          const patientDraft = drafts.find(d => d.patientId === id);
          if (patientDraft) {
            setRecoveredDraft(patientDraft);
          }
        }
      } catch (err) {
        console.error("Erro ao procurar rascunhos de gravação:", err);
      }
    };
    checkForDrafts();
  }, [id, searchParams]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      audioItemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, []);

  const hydrateAudioItems = async (blobs: Blob[], source: AudioEvolutionItem['source']) => {
    const items = await Promise.all(
      blobs.map((blob, index) => createAudioItem(blob, source, `Áudio ${index + 1}`))
    );
    return items;
  };

  const handleApplyRecoveredDraftForSubmit = async () => {
    if (!recoveredDraft) return;
    try {
      clearAuthRecoveryFlag();
      const blobs = getPendingEvolutionAudioBlobs(recoveredDraft);
      const items = await hydrateAudioItems(blobs, 'draft');
      audioItemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
      updateAudioItems(items);
      setRecordingTime(recoveredDraft.recordingTime || getTotalAudioDuration(items));
      setSessionDate(recoveredDraft.sessionDate);
      draftIdRef.current = recoveredDraft.id;
      recordingTimeRef.current = recoveredDraft.recordingTime || 0;
      setStatus('idle');
      setErrorMessage('');
      setProcessingMessage('');
      
      setRecoveredDraft(null);
    } catch (err) {
      console.error('Erro ao recuperar rascunho para envio:', err);
      alert('Não foi possível recuperar o rascunho. Tente novamente.');
    }
  };

  const handleApplyRecoveredDraftForContinue = async () => {
    if (!recoveredDraft) return;
    try {
      clearAuthRecoveryFlag();
      const blobs = getPendingEvolutionAudioBlobs(recoveredDraft);
      const items = await hydrateAudioItems(blobs, 'draft');
      audioItemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
      updateAudioItems(items);
      setRecordingTime(recoveredDraft.recordingTime || getTotalAudioDuration(items));
      setSessionDate(recoveredDraft.sessionDate);
      draftIdRef.current = recoveredDraft.id;
      recordingTimeRef.current = recoveredDraft.recordingTime || getTotalAudioDuration(items);
      setStatus('idle');
      setErrorMessage('');
      setProcessingMessage('');
      setRecoveredDraft(null);

      void startRecording();
    } catch (err) {
      console.error('Erro ao recuperar rascunho para continuar:', err);
      alert('Não foi possível recuperar o rascunho para continuar. Tente novamente.');
    }
  };

  const handleDiscardRecoveredDraft = async () => {
    if (!recoveredDraft) return;
    if (window.confirm("Certeza que deseja excluir permanentemente esta gravação incompleta?")) {
      clearAuthRecoveryFlag();
      await removePendingEvolution(recoveredDraft.id);
      setRecoveredDraft(null);
    }
  };

  const handleReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      sessionStorage.setItem(
        AUTH_REAUTH_RECOVERY_KEY,
        JSON.stringify({
          patientId: id,
          draftId: draftIdRef.current,
          sessionDate
        })
      );
      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        prompt: 'consent',
        loginHint: user?.email || undefined
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauthentication error:", error);
      clearAuthRecoveryFlag();
      alert("Erro ao renovar autenticação. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !recoveredDraft || audioItemsRef.current.length > 0) return;

    const pendingRecovery = sessionStorage.getItem(AUTH_REAUTH_RECOVERY_KEY);
    if (!pendingRecovery) return;

    let parsedRecovery: { patientId?: string; draftId?: string; sessionDate?: string } | null = null;
    try {
      parsedRecovery = JSON.parse(pendingRecovery);
    } catch (err) {
      clearAuthRecoveryFlag();
      return;
    }

    if (parsedRecovery?.patientId && parsedRecovery.patientId !== id) {
      clearAuthRecoveryFlag();
      return;
    }

    if (autoRestoreAfterAuthRef.current) {
      return;
    }

    autoRestoreAfterAuthRef.current = true;
    void handleApplyRecoveredDraftForSubmit().finally(() => {
      clearAuthRecoveryFlag();
    });
  }, [isAuthReady, recoveredDraft, id]);

  const handleOpenModal = async () => {
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
      if (msg.includes("INSUFFICIENT_SCOPES")) {
        msg = "Sua conta Google está conectada, mas ainda não liberou as permissões clínicas completas. Renove a autenticação para aprovar o acesso ao Google Drive e Docs.";
      } else if (msg.includes("UNAUTHENTICATED") || msg.includes("401")) {
        msg = "Sua sessão do Google expirou. Feche o modal e renove a autenticação.";
        setGoogleAccessToken(null);
      }
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveModalText = async () => {
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
      if (msg.includes("INSUFFICIENT_SCOPES")) {
        msg = "Sua conta Google está conectada, mas ainda não liberou as permissões clínicas completas. Renove a autenticação para aprovar o acesso ao Google Drive e Docs.";
      } else if (msg.includes("UNAUTHENTICATED") || msg.includes("401")) {
        msg = "Sua sessão do Google expirou. Por favor, renove sua autenticação.";
        setGoogleAccessToken(null);
      }
      setModalError(msg);
    } finally {
      setModalSaving(false);
    }
  };

  const startRecording = async () => {
    try {
      isDiscardingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      recordingTimeRef.current = 0;
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          // Salva rascunho periodicamente
          if (!isDiscardingRef.current) {
            const partialBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            void persistDraft(audioItemsRef.current, partialBlob);
          }
        }
      };

      mediaRecorder.onstop = () => {
        if (!isDiscardingRef.current) {
          if (chunksRef.current.length > 0) {
            const newBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
            void (async () => {
              const nextItem = await createAudioItem(
                newBlob,
                'recording',
                `Gravação ${audioItemsRef.current.length + 1}`
              );
              const nextItems = [...audioItemsRef.current, nextItem];
              updateAudioItems(nextItems);
              recordingTimeRef.current = 0;
              setRecordingTime(0);
              setIsRecording(false);
              setIsPaused(false);
              await persistDraft(nextItems);
            })();
          }
        }
        stream.getTracks().forEach(track => track.stop());
      };

      // Inicia gravando e fatiando os dados a cada 3 segundos (3000ms)
      mediaRecorder.start(3000);
      setIsRecording(true);
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          recordingTimeRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          recordingTimeRef.current = next;
          return next;
        });
      }, 1000);
    }
  };

  const discardRecording = async () => {
    if (window.confirm("Certeza que deseja descartar esta gravação? Toda a captura atual será perdida.")) {
      isDiscardingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Reset dos estados da gravação atual
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      chunksRef.current = [];

      if (audioItemsRef.current.length > 0) {
        await persistDraft(audioItemsRef.current);
      } else if (draftIdRef.current) {
        await removePendingEvolution(draftIdRef.current);
        draftIdRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setProcessingMessage('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    if (files.length === 0) {
      return;
    }

    if (isRecording) {
      alert('Finalize a gravação atual antes de adicionar arquivos.');
      return;
    }

    const newItems = await Promise.all(
      files.map(async (file, index) => {
        const item = await createAudioItem(
          file,
          'upload',
          file.name || `Arquivo ${index + 1}`
        );
        return item;
      })
    );

    const nextItems = [...audioItemsRef.current, ...newItems];
    updateAudioItems(nextItems);
    if (status !== 'processing') setStatus('idle');
    await persistDraft(nextItems);
  };

  const handleClearAudio = async () => {
    await clearAllAudioItems();
    if (status !== 'processing') setStatus('idle');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getAudioSourceLabel = (source: AudioEvolutionItem['source']) => {
    if (source === 'upload') return 'Arquivo enviado';
    if (source === 'recording') return 'Gravação';
    return 'Recuperado';
  };

  const handleSubmit = async () => {
    const items = audioItemsRef.current;
    if (items.length === 0 || !patient || !user) return;

    if (isRecording) {
      alert('Finalize a gravação atual antes de enviar a evolução.');
      return;
    }
    
    if (!patient.google_doc_id) {
      alert("Este paciente não possui um prontuário vinculado. Por favor, edite o paciente e vincule um documento do Google Docs primeiro.");
      return;
    }

    if (!hasClinicalAccess) {
      alert(hasGoogleSession
        ? "Sua autorização do Google precisa ser renovada antes de continuar."
        : "Você ainda não autenticou o Google neste fluxo. Volte ao cadastro do paciente para vincular a conta e criar o prontuário antes de continuar.");
      return;
    }

    setStatus('processing');
    setErrorMessage('');
    setProcessingMessage('');

    const evolutionId = draftIdRef.current || uuidv4();
    const totalAudioDuration = getTotalAudioDuration(items);
    const audioBlobs = items.map(item => item.blob);

    const activeTemplate = templates.find(t => t.id === selectedTemplateId);
    const customPrompt = activeTemplate?.system_prompt_instruction;

    const evolutionData = {
      id: evolutionId,
      professional_id: user.id,
      patient_id: patient.id,
      session_date: sessionDate,
      transcription_status: 'processing',
      google_doc_append_status: 'pending',
      audio_duration_seconds: totalAudioDuration,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      template_id: selectedTemplateId || null
    };

    const transcribeAllAudios = async () => {
      const transcriptionParts: string[] = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setProcessingMessage(
          items.length > 1
            ? `Transcrevendo áudio ${index + 1} de ${items.length}...`
            : 'Transcrevendo áudio...'
        );

        const transcription = await transcribeAudio({
          audioBlob: item.blob,
          mimeType: item.blob.type || 'audio/webm',
          audioDuration: item.duration || 0,
          customPrompt: customPrompt || undefined,
          onRetry: (attempt, delay, isFallback) => {
            console.log(`[NewEvolution] Retry ${attempt} with delay ${delay}ms. Fallback: ${isFallback}`);
          }
        });

        if (!transcription) {
          throw new Error(`A IA não retornou transcrição para o áudio ${index + 1}.`);
        }

        transcriptionParts.push(transcription.trim());
      }

      return transcriptionParts.join('\n\n');
    };

    try {
      if (!navigator.onLine) {
        throw new Error("offline");
      }
      
      const { error: insertError } = await supabase
        .from('evolutions')
        .insert(evolutionData);
      if (insertError) throw insertError;

      const transcription = await transcribeAllAudios();

      console.log("Transcrição concluída. Inserindo no Google Docs...");

      await appendToGoogleDoc(
        googleAccessToken,
        patient.google_doc_id,
        sessionDate,
        transcription
      );

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

      setStatus('success');
      setProcessingMessage('');

      if (draftIdRef.current) {
        await removePendingEvolution(draftIdRef.current);
        draftIdRef.current = null;
      }

      await clearAllAudioItems();

      if (isOnboardingMode && user?.id && patient?.id) {
        setOnboardingState(user.id, {
          step: 'agenda',
          patientId: patient.id,
          patientName: patient.full_name
        });
      }

      void sendNotification({
        title: "Evolução Criada com Sucesso 🎉",
        content: `A evolução clínica do paciente ${patient.full_name} foi processada e adicionada ao prontuário no Google Docs.`,
        type: "success",
        link: `/painel/patients/${patient.id}`
      });
    } catch (error: any) {
      console.error("Processing error:", error);
      
      let msg = error.message || "Erro desconhecido";
      
      if (msg === 'offline' || msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        try {
          await addPendingEvolution({
            id: evolutionId,
            patientId: patient.id,
            patientName: patient.full_name,
            googleDocId: patient.google_doc_id,
            sessionDate,
            audioBlob: audioBlobs[0],
            audioBlobs,
            mimeType: audioBlobs[0].type || 'audio/webm',
            source: 'new',
            createdAt: new Date().toISOString(),
            status: 'pending',
            evolutionData
          });
          
          setStatus('success');
          setProcessingMessage('');
          setErrorMessage(''); 
          alert("Você está sem internet! A evolução foi salva com segurança na sua Fila Offline. O aplicativo irá mantê-la no seu celular até você sincronizar.");
          
          draftIdRef.current = null;
          await clearAllAudioItems();
          return;
        } catch (queueErr) {
          console.error("Erro ao salvar na fila offline:", queueErr);
          msg = "Você está sem internet e houve uma falha ao salvar no armazenamento local do navegador. Não feche o aplicativo e espere a conexão voltar.";
        }
      } else if (msg.includes('429') || msg.includes('exhausted')) {
        msg = "O limite de processamento gratuito da Google (Gemini) foi atingido. Aguarde cerca de 60 segundos e clique em 'Tentar Novamente'.";
      } else if (msg.includes('INSUFFICIENT_SCOPES')) {
        msg = "Sua conta Google foi conectada, mas este token ainda não tem os escopos clinicos completos. Clique em 'Renovar Autenticacao' para aprovar o acesso ao Google Drive e Docs.";
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        msg = hasGoogleSession
          ? "Sua sessão do Google expirou. Por favor, renove a autenticação clicando no botão abaixo."
          : "Você ainda não autenticou o Google neste fluxo. Volte ao cadastro do paciente para vincular a conta e criar o prontuário antes de continuar.";
        setGoogleAccessToken(null);
      }
      
      setErrorMessage(msg);
      setStatus('error');
      setProcessingMessage('');
      
      void sendNotification({
        title: "Erro ao Criar Evolução ⚠️",
        content: `O processamento da evolução do paciente ${patient.full_name} falhou: ${msg}`,
        type: "error",
        link: `/painel/patients/${patient.id}`
      });
      
      try {
        await supabase
          .from('evolutions')
          .update({
            transcription_status: 'failed',
            google_doc_append_status: 'failed',
            error_message: msg,
            updated_at: new Date().toISOString()
          })
          .eq('id', evolutionId);
      } catch (fError) {
        console.error("Failed to update supabase with error state (likely offline):", fError);
      }
    }
  };

  const recoveredAudioCount = recoveredDraft ? getPendingEvolutionAudioBlobs(recoveredDraft).length : 0;
  const recoveredDuration = recoveredDraft?.recordingTime || 0;

  if (!patient) return <div>Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            to={isOnboardingMode ? `/painel/patients/${id}/edit?onboarding=1` : `/painel/patients/${id}`}
            className="p-2 rounded-2xl hover:bg-white text-brand-text-muted hover:text-brand-text border border-transparent hover:border-brand-border bg-white/40 backdrop-blur-sm transition-all shadow-sm flex items-center justify-center"
            title="Voltar para o paciente"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-2xl font-display font-semibold text-brand-primary">Nova Evolução</h1>
        </div>
        <span className="text-sm font-medium text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
          {patient.full_name}
        </span>
      </div>

      {recoveredDraft && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center space-x-2 text-amber-800 font-semibold">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span>Gravação Não Finalizada Encontrada</span>
          </div>
          <p className="text-sm text-amber-700 leading-relaxed">
            Identificamos {recoveredAudioCount > 1 ? `${recoveredAudioCount} áudios interrompidos` : 'uma gravação interrompida'} para este paciente em{" "}
            <strong>{new Date(recoveredDraft.createdAt).toLocaleDateString('pt-BR')} às {new Date(recoveredDraft.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong> com{" "}
            <strong>{formatTime(recoveredDuration)}</strong> de duração total. Deseja recuperar o conteúdo para subir na evolução, continuar gravando ou descartar para iniciar uma nova?
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleApplyRecoveredDraftForSubmit}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              Recuperar para a Evolução
            </button>
            <button
              onClick={handleApplyRecoveredDraftForContinue}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              Recuperar e Continuar Gravação
            </button>
            <button
              onClick={handleDiscardRecoveredDraft}
              className="bg-white border border-amber-300 text-amber-800 hover:bg-amber-100/50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              Descartar e Iniciar Nova
            </button>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Data da Sessão</label>
            <input
              type="date"
              required
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="input-field p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Template de Evolução</label>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="input-field p-2"
            >
              <option value="">Sem template padrão (Formatação Geral)</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-brand-border pt-6">
          <label className="block text-sm font-medium text-brand-text mb-4">Áudio da Evolução</label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Record Audio */}
            <div className="border border-brand-border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 bg-brand-bg/50 relative overflow-hidden">
              {isRecording ? (
                <>
                  <div className={`w-16 h-16 ${isPaused ? 'bg-yellow-100' : 'bg-red-100'} rounded-full flex items-center justify-center ${!isPaused && 'animate-pulse'}`}>
                    <Mic className={`${isPaused ? 'text-yellow-600' : 'text-red-600'} w-8 h-8`} />
                  </div>
                  <div className="text-2xl font-mono text-brand-text flex items-center">
                    {formatTime(recordingTime)}
                    {isPaused && <span className="text-xs ml-2 bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">Pausado</span>}
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-3">
                    {isPaused ? (
                      <button
                        onClick={resumeRecording}
                        className="flex items-center space-x-2 bg-brand-primary text-white px-4 py-2 rounded-xl hover:bg-brand-primary-hover transition-colors"
                      >
                        <RefreshCw size={16} />
                        <span>Retomar</span>
                      </button>
                    ) : (
                      <button
                        onClick={pauseRecording}
                        className="flex items-center space-x-2 bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 transition-colors"
                      >
                        <Square size={14} className="rounded-sm fill-current" />
                        <span>Pausar</span>
                      </button>
                    )}

                    <button
                      onClick={stopRecording}
                      className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
                    >
                      <CheckCircle size={16} />
                      <span>Finalizar</span>
                    </button>

                    <button
                      onClick={discardRecording}
                      className="flex items-center space-x-2 bg-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-300 transition-colors"
                    >
                      <Trash2 size={16} />
                      <span>Descartar</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center">
                    <Mic className="text-brand-primary w-8 h-8" />
                  </div>
                  <p className="text-sm text-brand-text-muted px-4">Grave o áudio da sessão com segurança (Backup automático ativo)</p>
                  <button
                    onClick={() => startRecording()}
                    disabled={status === 'processing'}
                    className="btn-primary w-full py-3"
                  >
                    Iniciar Gravação
                  </button>
                </>
              )}
            </div>

            {/* Upload Audio */}
            <div className="border border-brand-border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 bg-brand-bg/50">
              <div className="w-16 h-16 bg-brand-bg rounded-full flex items-center justify-center border border-brand-border">
                <Upload className="text-brand-text-muted w-8 h-8" />
              </div>
              <p className="text-sm text-brand-text-muted">Ou envie um ou mais arquivos de áudio do seu dispositivo</p>
              <label className="btn-outline cursor-pointer">
                <span>Escolher Arquivos</span>
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isRecording || status === 'processing'}
                />
              </label>
            </div>
          </div>

          {audioItems.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-primary">Áudios adicionados</p>
                  <p className="text-xs text-brand-text-muted">
                    {audioItems.length} arquivo(s) • {formatTime(getTotalAudioDuration(audioItems))} total
                  </p>
                </div>
                {!isRecording && status !== 'processing' && (
                  <button
                    onClick={handleClearAudio}
                    className="flex items-center space-x-1 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                  >
                    <Trash2 size={14} />
                    <span>Limpar tudo</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {audioItems.map((item, index) => (
                  <div key={item.id} className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/20 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-brand-text-muted">
                          <GripVertical size={16} />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-brand-primary leading-none">
                            Áudio {index + 1}
                          </p>
                          <p className="text-xs text-brand-text-muted">
                            {getAudioSourceLabel(item.source)} • {formatTime(Math.max(0, Math.round(item.duration || 0)))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            await reorderAudioItem(index, -1);
                          }}
                          disabled={isRecording || status === 'processing' || index === 0}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border bg-white text-xs font-medium text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronUp size={14} />
                          <span>Subir</span>
                        </button>
                        <button
                          onClick={async () => {
                            await reorderAudioItem(index, 1);
                          }}
                          disabled={isRecording || status === 'processing' || index === audioItems.length - 1}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border bg-white text-xs font-medium text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronDown size={14} />
                          <span>Descer</span>
                        </button>
                        <button
                          onClick={async () => {
                            const nextItems = audioItemsRef.current.filter(audioItem => audioItem.id !== item.id);
                            URL.revokeObjectURL(item.url);
                            updateAudioItems(nextItems);
                            if (nextItems.length === 0) {
                              await clearAllAudioItems();
                              setStatus('idle');
                              setErrorMessage('');
                              return;
                            }
                            await persistDraft(nextItems);
                          }}
                          disabled={isRecording || status === 'processing'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                    <audio src={item.url} controls className="w-full" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status and Submit */}
        <div className="border-t border-brand-border pt-6">
          {!hasClinicalAccess ? (
            <div className="flex flex-col items-center justify-center p-6 bg-yellow-50 rounded-xl border border-yellow-100 space-y-3">
          <AlertCircle className="w-8 h-8 text-yellow-600" />
          <p className="text-yellow-900 font-medium text-center">
            {hasGoogleSession
              ? 'Sua autorização do Google precisa ser renovada para continuar.'
              : 'Você ainda não autenticou o Google neste fluxo.'}
          </p>
          <button
            onClick={() => {
              if (!hasGoogleSession && isOnboardingMode) {
                navigate(`/painel/patients/${id}/edit?onboarding=1`, { replace: true });
                return;
              }
              handleReauthenticate();
            }}
            disabled={isReauthenticating}
            className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          >
                {isReauthenticating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{hasGoogleSession ? 'Renovar Autenticação' : (isOnboardingMode ? 'Voltar ao cadastro do paciente' : 'Conectar com Google')}</span>
              </button>
            </div>
          ) : status === 'idle' && (
            <button
              onClick={handleSubmit}
              disabled={audioItems.length === 0}
              className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enviar para Processamento
            </button>
          )}

          {status === 'processing' && (
            <div className="flex flex-col items-center justify-center p-6 bg-brand-primary/5 rounded-xl border border-brand-primary/20 space-y-3">
              <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
              <p className="text-brand-primary font-medium">Processando evolução...</p>
              <p className="text-sm text-brand-text-muted text-center">
                {processingMessage || 'A IA está transcrevendo os áudios e inserindo no prontuário do paciente. Isso pode levar alguns segundos.'}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className={`flex flex-col items-center justify-center p-6 rounded-xl border space-y-3 ${
              isOnboardingMode
                ? 'bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40 border-emerald-200 shadow-sm'
                : 'bg-brand-accent/10 border-brand-accent/20'
            }`}>
              {isOnboardingMode && (
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                  Fluxo guiado
                </div>
              )}
              <CheckCircle className="w-10 h-10 text-brand-primary" />
              <p className="text-brand-primary font-medium text-lg text-center">
                {isOnboardingMode ? 'Evolução concluída. Continue para a sincronização da agenda.' : 'Evolução registrada com sucesso!'}
              </p>
              <p className="text-sm text-brand-text-muted text-center">
                {isOnboardingMode
                  ? 'O próximo passo do onboarding é sincronizar os atendimentos da agenda.'
                  : 'A transcrição foi adicionada ao final do documento Google Docs do paciente.'}
              </p>

              {isOnboardingMode && (
                <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-center text-sm text-emerald-900 shadow-sm">
                  Você ainda está no assistente de configuração. Falta só a etapa da agenda para finalizar o onboarding.
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mt-4">
                <a
                  href={`https://docs.google.com/document/d/${patient.google_doc_id}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white text-brand-primary border border-brand-primary/20 rounded-xl hover:bg-brand-primary/5 font-medium transition-colors text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Acessar no Google Drive</span>
                </a>
                <button
                  onClick={handleOpenModal}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 font-medium transition-colors text-sm"
                >
                  <Eye className="w-4 h-4" />
                  <span>Ver/Editar Transcrição</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-2 border-t border-brand-primary/10 pt-4 w-full justify-center">
                <button
                  onClick={() => navigate(isOnboardingMode ? '/onboarding?step=agenda' : `/painel/patients/${id}`)}
                  className="btn-primary px-5 py-2.5 text-sm"
                >
                  {isOnboardingMode ? 'Continuar para a agenda' : 'Voltar ao Paciente'}
                </button>
                {!isOnboardingMode && (
                  <button
                    onClick={() => {
                      audioItemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
                      audioItemsRef.current = [];
                      setAudioItems([]);
                      draftIdRef.current = null;
                      recordingTimeRef.current = 0;
                      setRecordingTime(0);
                      setStatus('idle');
                      setProcessingMessage('');
                      setErrorMessage('');
                    }}
                    className="btn-outline px-4 py-2 text-sm"
                  >
                    Nova Evolução
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center p-6 bg-red-50 rounded-xl border border-red-100 space-y-3">
              <AlertCircle className="w-10 h-10 text-red-600" />
              <p className="text-red-900 font-medium text-lg">Falha no processamento</p>
              <p className="text-sm text-red-700 text-center">{errorMessage}</p>
              <button
                onClick={handleSubmit}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {isOnboardingMode && user?.id && (
            <div className="flex justify-center pt-4 border-t border-brand-border/40 mt-4">
              <button
                type="button"
                onClick={() => {
                  if (confirm("Deseja mesmo sair do assistente de configuração e continuar depois? Você poderá criar pacientes e evoluções normalmente no painel.")) {
                    completeOnboarding(user.id);
                    navigate('/painel/dashboard');
                  }
                }}
                className="text-xs font-semibold text-brand-text-muted hover:text-red-500 transition-colors py-2 px-3 hover:bg-red-50 rounded-xl"
              >
                Sair do onboarding e configurar depois
              </button>
            </div>
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
                  {patient?.full_name}
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

      <GoogleSecurityModal
        isOpen={isOnboardingGateModalOpen}
        onClose={() => setIsOnboardingGateModalOpen(false)}
        onConfirm={() => {
          setIsOnboardingGateModalOpen(false);
          navigate(`/painel/patients/${id}/edit?onboarding=1`, { replace: true });
        }}
        confirmLabel="Voltar ao cadastro do paciente"
        mode="onboarding"
        showCloseButton={false}
      />
    </div>
  );
}
