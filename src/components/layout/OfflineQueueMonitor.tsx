import React, { useState, useEffect } from 'react';
import { getPendingEvolutions, removePendingEvolution, PendingEvolution } from '../../services/offlineQueue';
import { transcribeAudio } from '../../services/aiTranscription';
import { appendToGoogleDoc } from '../../services/googleDocs';
import { getPendingEvolutionAudioBlobs } from '../../services/evolutionAudio';
import { supabase } from '../../supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { CloudOff, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

export function OfflineQueueMonitor() {
  const [queue, setQueue] = useState<PendingEvolution[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();

  const loadQueue = async () => {
    if (isSyncing) return;
    try {
      const items = await getPendingEvolutions();
      setQueue(items);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000); // Poll de 5s para refletir adições em outras telas
    
    const onOnline = () => {
      setIsOnline(true);
      loadQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isSyncing]);

  useEffect(() => {
    // Sincronização automática
    if (isOnline && queue.length > 0 && !isSyncing && !hasError && googleAccessToken) {
      handleSync();
    }
  }, [isOnline, queue.length, isSyncing, hasError, googleAccessToken]);

  if (queue.length === 0) return null;

  const handleSync = async () => {
    if (!navigator.onLine) {
      alert("Você ainda está sem conexão com a internet.");
      return;
    }
    if (!googleAccessToken) {
      alert("Seu Google Token expirou/não encontrado. Use o aplicativo estando logado para sincronizar.");
      return;
    }

    setIsSyncing(true);
    setHasError(false);
    setSyncStatus('Iniciando sincronização...');

    let itemsLeft = [...queue];

    for (const item of queue) {
      try {
        const audioBlobs = getPendingEvolutionAudioBlobs(item);
        if (audioBlobs.length === 0) {
          throw new Error('Nenhum áudio encontrado para sincronizar.');
        }

        setSyncStatus(
          audioBlobs.length > 1
            ? `Processando ${item.patientName}... (IA ${audioBlobs.length} áudios)`
            : `Processando ${item.patientName}... (IA)`
        );
        
        const transcriptions: string[] = [];

        for (let index = 0; index < audioBlobs.length; index += 1) {
          const blob = audioBlobs[index];
          // WhatsApp PWA costuma vir genérico, previne IA de errar
          let mime = blob.type || item.mimeType;
          if (!mime || mime === 'application/octet-stream') mime = 'audio/ogg';

          setSyncStatus(
            audioBlobs.length > 1
              ? `Processando ${item.patientName}... (IA ${index + 1}/${audioBlobs.length})`
              : `Processando ${item.patientName}... (IA)`
          );

          const transcription = await transcribeAudio({
            audioBlob: blob,
            mimeType: mime,
            onRetry: (attempt) => setSyncStatus(`Processando ${item.patientName}... (IA Tentativa ${attempt})`)
          });

          if (!transcription) throw new Error("A IA retornou um texto vazio.");
          transcriptions.push(transcription.trim());
        }

        const mergedTranscription = transcriptions.join('\n\n');

        setSyncStatus(`Inserindo ${item.patientName} no Google Docs...`);
        await appendToGoogleDoc(googleAccessToken, item.googleDocId, item.sessionDate, mergedTranscription);

        setSyncStatus(`Salvando ${item.patientName}...`);
        const { error: upsertError } = await supabase
          .from('evolutions')
          .upsert({
            ...item.evolutionData,
            transcription_status: 'completed',
            transcription_text: mergedTranscription,
            google_doc_append_status: 'completed',
            google_doc_append_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (upsertError) throw upsertError;

        // Removendo da fila
        await removePendingEvolution(item.id);
        itemsLeft = itemsLeft.filter(q => q.id !== item.id);
        setQueue(itemsLeft);

      } catch (err: any) {
        console.error("Sync error para", item.id, err);
        setHasError(true);
        let msg = err.message || "Erro desconhecido";
        
        if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Credentials')) {
          msg = "Sessão do Google expirada =(. A fila pausou. Entre na página de Nova Evolução para Renovar Autenticação.";
          setGoogleAccessToken(null); // Apaga o token inválido para forçar login
        }
        
        setSyncStatus(`Erro em ${item.patientName}: ${msg}`);
        setIsSyncing(false);
        return; // Interrompe para o usuário tratar o erro ou reiniciar
      }
    }

    setSyncStatus('Sincronização 100% concluída!');
    setTimeout(() => {
      setIsSyncing(false);
      loadQueue();
    }, 3000);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-4 z-[60] text-white overflow-hidden animate-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {isSyncing ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : hasError ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : (
            <CloudOff className="w-5 h-5 text-yellow-400" />
          )}
          <span className="font-semibold text-sm">
            {isSyncing ? 'Sincronizando Fila...' : `${queue.length} Evoluções Offline`}
          </span>
        </div>
      </div>
      
      <p className="text-xs text-slate-300 mb-4 h-8 flex items-center leading-relaxed">
        {syncStatus || (hasError ? 'Falha na sincronização. Tente novamente.' : 'Estes áudios estão seguros no seu aparelho. O envio será automático assim que encontrar internet.')}
      </p>

      {!isSyncing && queue.length > 0 && (
        <button
          onClick={handleSync}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2 px-4 transition-colors font-medium text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sincronizar Agora</span>
        </button>
      )}
    </div>
  );
}
