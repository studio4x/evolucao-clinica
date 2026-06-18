import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Clock, ShieldAlert, LogOut, Sparkles } from 'lucide-react';
import { AppVersion } from '../components/layout/AppVersion';

export default function PendingApproval() {
  const { user, profileStatus, setUser, setProfileInfo } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInactive = searchParams.get('status') === 'inactive' || profileStatus === 'inactive';

  useEffect(() => {
    // Redireciona de volta se não estiver autenticado
    if (!user) {
      navigate('/login', { replace: true });
    } else if (profileStatus === 'active') {
      // Se já estiver ativo, pode ir direto para a raiz
      navigate('/', { replace: true });
    }
  }, [user, profileStatus, navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfileInfo(null, null);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Erro ao deslogar:', error);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 px-6 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-white rounded-3xl shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
            <img src="/logotipo-transparente-1024.png" alt="Evolução Clínica" className="h-20 w-auto object-contain" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-display font-bold text-brand-primary tracking-tight">
          Evolução Clínica
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="card shadow-2xl shadow-brand-primary/5 py-10 px-6 sm:px-10 bg-white/80 backdrop-blur-sm border-brand-primary/10 text-center">
          <div className="flex flex-col items-center">
            {isInactive ? (
              <>
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100 mb-6 animate-pulse">
                  <ShieldAlert className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-display font-bold text-red-600 mb-3">
                  Cadastro Inativo
                </h3>
                <p className="text-sm text-brand-text-muted leading-relaxed mb-8">
                  O acesso à sua conta na plataforma foi desativado temporariamente. Se você acredita que isso é um engano ou precisa de suporte técnico, entre em contato com a administração.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-brand-accent/10 rounded-2xl flex items-center justify-center border border-brand-accent/20 mb-6">
                  <Clock className="w-8 h-8 text-brand-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-display font-bold text-brand-primary mb-3">
                  Aguardando Aprovação
                </h3>
                <p className="text-sm text-brand-text-muted leading-relaxed mb-8">
                  Seu cadastro foi recebido com sucesso! Para garantir a segurança dos dados, novos acessos passam por análise. Você terá acesso aos recursos da plataforma assim que seu perfil for aprovado por um administrador.
                </p>
              </>
            )}

            <div className="w-full border-t border-brand-border/60 pt-6 mb-4">
              <div className="flex items-center justify-center space-x-3 text-xs text-brand-text mb-4">
                <span className="font-semibold">{user?.displayName}</span>
                <span className="text-brand-text-muted">({user?.email})</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center px-4 py-3 border border-brand-border text-sm font-medium rounded-xl text-brand-text bg-white hover:bg-brand-bg hover:border-brand-primary/30 transition-all duration-200 active:scale-95 shadow-sm hover:shadow flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4 text-brand-text-muted" />
              <span>Sair e acessar com outra conta</span>
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center space-x-2 text-brand-primary/60">
            <Sparkles className="w-4 h-4" />
            <p className="text-xs font-medium uppercase tracking-widest italic">Conexão Seres</p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8 relative z-10 text-center">
        <div className="inline-block px-4 py-1.5 bg-white/50 backdrop-blur-md rounded-full border border-brand-primary/5 shadow-sm">
          <AppVersion />
        </div>
      </div>
    </div>
  );
}
