import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Mail, ShieldAlert, Loader2, CheckCircle, AlertCircle, Key, Briefcase, Sparkles, RefreshCcw, Trash2, AlertTriangle } from 'lucide-react';
import { clearOnboardingState, isOnboardingComplete } from '../utils/onboarding';
import { clearPendingGoogleScopes } from '../services/googleAuth';

export default function Profile() {
  const navigate = useNavigate();
  const { user, googleAccessToken, setUser, setGoogleAccessToken, setGoogleGrantedScopes, setProfileInfo } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professionalRegister, setProfessionalRegister] = useState('');
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
          setProfessionalTitle(data.professional_title || 'Terapeuta');
          setProfessionalRegister(data.professional_register || '');
          setOnboardingCompleted(data.onboarding_completed === true);
        } else {
          // Fallback para metadados do auth
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
          const nameParts = fullName.trim().split(' ');
          setFirstName(nameParts[0] || '');
          setLastName(nameParts.slice(1).join(' ') || '');
          setProfessionalTitle(user.user_metadata?.professional_title || 'Terapeuta');
        }
      } catch (err: any) {
        console.error("Erro ao carregar perfil:", err);
        // Fallback silencioso usando metadados do auth
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const nameParts = fullName.trim().split(' ');
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.slice(1).join(' ') || '');
        setProfessionalTitle(user.user_metadata?.professional_title || 'Terapeuta');
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

    try {
      // 1. Atualiza a tabela public.professionals
      const { error: dbError } = await supabase
        .from('professionals')
        .update({
          full_name: fullName,
          professional_title: professionalTitle.trim(),
          professional_register: professionalRegister.trim() || null,
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
          professional_title: professionalTitle.trim()
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

  const handleRestartOnboarding = async () => {
    if (!user) return;

    const confirmed = window.confirm(
      'Deseja reiniciar o onboarding? O fluxo será recomeçado do início e você poderá refazer a apresentação, criar um novo paciente e seguir todas as etapas novamente.'
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
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user?.user_metadata?.avatar_url}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-2 border-brand-accent shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-brand-primary/10 border-2 border-brand-accent flex items-center justify-center text-2xl font-bold text-brand-primary font-display shadow-sm">
                {initials}
              </div>
            )}
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
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                <input
                  type="text"
                  required
                  value={professionalTitle}
                  onChange={(e) => setProfessionalTitle(e.target.value)}
                  className="input-field pl-10 pr-4 py-3"
                  placeholder="Ex: Terapeuta Ocupacional, Fonoaudióloga, Psicóloga"
                  disabled={saving}
                />
              </div>
              <p className="text-[10px] text-brand-text-muted">
                Este rótulo será exibido no seu perfil, nos relatórios e define a especialidade usada pela IA.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Nº de Registro de Classe
              </label>
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
                    Sua conta está vinculada ao **Google Login**. Não é necessária uma senha na nossa plataforma.
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
