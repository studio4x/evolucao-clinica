import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth, apiKey, projectId, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { FileText, Link as LinkIcon, Plus, Loader2, FolderOpen, X, FolderPlus, ChevronRight, ChevronLeft, Home, Search, Folder } from 'lucide-react';
import { createGoogleDoc, createGoogleFolder, listGoogleFolders } from '../services/googleDocs';

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
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Custom Folder Explorer State
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerPath, setExplorerPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'Meu Drive'}]);
  const [explorerFolders, setExplorerFolders] = useState<any[]>([]);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    notes: '',
    status: 'active',
    google_doc_id: '',
    google_doc_name: '',
    google_doc_url: '',
    target_folder_id: localStorage.getItem('last_google_folder_id') || '',
    target_folder_name: localStorage.getItem('last_google_folder_name') || ''
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
      const newDoc = await createGoogleDoc(googleAccessToken, title, formData.target_folder_id);
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

  const loadExplorerFolders = async (parentId: string, tokenOverride?: string) => {
    const token = tokenOverride || googleAccessToken;
    if (!token) return;
    
    setIsLoadingExplorer(true);
    try {
      const files = await listGoogleFolders(token, parentId);
      setExplorerFolders(files.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    } catch (error: any) {
      console.error("Explorer load error:", error);
      if (error.message?.includes('401')) {
        setGoogleAccessToken(null);
        setShowExplorer(false);
      }
    } finally {
      setIsLoadingExplorer(false);
    }
  };

  useEffect(() => {
    if (showExplorer) {
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id);
    }
  }, [showExplorer, explorerPath]);

  const handleExplorerReauthenticate = async () => {
    setIsReauthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        // Recarregar pastas após re-autenticação usando o novo token imediatamente
        const current = explorerPath[explorerPath.length - 1];
        loadExplorerFolders(current.id, credential.accessToken);
      }
    } catch (error) {
      console.error("Reauth error:", error);
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateNewFolder = async () => {
    if (!googleAccessToken) return;
    
    // Pegar o local atual do explorador
    const currentFolder = explorerPath[explorerPath.length - 1];
    
    const folderName = prompt(`Criar nova pasta dentro de "${currentFolder.name}":`);
    if (!folderName) return;

    setIsCreatingFolder(true);
    try {
      const newFolder = await createGoogleFolder(googleAccessToken, folderName, currentFolder.id === 'root' ? undefined : currentFolder.id);
      
      // Refresh folders list
      await loadExplorerFolders(currentFolder.id);
      
      alert(`Pasta "${folderName}" criada com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao criar pasta:", error);
      alert("Erro ao criar pasta no Google Drive.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleNavigateDown = (folderId: string, folderName: string) => {
    setExplorerPath(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const handleNavigateUp = (index: number) => {
    setExplorerPath(prev => prev.slice(0, index + 1));
  };

  const handleSelectCurrentFolder = () => {
    const current = explorerPath[explorerPath.length - 1];
    if (current.id === 'root') {
      setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: 'Meu Drive (Principal)' }));
      localStorage.removeItem('last_google_folder_id');
      localStorage.removeItem('last_google_folder_name');
    } else {
      setFormData(prev => ({ ...prev, target_folder_id: current.id, target_folder_name: current.name }));
      localStorage.setItem('last_google_folder_id', current.id);
      localStorage.setItem('last_google_folder_name', current.name);
    }
    setShowExplorer(false);
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
                  <div className="col-span-1 md:col-span-2 space-y-2 mb-2">
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider">
                      Onde salvar o novo arquivo?
                    </label>
                    {formData.target_folder_id ? (
                      <div className="flex items-center justify-between p-3 bg-brand-bg border border-brand-border rounded-xl">
                        <div className="flex items-center space-x-2 text-sm text-brand-text">
                          <FolderOpen size={16} className="text-brand-primary" />
                          <span className="font-medium truncate max-w-[200px]">{formData.target_folder_name}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: '' }));
                            localStorage.removeItem('last_google_folder_id');
                            localStorage.removeItem('last_google_folder_name');
                          }}
                          className="text-brand-text-muted hover:text-red-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowExplorer(true)}
                        className="w-full flex items-center justify-center space-x-2 p-4 bg-white border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group"
                      >
                        <FolderOpen size={24} className="group-hover:scale-110 transition-transform" />
                        <div className="text-left">
                          <p className="font-bold">Selecionar ou Criar Pasta</p>
                          <p className="text-xs">Abra o explorador para escolher onde salvar.</p>
                        </div>
                      </button>
                    )}
                  </div>

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
              <span className="text-yellow-600">Sua sessão do Google expirou. Renove a autenticação para acessar o Drive.</span>
            ) : (
              formData.target_folder_id 
                ? `O novo prontuário será criado dentro da pasta "${formData.target_folder_name}".`
                : "Selecione uma pasta de destino para organizar seus prontuários."
            )}
          </p>
        </div>

        {/* Custom Folder Explorer Modal */}
        {showExplorer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[85vh] border border-brand-border animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/50">
                <div className="flex items-center space-x-2 text-brand-primary font-bold">
                  <FolderOpen size={20} />
                  <span>Explorador do Drive</span>
                </div>
                <button onClick={() => setShowExplorer(false)} className="p-1 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Breadcrumbs */}
              <div className="px-4 py-2 bg-white border-b border-brand-border flex items-center space-x-1 overflow-x-auto whitespace-nowrap text-sm scrollbar-hide">
                {explorerPath.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <ChevronRight size={14} className="text-brand-text-muted flex-shrink-0" />}
                    <button
                      onClick={() => handleNavigateUp(index)}
                      className={`hover:text-brand-primary transition-colors flex items-center space-x-1 ${index === explorerPath.length - 1 ? 'font-bold text-brand-text' : 'text-brand-text-muted'}`}
                    >
                      {index === 0 && <Home size={14} />}
                      <span>{item.name}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Toolbar */}
              <div className="p-3 bg-brand-bg/30 flex items-center justify-between border-b border-brand-border">
                <button
                  onClick={handleCreateNewFolder}
                  disabled={isCreatingFolder}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-brand-primary/20 rounded-xl text-brand-primary hover:bg-brand-primary/5 transition-all text-sm font-bold shadow-sm"
                >
                  {isCreatingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                  <span>Criar Pasta aqui</span>
                </button>
                <div className="text-xs text-brand-text-muted italic">
                  Navegue até a pasta desejada
                </div>
              </div>

              {/* Folder List */}
              <div className="flex-grow overflow-y-auto p-2">
                {isLoadingExplorer ? (
                  <div className="flex flex-col items-center justify-center h-64 text-brand-text-muted space-y-4">
                    <Loader2 size={40} className="animate-spin text-brand-primary" />
                    <p className="animate-pulse">Acessando pastas do Google...</p>
                  </div>
                ) : explorerFolders.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                    {explorerFolders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => handleNavigateDown(folder.id, folder.name)}
                        className="flex items-center space-x-3 p-4 bg-white border border-brand-border rounded-xl hover:border-brand-primary hover:bg-brand-primary/5 transition-all text-left group"
                      >
                        <div className="p-2 bg-brand-primary/10 rounded-lg group-hover:bg-brand-primary group-hover:text-white transition-colors">
                          <Folder size={20} className="text-brand-primary group-hover:text-white" />
                        </div>
                        <span className="font-medium text-brand-text truncate grow">{folder.name}</span>
                        <ChevronRight size={16} className="text-brand-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[300px] text-brand-text-muted space-y-4 px-8 text-center">
                    <Folder className="opacity-20" size={64} />
                    <div>
                      <p className="font-bold text-brand-text">Nenhuma subpasta encontrada</p>
                      <p className="text-sm mt-1">Crie uma nova ou selecione esta pasta atual.</p>
                    </div>
                    <div className="pt-4 border-t border-brand-border w-full">
                      <p className="text-xs mb-3">Não está vendo suas pastas do Drive?</p>
                      <button
                        onClick={handleExplorerReauthenticate}
                        className="btn-outline text-xs py-2"
                      >
                        {isReauthenticating ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
                        Renovar Acesso ao Drive
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-white border-t border-brand-border flex items-center justify-between">
                <button
                  onClick={() => setShowExplorer(false)}
                  className="btn-outline border-brand-border"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSelectCurrentFolder}
                  className="btn-primary min-w-[200px]"
                >
                  Selecionar esta pasta
                </button>
              </div>
            </div>
          </div>
        )}

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
