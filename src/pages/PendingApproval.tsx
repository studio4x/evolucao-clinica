import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Clock, ShieldAlert, LogOut, Sparkles } from 'lucide-react';
import { AppVersion } from '../components/layout/AppVersion';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination, isOnboardingComplete } from '../utils/onboarding';

export default function PendingApproval() {
  const { user, profileStatus, profileRole, setUser, setProfileInfo } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const isInactive = searchParams.get('status') === 'inactive' || profileStatus === 'inactive';

  useEffect(() => {
    // Redireciona de volta se não estiver autenticado
    if (!user) {
      navigate('/login', { replace: true });
    } else if (profileStatus === 'active') {
      if (profileRole !== 'admin' && !isOnboardingComplete(user.id)) {
        navigate(getOnboardingDestination(user.id), { replace: true });
      } else {
        // Se já estiver ativo, pode ir direto para a raiz
        navigate('/painel/dashboard', { replace: true });
      }
    }
  }, [user, profileStatus, profileRole, navigate]);

  useEffect(() => {
    if (!user || profileStatus === 'active') {
      return;
    }

    let cancelled = false;

    const syncAccess = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;

        if (!session || cancelled) {
          return;
        }

        const response = await fetch('/api/onboarding/bootstrap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || cancelled) {
          return;
        }

        const profile = data.profile || {};
        const nextStatus = profile.status || data.status || 'pending';

        setProfileInfo(
          nextStatus,
          profile.role || 'therapist',
          profile.subscription_plan || 'trial',
          profile.subscription_status || 'trialing',
          profile.subscription_ends_at || null,
          profile.trial_ends_at || null
        );

        if (nextStatus === 'active') {
          navigate('/painel/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Erro ao sincronizar acesso pendente:', error);
      }
    };

    void syncAccess();
    const interval = window.setInterval(syncAccess, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, profileStatus, navigate, setProfileInfo]);

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
          {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
            <div className="p-3 bg-white rounded-3xl shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                alt="Evolução Clínica"
                className="h-20 w-auto object-contain p-2"
              />
            </div>
          ) : (
            <h2 className="mt-4 text-center text-2xl font-display font-bold text-brand-primary tracking-tight">
              {siteConfig.pwa_app_name || "Evolução Clínica"}
            </h2>
          )}
        </div>
        {siteConfig.logo_light_url && (
          <h2 className="mt-4 text-center text-2xl font-display font-bold text-brand-primary tracking-tight">
            {siteConfig.pwa_app_name || "Evolução Clínica"}
          </h2>
        )}
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
                <span className="font-semibold">{user?.user_metadata?.full_name || user?.email}</span>
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
            <p className="text-xs font-medium uppercase tracking-widest italic">Evolução Clínica</p>
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
