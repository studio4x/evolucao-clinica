import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { UserAvatar } from '../components/common/UserAvatar';
import { Mail, ShieldAlert, Loader2, CheckCircle, AlertCircle, Key, Briefcase, Sparkles, RefreshCcw, Trash2, AlertTriangle, Upload, Lock, Image, Download, Cloud, Database } from 'lucide-react';
import { clearOnboardingState, isOnboardingComplete } from '../utils/onboarding';
import { clearPendingGoogleScopes } from '../services/googleAuth';
import { showAlert, showConfirm } from '../store/modalStore';
import { 
  getBackupPreferences, 
  updateBackupPreferences, 
  generateBackupJson, 
  downloadBackupJsonLocal, 
  uploadBackupToGoogleDrive,
  getBackupsListFromDrive,
  restoreBackupFromDrive
} from '../services/backupService';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';

export default function Profile() {
  const navigate = useNavigate();
  const { user, googleAccessToken, setUser, setGoogleAccessToken, setGoogleGrantedScopes, setProfileInfo, profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professionalRegister, setProfessionalRegister] = useState('');

  // Lista pré-definida de rótulos profissionais / especialidades médicas e terapêuticas
  const professionalOptions = [
    "Psicólogo(a)",
    "Neuropsicólogo(a)",
    "Psicoterapeuta",
    "Psicanalista",
    "Psiquiatra",
    "Fonoaudiólogo(a)",
    "Terapeuta Ocupacional",
    "Fisioterapeuta",
    "Fisioterapeuta Neurofuncional",
    "Psicopedagogo(a)",
    "Neuropsicopedagogo(a)",
    "Nutricionista",
    "Enfermeiro(a)",
    "Médico(a) Generalista",
    "Médico(a) Pediatra",
    "Médico(a) Neurologista",
    "Médico(a) Neuropediatra",
    "Médico(a) Fisiatra",
    "Médico(a) Geriatra",
    "Médico(a) Ortopedista",
    "Médico(a) Cardiologista",
    "Médico(a) Dermatologista",
    "Médico(a) Ginecologista e Obstetra",
    "Dentista / Odontólogo(a)",
    "Assistente Social",
    "Musicoterapeuta",
    "Arteterapeuta",
    "Equoterapeuta",
    "Educador(a) Físico(a)",
    "Psicomotricista",
    "Veterinário(a)"
  ];

  const [selectValue, setSelectValue] = useState('');
  const [customValue, setCustomValue] = useState('');

  const handleSelectChange = (val: string) => {
    setSelectValue(val);
    if (val === 'Outro') {
      setProfessionalTitle(customValue);
    } else {
      setProfessionalTitle(val);
    }
  };

  const handleCustomValueChange = (val: string) => {
    setCustomValue(val);
    setProfessionalTitle(val);
  };

  // Mapeamento dos Conselhos de Classe do Brasil por Profissão
  const prefixMap: Record<string, string> = {
    "Psicólogo(a)": "CRP",
    "Neuropsicólogo(a)": "CRP",
    "Psicoterapeuta": "CRP",
    "Psicanalista": "Registro",
    "Psiquiatra": "CRM",
    "Fonoaudiólogo(a)": "CRFa",
    "Terapeuta Ocupacional": "CREFITO",
    "Fisioterapeuta": "CREFITO",
    "Fisioterapeuta Neurofuncional": "CREFITO",
    "Psicopedagogo(a)": "CBO",
    "Neuropsicopedagogo(a)": "CBO",
    "Nutricionista": "CRN",
    "Enfermeiro(a)": "COREN",
    "Médico(a) Generalista": "CRM",
    "Médico(a) Pediatra": "CRM",
    "Médico(a) Neurologista": "CRM",
    "Médico(a) Neuropediatra": "CRM",
    "Médico(a) Fisiatra": "CRM",
    "Médico(a) Geriatra": "CRM",
    "Médico(a) Ortopedista": "CRM",
    "Médico(a) Cardiologista": "CRM",
    "Médico(a) Dermatologista": "CRM",
    "Médico(a) Ginecologista e Obstetra": "CRM",
    "Dentista / Odontólogo(a)": "CRO",
    "Assistente Social": "CRESS",
    "Musicoterapeuta": "AMT",
    "Arteterapeuta": "AATER",
    "Equoterapeuta": "ANDE",
    "Educador(a) Físico(a)": "CREF",
    "Psicomotricista": "ABP",
    "Veterinário(a)": "CRMV"
  };

  const activePrefix = prefixMap[selectValue] || '';

  const parseRegister = (dbValue: string, prefix: string) => {
    if (!dbValue) return '';
    if (!prefix) return dbValue;
    
    const lowerDb = dbValue.toLowerCase().trim();
    const lowerPrefix = prefix.toLowerCase().trim();
    
    if (lowerDb.startsWith(lowerPrefix)) {
      return dbValue.substring(prefix.length).trim();
    }
    return dbValue;
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
    return user ? isOnboardingComplete(user.id) : false;
  });
  const [deleteStep, setDeleteStep] = useState<1 | 2 | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');

  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [dbSubscriptionPlan, setDbSubscriptionPlan] = useState<'trial' | 'monthly' | 'yearly' | 'none' | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [uploadingBackupDrive, setUploadingBackupDrive] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [loadingBackupsList, setLoadingBackupsList] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState<any | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      setLoading(true);
      setEmail(user.email || '');

      try {
        // Busca os dados da tabela professionals
        const { data, error } = await supabase
          .from('professionals')
          .select('full_name, professional_title, professional_register, onboarding_completed, custom_logo_url, subscription_plan, auto_backup_enabled, backup_frequency, last_backup_at')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data) {
          if (data.full_name) {
            const nameParts = data.full_name.trim().split(' ');
            setFirstName(nameParts[0] || '');
            setLastName(nameParts.slice(1).join(' ') || '');
          }
          const dbTitle = data.professional_title || 'Terapeuta';
          setProfessionalTitle(dbTitle);
          
          let initialSelect = 'Outro';
          let initialCustom = dbTitle;
          if (professionalOptions.includes(dbTitle)) {
            initialSelect = dbTitle;
            initialCustom = '';
          }
          setSelectValue(initialSelect);
          setCustomValue(initialCustom);

          const initialPrefix = prefixMap[initialSelect] || '';
          setProfessionalRegister(parseRegister(data.professional_register || '', initialPrefix));
          
          setOnboardingCompleted(data.onboarding_completed === true);
          setCustomLogoUrl(data.custom_logo_url || '');
          setDbSubscriptionPlan(data.subscription_plan || null);
          setAutoBackupEnabled(data.auto_backup_enabled || false);
          setBackupFrequency((data.backup_frequency as 'daily' | 'weekly' | 'monthly') || 'monthly');
          setLastBackupAt(data.last_backup_at || null);
        } else {
          // Fallback para metadados do auth
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
          const nameParts = fullName.trim().split(' ');
          setFirstName(nameParts[0] || '');
          setLastName(nameParts.slice(1).join(' ') || '');
          
          const metaTitle = user.user_metadata?.professional_title || 'Terapeuta';
          setProfessionalTitle(metaTitle);
          
          let initialSelect = 'Outro';
          let initialCustom = metaTitle;
          if (professionalOptions.includes(metaTitle)) {
            initialSelect = metaTitle;
            initialCustom = '';
          }
          setSelectValue(initialSelect);
          setCustomValue(initialCustom);

          const initialPrefix = prefixMap[initialSelect] || '';
          setProfessionalRegister(parseRegister(user.user_metadata?.professional_register || '', initialPrefix));
        }
      } catch (err: any) {
        console.error("Erro ao carregar perfil:", err);
        // Fallback silencioso usando metadados do auth
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const nameParts = fullName.trim().split(' ');
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.slice(1).join(' ') || '');
        
        const metaTitle = user.user_metadata?.professional_title || 'Terapeuta';
        setProfessionalTitle(metaTitle);
        
        let initialSelect = 'Outro';
        let initialCustom = metaTitle;
        if (professionalOptions.includes(metaTitle)) {
          initialSelect = metaTitle;
          initialCustom = '';
        }
        setSelectValue(initialSelect);
        setCustomValue(initialCustom);

        const initialPrefix = prefixMap[initialSelect] || '';
        setProfessionalRegister(parseRegister(user.user_metadata?.professional_register || '', initialPrefix));
        setOnboardingCompleted(isOnboardingComplete(user.id));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const loadGoogleBackups = async (token?: string) => {
    const activeToken = token || googleAccessToken;
    if (!activeToken || !isYearly) return;

    try {
      setLoadingBackupsList(true);
      const list = await getBackupsListFromDrive(activeToken);
      setBackupsList(list);
    } catch (err) {
      console.error('[Profile] Erro ao carregar backups do Drive:', err);
    } finally {
      setLoadingBackupsList(false);
    }
  };

  const isYearly = hasActiveYearlyAccess({
    profileRole,
    subscriptionPlan: dbSubscriptionPlan ?? subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt
  });

  useEffect(() => {
    if (googleAccessToken && isYearly) {
      loadGoogleBackups(googleAccessToken);
    }
  }, [googleAccessToken, isYearly]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSuccessMessage('');
    setErrorMessage('');

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const finalRegister = activePrefix 
      ? `${activePrefix} ${professionalRegister.trim()}`.trim()
      : professionalRegister.trim();

    try {
      // 1. Atualiza a tabela public.professionals
      const { error: dbError } = await supabase
        .from('professionals')
        .update({
          full_name: fullName,
          professional_title: professionalTitle.trim(),
          professional_register: finalRegister || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 2. Atualiza os metadados do Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          name: firstName.trim(),
          family_name: lastName.trim(),
          professional_title: professionalTitle.trim(),
          professional_register: finalRegister || null
        }
      });

      if (authError) throw authError;

      // 3. Atualiza o estado global no authStore com o usuário atualizado
      if (authData?.user) {
        setUser(authData.user);
      }

      setSuccessMessage('Perfil atualizado com sucesso!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      setErrorMessage(err.message || 'Ocorreu um erro ao atualizar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!isYearly) {
      await showAlert("A personalização do logotipo é uma funcionalidade exclusiva do Plano Anual.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      await showAlert("Por favor, envie uma imagem nos formatos PNG, JPG ou WEBP.", {
        title: "Formato Inválido",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      await showAlert("A imagem deve ter no máximo 2MB.", {
        title: "Arquivo Muito Grande",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    try {
      setUploadingLogo(true);
      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `custom_logos/${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('brand')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('brand')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      setCustomLogoUrl(publicUrl);

      const { error: dbError } = await supabase
        .from('professionals')
        .update({
          custom_logo_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setSuccessMessage('Logotipo personalizado atualizado com sucesso!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao fazer upload do logotipo:", err);
      await showAlert("Erro ao fazer upload: " + (err.message || err), {
        title: "Erro de Upload",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!user) return;
    try {
      setUploadingLogo(true);

      const { error: dbError } = await supabase
        .from('professionals')
        .update({
          custom_logo_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setCustomLogoUrl('');
      setSuccessMessage('Logotipo personalizado removido com sucesso!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao remover logotipo:", err);
      await showAlert("Erro ao remover logotipo: " + (err.message || err), {
        title: "Erro ao Remover",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleManualBackup = async () => {
    if (!user) return;
    if (!isYearly) {
      await showAlert("O backup em lote é uma funcionalidade exclusiva do Plano Anual.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    const confirmBackup = await showConfirm("Deseja gerar e baixar um arquivo de backup completo contendo os seus dados cadastrais, fichas de pacientes e prontuários?", {
      title: "Confirmar Backup",
      confirmLabel: "Gerar Backup",
      cancelLabel: "Cancelar",
      variant: "info",
      icon: "question"
    });
    if (!confirmBackup) return;

    try {
      setBackingUp(true);
      await downloadBackupJsonLocal(user.id, `${firstName} ${lastName}`);
      setSuccessMessage('Backup completo baixado com sucesso!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao gerar backup:", err);
      await showAlert("Erro ao gerar backup: " + (err.message || err), {
        title: "Erro de Backup",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!user) return;
    if (!isYearly) {
      await showAlert("O backup automático no Google Drive é uma funcionalidade exclusiva do Plano Anual.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    try {
      const newVal = !autoBackupEnabled;
      await updateBackupPreferences(user.id, newVal, backupFrequency);
      setAutoBackupEnabled(newVal);
      setSuccessMessage(newVal ? 'Backup automático ativado!' : 'Backup automático desativado!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao atualizar backup automático:", err);
      await showAlert("Erro ao salvar preferência de backup: " + (err.message || err), {
        title: "Erro ao Salvar",
        variant: "danger",
        icon: "warning"
      });
    }
  };

  const handleChangeBackupFrequency = async (freq: 'daily' | 'weekly' | 'monthly') => {
    if (!user) return;
    if (!isYearly) {
      await showAlert("O backup automático no Google Drive é uma funcionalidade exclusiva do Plano Anual ativo.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }
    try {
      await updateBackupPreferences(user.id, autoBackupEnabled, freq);
      setBackupFrequency(freq);
      setSuccessMessage(`Frequência de backup alterada para: ${freq === 'daily' ? 'Diário' : freq === 'weekly' ? 'Semanal' : 'Mensal'}`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao alterar frequência do backup:", err);
      await showAlert("Erro ao salvar frequência: " + (err.message || err), {
        title: "Erro ao Salvar",
        variant: "danger",
        icon: "warning"
      });
    }
  };

  const handleManualDriveBackup = async () => {
    if (!user) return;
    if (!isYearly) {
      await showAlert("O backup no Google Drive é uma funcionalidade exclusiva do Plano Anual ativo.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }
    if (!googleAccessToken) {
      await showAlert("Você precisa conectar sua conta do Google nas configurações antes de enviar para o Drive.", {
        title: "Conectar Google",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    const confirmBackup = await showConfirm("Deseja gerar e enviar uma cópia de segurança completa para a sua conta do Google Drive agora?", {
      title: "Backup no Google Drive",
      confirmLabel: "Gerar Backup",
      cancelLabel: "Cancelar",
      variant: "info",
      icon: "question"
    });
    if (!confirmBackup) return;

    try {
      setUploadingBackupDrive(true);
      const jsonString = await generateBackupJson(user.id);
      await uploadBackupToGoogleDrive(googleAccessToken, jsonString, `${firstName} ${lastName}`);
      
      const { error: tsError } = await supabase
        .from('professionals')
        .update({
          last_backup_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (tsError) throw tsError;
      setLastBackupAt(new Date().toISOString());
      
      setSuccessMessage('Cópia de segurança salva com sucesso no seu Google Drive!');
      setTimeout(() => setSuccessMessage(''), 4000);
      
      // Recarregar a lista
      await loadGoogleBackups();
    } catch (err: any) {
      console.error("Erro ao enviar backup para o Drive:", err);
      await showAlert("Erro ao enviar backup para o Drive: " + (err.message || err), {
        title: "Erro no Backup",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setUploadingBackupDrive(false);
    }
  };

  const handleRestoreBackup = async (backupFile: any) => {
    if (!user || !googleAccessToken) return;
    if (!isYearly) {
      await showAlert("A restauração de backups é uma funcionalidade exclusiva do Plano Anual ativo.", {
        title: "Funcionalidade Premium",
        variant: "warning",
        icon: "warning"
      });
      return;
    }
    
    try {
      setRestoringBackupId(backupFile.id);
      const result = await restoreBackupFromDrive(googleAccessToken, backupFile.id, user.id);
      
      await showAlert(`Restauração concluída com sucesso!\n\nDados importados/atualizados:\n- ${result.patientsCount} Pacientes\n- ${result.evolutionsCount} Evoluções Clínicas\n- ${result.reportsCount} Relatórios/PDIs`, {
        title: "Restauração Concluída",
        variant: "success",
        icon: "success"
      });
      
      setSuccessMessage('Dados restaurados com sucesso!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error("Erro ao restaurar backup:", err);
      await showAlert("Erro na restauração: " + (err.message || err), {
        title: "Erro de Restauração",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setRestoringBackupId(null);
      setShowRestoreConfirmModal(null);
    }
  };

  const handleRestartOnboarding = async () => {
    if (!user) return;

    const confirmed = await showConfirm(
      'Deseja reiniciar o onboarding? O fluxo será recomeçado do início e você poderá refazer a apresentação, criar um novo paciente e seguir todas as etapas novamente.',
      {
        title: "Reiniciar Apresentação",
        confirmLabel: "Reiniciar",
        cancelLabel: "Cancelar",
        variant: "warning",
        icon: "question"
      }
    );

    if (!confirmed) return;

    setResettingOnboarding(true);
    try {
      clearOnboardingState(user.id);
      
      const { error } = await supabase
        .from('professionals')
        .update({ onboarding_completed: false })
        .eq('id', user.id);

      if (error) {
        console.error('Erro ao resetar status de onboarding no banco:', error);
      }

      navigate('/onboarding', { replace: true });
    } catch (err) {
      console.error('Erro ao reiniciar onboarding:', err);
    } finally {
      setResettingOnboarding(false);
    }
  };

  const openDeleteAccountModal = () => {
    setDeleteStep(1);
    setDeleteConfirmationText('');
    setDeleteErrorMessage('');
  };

  const closeDeleteAccountModal = () => {
    if (deletingAccount) return;
    setDeleteStep(null);
    setDeleteConfirmationText('');
    setDeleteErrorMessage('');
  };

  const proceedToDeleteConfirmation = () => {
    setDeleteStep(2);
    setDeleteConfirmationText('');
    setDeleteErrorMessage('');
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    if (deleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR') {
      setDeleteErrorMessage('Digite EXCLUIR para confirmar.');
      return;
    }

    setDeletingAccount(true);
    setDeleteErrorMessage('');

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session?.access_token) {
        throw new Error('Sua sessão não está disponível. Faça login novamente e tente outra vez.');
      }

      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          googleAccessToken
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir a conta.');
      }

      if (user?.id) {
        clearOnboardingState(user.id);
      }
      setGoogleAccessToken(null);
      setGoogleGrantedScopes([]);
      setProfileInfo(null, null, null, null, null, null);
      clearPendingGoogleScopes();
      setUser(null);
      await supabase.auth.signOut().catch(() => {});
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Erro ao excluir conta:', err);
      setDeleteErrorMessage(err.message || 'Ocorreu um erro ao excluir a conta.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const displayName = `${firstName} ${lastName}`.trim() || user?.email?.split('@')[0] || 'Profissional';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 text-brand-primary animate-spin" />
        <span className="ml-2 text-brand-text-muted text-sm">Carregando dados do perfil...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="border-b border-brand-border/60 pb-5">
        <h1 className="text-3xl font-display font-bold text-brand-primary">Meu Perfil</h1>
        <p className="text-sm text-brand-text-muted mt-1">
          Gerencie suas informações pessoais e visualize seus detalhes de acesso.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Card Lateral do Avatar */}
        <div className="card p-6 bg-white flex flex-col items-center text-center space-y-4 shadow-sm border border-brand-border/60 self-start">
          <div className="relative">
            <UserAvatar
              name={displayName}
              email={user?.email}
              src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture || user?.user_metadata?.photo_url}
              className="h-24 w-24 border-2 border-brand-accent text-2xl font-display shadow-sm"
            />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-brand-text text-lg leading-tight truncate max-w-[220px]">
              {displayName}
            </h3>
            <p className="text-xs text-brand-text-muted font-medium bg-brand-primary/5 px-2 py-0.5 rounded-full inline-block border border-brand-primary/10">
              {professionalTitle || 'Terapeuta'}
            </p>
          </div>
          <div className="w-full border-t border-brand-border/40 pt-4 text-left space-y-2 text-xs text-brand-text-muted">
            <div className="flex items-center space-x-2">
              <Mail size={14} className="text-brand-primary" />
              <span className="truncate max-w-[200px]" title={email}>{email}</span>
            </div>
          </div>
        </div>

        {/* Card do Formulário */}
        <div className="card p-6 md:p-8 bg-white shadow-sm border border-brand-border/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-primary to-brand-accent" />
          
          <form onSubmit={handleSave} className="space-y-6">
            <h2 className="text-lg font-display font-semibold text-brand-primary border-b border-brand-border/40 pb-2">
              Informações Pessoais
            </h2>

            {successMessage && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-sm text-emerald-700 animate-fadeIn">
                <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                <span className="font-medium">{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center space-x-2 text-sm text-red-700 animate-fadeIn">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                  Nome
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field p-3"
                  placeholder="Seu primeiro nome"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                  Sobrenome
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field p-3"
                  placeholder="Seu sobrenome completo"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Rótulo Profissional
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted z-10" />
                <select
                  value={selectValue}
                  onChange={(e) => handleSelectChange(e.target.value)}
                  className="input-field pl-10 pr-10 py-3 appearance-none bg-white cursor-pointer"
                  disabled={saving}
                >
                  <option value="" disabled>Selecione sua profissão...</option>
                  {professionalOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="Outro">Outro...</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-brand-text-muted">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
              
              {selectValue === 'Outro' && (
                <div className="relative mt-2 animate-fadeIn">
                  <input
                    type="text"
                    required
                    value={customValue}
                    onChange={(e) => handleCustomValueChange(e.target.value)}
                    className="input-field p-3"
                    placeholder="Digite seu rótulo profissional personalizado"
                    disabled={saving}
                  />
                </div>
              )}
              <p className="text-[10px] text-brand-text-muted">
                Este rótulo será exibido no seu perfil, nos relatórios e define a especialidade usada pela IA.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Nº de Registro de Classe
              </label>
              {activePrefix ? (
                <div className="flex rounded-xl overflow-hidden border border-brand-border shadow-xs">
                  <span className="bg-brand-bg px-4 flex items-center justify-center text-xs font-bold text-[#105576] border-r border-brand-border select-none min-w-[70px]">
                    {activePrefix}
                  </span>
                  <input
                    type="text"
                    value={professionalRegister}
                    onChange={(e) => setProfessionalRegister(e.target.value)}
                    className="flex-1 p-3 text-sm text-brand-text bg-white outline-none border-none"
                    placeholder="Digite apenas o número (Ex: 06/12345 ou 123456/SP)"
                    disabled={saving}
                  />
                </div>
              ) : (
                <div className="relative">
                  <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                  <input
                    type="text"
                    value={professionalRegister}
                    onChange={(e) => setProfessionalRegister(e.target.value)}
                    className="input-field pl-10 pr-4 py-3"
                    placeholder="Ex: CREFITO-3 123456-F, CRP 06/12345"
                    disabled={saving}
                  />
                </div>
              )}
              <p className="text-[10px] text-brand-text-muted">
                Número do seu conselho de classe. Será exibido nos relatórios gerados pela IA.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                E-mail vinculado
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border text-sm bg-brand-bg/30 text-brand-text-muted cursor-not-allowed outline-none"
                />
              </div>
              <p className="text-[10px] text-brand-text-muted">
                O e-mail não pode ser alterado pois é a credencial de login oficial.
              </p>
            </div>

            {/* Logotipo Personalizado - Funcionalidade Anual */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
                <h2 className="text-lg font-display font-semibold text-brand-primary">
                  Logotipo Personalizado
                </h2>
                {!isYearly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm">
                    <Lock size={10} /> Plano Anual
                  </span>
                )}
              </div>

              {!isYearly ? (
                <div className="bg-gradient-to-br from-amber-50/40 to-orange-50/20 border border-amber-200/60 rounded-2xl p-5 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-lg">
                      <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-600" />
                        Timbre Exclusivo com Sua Marca
                      </h4>
                      <p className="text-xs text-amber-700/80 leading-relaxed">
                        Personalize os seus relatórios, planos de desenvolvimento (PDI) e evoluções clínicas impressas ou em PDF com o seu próprio logotipo ou o logotipo da sua clínica.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/painel/subscription')}
                      className="btn-primary py-2 px-4 text-xs font-semibold shrink-0 cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 shadow-md shadow-amber-500/10 active:scale-95 transition-all animate-none flex items-center justify-center"
                    >
                      Assinar Plano Anual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-brand-border rounded-2xl p-5 bg-white space-y-4">
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    Envie uma imagem com o seu logotipo profissional ou da sua clínica. Formatos aceitos: PNG, JPG ou WEBP (máx. 2MB). Este logotipo substituirá a marca padrão da plataforma no cabeçalho das evoluções e relatórios clínicos impressos e em PDF.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {customLogoUrl ? (
                      <div className="relative w-32 h-32 bg-stone-50 rounded-2xl border border-brand-border flex items-center justify-center p-2 group overflow-hidden">
                        <img src={customLogoUrl} alt="Logo Timbre" className="max-h-full max-w-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={uploadingLogo}
                            className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
                            title="Remover Logotipo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-32 h-32 bg-stone-50 rounded-2xl border border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 p-2">
                        <Image size={24} className="text-stone-300 mb-1" />
                        <span className="text-[10px] text-center font-medium">Sem logotipo</span>
                      </div>
                    )}

                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 rounded-xl bg-brand-primary text-white px-4 py-2.5 text-xs font-semibold hover:bg-brand-primary/95 transition-colors shadow-md shadow-brand-primary/10 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                          <Upload size={14} />
                          <span>{uploadingLogo ? 'Carregando...' : 'Enviar Logotipo'}</span>
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            onChange={handleLogoUpload}
                            disabled={uploadingLogo}
                            className="hidden"
                          />
                        </label>
                        {customLogoUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={uploadingLogo}
                            className="rounded-xl border border-red-200 text-red-600 bg-red-50/50 px-4 py-2.5 text-xs font-semibold hover:bg-red-100/70 transition-colors cursor-pointer"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-brand-text-muted">
                        Para melhor visualização no cabeçalho dos documentos, recomendamos imagens horizontais com fundo transparente ou branco.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Backup e Exportação de Dados - Funcionalidade Anual */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
                <h2 className="text-lg font-display font-semibold text-brand-primary">
                  Backup e Exportação de Dados
                </h2>
                {!isYearly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm">
                    <Lock size={10} /> Plano Anual
                  </span>
                )}
              </div>

              {!isYearly ? (
                <div className="bg-gradient-to-br from-amber-50/40 to-orange-50/20 border border-amber-200/60 rounded-2xl p-5 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-lg">
                      <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-600" />
                        Backup Completo e Restauração (Google Drive)
                      </h4>
                      <p className="text-xs text-amber-700/80 leading-relaxed">
                        Exporte as configurações da sua conta, a ficha de todos os seus pacientes e prontuários completos em um único arquivo de backup em nuvem, com restauração fácil em 1 clique e histórico de 3 versões.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/painel/subscription')}
                      className="btn-primary py-2 px-4 text-xs font-semibold shrink-0 cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0 shadow-md shadow-amber-500/10 active:scale-95 transition-all animate-none flex items-center justify-center"
                    >
                      Assinar Plano Anual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-brand-border rounded-2xl p-5 bg-white space-y-6">
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    Sua conta possui o sistema de backup seguro e soberania dos dados. Toda a sua configuração de conta, lista de pacientes, evoluções clínicas assinadas e relatórios de IA são compilados em um arquivo de segurança. Você pode restaurar qualquer backup anterior diretamente do seu Google Drive.
                  </p>

                  <div className="flex flex-col md:flex-row gap-5">
                    {/* Painel Esquerdo: Configurações de backup automático e manual */}
                    <div className="flex-1 border border-brand-border/60 rounded-2xl p-5 bg-brand-bg/10 space-y-5">
                      <div className="space-y-1.5 border-b border-brand-border/40 pb-3">
                        <h4 className="text-sm font-semibold text-brand-primary flex items-center gap-1.5">
                          <Cloud size={16} className="text-brand-primary/80" />
                          Sincronização no Google Drive
                        </h4>
                        <p className="text-xs text-brand-text-muted leading-relaxed">
                          Configure e controle os snapshots automáticos na sua conta pessoal.
                        </p>
                      </div>

                      {/* Toggle de ativação */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold text-brand-primary block">Backup Automático</span>
                          <span className="text-[10px] text-brand-text-muted block">Gera cópias periódicas na nuvem</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleAutoBackup}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoBackupEnabled ? 'bg-brand-primary' : 'bg-stone-200'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoBackupEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                        </button>
                      </div>

                      {/* Dropdown de Frequência */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-primary block">Frequência da Automação</label>
                        <select
                          value={backupFrequency}
                          onChange={(e) => handleChangeBackupFrequency(e.target.value as any)}
                          disabled={!autoBackupEnabled}
                          className="w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary/30 disabled:opacity-50 disabled:bg-stone-50 cursor-pointer font-medium"
                        >
                          <option value="daily">Diário (a cada 24 horas)</option>
                          <option value="weekly">Semanal (a cada 7 dias)</option>
                          <option value="monthly">Mensal (a cada 30 dias)</option>
                        </select>
                      </div>

                      {/* Botões de Ação Manuais */}
                      <div className="pt-2 space-y-2">
                        <button
                          type="button"
                          onClick={handleManualDriveBackup}
                          disabled={uploadingBackupDrive || !googleAccessToken}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary text-white px-4 py-2.5 text-xs font-semibold hover:bg-brand-primary/95 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-primary/10"
                        >
                          {uploadingBackupDrive ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Enviando para o Drive...</span>
                            </>
                          ) : (
                            <>
                              <Cloud size={14} />
                              <span>Salvar no Drive Agora</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleManualBackup}
                          disabled={backingUp}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/20 bg-white text-brand-primary px-4 py-2.5 text-xs font-semibold hover:bg-brand-primary/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {backingUp ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Exportando backup...</span>
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              <span>Baixar Backup Local</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="text-[10px] text-brand-text-muted pt-2 border-t border-brand-border/40 flex justify-between">
                        <span>Último backup realizado:</span>
                        <span className="font-semibold text-brand-primary">
                          {lastBackupAt ? new Date(lastBackupAt).toLocaleString('pt-BR') : 'Nunca realizado'}
                        </span>
                      </div>
                    </div>

                    {/* Painel Direito: Histórico de Versões e Ações de Restauração */}
                    <div className="flex-1 border border-brand-border/60 rounded-2xl p-5 bg-brand-bg/10 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5 border-b border-brand-border/40 pb-3 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-brand-primary flex items-center gap-1.5">
                            <Database size={16} className="text-brand-primary/80" />
                            Versões Anteriores (Drive)
                          </h4>
                          <p className="text-xs text-brand-text-muted leading-relaxed">
                            Restaurar dados salvos. Mantemos as 3 versões mais recentes.
                          </p>
                        </div>
                        {googleAccessToken && (
                          <button
                            type="button"
                            onClick={() => loadGoogleBackups()}
                            disabled={loadingBackupsList}
                            className="p-1.5 text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-colors cursor-pointer"
                            title="Atualizar lista de backups"
                          >
                            <RefreshCcw size={14} className={loadingBackupsList ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                        {!googleAccessToken ? (
                          <div className="text-center py-6 px-4 border border-dashed border-stone-300 rounded-2xl bg-white/50 space-y-2">
                            <ShieldAlert size={24} className="text-stone-400 mx-auto" />
                            <h5 className="text-xs font-semibold text-brand-primary">Google Drive Desconectado</h5>
                            <p className="text-[10px] text-brand-text-muted leading-relaxed max-w-[220px] mx-auto">
                              Conecte sua conta do Google na seção de integração acima para gerenciar os arquivos de backup.
                            </p>
                          </div>
                        ) : loadingBackupsList ? (
                          <div className="text-center py-10">
                            <Loader2 size={24} className="animate-spin text-brand-primary mx-auto mb-2" />
                            <span className="text-xs text-brand-text-muted font-medium">Buscando backups no seu Drive...</span>
                          </div>
                        ) : backupsList.length === 0 ? (
                          <div className="text-center py-8 px-4 border border-dashed border-stone-200 rounded-2xl bg-white/50 space-y-1">
                            <Database size={22} className="text-stone-400 mx-auto mb-1" />
                            <h5 className="text-xs font-semibold text-brand-primary">Nenhum backup encontrado</h5>
                            <p className="text-[10px] text-brand-text-muted leading-relaxed">
                              Realize o primeiro backup no Drive para exibir a lista de restauração.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {backupsList.slice(0, 3).map((backup, idx) => {
                              // Formatar nome do arquivo de backup
                              let displayName = backup.name;
                              const dateMatch = backup.name.match(/Backup_.*_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
                              if (dateMatch) {
                                const [_, datePart, h, m, s] = dateMatch;
                                const [y, mo, d] = datePart.split('-');
                                displayName = `Backup do dia ${d}/${mo}/${y} às ${h}:${m}:${s}`;
                              }
                              const sizeKB = backup.size ? `${(parseInt(backup.size) / 1024).toFixed(1)} KB` : 'Tamanho desconhecido';

                              return (
                                <div key={backup.id} className="bg-white border border-brand-border/60 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
                                  <div className="space-y-0.5 min-w-0">
                                    <span className="text-xs font-semibold text-brand-primary block truncate" title={backup.name}>
                                      {displayName}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-brand-text-muted">
                                      <span>Versão {idx + 1 === 1 ? 'mais recente' : `${idx + 1}ª anterior`}</span>
                                      <span>•</span>
                                      <span>{sizeKB}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setShowRestoreConfirmModal(backup)}
                                    disabled={restoringBackupId !== null}
                                    className="btn-outline h-7 px-2.5 text-[10px] font-semibold border-brand-primary/20 text-brand-primary hover:bg-brand-primary/5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                                  >
                                    {restoringBackupId === backup.id ? (
                                      <>
                                        <Loader2 size={10} className="animate-spin" />
                                        <span>Restaurando...</span>
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCcw size={10} />
                                        <span>Restaurar</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal de Confirmação de Restauração */}
            {showRestoreConfirmModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-brand-border overflow-hidden">
                  <div className="bg-gradient-to-r from-brand-primary to-brand-accent px-6 py-5 text-white">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-white/15 p-2.5">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Restaurar Prontuários</h3>
                        <p className="text-xs text-white/80">Confirmação de Importação de Backup</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <p className="text-xs text-brand-text leading-relaxed">
                      Você está prestes a restaurar os prontuários a partir do arquivo selecionado:
                    </p>
                    
                    <div className="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-3 text-xs text-brand-primary font-medium">
                      {showRestoreConfirmModal.name.match(/Backup_.*_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/) ? (() => {
                        const m = showRestoreConfirmModal.name.match(/Backup_.*_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
                        const [y, mo, d] = m[1].split('-');
                        return `Snapshot do dia ${d}/${mo}/${y} às ${m[2]}:${m[3]}:${m[4]}`;
                      })() : showRestoreConfirmModal.name}
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-xs text-amber-800 space-y-2 leading-relaxed">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertCircle size={14} className="text-amber-600" />
                        Informações Importantes:
                      </p>
                      <ul className="space-y-1 list-disc pl-4">
                        <li>A restauração é inteligente: ela <strong>mescla</strong> os dados do backup. Pacientes ou evoluções novas cadastradas após este backup <strong>não serão excluídos</strong>.</li>
                        <li>Os registros clínicos correspondentes que já existem serão atualizados para o estado em que estavam no backup.</li>
                      </ul>
                    </div>

                    <p className="text-[10px] text-brand-text-muted">
                      Esta operação é segura e utiliza atualizações idempotentes por UUID. Deseja prosseguir com a restauração?
                    </p>

                    <div className="flex justify-end gap-3 pt-2 border-t border-brand-border/40">
                      <button
                        type="button"
                        onClick={() => setShowRestoreConfirmModal(null)}
                        className="rounded-xl border border-brand-border px-4 py-2.5 text-xs font-semibold text-brand-text hover:bg-stone-50 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(showRestoreConfirmModal)}
                        className="rounded-xl bg-brand-primary text-white px-5 py-2.5 text-xs font-semibold hover:bg-brand-primary/95 transition-colors cursor-pointer shadow-md shadow-brand-primary/10"
                      >
                        Confirmar e Restaurar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Seção de Senha Explicativa */}
            <div className="space-y-3 pt-2">
              <h2 className="text-lg font-display font-semibold text-brand-primary border-b border-brand-border/40 pb-2">
                Configurações de Acesso
              </h2>
              
            <div className="bg-brand-bg/60 border border-brand-border rounded-2xl p-4 flex items-start space-x-3">
              <div className="p-2 bg-white rounded-xl border border-brand-border text-brand-primary flex-shrink-0">
                <Key size={18} />
              </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-brand-primary">Senha não necessária</h4>
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    Sua conta está vinculada ao <strong>Google Login</strong>. Não é necessária uma senha na nossa plataforma.
                    Para sua segurança, as credenciais e autenticação são gerenciadas diretamente pelo ecossistema do Google.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-brand-primary/5 to-brand-accent/10 border border-brand-primary/15 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-white rounded-xl border border-brand-primary/10 text-brand-primary flex-shrink-0 shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-brand-primary">Reiniciar onboarding</h4>
                    {onboardingCompleted !== null && (
                      onboardingCompleted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 select-none">
                          Concluído
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 select-none">
                          Pendente
                        </span>
                      )
                    )}
                  </div>
                  <p className="text-xs text-brand-text-muted leading-relaxed max-w-xl">
                    Use esta opção se quiser rever o fluxo inicial da plataforma, refazer a criação do primeiro paciente,
                    gerar uma evolução e repetir a etapa de sincronização da agenda.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRestartOnboarding}
                disabled={resettingOnboarding}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resettingOnboarding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reiniciando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" />
                    Reiniciar onboarding
                  </>
                )}
              </button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-white rounded-xl border border-red-200 text-red-600 flex-shrink-0 shadow-sm">
                  <Trash2 size={18} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-red-700">Excluir conta definitivamente</h4>
                  <p className="text-xs text-red-700/90 leading-relaxed max-w-xl">
                    Esta ação remove seu acesso ao aplicativo, revoga a vinculação com o Google quando possível e apaga
                    permanentemente os dados associados ao seu cadastro.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openDeleteAccountModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Excluir minha conta
              </button>
            </div>

            {/* Ações */}
            <div className="flex justify-end pt-4 border-t border-brand-border/40">
              <button
                type="submit"
                disabled={saving || !firstName.trim() || !lastName.trim()}
                className="btn-primary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {deleteStep && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-red-100 overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/15 p-2.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {deleteStep === 1 ? 'Excluir conta definitivamente' : 'Confirmação final'}
                  </h3>
                  <p className="text-sm text-white/85">
                    {deleteStep === 1
                      ? 'Leia com atenção antes de seguir.'
                      : 'Digite a palavra de confirmação para concluir.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {deleteStep === 1 ? (
                <>
                  <p className="text-sm text-brand-text leading-relaxed">
                    Ao continuar, você removerá permanentemente sua conta do app. Isso inclui o desligamento da sessão
                    atual, a desvinculação do Google quando a revogação for aceita e a exclusão dos dados associados ao
                    seu cadastro.
                  </p>

                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 space-y-2">
                    <p className="font-semibold">O que será perdido:</p>
                    <ul className="space-y-1.5 list-disc pl-5">
                      <li>Acesso ao painel, pacientes e evoluções.</li>
                      <li>Notificações, preferências e dados vinculados ao perfil.</li>
                      <li>Integração com o Google vinculada à conta.</li>
                    </ul>
                  </div>

                  {deleteErrorMessage && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {deleteErrorMessage}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-brand-text leading-relaxed">
                    Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo. Esta é a última etapa antes da
                    exclusão definitiva.
                  </p>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                      Digite EXCLUIR
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmationText}
                      onChange={(e) => {
                        setDeleteConfirmationText(e.target.value);
                        if (deleteErrorMessage) setDeleteErrorMessage('');
                      }}
                      className="input-field p-3"
                      placeholder="EXCLUIR"
                      disabled={deletingAccount}
                      autoComplete="off"
                    />
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    A ação não poderá ser desfeita depois da confirmação.
                  </div>

                  {deleteErrorMessage && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {deleteErrorMessage}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeDeleteAccountModal}
                  disabled={deletingAccount}
                  className="inline-flex items-center justify-center rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-text hover:bg-brand-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>

                {deleteStep === 1 ? (
                  <button
                    type="button"
                    onClick={proceedToDeleteConfirmation}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Entendi, continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmationText.trim().toUpperCase() !== 'EXCLUIR'}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deletingAccount ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Excluir definitivamente
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
