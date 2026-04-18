import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth, googleProvider, storage } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { Mic, Square, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
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

export default function NewEvolution() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();
  
  const [patient, setPatient] = useState<any>(null);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isDiscardingRef = useRef(false);

  // Helper para salvar backup no IndexedDB
  const saveRecordingBackup = async (blobs: Blob[]) => {
    try {
      const mergedBlob = new Blob(blobs, { type: 'audio/webm' });
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('EvolutionBackupDB', 1);
        request.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('backups')) {
            db.createObjectStore('backups');
          }
        };
        request.onsuccess = (e: any) => resolve(e.target.result);
        request.onerror = () => reject(request.error);
      });

      const transaction = idb.transaction('backups', 'readwrite');
      const store = transaction.objectStore('backups');
      store.put(mergedBlob, 'current-recording');
    } catch (err) {
      console.warn("Falha ao salvar backup silencioso:", err);
    }
  };

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;
      const docSnap = await getDoc(doc(db, 'patients', id));
      if (docSnap.exists()) {
        setPatient(docSnap.data());
      }
    };
    fetchPatient();
  }, [id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        alert("Autenticação renovada com sucesso! Você já pode enviar a evolução.");
      }
    } catch (error) {
      console.error("Reauthentication error:", error);
      alert("Erro ao renovar autenticação. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const startRecording = async () => {
    try {
      isDiscardingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          // Salva backup a cada fatia de áudio recebida
          if (!isDiscardingRef.current) {
            saveRecordingBackup(chunksRef.current);
          }
        }
      };

      mediaRecorder.onstop = () => {
        if (chunksRef.current.length > 0 && !isDiscardingRef.current) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      // Inicia gravando e emitindo dados a cada 5 segundos para backup
      mediaRecorder.start(5000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
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
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const discardRecording = () => {
    if (window.confirm("Certeza que deseja descartar esta gravação? Toda a captura atual será perdida.")) {
      isDiscardingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Reset absoluto de estados
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      chunksRef.current = [];
      
      // Limpa backup do IDB
      indexedDB.deleteDatabase('EvolutionBackupDB');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Efeito para forçar o cálculo de duração em Blobs WebM (evita bug de tempo infinito/errado)
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration === Infinity) {
          audio.currentTime = 1e101;
          audio.ontimeupdate = function() {
            this.ontimeupdate = () => {};
            audio.currentTime = 0;
          };
        }
      });
    }
  }, [audioUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
      // Reset status if it was error or success
      if (status !== 'processing') setStatus('idle');
    }
  };

  const handleClearAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    if (status !== 'processing') setStatus('idle');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = async () => {
    if (!audioBlob || !patient || !auth.currentUser) return;
    
    if (!patient.google_doc_id) {
      alert("Este paciente não possui um prontuário vinculado. Por favor, edite o paciente e vincule um documento do Google Docs primeiro.");
      return;
    }

    if (!googleAccessToken) {
      alert("Token do Google expirado ou não encontrado. Por favor, faça login novamente.");
      return;
    }

    setStatus('processing');
    setErrorMessage('');

    const evolutionId = uuidv4();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    // 1. Prepare data
    const evolutionData = {
      id: evolutionId,
      professional_id: auth.currentUser.uid,
      patient_id: patient.id,
      session_date: sessionDate,
      transcription_status: 'processing',
      google_doc_append_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('googleAccessToken', googleAccessToken);
    formData.append('googleDocId', patient.google_doc_id);
    formData.append('patientName', patient.full_name);
    formData.append('sessionDate', sessionDate);

    // Vercel Hobby tier limit is 4.5MB for request body
    if (audioBlob.size > 4.4 * 1024 * 1024) {
      const msg = "O arquivo de áudio é muito grande para o plano gratuito da Vercel (limite de 4.5MB). Tente gravar um áudio mais curto ou reduzir a qualidade.";
      setErrorMessage(msg);
      setStatus('error');
      return;
    }

    const maxRetries = 3;
    let retryCount = 0;

    const attemptProcess = async () => {
      try {
        // 1. Transcribe with Gemini (Frontend)
        setStatus('processing');
        console.log(`Iniciando transcrição (Tentativa ${retryCount + 1})...`);
        
        // Lógica de Contingência (Fallback)
        const mainKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        const backupKey = (process as any).env?.GEMINI_API_KEY_REAL || import.meta.env.VITE_GEMINI_API_KEY_REAL;
        
        // Se já falhou uma vez e temos a chave real, usamos ela
        const apiKey = (retryCount > 0 && backupKey) ? backupKey : (mainKey || backupKey);

        if (!apiKey) {
          throw new Error("Chave da API Gemini não encontrada no ambiente.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const base64Audio = await blobToBase64(audioBlob);
        
        const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-2.0-flash",
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
          googleAccessToken,
          patient.google_doc_id,
          sessionDate,
          transcription
        );

        // 3. Update Firestore with success
        await setDoc(doc(db, 'evolutions', evolutionId), {
          ...evolutionData,
          transcription_status: 'completed',
          transcription_text: transcription,
          google_doc_append_status: 'completed',
          google_doc_append_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        setStatus('success');
        clearTimeout(timeoutId);
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          const abortError = new Error("O processamento demorou muito tempo ou foi cancelado pelo navegador.");
          abortError.name = 'AbortError';
          throw abortError;
        }

        const isQuotaError = error.message?.includes('429') || error.message?.includes('exhausted');

        if (retryCount < maxRetries && (error.message === 'Failed to fetch' || error.message?.includes('network') || isQuotaError)) {
          retryCount++;
          // Aumenta drasticamente o delay para erros de cota (mínimo 15 segundos)
          const delay = isQuotaError ? 15000 * retryCount : 2000 * retryCount;
          console.log(`Retrying process-evolution... Attempt ${retryCount} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return attemptProcess();
        }
        throw error;
      }
    };

    try {
      // 1. Save initial state to Firestore
      await setDoc(doc(db, 'evolutions', evolutionId), evolutionData);

      // 2. Send to Backend
      await attemptProcess();
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Processing error:", error);
      
      let msg = error.message || "Erro desconhecido";
      if (error.name === 'AbortError') {
        msg = "O processamento demorou muito tempo (mais de 5 minutos) e foi cancelado. Tente com um áudio mais curto ou verifique sua conexão.";
      } else if (msg === 'Failed to fetch') {
        msg = "Não foi possível conectar ao servidor. Verifique sua conexão com a internet ou tente novamente em instantes.";
      } else if (msg.includes('429') || msg.includes('exhausted')) {
        msg = "O limite de processamento gratuito da Google (Gemini) foi atingido. Aguarde cerca de 60 segundos e clique em 'Tentar Novamente'.";
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        msg = "Sua sessão do Google expirou. Por favor, renove a autenticação clicando no botão abaixo.";
        setGoogleAccessToken(null);
      }
      
      setErrorMessage(msg);
      setStatus('error');
      
      // Update Firestore with error
      await setDoc(doc(db, 'evolutions', evolutionId), {
        transcription_status: 'failed',
        google_doc_append_status: 'failed',
        error_message: error.message || "Erro desconhecido",
        updated_at: new Date().toISOString()
      }, { merge: true });
    }
  };

  if (!patient) return <div>Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold text-brand-primary">Nova Evolução</h1>
        <span className="text-sm font-medium text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
          {patient.full_name}
        </span>
      </div>

      <div className="card p-6 space-y-6">
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
                    onClick={startRecording}
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
              <p className="text-sm text-brand-text-muted">Ou envie um arquivo de áudio do seu dispositivo</p>
              <label className="btn-outline cursor-pointer">
                <span>Escolher Arquivo</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {audioUrl && !isRecording && (
            <div className="mt-6 p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-brand-primary">Áudio selecionado:</p>
                <button
                  onClick={handleClearAudio}
                  className="flex items-center space-x-1 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Excluir Áudio</span>
                </button>
              </div>
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
        </div>

        {/* Status and Submit */}
        <div className="border-t border-brand-border pt-6">
          {!googleAccessToken ? (
            <div className="flex flex-col items-center justify-center p-6 bg-yellow-50 rounded-xl border border-yellow-100 space-y-3">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
              <p className="text-yellow-900 font-medium text-center">
                Seu token de acesso ao Google expirou ou não foi encontrado.
              </p>
              <button
                onClick={handleReauthenticate}
                disabled={isReauthenticating}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-xl hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                {isReauthenticating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>Renovar Autenticação</span>
              </button>
            </div>
          ) : status === 'idle' && (
            <button
              onClick={handleSubmit}
              disabled={!audioBlob}
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
                A IA está transcrevendo o áudio e inserindo no prontuário do paciente. Isso pode levar alguns segundos.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center justify-center p-6 bg-brand-accent/10 rounded-xl border border-brand-accent/20 space-y-3">
              <CheckCircle className="w-10 h-10 text-brand-primary" />
              <p className="text-brand-primary font-medium text-lg">Evolução registrada com sucesso!</p>
              <p className="text-sm text-brand-text-muted text-center">
                A transcrição foi adicionada ao final do documento Google Docs do paciente.
              </p>
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={() => navigate(`/patients/${id}`)}
                  className="btn-outline"
                >
                  Voltar ao Paciente
                </button>
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioUrl(null);
                    setStatus('idle');
                  }}
                  className="btn-primary"
                >
                  Nova Gravação
                </button>
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
        </div>
      </div>
    </div>
  );
}
