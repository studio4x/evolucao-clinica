import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth, googleProvider, storage } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { Mic, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { appendToGoogleDoc } from '../services/googleDocs';

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

const clearSharedFile = (): Promise<void> => {
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

export default function ShareTarget() {
  const navigate = useNavigate();
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();
  
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'processing' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load patients
        const querySnapshot = await getDocs(collection(db, 'patients'));
        const patientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
      } catch (error) {
        console.error("Error loading shared file:", error);
        setStatus('error');
        setErrorMessage('Erro ao carregar o arquivo compartilhado.');
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    return () => {
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

  const handleProcess = async () => {
    if (!audioFile || !selectedPatientId) return;

    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient || !patient.google_doc_id) {
      setErrorMessage('Paciente selecionado não possui um Google Doc vinculado.');
      setStatus('error');
      return;
    }

    if (!googleAccessToken) {
      setErrorMessage('Autenticação do Google ausente ou expirada.');
      setStatus('error');
      return;
    }

    setStatus('processing');
    setErrorMessage('');

    const evolutionId = uuidv4();
    const storageRef = ref(storage, `evolutions/${selectedPatientId}/${evolutionId}.webm`);
    
    const evolutionData = {
      id: evolutionId,
      patient_id: selectedPatientId,
      session_date: sessionDate,
      audio_url: '',
      transcription_status: 'processing',
      transcription_text: '',
      google_doc_append_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Upload Audio
      console.log("Fazendo upload do áudio...");
      await uploadBytes(storageRef, audioFile);
      const downloadURL = await getDownloadURL(storageRef);
      evolutionData.audio_url = downloadURL;

      // Save initial state to Firestore
      await setDoc(doc(db, 'evolutions', evolutionId), evolutionData);

      // 2. Transcribe with Gemini
      console.log("Iniciando transcrição...");
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave da API Gemini não encontrada.");

      const ai = new GoogleGenAI({ apiKey });
      const base64Audio = await blobToBase64(audioFile);
      
      const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Audio, mimeType: audioFile.type || 'audio/webm' } }
          ]
        }
      });

      const transcription = geminiResponse.text;
      if (!transcription) throw new Error("A IA não retornou nenhuma transcrição.");

      // 3. Append to Google Docs
      console.log("Inserindo no Google Docs...");
      await appendToGoogleDoc(
        googleAccessToken,
        patient.google_doc_id,
        sessionDate,
        transcription
      );

      // 4. Update Firestore
      await setDoc(doc(db, 'evolutions', evolutionId), {
        ...evolutionData,
        transcription_status: 'completed',
        transcription_text: transcription,
        google_doc_append_status: 'completed',
        google_doc_append_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Clear the shared file
      await clearSharedFile();
      setStatus('success');

    } catch (error: any) {
      console.error("Processing error:", error);
      let msg = error.message || "Erro desconhecido";
      
      if (msg.includes('UNAUTHENTICATED') || msg.includes('401') || msg.includes('Invalid Credentials')) {
        msg = "Sua sessão do Google expirou. Por favor, renove a autenticação.";
        setGoogleAccessToken(null);
      }
      
      setErrorMessage(msg);
      setStatus('error');
      
      // Update Firestore with error
      if (evolutionData.audio_url) {
        await setDoc(doc(db, 'evolutions', evolutionId), {
          ...evolutionData,
          transcription_status: 'error',
          google_doc_append_status: 'error',
          error_message: msg,
          updated_at: new Date().toISOString()
        });
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
              <button
                onClick={() => navigate('/')}
                className="btn-primary"
              >
                Voltar ao Início
              </button>
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

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleProcess}
                  disabled={status === 'processing' || !selectedPatientId || !audioFile}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'processing' ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Processando...
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
    </div>
  );
}
