import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth, apiKey, projectId, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { FileText, Link as LinkIcon, Plus, Loader2 } from 'lucide-react';
import { createGoogleDoc } from '../services/googleDocs';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { googleAccessToken, setGoogleAccessToken } = useAuthStore();
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    notes: '',
    status: 'active',
    google_doc_id: '',
    google_doc_name: '',
    google_doc_url: ''
  });

  useEffect(() => {
    if (id) {
      const fetchPatient = async () => {
        const docRef = doc(db, 'patients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            full_name: data.full_name || '',
            notes: data.notes || '',
            status: data.status || 'active',
            google_doc_id: data.google_doc_id || '',
            google_doc_name: data.google_doc_name || '',
            google_doc_url: data.google_doc_url || ''
          });
        }
      };
      fetchPatient();
    }
  }, [id]);

  const handleReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        alert("Autenticação renovada com sucesso! Você já pode criar o prontuário.");
      }
    } catch (error) {
      console.error("Reauthentication error:", error);
      alert("Erro ao renovar autenticação. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!googleAccessToken) {
      alert('Token do Google não encontrado. Por favor, renove sua autenticação.');
      return;
    }

    if (!formData.full_name) {
      alert('Por favor, preencha o nome do paciente antes de criar o prontuário.');
      return;
    }

    setCreatingDoc(true);
    try {
      const title = `Prontuário - ${formData.full_name}`;
      const newDoc = await createGoogleDoc(googleAccessToken, title);
      setFormData(prev => ({
        ...prev,
        google_doc_id: newDoc.id,
        google_doc_name: newDoc.name,
        google_doc_url: newDoc.url
      }));
    } catch (error: any) {
      console.error("Erro ao criar documento:", error);
      const msg = error.message || "";
      if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        alert("Sua sessão do Google expirou. Por favor, clique em 'Renovar Autenticação' abaixo para continuar.");
        setGoogleAccessToken(null);
      } else {
        alert("Erro ao criar prontuário no Google Docs. Verifique sua conexão.");
      }
    } finally {
      setCreatingDoc(false);
    }
  };

  const handlePicker = () => {
    if (!googleAccessToken) {
      alert('Token do Google não encontrado. Por favor, faça login novamente.');
      return;
    }

    try {
      if (!window.gapi) {
        alert('A API do Google ainda não foi carregada. Tente novamente em alguns segundos.');
        return;
      }

      // Load the Picker API
      window.gapi.load('picker', {
        callback: () => {
          try {
            if (!window.google || !window.google.picker) {
              alert('Erro ao inicializar o Google Picker.');
              return;
            }

            const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCUMENTS)
              .setMimeTypes('application/vnd.google-apps.document')
              .setIncludeFolders(true); // Permite navegar em pastas

            const pickerApiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || apiKey;

            const picker = new window.google.picker.PickerBuilder()
              .addView(view)
              .setOAuthToken(googleAccessToken)
              .setDeveloperKey(pickerApiKey)
              .setAppId(projectId)
              .enableFeature(window.google.picker.Feature.NAV_HIDDEN) // Design mais limpo
              .setCallback((data: any) => {
                if (data.action === window.google.picker.Action.PICKED) {
                  const doc = data.docs[0];
                  setFormData(prev => ({
                    ...prev,
                    google_doc_id: doc.id,
                    google_doc_name: doc.name,
                    google_doc_url: doc.url
                  }));
                }
              })
              .build();
            picker.setVisible(true);
          } catch (err) {
            console.error("Erro dentro do callback do picker:", err);
            alert("Ocorreu um erro ao abrir o seletor de arquivos.");
          }
        },
        onerror: () => {
          console.error("Erro ao carregar a API do picker");
          alert("Falha ao carregar a interface do Google Drive.");
        }
      });
    } catch (error) {
      console.error("Erro geral no handlePicker:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const patientId = id || uuidv4();
      const patientData = {
        id: patientId,
        professional_id: auth.currentUser.uid,
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (id) {
        await updateDoc(doc(db, 'patients', id), patientData);
      } else {
        await setDoc(doc(db, 'patients', patientId), {
          ...patientData,
          created_at: new Date().toISOString()
        });
      }
      navigate('/patients');
    } catch (error) {
      console.error("Error saving patient:", error);
      alert("Erro ao salvar paciente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-semibold text-brand-primary">
        {id ? 'Editar Paciente' : 'Novo Paciente'}
      </h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Nome Completo</label>
          <input
            type="text"
            required
            value={formData.full_name}
            onChange={e => setFormData({...formData, full_name: e.target.value})}
            className="input-field p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Observações</label>
          <textarea
            rows={4}
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
            className="input-field p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Status</label>
          <select
            value={formData.status}
            onChange={e => setFormData({...formData, status: e.target.value})}
            className="input-field p-2"
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>

        <div className="border-t border-brand-border pt-6">
          <h3 className="text-lg font-medium text-brand-text mb-4">Prontuário no Google Docs</h3>
          
          {formData.google_doc_id ? (
            <div className="flex items-center justify-between p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20">
              <div className="flex items-center space-x-3">
                <FileText className="text-brand-primary" />
                <div>
                  <p className="font-medium text-brand-text">{formData.google_doc_name}</p>
                  <a href={formData.google_doc_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center mt-1">
                    <LinkIcon size={14} className="mr-1" /> Abrir documento
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePicker}
                className="btn-outline px-3 py-1.5 text-xs"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!googleAccessToken ? (
                <button
                  type="button"
                  onClick={handleReauthenticate}
                  disabled={isReauthenticating}
                  className="col-span-1 md:col-span-2 flex items-center justify-center space-x-2 p-6 bg-yellow-50 border-2 border-yellow-200 border-dashed rounded-xl text-yellow-700 hover:bg-yellow-100 transition-colors"
                >
                  {isReauthenticating ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Plus size={24} />
                  )}
                  <div className="text-left">
                    <p className="font-bold">Sessão Google Expirada</p>
                    <p className="text-xs">Clique aqui para renovar o acesso e liberar o Drive.</p>
                  </div>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCreateDoc}
                    disabled={creatingDoc || !formData.full_name}
                    className="flex items-center justify-center space-x-2 p-4 border-2 border-brand-primary border-dashed rounded-xl text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-50"
                  >
                    {creatingDoc ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <Plus size={24} />
                    )}
                    <span className="font-medium">Criar novo prontuário</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePicker}
                    className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-brand-bg/50 hover:bg-brand-primary/5"
                  >
                    <FileText size={24} />
                    <span className="font-medium">Selecionar existente</span>
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-brand-text-muted mt-2">
            {!formData.full_name && !formData.google_doc_id ? (
              <span className="text-red-500">Preencha o nome do paciente para liberar a criação do prontuário.</span>
            ) : !googleAccessToken ? (
              <span className="text-yellow-600">É necessário renovar sua autenticação com o Google para gerenciar documentos.</span>
            ) : (
              "Selecione ou crie o documento onde as evoluções serão inseridas automaticamente."
            )}
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t border-brand-border">
          <button
            type="button"
            onClick={() => navigate('/patients')}
            className="btn-outline"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Salvando...' : 'Salvar Paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}
