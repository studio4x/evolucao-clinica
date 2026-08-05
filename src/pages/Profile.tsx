import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { UserAvatar } from '../components/common/UserAvatar';
import { Mail, ShieldAlert, Loader2, CheckCircle, AlertCircle, Key, Briefcase, Sparkles, RefreshCcw, Trash2, AlertTriangle } from 'lucide-react';
import { clearOnboardingState, isOnboardingComplete } from '../utils/onboarding';
import { clearPendingGoogleScopes } from '../services/googleAuth';
import { showConfirm } from '../store/modalStore';

export default function Profile() {
  const navigate = useNavigate();
  const { user, googleAccessToken, setUser, setGoogleAccessToken, setGoogleGrantedScopes, setProfileInfo } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professionalRegister, setProfessionalRegister] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  const WHATSAPP_OPT_IN_TEXT = 'Quero receber pelo WhatsApp notificações operacionais relacionadas à minha conta e ao uso do Evolução Clínica. Posso cancelar essa autorização a qualquer momento.';
  const WHATSAPP_OPT_IN_TEXT_VERSION = 'v1';

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

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      setLoading(true);
      setEmail(user.email || '');

      try {
        // Busca os dados da tabela professionals
        const { data, error } = await supabase
          .from('professionals')
          .select('full_name, professional_title, professional_register, onboarding_completed')
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
          // Carregar whatsapp_number de communication_preferences
          try {
            const { data: sessionPrefs } = await supabase.auth.getSession();
            const prefToken = sessionPrefs.session?.access_token;
            if (prefToken) {
              const prefsRes = await fetch('/api/communication/preferences', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${prefToken}` }
              });
              if (prefsRes.ok) {
                const prefsData = await prefsRes.json();
                setWhatsappNumber(prefsData.preferences?.whatsapp_number || '');
                setWhatsappOptIn(prefsData.preferences?.whatsapp_opt_in === true);
              }
            }
          } catch (prefErr) {
            console.warn('[Profile] Erro ao carregar preferências de comunicação:', prefErr);
          }
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

      // 4. Atualiza whatsapp_number em communication_preferences e sincroniza com Brevo
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const syncToken = sessionData.session?.access_token;
        if (syncToken) {
          const preferencesResponse = await fetch('/api/communication/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` },
            body: JSON.stringify({
              whatsapp_number: whatsappNumber.trim() || null,
              whatsapp_opt_in: whatsappOptIn,
              whatsapp_opt_in_source: 'configurações',
              whatsapp_opt_in_text_version: WHATSAPP_OPT_IN_TEXT_VERSION
            })
          });
          if (!preferencesResponse.ok) {
            const preferencesError = await preferencesResponse.json().catch(() => ({}));
            throw new Error(preferencesError.error || 'Não foi possível salvar a autorização do WhatsApp.');
          }
          fetch('/api/profile/sync-brevo', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` },
            body: JSON.stringify({ fullName, whatsappNumber: whatsappNumber.trim() || null })
          }).catch((err) => console.warn('[Profile] Erro ao sincronizar perfil com Brevo:', err));
        }
      } catch (syncErr) {
        console.warn('[Profile] Erro ao salvar preferências WhatsApp:', syncErr);
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

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Número do WhatsApp (DDI + DDD + Número)
              </label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="input-field pl-10 pr-4 py-3"
                  placeholder="Ex: 5511999887766"
                  disabled={saving}
                />
              </div>
              <p className="text-[10px] text-brand-text-muted">
                DDI + DDD + Número, sem espaços ou caracteres especiais. Ex: 5511999887766.
              </p>
              <label className="flex items-start gap-3 rounded-xl border border-brand-border bg-brand-bg/40 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappOptIn}
                  onChange={(e) => setWhatsappOptIn(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-brand-primary"
                  disabled={saving}
                  aria-describedby="whatsapp-opt-in-text"
                />
                <span id="whatsapp-opt-in-text" className="text-xs leading-relaxed text-brand-text-muted">
                  {WHATSAPP_OPT_IN_TEXT}
                </span>
              </label>
            </div>

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

            <div className="bg-gradient-to-br from-brand-primary/5 to-brand-accent/10 border border-brand-primary/15 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start space-x-3">
                <div className="p-2 bg-white rounded-xl border border-brand-primary/10 text-brand-primary flex-shrink-0 shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-brand-primary/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed lg:w-auto"
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

            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start space-x-3">
                <div className="p-2 bg-white rounded-xl border border-red-200 text-red-600 flex-shrink-0 shadow-sm">
                  <Trash2 size={18} />
                </div>
                <div className="min-w-0 space-y-1">
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
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors lg:w-auto"
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
