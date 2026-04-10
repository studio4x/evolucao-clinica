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
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

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

    const maxRetries = 2;
    let retryCount = 0;

    const attemptProcess = async () => {
      try {
        // 1. Transcribe with Gemini (Frontend)
        setStatus('processing');
        console.log("Iniciando transcrição no frontend...");
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("Chave da API Gemini não encontrada no ambiente.");
        }

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

        console.log("Transcrição concluída. Enviando para o backend...");

        // 2. Send transcription to backend for Google Docs insertion
        const response = await fetch('/api/process-evolution', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            googleAccessToken,
            googleDocId: patient.google_doc_id,
            patientName: patient.full_name,
            sessionDate,
            transcription
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          let errorMsg = 'Erro ao inserir no Google Docs';
          try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const result = await response.json();
              errorMsg = result.error || errorMsg;
            } else {
              const text = await response.text();
              console.error("Server returned non-JSON error:", text);
              errorMsg = `Erro do servidor (${response.status}): ${text.substring(0, 100)}...`;
            }
          } catch (e) {
            errorMsg = `Erro do servidor (${response.status})`;
          }
          throw new Error(errorMsg);
        }

        const result = await response.json();

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
        <h1 className="text-2xl font-bold text-gray-900">Nova Evolução</h1>
        <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {patient.full_name}
        </span>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data da Sessão</label>
          <input
            type="date"
            required
            value={sessionDate}
            onChange={e => setSessionDate(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="border-t pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-4">Áudio da Evolução</label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Record Audio */}
            <div className="border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 bg-gray-50">
              {isRecording ? (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                    <Mic className="text-red-600 w-8 h-8" />
                  </div>
                  <div className="text-2xl font-mono text-gray-900">{formatTime(recordingTime)}</div>
                  <button
                    onClick={stopRecording}
                    className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                  >
                    <Square size={16} />
                    <span>Parar Gravação</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Mic className="text-blue-600 w-8 h-8" />
                  </div>
                  <p className="text-sm text-gray-600">Grave o áudio diretamente pelo navegador</p>
                  <button
                    onClick={startRecording}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Iniciar Gravação
                  </button>
                </>
              )}
            </div>

            {/* Upload Audio */}
            <div className="border rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 bg-gray-50">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                <Upload className="text-gray-600 w-8 h-8" />
              </div>
              <p className="text-sm text-gray-600">Ou envie um arquivo de áudio do seu dispositivo</p>
              <label className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
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
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-900">Áudio selecionado:</p>
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
        <div className="border-t pt-6">
          {!googleAccessToken ? (
            <div className="flex flex-col items-center justify-center p-6 bg-yellow-50 rounded-lg border border-yellow-100 space-y-3">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
              <p className="text-yellow-900 font-medium text-center">
                Seu token de acesso ao Google expirou ou não foi encontrado.
              </p>
              <button
                onClick={handleReauthenticate}
                disabled={isReauthenticating}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
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
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Enviar para Processamento
            </button>
          )}

          {status === 'processing' && (
            <div className="flex flex-col items-center justify-center p-6 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-blue-900 font-medium">Processando evolução...</p>
              <p className="text-sm text-blue-700 text-center">
                A IA está transcrevendo o áudio e inserindo no prontuário do paciente. Isso pode levar alguns segundos.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center justify-center p-6 bg-green-50 rounded-lg border border-green-100 space-y-3">
              <CheckCircle className="w-10 h-10 text-green-600" />
              <p className="text-green-900 font-medium text-lg">Evolução registrada com sucesso!</p>
              <p className="text-sm text-green-700 text-center">
                A transcrição foi adicionada ao final do documento Google Docs do paciente.
              </p>
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={() => navigate(`/patients/${id}`)}
                  className="px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-100"
                >
                  Voltar ao Paciente
                </button>
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioUrl(null);
                    setStatus('idle');
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Nova Gravação
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center p-6 bg-red-50 rounded-lg border border-red-100 space-y-3">
              <AlertCircle className="w-10 h-10 text-red-600" />
              <p className="text-red-900 font-medium text-lg">Falha no processamento</p>
              <p className="text-sm text-red-700 text-center">{errorMessage}</p>
              <button
                onClick={handleSubmit}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
