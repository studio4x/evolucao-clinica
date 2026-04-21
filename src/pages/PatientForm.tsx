import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth, apiKey, projectId, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { FileText, Link as LinkIcon, Plus, Loader2, FolderOpen, X, FolderPlus, ChevronRight, ChevronLeft, Home, Search, Folder, RefreshCw, Trash2, File } from 'lucide-react';
import { createGoogleDoc, createGoogleFolder, listGoogleFiles, deleteGoogleFile } from '../services/googleDocs';

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
  const [explorerMode, setExplorerMode] = useState<'folder' | 'file'>('folder');
  const [explorerPath, setExplorerPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'Meu Drive'}]);
  const [explorerFolders, setExplorerFolders] = useState<any[]>([]);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  
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

  const loadExplorerFolders = async (parentId: string, tokenOverride?: string, searchTerm: string = '', isGlobal: boolean = false) => {
    const token = tokenOverride || googleAccessToken;
    if (!token) return;
    
    setIsLoadingExplorer(true);
    try {
      const files = await listGoogleFiles(token, parentId, searchTerm, isGlobal);
      // Ordenar: pastas primeiro, depois arquivos
      const sorted = files.sort((a: any, b: any) => {
        if (a.mimeType === b.mimeType) return a.name.localeCompare(b.name);
        return a.mimeType === 'application/vnd.google-apps.folder' ? -1 : 1;
      });
      setExplorerFolders(sorted);
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

  // Debounced Search Effect
  useEffect(() => {
    if (!showExplorer) return;
    
    const timer = setTimeout(() => {
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id, undefined, explorerSearch, isGlobalSearch);
    }, 500);

    return () => clearTimeout(timer);
  }, [explorerSearch, isGlobalSearch, showExplorer]);

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
      
      // Entrar automaticamente na pasta criada para facilitar a navegação
      handleNavigateDown(newFolder.id, newFolder.name);
      
      alert(`Pasta "${folderName}" criada com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao criar pasta:", error);
      alert("Erro ao criar pasta no Google Drive.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string, folderName: string) => {
    e.stopPropagation(); // Não navegar para a pasta ao clicar no lixo
    
    if (!confirm(`Tem certeza que deseja excluir a pasta "${folderName}" permanentemente do Google Drive?`)) return;

    try {
      await deleteGoogleFile(googleAccessToken!, folderId);
      
      // Se a pasta excluída era a selecionada, limpa
      if (formData.target_folder_id === folderId) {
        setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: '' }));
        localStorage.removeItem('last_google_folder_id');
        localStorage.removeItem('last_google_folder_name');
      }

      // Refresh list
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id);
      
      alert(`Pasta "${folderName}" excluída com sucesso.`);
    } catch (error) {
      console.error("Delete error:", error);
      alert("Erro ao excluir pasta.");
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

  const handleSelectItem = (item: any) => {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      handleNavigateDown(item.id, item.name);
    } else if (explorerMode === 'file') {
      // É um arquivo e estamos em modo de seleção de arquivo
      setFormData(prev => ({
        ...prev,
        google_doc_id: item.id,
        google_doc_name: item.name,
        google_doc_url: `https://docs.google.com/document/d/${item.id}/edit`
      }));
      setShowExplorer(false);
    }
  };

  const openExplorer = (mode: 'folder' | 'file') => {
    setExplorerMode(mode);
    setShowExplorer(true);
  };

  const handlePicker = () => {
    openExplorer('file');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const patientId = id || uuidv4();
      
      // Sanitizar dados para o Firestore: enviar apenas campos permitidos pelas regras de segurança
      const patientData: any = {
        id: patientId,
        professional_id: auth.currentUser.uid,
        full_name: formData.full_name,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString()
      };

      // Só inclui campos do Google Drive se eles tiverem valor (para não quebrar regras de validação de string)
      if (formData.google_doc_id) {
        patientData.google_doc_id = formData.google_doc_id;
        patientData.google_doc_name = formData.google_doc_name;
        patientData.google_doc_url = formData.google_doc_url;
      }
      if (formData.target_folder_id) {
        patientData.target_folder_id = formData.target_folder_id;
        patientData.target_folder_name = formData.target_folder_name;
      }

      if (id) {
        await updateDoc(doc(db, 'patients', id), patientData);
      } else {
        patientData.created_at = new Date().toISOString();
        await setDoc(doc(db, 'patients', patientId), patientData);
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
                        onClick={() => openExplorer('folder')}
                        className="w-full flex items-center justify-center space-x-2 p-4 bg-white border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group"
                      >
                        <FolderOpen size={24} className="group-hover:scale-110 transition-transform" />
                        <div className="text-left">
                          <p className="font-bold">Selecionar ou Criar Pasta</p>
                          <p className="text-xs">Escolha onde o novo arquivo será salvo.</p>
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
                  <span>{explorerMode === 'folder' ? 'Selecionar Pasta de Destino' : 'Selecionar Prontuário Existente'}</span>
                </div>
                <button type="button" onClick={() => setShowExplorer(false)} className="p-1 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Breadcrumbs */}
              <div className="px-4 py-2 bg-white border-b border-brand-border flex items-center space-x-1 overflow-x-auto whitespace-nowrap text-sm scrollbar-hide">
                {explorerPath.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <ChevronRight size={14} className="text-brand-text-muted flex-shrink-0" />}
                    <button
                      type="button"
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
              <div className="p-3 bg-brand-bg/30 flex flex-col space-y-3 border-b border-brand-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreateNewFolder}
                      disabled={isCreatingFolder}
                      className="flex items-center space-x-2 px-4 py-2 bg-white border border-brand-primary/20 rounded-xl text-brand-primary hover:bg-brand-primary/5 transition-all text-sm font-bold shadow-sm"
                    >
                      {isCreatingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                      <span className="hidden sm:inline">Criar Pasta</span>
                      <span className="sm:hidden">Criar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = explorerPath[explorerPath.length - 1];
                        loadExplorerFolders(current.id, undefined, explorerSearch, isGlobalSearch);
                      }}
                      disabled={isLoadingExplorer}
                      className="p-2 bg-white border border-brand-border rounded-xl text-brand-text-muted hover:text-brand-primary transition-all shadow-sm"
                      title="Atualizar lista"
                    >
                      <RefreshCw size={18} className={isLoadingExplorer ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isGlobalSearch}
                        onChange={(e) => setIsGlobalSearch(e.target.checked)}
                        className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                      />
                      <span className="text-xs text-brand-text-muted">Busca Global</span>
                    </label>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={18} />
                  <input
                    type="text"
                    value={explorerSearch}
                    onChange={(e) => setExplorerSearch(e.target.value)}
                    placeholder={isGlobalSearch ? "Pesquisar em todo o Drive..." : "Pesquisar nesta pasta..."}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-brand-border rounded-xl focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none text-sm transition-all shadow-inner"
                  />
                  {explorerSearch && (
                    <button
                      type="button"
                      onClick={() => setExplorerSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary"
                    >
                      <X size={16} />
                    </button>
                  )}
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
                    {explorerFolders.map(item => {
                      const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                      const isSelectableFile = explorerMode === 'file' && item.mimeType === 'application/vnd.google-apps.document';
                      
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          className={`flex items-center space-x-3 p-4 bg-white border rounded-xl transition-all text-left group relative
                            ${isFolder ? 'border-brand-border hover:border-brand-primary hover:bg-brand-primary/5' : ''}
                            ${isSelectableFile ? 'border-brand-primary/30 hover:border-brand-primary hover:bg-brand-primary/5 shadow-sm' : 'border-dashed border-brand-border/40 opacity-70'}
                          `}
                          disabled={!isFolder && !isSelectableFile}
                        >
                          <div className={`p-2 rounded-lg transition-colors
                            ${isFolder ? 'bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-white' : 'bg-brand-bg text-brand-text-muted group-hover:bg-brand-primary group-hover:text-white'}
                          `}>
                            {isFolder ? <Folder size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="grow truncate">
                            <p className={`font-medium truncate ${isFolder ? 'text-brand-text' : 'text-brand-text-muted group-hover:text-brand-text'}`}>
                              {item.name}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider text-brand-text-muted mt-0.5">
                              {isFolder ? 'Pasta' : 'Documento'}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteFolder(e, item.id, item.name)}
                              className="p-2 text-brand-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                            {isFolder && <ChevronRight size={16} className="text-brand-text-muted group-hover:translate-x-1 transition-transform" />}
                          </div>
                        </button>
                      );
                    })}
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
                        type="button"
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
                  type="button"
                  onClick={() => setShowExplorer(false)}
                  className="btn-outline border-brand-border"
                >
                  Cancelar
                </button>
                  <button
                    type="button"
                    onClick={handleSelectCurrentFolder}
                    disabled={explorerMode !== 'folder'}
                    className={`btn-primary min-w-[200px] ${explorerMode !== 'folder' ? 'opacity-0 pointer-events-none' : ''}`}
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
