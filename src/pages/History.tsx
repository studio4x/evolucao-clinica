import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth, googleProvider } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, AlertCircle, RefreshCw, Loader2, Trash2 } from 'lucide-react';

export default function History() {
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [patientsMap, setPatientsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'evolutions'),
        where('professional_id', '==', auth.currentUser.uid),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const evos = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      
      // Fetch patient details for each evolution
      const pMap: Record<string, any> = { ...patientsMap };
      const patientIds = [...new Set(evos.map(e => e.patient_id))];
      
      for (const pid of patientIds) {
        if (pMap[pid]) continue;
        const pSnap = await getDoc(doc(db, 'patients', pid));
        if (pSnap.exists()) {
          pMap[pid] = pSnap.data();
        }
      }
      
      setPatientsMap(pMap);
      setEvolutions(evos);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleReprocess = async (evo: any) => {
    if (!auth.currentUser) return;
    
    let currentToken = googleAccessToken;

    // 1. Check for Google Token
    if (!currentToken) {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          currentToken = credential.accessToken;
          setGoogleAccessToken(currentToken);
        } else {
          alert("Não foi possível obter o token do Google. Por favor, tente novamente.");
          return;
        }
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
        const response = await fetch('/api/process-evolution', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Erro ao processar evolução');
        }

        const result = await response.json();

        // Update Firestore with success
        await updateDoc(doc(db, 'evolutions', evo.id), {
          transcription_status: 'completed',
          transcription_text: result.transcription,
          google_doc_append_status: 'completed',
          google_doc_append_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString()
        });

        clearTimeout(timeoutId);
        await fetchHistory();
        alert("Evolução reprocessada com sucesso!");
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw error;
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
      await updateDoc(doc(db, 'evolutions', evo.id), {
        transcription_status: 'processing',
        google_doc_append_status: 'pending',
        updated_at: new Date().toISOString()
      });

      await attemptProcess();
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Reprocessing error:", error);
      
      let msg = error.message || "Erro desconhecido";
      if (error.name === 'AbortError') {
        msg = "O processamento demorou muito tempo e foi cancelado.";
      }
      
      await updateDoc(doc(db, 'evolutions', evo.id), {
        transcription_status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString()
      });
      await fetchHistory();
      alert(`Erro ao reprocessar: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleClearEvolutions = async () => {
    setIsClearing(true);
    try {
      for (const evo of evolutions) {
        await deleteDoc(doc(db, 'evolutions', evo.id));
      }
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
        <h1 className="text-2xl font-bold text-gray-900">Histórico de Evoluções</h1>
        {evolutions.length > 0 && (
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="text-red-600 hover:text-red-700 flex items-center space-x-1 text-sm font-medium"
          >
            <Trash2 size={18} />
            <span>Limpar Histórico</span>
          </button>
        )}
      </div>

      {showClearConfirm && (
        <div className="bg-red-50 border rounded-xl p-6 border-red-100">
          <p className="text-red-900 font-medium mb-2">Deseja limpar todo o seu histórico de evoluções?</p>
          <p className="text-sm text-red-700 mb-4">
            Esta ação removerá o histórico de <strong>todos os pacientes</strong> apenas aqui na plataforma. 
            O conteúdo já inserido no Google Docs <strong>NÃO</strong> será afetado.
          </p>
          <div className="flex space-x-3">
            <button 
              onClick={handleClearEvolutions}
              disabled={isClearing}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {isClearing && <Loader2 size={14} className="animate-spin" />}
              <span>Confirmar Limpeza</span>
            </button>
            <button 
              onClick={() => setShowClearConfirm(false)}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="divide-y">
          {evolutions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Nenhuma evolução registrada.
            </div>
          ) : (
            evolutions.map((evo) => {
              const patient = patientsMap[evo.patient_id];
              return (
                <div key={evo.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Clock size={16} className="text-gray-400" />
                        <span className="font-medium text-gray-900">{formatDateTime(evo.created_at)}</span>
                      </div>
                      <Link to={`/patients/${evo.patient_id}`} className="text-blue-600 hover:underline font-medium">
                        {patient?.full_name || 'Paciente Desconhecido'}
                      </Link>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        {evo.transcription_status === 'completed' ? (
                          <span className="flex items-center text-green-700 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
                            <CheckCircle size={16} className="mr-1" /> Sucesso
                          </span>
                        ) : evo.transcription_status === 'failed' ? (
                          <span className="flex items-center text-red-700 bg-red-100 px-3 py-1 rounded-full text-sm font-medium">
                            <AlertCircle size={16} className="mr-1" /> Falha
                          </span>
                        ) : (
                          <span className="flex items-center text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full text-sm font-medium">
                            <RefreshCw size={16} className="mr-1 animate-spin" /> Processando
                          </span>
                        )}
                      </div>
                      
                      {evo.transcription_status === 'failed' && evo.audio_url && (
                        <button 
                          onClick={() => handleReprocess(evo)}
                          disabled={processingId === evo.id}
                          className="flex items-center space-x-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {processingId === evo.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          <span>Reprocessar</span>
                        </button>
                      )}
                      
                      {evo.transcription_status === 'failed' && !evo.audio_url && (
                        <Link 
                          to={`/patients/${evo.patient_id}/evolutions/new`}
                          className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          Tentar Novamente
                        </Link>
                      )}
                    </div>
                  </div>
                  
                  {evo.error_message && (
                    <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-100">
                      <strong>Erro:</strong> {evo.error_message}
                    </div>
                  )}
                  
                  {evo.transcription_text && (
                    <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded border">
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
