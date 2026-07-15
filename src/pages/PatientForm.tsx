import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { FileText, Link as LinkIcon, Plus, Loader2, FolderOpen, X, FolderPlus, ChevronRight, ChevronLeft, Home, Search, Folder, RefreshCw, Trash2, File, HelpCircle, ShieldCheck, Lock } from 'lucide-react';
import { createGoogleDoc, createGoogleFolder, listGoogleFiles, deleteGoogleFile } from '../services/googleDocs';
import { sendNotification } from '../services/notificationHelper';
import { setOnboardingState, completeOnboarding, getOnboardingState } from '../utils/onboarding';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import TemplateExplanationModal from '../components/common/TemplateExplanationModal';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const COUNTRIES = [
  { code: '+55', name: 'Brasil', flag: '🇧🇷' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+1', name: 'EUA/Canadá', flag: '🇺🇸' },
  { code: '+54', name: 'Argentina', flag: '🇦🇷' },
  { code: '+598', name: 'Uruguai', flag: '🇺🇾' },
  { code: '+595', name: 'Paraguai', flag: '🇵🇾' },
  { code: '+591', name: 'Bolívia', flag: '🇧🇴' },
  { code: '+56', name: 'Chile', flag: '🇨🇱' },
  { code: '+57', name: 'Colômbia', flag: '🇨🇴' },
  { code: '+34', name: 'Espanha', flag: '🇪🇸' },
  { code: '+39', name: 'Itália', flag: '🇮🇹' },
  { code: '+44', name: 'Reino Unido', flag: '🇬🇧' },
  { code: '+244', name: 'Angola', flag: '🇦🇴' },
  { code: '+258', name: 'Moçambique', flag: '🇲🇿' },
];

const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/\D/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength <= 2) {
    return phoneNumber;
  }
  if (phoneNumberLength <= 6) {
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2)}`;
  }
  if (phoneNumberLength <= 10) {
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 6)}-${phoneNumber.slice(6)}`;
  }
  return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 7)}-${phoneNumber.slice(7, 11)}`;
};

type PatientFormValues = {
  full_name: string;
  birth_date: string;
  phone: string;
  notes: string;
  status: 'active' | 'inactive';
  google_doc_id: string;
  google_doc_name: string;
  google_doc_url: string;
  target_folder_id: string;
  target_folder_name: string;
  evolution_reminder_active: boolean;
  session_days: number[];
  session_time: string;
  default_template_id: string;
};

type PatientFormDraft = {
  patientId?: string;
  formData: PatientFormValues;
  ddi: string;
  savedAt: string;
};

const PATIENT_FORM_DRAFT_PREFIX = 'evolucao-clinica:patient-form-draft';

const emptyPatientFormValues = (): PatientFormValues => ({
  full_name: '',
  birth_date: '',
  phone: '',
  notes: '',
  status: 'active',
  google_doc_id: '',
  google_doc_name: '',
  google_doc_url: '',
  target_folder_id: localStorage.getItem('last_google_folder_id') || '',
  target_folder_name: localStorage.getItem('last_google_folder_name') || '',
  evolution_reminder_active: false,
  session_days: [],
  session_time: '',
  default_template_id: '',
});

const getPatientFormDraftKey = (userId: string) => `${PATIENT_FORM_DRAFT_PREFIX}:${userId}:${window.location.pathname}`;

const readPatientFormDraft = (key: string): PatientFormDraft | null => {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as PatientFormDraft;
  } catch {
    return null;
  }
};

const writePatientFormDraft = (key: string, draft: PatientFormDraft) => {
  sessionStorage.setItem(key, JSON.stringify(draft));
};

const clearPatientFormDraft = (key: string) => {
  sessionStorage.removeItem(key);
};

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, googleAccessToken, googleGrantedScopes, setGoogleAccessToken } = useAuthStore();
  const onboardingState = getOnboardingState(user?.id);
  const isOnboardingMode = !id && (
    searchParams.get('onboarding') === '1'
    || onboardingState?.step === 'patient'
    || onboardingState?.step === 'evolution'
    || onboardingState?.step === 'agenda'
  );
  const hasGoogleSession = Boolean(googleAccessToken);
  const hasClinicalAccess = Boolean(googleAccessToken) && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);
  const restoredDraftUserRef = useRef<string | null>(null);
  const [ddi, setDdi] = useState('+55');
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isOnboardingGateModalOpen, setIsOnboardingGateModalOpen] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Custom Folder Explorer State
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerMode, setExplorerMode] = useState<'folder' | 'file'>('folder');
  const [explorerPath, setExplorerPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'Meu Drive'}]);
  const [explorerFolders, setExplorerFolders] = useState<any[]>([]);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);
  const [explorerSearch, setExplorerSearch] = useState('');

  // Vincular pasta pelo link
  const [showLinkFolder, setShowLinkFolder] = useState(false);
  const [linkFolderUrl, setLinkFolderUrl] = useState('');
  const [linkFolderName, setLinkFolderName] = useState('');
  const [showLinkFolderHelp, setShowLinkFolderHelp] = useState(false);
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateHelpOpen, setIsTemplateHelpOpen] = useState(false);
  const [formData, setFormData] = useState<PatientFormValues>(emptyPatientFormValues);
  const pendingPatientIdRef = useRef<string | null>(null);

  const getDraftPatientId = () => pendingPatientIdRef.current || id || undefined;

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('evolution_templates')
          .select('*')
          .order('name');
        if (!error && data) {
          setTemplates(data);
        }
      } catch (err) {
        console.error("Erro ao buscar templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (!user?.id || id) return;
    if (restoredDraftUserRef.current === user.id) return;

    const draft = readPatientFormDraft(getPatientFormDraftKey(user.id));
    restoredDraftUserRef.current = user.id;

    if (!draft) return;

    pendingPatientIdRef.current = draft.patientId || null;

    setFormData((prev) => ({
      ...prev,
      ...draft.formData,
    }));
    setDdi(draft.ddi || '+55');

    if (draft.formData.target_folder_id) {
      localStorage.setItem('last_google_folder_id', draft.formData.target_folder_id);
      localStorage.setItem('last_google_folder_name', draft.formData.target_folder_name || '');
    }
  }, [id, user?.id]);

  useEffect(() => {
    if (!user?.id || id) return;

    const timer = window.setTimeout(() => {
      writePatientFormDraft(getPatientFormDraftKey(user.id), {
        patientId: getDraftPatientId(),
        formData,
        ddi,
        savedAt: new Date().toISOString(),
      });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [ddi, formData, id, user?.id]);

  useEffect(() => {
    if (formData.target_folder_id) {
      localStorage.setItem('last_google_folder_id', formData.target_folder_id);
      localStorage.setItem('last_google_folder_name', formData.target_folder_name || '');
    } else {
      localStorage.removeItem('last_google_folder_id');
      localStorage.removeItem('last_google_folder_name');
    }
  }, [formData.target_folder_id, formData.target_folder_name]);

  useEffect(() => {
    if (id) {
      const fetchPatient = async () => {
        try {
          const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', id)
            .single();
          
          if (error) throw error;
          if (data) {
            let rawPhone = data.phone || '';
            let selectedDdi = '+55';
            let formattedPhone = '';

            if (rawPhone.startsWith('+')) {
              const matchedCountry = COUNTRIES.sort((a, b) => b.code.length - a.code.length).find(c => rawPhone.startsWith(c.code));
              if (matchedCountry) {
                selectedDdi = matchedCountry.code;
                rawPhone = rawPhone.substring(matchedCountry.code.length).trim();
              }
            } else if (rawPhone.startsWith('55') && rawPhone.length >= 10) {
              selectedDdi = '+55';
              rawPhone = rawPhone.substring(2).trim();
            }

            formattedPhone = formatPhoneNumber(rawPhone);

            setFormData({
              full_name: data.full_name || '',
              birth_date: data.birth_date || '',
              phone: formattedPhone,
              notes: data.notes || '',
              status: (data.status === 'inactive' ? 'inactive' : 'active'),
              google_doc_id: data.google_doc_id || '',
              google_doc_name: data.google_doc_name || '',
              google_doc_url: data.google_doc_url || '',
              target_folder_id: data.target_folder_id || '',
              target_folder_name: data.target_folder_name || '',
              evolution_reminder_active: data.evolution_reminder_active ?? false,
              session_days: data.session_days || [],
              session_time: data.session_time ? data.session_time.substring(0, 5) : '',
              default_template_id: data.default_template_id || ''
            });
            setDdi(selectedDdi);
          }
        } catch (error) {
          console.error("Error fetching patient:", error);
        }
      };
      fetchPatient();
    }
  }, [id]);

  useEffect(() => {
    if (isOnboardingMode && user?.id) {
      setOnboardingState(user.id, { step: 'patient' });
    }
  }, [isOnboardingMode, user?.id]);

  const handleReauthenticate = async () => {
    setIsSecurityModalOpen(true);
  };

  const executeGoogleReauthentication = async () => {
    setIsReauthenticating(true);
    try {
      if (user?.id && !id) {
        writePatientFormDraft(getPatientFormDraftKey(user.id), {
          patientId: getDraftPatientId(),
          formData,
          ddi,
          savedAt: new Date().toISOString(),
        });
      }

      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        loginHint: user?.email || undefined
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauthentication error:", error);
      alert("Erro ao renovar autenticação. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!hasClinicalAccess) {
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
      } else if (msg.includes('userRateLimitExceeded') || msg.includes('rateLimitExceeded') || msg.includes('quotaExceeded') || msg.includes('403')) {
        alert("O Google está limitando temporariamente a criação do documento. Tente novamente em alguns segundos.");
      } else {
        alert("Erro ao criar prontuário no Google Docs. Verifique sua conexão.");
      }
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleSendTestReminder = async () => {
    if (!formData.full_name) {
      alert('Por favor, preencha o nome do paciente para testar o lembrete.');
      return;
    }

    try {
      await sendNotification({
        title: `🔔 Lembrete de Evolução (Teste): ${formData.full_name}`,
        content: `Este é um lembrete de teste para o(a) paciente ${formData.full_name}. Quando ativo, você receberá notificações semelhantes após o horário de atendimento configurado nos dias selecionados.`,
        type: 'warning',
        link: id ? `/painel/patients/${id}` : '/painel/patients'
      });
      alert("Lembrete de teste enviado com sucesso! Verifique a página de notificações, e-mail ou push.");
    } catch (err: any) {
      console.error("Error sending test reminder:", err);
      alert("Erro ao enviar lembrete de teste: " + (err.message || err));
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
      if (user?.id && !id) {
        writePatientFormDraft(getPatientFormDraftKey(user.id), {
          patientId: getDraftPatientId(),
          formData,
          ddi,
          savedAt: new Date().toISOString(),
        });
      }

      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        loginHint: user?.email || undefined
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauth error:", error);
      alert("Erro ao reautenticar com o Google. Tente novamente.");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateNewFolder = async () => {
    if (!hasClinicalAccess) return;
    
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

  // Extrai o folderId de uma URL do Google Drive ou aceita o ID diretamente
  const parseFolderIdFromUrl = (input: string): string | null => {
    const trimmed = input.trim();
    // URL padrão: https://drive.google.com/drive/folders/{id}
    // URL com user: https://drive.google.com/drive/u/0/folders/{id}
    const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (urlMatch) return urlMatch[1];
    // ID direto (string alfanumérica de 10+ chars sem espaços)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleConfirmLinkFolder = () => {
    const folderId = parseFolderIdFromUrl(linkFolderUrl);
    if (!folderId) {
      alert('URL ou ID de pasta inválido. Copie a URL completa da pasta no Google Drive (ex: https://drive.google.com/drive/folders/...) e cole aqui.');
      return;
    }
    const name = linkFolderName.trim() || 'Pasta vinculada';
    setFormData(prev => ({ ...prev, target_folder_id: folderId, target_folder_name: name }));
    localStorage.setItem('last_google_folder_id', folderId);
    localStorage.setItem('last_google_folder_name', name);
    setShowLinkFolder(false);
    setLinkFolderUrl('');
    setLinkFolderName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    try {
      const patientId = id || pendingPatientIdRef.current || uuidv4();
      const existingPatientId = id || pendingPatientIdRef.current;
      
      const patientData: any = {
        id: patientId,
        professional_id: user.id,
        full_name: formData.full_name,
        birth_date: formData.birth_date || null,
        phone: formData.phone ? `${ddi} ${formData.phone}` : null,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString(),
        evolution_reminder_active: formData.evolution_reminder_active,
        session_days: formData.evolution_reminder_active ? formData.session_days : [],
        session_time: (formData.evolution_reminder_active && formData.session_time) ? formData.session_time : null,
        default_template_id: formData.default_template_id || null
      };

      // Só inclui campos do Google Drive se eles tiverem valor (ou envia null de forma explícita)
      patientData.google_doc_id = formData.google_doc_id || null;
      patientData.google_doc_name = formData.google_doc_name || null;
      patientData.google_doc_url = formData.google_doc_url || null;
      patientData.target_folder_id = formData.target_folder_id || null;
      patientData.target_folder_name = formData.target_folder_name || null;

      if (existingPatientId) {
        const { error } = await supabase
          .from('patients')
          .update(patientData)
          .eq('id', existingPatientId);
        if (error) throw error;
        void sendNotification({
          title: 'ℹ️ Dados do Paciente Atualizados',
          content: `As informações do paciente ${formData.full_name} foram atualizadas com sucesso.`,
          type: 'info',
          link: `/painel/patients/${existingPatientId}`
        });
      } else {
        patientData.created_at = new Date().toISOString();
        const { error } = await supabase
          .from('patients')
          .insert(patientData);
        if (error) throw error;
        void sendNotification({
          title: '✅ Paciente Cadastrado com Sucesso',
          content: `O paciente ${formData.full_name} foi registrado na plataforma e já está disponível no seu prontuário.`,
          type: 'success',
          link: `/painel/patients`
        });
      }

      if (isOnboardingMode) {
        pendingPatientIdRef.current = patientId;

        if (!googleAccessToken) {
          setOnboardingState(user.id, {
            step: 'patient',
            patientId,
            patientName: formData.full_name
          });
          if (!id) {
            writePatientFormDraft(getPatientFormDraftKey(user.id), {
              patientId,
              formData,
              ddi,
              savedAt: new Date().toISOString(),
            });
          }
          setIsOnboardingGateModalOpen(true);
          return;
        }

        if (!formData.google_doc_id) {
          setOnboardingState(user.id, {
            step: 'patient',
            patientId,
            patientName: formData.full_name
          });
          if (!id) {
            writePatientFormDraft(getPatientFormDraftKey(user.id), {
              patientId,
              formData,
              ddi,
              savedAt: new Date().toISOString(),
            });
          }
          alert('Antes de seguir para a evolução, crie ou vincule o prontuário do paciente no Google Docs.');
          return;
        }

        setOnboardingState(user.id, {
          step: 'evolution',
          patientId,
          patientName: formData.full_name
        });
        if (!id) {
          clearPatientFormDraft(getPatientFormDraftKey(user.id));
        }
        pendingPatientIdRef.current = null;
        navigate(`/painel/patients/${patientId}/evolutions/new?onboarding=1`);
      } else {
        if (!id) {
          clearPatientFormDraft(getPatientFormDraftKey(user.id));
        }
        pendingPatientIdRef.current = null;
        navigate('/painel/patients');
      }
    } catch (error: any) {
      console.error("Error saving patient:", error);
      alert("Erro ao salvar paciente: " + (error?.message || error));
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
          <label className="block text-sm font-medium text-brand-text mb-1">
            Data de Nascimento <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <input
            type="date"
            value={formData.birth_date}
            onChange={e => setFormData({...formData, birth_date: e.target.value})}
            className="input-field p-2"
            max={new Date().toISOString().split('T')[0]}
          />
          <p className="text-xs text-brand-text-muted mt-1">
            Usada para lembrar aniversários no painel principal.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Telefone / WhatsApp <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <div className="flex gap-2">
            <select
              value={ddi}
              onChange={e => setDdi(e.target.value)}
              className="input-field p-2 w-36 bg-white border border-brand-border rounded-xl text-sm outline-none cursor-pointer"
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code} ({c.name})
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="(99) 99999-9999"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: formatPhoneNumber(e.target.value)})}
              className="input-field p-2 flex-grow"
              maxLength={15}
            />
          </div>
          <p className="text-xs text-brand-text-muted mt-1">
            Usado para enviar mensagens rápidas de aniversário via WhatsApp.
          </p>
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
          <label className="block text-sm font-medium text-brand-text mb-1">Template de Evolução Padrão</label>
          <select
            value={formData.default_template_id}
            onChange={e => setFormData({...formData, default_template_id: e.target.value})}
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
            onClick={() => setIsTemplateHelpOpen(true)}
            className="mt-1.5 text-xs text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer p-0"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Não sabe qual escolher? Ver diferenças dos templates
          </button>
          <p className="text-xs text-brand-text-muted mt-1.5">
            Define o formato metodológico clínico padrão para as evoluções deste paciente (ex: SOAP, ABA, TCC).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Status</label>
          <select
            value={formData.status}
            onChange={e => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})}
            className="input-field p-2"
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>

        <div className="border-t border-brand-border pt-6 space-y-4">
          <h3 className="text-lg font-medium text-brand-text">Lembretes de Evolução</h3>
          
          <div className="space-y-4">
            <label className="flex items-center space-x-2 text-sm text-brand-text cursor-pointer">
              <input
                type="checkbox"
                checked={formData.evolution_reminder_active}
                onChange={e => setFormData({ ...formData, evolution_reminder_active: e.target.checked })}
                className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
              />
              <span className="font-medium">Ativar lembretes de evolução para este paciente</span>
            </label>

            {formData.evolution_reminder_active && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-2">Dias de Atendimento</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { val: 1, label: 'S' },
                      { val: 2, label: 'T' },
                      { val: 3, label: 'Q' },
                      { val: 4, label: 'Q' },
                      { val: 5, label: 'S' },
                      { val: 6, label: 'S' },
                      { val: 0, label: 'D' }
                    ].map((day, idx) => {
                      const isSelected = formData.session_days.includes(day.val);
                      const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                      return (
                        <button
                          key={idx}
                          type="button"
                          title={weekdayNames[day.val]}
                          onClick={() => {
                            const newDays = isSelected
                              ? formData.session_days.filter((d: number) => d !== day.val)
                              : [...formData.session_days, day.val].sort();
                            setFormData({ ...formData, session_days: newDays });
                          }}
                          className={`w-9 h-9 text-sm font-semibold rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? 'bg-brand-primary text-white shadow-sm border border-brand-primary'
                              : 'bg-brand-bg text-brand-text-muted hover:bg-brand-border border border-brand-border'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">Horário do Atendimento</label>
                  <input
                    type="time"
                    value={formData.session_time}
                    onChange={e => setFormData({ ...formData, session_time: e.target.value })}
                    className="input-field p-2"
                  />
                  <p className="text-xs text-brand-text-muted mt-1">
                    Você receberá lembretes nos dias selecionados após este horário para registrar as evoluções clínicas.
                  </p>
                </div>
              </div>
            )}

            {formData.evolution_reminder_active && (
              <div className="pt-2 border-t border-brand-border/50">
                <button
                  type="button"
                  onClick={handleSendTestReminder}
                  className="inline-flex items-center justify-center px-4 py-2 border border-brand-primary/30 text-brand-primary bg-white hover:bg-brand-primary/5 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer"
                >
                  <span>Enviar Lembrete de Teste</span>
                </button>
              </div>
            )}
          </div>
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
              {!hasClinicalAccess ? (
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
                    <p className="font-bold">
                      {hasGoogleSession ? 'Autorizar acesso ao Drive' : 'Conectar com o Google'}
                    </p>
                    <p className="text-xs">
                      {hasGoogleSession
                        ? 'Sua conta Google já está conectada. Clique para liberar o acesso ao Drive e criar o prontuário.'
                        : 'Clique aqui para conectar sua conta Google e liberar o acesso ao Drive.'}
                    </p>
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
                    ) : showLinkFolder ? (
                      <div className="space-y-3 p-4 bg-brand-bg border border-brand-border rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-brand-text">Vincular pasta pelo link do Drive</p>
                            <button
                              type="button"
                              onClick={() => setShowLinkFolderHelp(true)}
                              className="p-1 rounded-full text-brand-text-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                              title="Como obter o link da pasta?"
                            >
                              <HelpCircle size={15} />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setShowLinkFolder(false); setLinkFolderUrl(''); setLinkFolderName(''); }}
                            className="p-1 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-brand-text-muted"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-brand-text-muted mb-1">URL da pasta (copie do Google Drive)</label>
                          <input
                            type="text"
                            value={linkFolderUrl}
                            onChange={e => setLinkFolderUrl(e.target.value)}
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="w-full input-field text-sm p-2"
                            autoFocus
                          />
                          <p className="text-xs text-brand-text-muted mt-1">
                            Abra a pasta no Google Drive, copie a URL da barra de endereço e cole aqui.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-brand-text-muted mb-1">Nome da pasta (para identificação)</label>
                          <input
                            type="text"
                            value={linkFolderName}
                            onChange={e => setLinkFolderName(e.target.value)}
                            placeholder="Ex: Pacientes, Prontuários..."
                            className="w-full input-field text-sm p-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleConfirmLinkFolder}
                          disabled={!linkFolderUrl.trim()}
                          className="w-full btn-primary text-sm py-2 disabled:opacity-50"
                        >
                          Confirmar vínculo
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => openExplorer('folder')}
                          className="w-full flex items-center justify-center space-x-2 p-4 bg-white border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group"
                        >
                          <FolderOpen size={24} className="group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="font-bold">Selecionar ou Criar Pasta</p>
                            <p className="text-xs">Pastas criadas pelo app aparecem aqui.</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkFolder(true)}
                          className="w-full flex items-center justify-center space-x-2 p-3 bg-white border border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group text-sm"
                        >
                          <LinkIcon size={18} className="group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="font-semibold">Vincular pasta existente pelo link</p>
                            <p className="text-xs">Já tem uma pasta no Drive? Cole o link aqui.</p>
                          </div>
                        </button>
                      </div>
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
            ) : !hasClinicalAccess ? (
              <span className="text-yellow-600">
                {hasGoogleSession
                  ? 'Sua conta Google já está conectada, mas ainda falta autorizar o acesso ao Drive para criar o prontuário.'
                  : 'Conecte sua conta Google para acessar o Drive e criar o prontuário.'}
              </span>
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

              {/* Privacy Badge */}
              <div className="px-4 py-2.5 bg-brand-primary/5 border-b border-brand-border/60 flex items-center space-x-2 text-xs text-brand-primary">
                <ShieldCheck size={16} className="flex-shrink-0" />
                <span>
                  <strong>Privacidade garantida:</strong> O aplicativo só acessa pastas e prontuários criados por ele mesmo. Seus arquivos pessoais permanecem 100% seguros e inacessíveis.
                </span>
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
                  <div className="flex flex-col items-center justify-center min-h-[300px] text-brand-text-muted space-y-4 px-8 py-6 text-center">
                    <FolderOpen className="opacity-20 text-brand-primary" size={56} />
                    <div className="max-w-md space-y-1">
                      <p className="font-bold text-brand-text">Nenhuma subpasta encontrada</p>
                      <p className="text-sm leading-relaxed">
                        O explorador mostra apenas pastas criadas por este app. Crie uma nova pasta ou use a opção <strong>"Vincular pelo link"</strong> para conectar uma pasta já existente no seu Drive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowExplorer(false); setShowLinkFolder(true); }}
                      className="flex items-center space-x-2 px-4 py-2.5 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary hover:bg-brand-primary/20 transition-all text-sm font-semibold"
                    >
                      <LinkIcon size={16} />
                      <span>Vincular pasta existente pelo link</span>
                    </button>
                    <div className="pt-4 border-t border-brand-border w-full max-w-xs">
                      <p className="text-xs mb-2">Ou crie uma nova pasta neste local:</p>
                      <button
                        type="button"
                        onClick={handleExplorerReauthenticate}
                        className="btn-outline text-xs py-2 w-full justify-center"
                      >
                        {isReauthenticating ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
                        Sincronizar Google Drive
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

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-brand-border">
          {isOnboardingMode ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Deseja mesmo sair do assistente de configuração e continuar depois? Você poderá criar pacientes e evoluções normalmente no painel.")) {
                  if (user?.id) completeOnboarding(user.id);
                  if (user?.id && !id) {
                    clearPatientFormDraft(getPatientFormDraftKey(user.id));
                  }
                  navigate('/painel/dashboard');
                }
              }}
              className="text-xs font-semibold text-brand-text-muted hover:text-red-500 transition-colors py-2 px-3 hover:bg-red-50 rounded-xl"
            >
              Sair do onboarding e configurar depois
            </button>
          ) : (
            <div />
          )}
          <div className="flex space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => navigate(isOnboardingMode ? '/onboarding' : '/painel/patients')}
              className="btn-outline"
            >
              {isOnboardingMode ? 'Voltar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Salvando...' : 'Salvar Paciente'}
            </button>
          </div>
        </div>
      </form>

      <GoogleSecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onConfirm={executeGoogleReauthentication}
        confirmLabel="Autorizar acesso"
        mode="clinical"
      />

      <GoogleSecurityModal
        isOpen={isOnboardingGateModalOpen}
        onClose={() => setIsOnboardingGateModalOpen(false)}
        onConfirm={executeGoogleReauthentication}
        confirmLabel="Autorizar acesso ao Google"
        mode="onboarding"
        showCloseButton={false}
      />


      <TemplateExplanationModal
        isOpen={isTemplateHelpOpen}
        onClose={() => setIsTemplateHelpOpen(false)}
      />

      {/* Modal de ajuda: como obter o link da pasta no Google Drive */}
      {showLinkFolderHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-brand-border animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-brand-border flex items-center justify-between bg-brand-primary/5">
              <div className="flex items-center gap-2 text-brand-primary font-bold">
                <HelpCircle size={20} />
                <span>Como obter o link da pasta</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkFolderHelp(false)}
                className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-brand-text-muted"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Siga os passos abaixo para copiar o link da pasta existente no seu Google Drive:
              </p>

              <ol className="space-y-4">
                {[
                  {
                    step: 1,
                    title: 'Acesse o Google Drive',
                    desc: 'Abra o Google Drive no seu navegador (drive.google.com) e faça login com a conta Google vinculada ao app.',
                  },
                  {
                    step: 2,
                    title: 'Navegue até a pasta',
                    desc: 'Encontre a pasta que contém os prontuários do paciente. Clique nela para abri-la.',
                  },
                  {
                    step: 3,
                    title: 'Copie o link da barra de endereço',
                    desc: 'Com a pasta aberta, clique na barra de endereço do navegador, selecione tudo (Ctrl+A) e copie (Ctrl+C). O link terá o formato:',
                    extra: 'https://drive.google.com/drive/folders/...',
                  },
                  {
                    step: 4,
                    title: 'Cole aqui no app',
                    desc: 'Volte para este formulário, cole o link no campo "URL da pasta" e clique em Confirmar vínculo.',
                  },
                ].map(({ step, title, desc, extra }) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {step}
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-brand-text">{title}</p>
                      <p className="text-xs text-brand-text-muted leading-relaxed">{desc}</p>
                      {extra && (
                        <p className="text-xs font-mono bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1.5 text-brand-primary break-all">
                          {extra}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="pt-2 border-t border-brand-border">
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-semibold text-sm rounded-xl transition-colors"
                >
                  <FolderOpen size={16} />
                  Abrir Google Drive em nova aba
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowLinkFolderHelp(false)}
                className="w-full btn-primary py-2.5"
              >
                Entendi, vou copiar o link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
