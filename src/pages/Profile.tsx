import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { User as UserIcon, Mail, ShieldAlert, Loader2, CheckCircle, AlertCircle, Key, Briefcase, Sparkles, RefreshCcw } from 'lucide-react';
import { clearOnboardingState } from '../utils/onboarding';

export default function Profile() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professionalRegister, setProfessionalRegister] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      
      setLoading(true);
      setEmail(user.email || '');

      try {
        // Busca os dados da tabela professionals
        const { data, error } = await supabase
          .from('professionals')
          .select('full_name, professional_title, professional_register')
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

  const handleRestartOnboarding = () => {
    if (!user) return;

    const confirmed = window.confirm(
      'Deseja reiniciar o onboarding? O fluxo será recomeçado do início e você poderá refazer a apresentação, criar um novo paciente e seguir todas as etapas novamente.'
    );

    if (!confirmed) return;

    setResettingOnboarding(true);
    try {
      clearOnboardingState(user.id);
      navigate('/onboarding', { replace: true });
    } finally {
      setResettingOnboarding(false);
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
                  <h4 className="text-sm font-semibold text-brand-primary">Reiniciar onboarding</h4>
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
    </div>
  );
}
