import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth, googleProvider } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { FileText, Plus, ExternalLink, Clock, RefreshCw, Loader2, Trash2 } from 'lucide-react';

export default function PatientDetail() {
  const { id } = useParams();
  const [patient, setPatient] = useState<any>(null);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();

  const fetchData = async () => {
    if (!id || !auth.currentUser) return;
    try {
      const docRef = doc(db, 'patients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPatient({ id: docSnap.id, ...docSnap.data() });
      }

      const q = query(
        collection(db, 'evolutions'),
        where('patient_id', '==', id),
        where('professional_id', '==', auth.currentUser?.uid),
        orderBy('created_at', 'desc')
      );
      const evosSnap = await getDocs(q);
      setEvolutions(evosSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching patient details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

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

    if (!patient || !patient.google_doc_id) {
      alert("Prontuário não encontrado.");
      return;
    }

    setProcessingId(evo.id);

    try {
      // Update status to processing
      await updateDoc(doc(db, 'evolutions', evo.id), {
        transcription_status: 'processing',
        google_doc_append_status: 'pending',
        updated_at: new Date().toISOString()
      });

      // Call backend
      const formData = new FormData();
      formData.append('audioUrl', evo.audio_url);
      formData.append('googleAccessToken', currentToken!);
      formData.append('googleDocId', patient.google_doc_id);
      formData.append('patientName', patient.full_name);
      formData.append('sessionDate', evo.session_date);

      const response = await fetch('/api/process-evolution', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao processar evolução');
      }

      // Update Firestore with success
      await updateDoc(doc(db, 'evolutions', evo.id), {
        transcription_status: 'completed',
        transcription_text: result.transcription,
        google_doc_append_status: 'completed',
        google_doc_append_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString()
      });

      // Refresh data
      await fetchData();
      alert("Evolução reprocessada com sucesso!");
    } catch (error: any) {
      console.error("Reprocessing error:", error);
      await updateDoc(doc(db, 'evolutions', evo.id), {
        transcription_status: 'failed',
        error_message: error.message || "Erro desconhecido",
        updated_at: new Date().toISOString()
      });
      await fetchData();
      alert(`Erro ao reprocessar: ${error.message}`);
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

  if (loading) return <div>Carregando...</div>;
  if (!patient) return <div>Paciente não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{patient.full_name}</h1>
          <div className="flex items-center space-x-2 mt-2">
            <span className={`px-2 py-1 text-xs rounded-full ${patient.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {patient.status === 'active' ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
        <div className="flex space-x-3">
          <Link 
            to={`/patients/${id}/edit`}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Editar
          </Link>
          <Link 
            to={`/patients/${id}/evolutions/new`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nova Evolução</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="font-semibold text-gray-900 mb-4">Prontuário Vinculado</h3>
            {patient.google_doc_id ? (
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <FileText className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <p className="text-sm font-medium text-gray-900 break-words">{patient.google_doc_name}</p>
                </div>
                <a 
                  href={patient.google_doc_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <ExternalLink size={16} />
                  <span>Abrir no Google Docs</span>
                </a>
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">
                Nenhum documento vinculado. <Link to={`/patients/${id}/edit`} className="text-blue-600 hover:underline">Vincular agora</Link>.
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="font-semibold text-gray-900 mb-2">Observações</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {patient.notes || 'Nenhuma observação registrada.'}
            </p>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Histórico de Evoluções</h2>
              {evolutions.length > 0 && (
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="text-red-600 hover:text-red-700 flex items-center space-x-1 text-sm font-medium"
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

            <div className="divide-y">
              {evolutions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhuma evolução registrada para este paciente.
                </div>
              ) : (
                evolutions.map((evo) => (
                  <div key={evo.id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <Clock size={16} className="text-gray-400" />
                        <span className="font-medium text-gray-900">{formatDateTime(evo.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {evo.transcription_status === 'failed' && evo.audio_url && (
                          <button 
                            onClick={() => handleReprocess(evo)}
                            disabled={processingId === evo.id}
                            className="flex items-center space-x-1 text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700 disabled:opacity-50 mr-2"
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
                          evo.transcription_status === 'completed' ? 'bg-green-100 text-green-700' : 
                          evo.transcription_status === 'failed' ? 'bg-red-100 text-red-700' : 
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {evo.transcription_status === 'completed' ? 'Concluído' : 
                           evo.transcription_status === 'failed' ? 'Falha' : 'Processando'}
                        </span>
                      </div>
                    </div>
                    {evo.transcription_text && (
                      <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded border">
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
    </div>
  );
}
