import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { Mic, Square, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, Trash2, ExternalLink, Eye, X, Save, ArrowLeft, ChevronUp, ChevronDown, GripVertical, HelpCircle, Play, Pause } from 'lucide-react';
import { appendToGoogleDoc, getGoogleDocContent, updateGoogleDocContent } from '../services/googleDocs';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';
import TemplateExplanationModal from '../components/common/TemplateExplanationModal';
import { rememberMicrophonePermission } from '../utils/microphonePermission';

import { transcribeAudio } from '../services/aiTranscription';
import { addPendingEvolution, getDraftEvolutions, getPendingEvolutionById, removePendingEvolution, PendingEvolution } from '../services/offlineQueue';
import { getPendingEvolutionAudioBlobs } from '../services/evolutionAudio';
import { sendNotification } from '../services/notificationHelper';
import { setOnboardingState, completeOnboarding } from '../utils/onboarding';
import { getAudioDurationFromBlob } from '../utils/audioDuration';
import { showAlert, showConfirm } from '../store/modalStore';

type AudioEvolutionItem = {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  source: 'recording' | 'upload' | 'draft';
  name: string;
};

let activeAudioStopper: (() => void) | null = null;

const AudioPlaybackButton = ({ item }: { item: AudioEvolutionItem }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackContextRef = useRef<AudioContext | null>(null);
  const fallbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const isStartingRef = useRef(false);
  const playbackAttemptRef = useRef(0);
  const stopPlaybackRef = useRef<() => void>(() => undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState('');

  const setPlaying = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  };

  const stopPlayback = () => {
    playbackAttemptRef.current += 1;
    isStartingRef.current = false;
    audioRef.current?.pause();

    if (fallbackSourceRef.current) {
      try {
        fallbackSourceRef.current.stop();
      } catch {
        // A source that already ended cannot be stopped a second time.
      }
      fallbackSourceRef.current = null;
    }

    setPlaying(false);
    activeAudioStopper = null;
  };

  stopPlaybackRef.current = stopPlayback;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaybackError('');
    if (isPlayingRef.current || fallbackSourceRef.current) {
      stopPlayback();
      return;
    }
    if (isStartingRef.current) return;

    activeAudioStopper?.();
    activeAudioStopper = stopPlaybackRef.current;
    isStartingRef.current = true;
    const attempt = playbackAttemptRef.current + 1;
    playbackAttemptRef.current = attempt;

    try {
      await audio.play();
      if (playbackAttemptRef.current !== attempt) {
        audio.pause();
        return;
      }

      setPlaying(true);
    } catch (error) {
      try {
        const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) throw error;
        const context = fallbackContextRef.current || new AudioContextConstructor();
        fallbackContextRef.current = context;
        if (context.state === 'suspended') await context.resume();
        const buffer = await context.decodeAudioData(await item.blob.arrayBuffer());
        if (playbackAttemptRef.current !== attempt) return;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          if (fallbackSourceRef.current !== source) return;
          fallbackSourceRef.current = null;
          if (playbackAttemptRef.current === attempt) {
            isStartingRef.current = false;
            setPlaying(false);
            if (activeAudioStopper === stopPlaybackRef.current) activeAudioStopper = null;
          }
        };
        fallbackSourceRef.current = source;
        source.start();
        setPlaying(true);
      } catch (fallbackError) {
        console.error('[Audio] Falha ao iniciar reprodução', {
          error,
          fallbackError,
          mimeType: item.blob.type,
          bytes: item.blob.size,
        });
        if (playbackAttemptRef.current === attempt) {
          setPlaying(false);
          setPlaybackError('Este áudio não pôde ser reproduzido neste dispositivo.');
        }
      } finally {
        if (playbackAttemptRef.current === attempt) isStartingRef.current = false;
      }
    }
  };

  useEffect(() => () => {
    stopPlaybackRef.current();
    void fallbackContextRef.current?.close();
  }, []);

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={item.url}
        preload="metadata"
        className="hidden"
        onEnded={() => {
          if (!fallbackSourceRef.current) {
            isStartingRef.current = false;
            setPlaying(false);
            if (activeAudioStopper === stopPlaybackRef.current) activeAudioStopper = null;
          }
        }}
        onError={(event) => {
          const mediaError = event.currentTarget.error;
          console.error('[Audio] Falha na reprodução', {
            code: mediaError?.code,
            message: mediaError?.message,
            mimeType: item.blob.type,
            bytes: item.blob.size,
          });
          if (!fallbackSourceRef.current) setPlaying(false);
        }}
      />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary/90 active:scale-[0.99]"
        aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {isPlaying ? <Pause size={19} /> : <Play size={19} />}
        <span>{isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}</span>
      </button>
      {playbackError && <p className="text-sm text-red-700" role="alert">{playbackError}</p>}
    </div>
  );
};

const AUTH_REAUTH_RECOVERY_KEY = 'new-evolution:resume-after-auth';

export default function NewEvolution() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    user, 
    googleAccessToken, 
    googleGrantedScopes, 
    setGoogleAccessToken, 
    isAuthReady,
    subscriptionStatus,
    subscriptionEndsAt,
    profileRole
  } = useAuthStore();
  const hasGoogleSession = Boolean(googleAccessToken);
  const hasClinicalAccess = hasGoogleSession && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);

  const isPlanActive = () => {
    if (profileRole === 'admin') return true;
    const now = new Date();
    const endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    const isExpired = endsAt ? endsAt < now : false;
    const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
    return isActive && !isExpired;
  };

  const checkPlanActiveAndAlert = async (actionName: string): Promise<boolean> => {
    if (!isPlanActive()) {
      await showAlert(`Para acessar e utilizar a funcionalidade "${actionName}", você precisa ter um plano de assinatura ativo. Por favor, regularize seu plano.`, {
        title: "Plano Necessário",
        variant: "warning",
        icon: "warning"
      });
      navigate('/painel/subscription');
      return false;
    }
    return true;
  };
  const isOnboardingMode = searchParams.get('onboarding') === '1';
  
  const [patient, setPatient] = useState<any>(null);
  const dateParam = searchParams.get('date');
  const [sessionDate, setSessionDate] = useState(dateParam || new Date().toISOString().split('T')[0]);
  
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

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioItems, setAudioItems] = useState<AudioEvolutionItem[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [processingMessage, setProcessingMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isOnboardingGateModalOpen, setIsOnboardingGateModalOpen] = useState(false);
  const [isGoogleAccessNoticeOpen, setIsGoogleAccessNoticeOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isTemplateHelpOpen, setIsTemplateHelpOpen] = useState(false);

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
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const originalRecordingStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformFrameRef = useRef<number | null>(null);

  const drawWaveform = () => {
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 72;
    if (canvas.width !== width * pixelRatio || canvas.height !== height * pixelRatio) {
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      context.scale(pixelRatio, pixelRatio);
    }

    const values = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(values);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#eff8f1';
    context.fillRect(0, 0, width, height);
    context.lineWidth = 2;
    context.strokeStyle = '#087f3f';
    context.beginPath();

    for (let index = 0; index < values.length; index += 1) {
      const x = (index / (values.length - 1)) * width;
      const y = (values[index] / 255) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    waveformFrameRef.current = window.requestAnimationFrame(drawWaveform);
  };

  const startWaveform = (stream: MediaStream) => {
    try {
      if (analyserRef.current) {
        if (waveformFrameRef.current === null) drawWaveform();
        return;
      }
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') void audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      if (waveformFrameRef.current === null) drawWaveform();
    } catch (error) {
      console.warn('Não foi possível iniciar o visualizador de áudio:', error);
    }
  };

  const pauseWaveform = () => {
    if (waveformFrameRef.current !== null) {
      window.cancelAnimationFrame(waveformFrameRef.current);
      waveformFrameRef.current = null;
    }
  };

  const stopWaveform = () => {
    pauseWaveform();
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  useEffect(() => () => stopWaveform(), []);

  useEffect(() => {
    if (isRecording && !isPaused && recordingStreamRef.current) {
      startWaveform(recordingStreamRef.current);
    } else {
      pauseWaveform();
    }
  }, [isRecording, isPaused]);

  const stopRecordingAudioProcessing = () => {
    if (recordingAudioContextRef.current) {
      void recordingAudioContextRef.current.close();
      recordingAudioContextRef.current = null;
    }
  };

  const createProcessedRecordingStream = async (stream: MediaStream) => {
    try {
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return stream;

      const audioContext = new AudioContextConstructor();
      if (audioContext.state === 'suspended') await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      const gain = audioContext.createGain();
      const compressor = audioContext.createDynamicsCompressor();
      const destination = audioContext.createMediaStreamDestination();

      // Eleva a voz capturada e reduz picos para evitar distorção nos aparelhos.
      gain.gain.value = 1.7;
      compressor.threshold.value = -24;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(destination);
      recordingAudioContextRef.current = audioContext;

      return destination.stream;
    } catch (error) {
      console.warn('Não foi possível aplicar ganho à gravação; usando captura direta:', error);
      stopRecordingAudioProcessing();
      return stream;
    }
  };

  useEffect(() => {
    audioItemsRef.current = audioItems;
  }, [audioItems]);

  const getTotalAudioDuration = (items: AudioEvolutionItem[]) => {
    return items.reduce((total, item) => total + (item.duration || 0), 0);
  };

  const getSupportedRecordingMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
    ];

    return candidates.find((mimeType) => MediaRecorder.isTypeSupported?.(mimeType)) || '';
  };

  const createAudioItem = async (blob: Blob, source: AudioEvolutionItem['source'], name: string, fallbackDuration = 0) => {
    const url = URL.createObjectURL(blob);
    const detectedDuration = await getAudioDurationFromBlob(blob);
    const duration = detectedDuration > 0 ? detectedDuration : fallbackDuration;

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
        sessionTime,
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
          session_time: sessionTime,
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

  useEffect(() => {
    if (!isAuthReady || isOnboardingMode || !patient?.id || hasClinicalAccess) return;
    setIsGoogleAccessNoticeOpen(true);
  }, [hasClinicalAccess, isAuthReady, isOnboardingMode, patient?.id]);

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
      if (recoveredDraft.sessionTime) {
        setSessionTime(recoveredDraft.sessionTime);
      }
      draftIdRef.current = recoveredDraft.id;
      recordingTimeRef.current = recoveredDraft.recordingTime || 0;
      setStatus('idle');
      setErrorMessage('');
      setProcessingMessage('');
      
      setRecoveredDraft(null);
    } catch (err) {
      console.error('Erro ao recuperar rascunho para envio:', err);
      await showAlert('Não foi possível recuperar o rascunho. Tente novamente.', {
        title: 'Recuperação Falhou',
        variant: 'danger',
        icon: 'warning'
      });
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
      if (recoveredDraft.sessionTime) {
        setSessionTime(recoveredDraft.sessionTime);
      }
      draftIdRef.current = recoveredDraft.id;
      recordingTimeRef.current = recoveredDraft.recordingTime || getTotalAudioDuration(items);
      setStatus('idle');
      setErrorMessage('');
      setProcessingMessage('');
      setRecoveredDraft(null);

      void startRecording();
    } catch (err) {
      console.error('Erro ao recuperar rascunho para continuar:', err);
      await showAlert('Não foi possível recuperar o rascunho para continuar. Tente novamente.', {
        title: 'Recuperação Falhou',
        variant: 'danger',
        icon: 'warning'
      });
    }
  };

  const handleDiscardRecoveredDraft = async () => {
    if (!recoveredDraft) return;
    const confirmed = await showConfirm("Certeza que deseja excluir permanentemente esta gravação incompleta?", {
      title: 'Excluir Gravação Incompleta',
      confirmLabel: 'Excluir',
      cancelLabel: 'Voltar',
      variant: 'danger',
      icon: 'trash'
    });
    if (confirmed) {
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
      await showAlert("Erro ao renovar autenticação. Tente novamente.", {
        title: "Falha na Autenticação",
        variant: "danger",
        icon: "warning"
      });
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
    setIsModalOpen(true);
    setModalError('');

    if (!patient) {
      setModalError('O paciente ainda não foi carregado. Tente novamente em instantes.');
      return;
    }

    if (!patient.google_doc_id) {
      setModalError('Este paciente não possui um prontuário Google Docs vinculado.');
      return;
    }

    if (!hasClinicalAccess || !googleAccessToken) {
      setModalError('Sua conexão com o Google expirou ou não possui as permissões clínicas necessárias. Renove a autenticação para editar a transcrição.');
      return;
    }

    setModalLoading(true);
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
      await showAlert("Texto do prontuário atualizado com sucesso no Google Docs!", {
        title: "Prontuário Atualizado",
        variant: "success",
        icon: "success"
      });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      originalRecordingStreamRef.current = stream;
      rememberMicrophonePermission();
      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach((track) => track.stop());
        originalRecordingStreamRef.current = null;
        throw new Error('Este dispositivo não oferece suporte à gravação de áudio.');
      }
      const mimeType = getSupportedRecordingMimeType();
      const recordingStream = await createProcessedRecordingStream(stream);
      const mediaRecorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
      recordingStreamRef.current = recordingStream;
      console.info('[Audio] Gravador iniciado', { requestedMimeType: mimeType || 'padrão', mimeType: mediaRecorder.mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      recordingTimeRef.current = 0;
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.info('[Audio] Fragmento capturado', { bytes: e.data.size, mimeType: e.data.type || mediaRecorder.mimeType });
          chunksRef.current.push(e.data);
          // Salva rascunho periodicamente
          if (!isDiscardingRef.current) {
            const partialBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            void persistDraft(audioItemsRef.current, partialBlob);
          }
        }
      };

      mediaRecorder.onstop = () => {
        if (!isDiscardingRef.current) {
          if (chunksRef.current.length > 0) {
            const newBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            const recordedDuration = Math.max(1, recordingTimeRef.current);
            console.info('[Audio] Gravação finalizada', { bytes: newBlob.size, mimeType: newBlob.type, chunks: chunksRef.current.length });
            void (async () => {
              const nextItem = await createAudioItem(
                newBlob,
                'recording',
                `Gravação ${audioItemsRef.current.length + 1}`,
                recordedDuration
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
        stopWaveform();
        recordingStreamRef.current = null;
        recordingStream.getTracks().forEach(track => track.stop());
        stream.getTracks().forEach(track => track.stop());
        originalRecordingStreamRef.current = null;
        stopRecordingAudioProcessing();
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
      stopRecordingAudioProcessing();
      originalRecordingStreamRef.current?.getTracks().forEach(track => track.stop());
      originalRecordingStreamRef.current = null;
      console.error("Error accessing microphone:", err);
      await showAlert("Não foi possível acessar o microfone. Verifique as permissões.", {
        title: "Erro de Microfone",
        variant: "danger",
        icon: "warning"
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      pauseWaveform();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      startWaveform(mediaRecorderRef.current.stream);
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
    const confirmed = await showConfirm("Certeza que deseja descartar esta gravação? Toda a captura atual será perdida.", {
      title: "Descartar Gravação",
      confirmLabel: "Descartar",
      cancelLabel: "Voltar",
      variant: "danger",
      icon: "trash"
    });
    if (confirmed) {
      isDiscardingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      originalRecordingStreamRef.current?.getTracks().forEach(track => track.stop());
      originalRecordingStreamRef.current = null;
      stopWaveform();
      stopRecordingAudioProcessing();
      recordingStreamRef.current = null;
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
      await showAlert('Finalize a gravação atual antes de adicionar arquivos.', {
        title: 'Gravação em Andamento',
        variant: 'warning',
        icon: 'warning'
      });
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
    const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
    const m = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const s = (safeSeconds % 60).toString().padStart(2, '0');
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
      await showAlert('Finalize a gravação atual antes de enviar a evolução.', {
        title: 'Gravação em Andamento',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }
    
    if (!patient.google_doc_id) {
      await showAlert("Este paciente não possui um prontuário vinculado. Por favor, edite o paciente e vincule um documento do Google Docs primeiro.", {
        title: "Vincular Google Docs",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    if (!hasClinicalAccess) {
      await showAlert(hasGoogleSession
        ? "Sua autorização do Google precisa ser renovada antes de continuar."
        : "Você ainda não autenticou o Google neste fluxo. Volte ao cadastro do paciente para vincular a conta e criar o prontuário antes de continuar.", {
        title: "Autenticação Necessária",
        variant: "warning",
        icon: "warning"
      });
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
      session_time: sessionTime,
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
          audioDuration: item.duration,
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
        .upsert(evolutionData);
      if (insertError) throw insertError;

      const transcription = await transcribeAllAudios();

      console.log("Transcrição concluída. Inserindo no Google Docs...");

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
          await showAlert("Você está sem internet! A evolução foi salva com segurança na sua Fila Offline. O aplicativo irá mantê-la no seu celular até você sincronizar.", {
            title: "Modo Offline",
            variant: "info",
            icon: "info"
          });
          
          draftIdRef.current = null;
          await clearAllAudioItems();
          return;
        } catch (queueErr) {
          console.error("Erro ao salvar na fila offline:", queueErr);
          msg = "Você está sem internet e houve uma falha ao salvar no armazenamento local do navegador. Não feche o aplicativo e espere a conexão voltar.";
        }
      } else if (msg.includes('Muitas solicitações de transcrição')) {
        msg = "Você atingiu o limite de 5 transcrições por minuto. Aguarde alguns segundos e tente novamente.";
      } else if (msg.includes('Limite mensal de transcrição de áudio atingido')) {
        msg = "Limite mensal de transcrição de áudio atingido. Adquira um pacote de horas adicionais.";
      } else if (msg.includes('429') || msg.includes('exhausted')) {
        msg = "O limite de processamento do provedor de IA foi atingido momentaneamente. Aguarde cerca de 60 segundos e clique em 'Tentar Novamente'.";
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <label className="block text-sm font-medium text-brand-text mb-1">Horário da Sessão</label>
            <input
              type="time"
              required
              value={sessionTime}
              onChange={e => handleSessionTimeChange(e.target.value)}
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
            <button
              type="button"
              onClick={async () => {
                if (await checkPlanActiveAndAlert("Comparação de Modelos Clínicos")) {
                  setIsTemplateHelpOpen(true);
                }
              }}
              className="mt-1.5 text-xs text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer p-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Não sabe qual escolher? Ver diferenças dos templates
            </button>
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
                  <div className="w-full rounded-2xl border border-brand-primary/20 bg-brand-surface p-3 text-left">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-brand-primary">
                      <span className="flex w-full items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${isPaused ? 'bg-yellow-500' : 'animate-pulse bg-red-500'}`} />{isPaused ? 'Gravação pausada' : 'Gravando agora'}</span>
                    </div>
                    <canvas ref={waveformCanvasRef} className="h-[72px] w-full rounded-xl" aria-label="Visualização do áudio capturado" />
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
                    <AudioPlaybackButton item={item} />
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
                  type="button"
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
                onClick={async () => {
                  const confirmed = await showConfirm("Deseja mesmo sair do assistente de configuração e continuar depois? Você poderá criar pacientes e evoluções normalmente no painel.", {
                    title: "Sair do Assistente",
                    confirmLabel: "Sair",
                    cancelLabel: "Continuar",
                    variant: "warning",
                    icon: "question"
                  });
                  if (confirmed) {
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
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-stone-900/60 p-4 transition-opacity sm:flex sm:items-center sm:justify-center">
          <div className="relative z-[91] mx-auto my-2 flex min-h-[70vh] max-h-[calc(100dvh-2rem)] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200 sm:my-0 sm:max-h-[85vh]">
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
            <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
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
                      type="button"
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
                    className="min-h-[40vh] w-full input-field resize-y rounded-xl border border-brand-border p-3 font-mono text-sm leading-relaxed outline-none focus:ring-1 focus:ring-brand-primary"
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
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-brand-border bg-stone-50 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-nowrap sm:space-x-3 sm:pb-4">
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

      <GoogleSecurityModal
        isOpen={isGoogleAccessNoticeOpen}
        onClose={() => setIsGoogleAccessNoticeOpen(false)}
        onConfirm={() => {
          setIsGoogleAccessNoticeOpen(false);
          void handleReauthenticate();
        }}
        confirmLabel={hasGoogleSession ? 'Renovar autenticação' : 'Conectar com Google'}
        mode="clinical"
        showCloseButton
      />

      <TemplateExplanationModal
        isOpen={isTemplateHelpOpen}
        onClose={() => setIsTemplateHelpOpen(false)}
      />
    </div>
  );
}
