import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AppVersion } from '../components/layout/AppVersion';
import { useState, useEffect } from 'react';
import { ShieldCheck, Zap, Sparkles, Files, ArrowLeft } from 'lucide-react';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination, isOnboardingComplete } from '../utils/onboarding';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';
import { requestGoogleOAuth } from '../services/googleAuth';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const { user, isAuthReady, profileStatus, profileRole, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [searchParams] = useSearchParams();
  const fromPlan = searchParams.get('from_plan');

  useEffect(() => {
    if (fromPlan === 'monthly' || fromPlan === 'yearly' || fromPlan === '1') {
      sessionStorage.setItem('pending_checkout_flow', 'true');
      if (fromPlan === 'monthly' || fromPlan === 'yearly') {
        sessionStorage.setItem('selected_checkout_plan', fromPlan);
      }
    } else if (fromPlan === null) {
      sessionStorage.removeItem('pending_checkout_flow');
      sessionStorage.removeItem('selected_checkout_plan');
    }
  }, [fromPlan]);

  useEffect(() => {
    if (isAuthReady && user) {
      const isPendingCheckoutFlow = sessionStorage.getItem('pending_checkout_flow') === 'true';
      const now = new Date();
      const endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
      const isExpired = endsAt ? endsAt < now : false;
      const isActive = isPendingCheckoutFlow
        ? subscriptionStatus === 'active'
        : (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');

      if (profileStatus === 'pending') {
        navigate('/pending', { replace: true });
      } else if (profileStatus === 'inactive') {
        navigate('/pending?status=inactive', { replace: true });
      } else if (profileRole === 'admin') {
        navigate('/admin/professionals', { replace: true });
      } else if (isPendingCheckoutFlow && (!isActive || isExpired)) {
        navigate('/painel/subscription', { replace: true });
      } else if (!isOnboardingComplete(user.id)) {
        navigate(getOnboardingDestination(user.id), { replace: true });
      } else {
        navigate('/painel/dashboard', { replace: true });
      }
    }
  }, [user, isAuthReady, profileStatus, profileRole, subscriptionStatus, subscriptionEndsAt, navigate]);

  const executeGoogleLogin = async () => {
    setLoading(true);
    try {
      const forcePrompt = localStorage.getItem('force_google_prompt') === 'true';
      if (forcePrompt) {
        localStorage.removeItem('force_google_prompt');
      }

      const { error } = await requestGoogleOAuth({
        requiredScopes: 'login',
        currentGrantedScopes: [],
        redirectTo: window.location.origin + '/painel',
        prompt: forcePrompt ? 'consent select_account' : undefined,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Login error:', error);
      setLoading(false);
      alert(`Erro de autenticação: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 px-6 sm:px-6 lg:px-8 relative overflow-hidden">

      {/* Elementos decorativos de fundo */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
            <div className="p-3 bg-white rounded-3xl shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                alt="Evolução Clínica"
                className="h-24 w-auto object-contain p-2"
              />
            </div>
          ) : (
            <h2 className="text-3xl font-display font-extrabold text-brand-primary text-center">
              {siteConfig.pwa_app_name || "Evolução Clínica"}
            </h2>
          )}
        </div>
        <p className="mt-3 text-center text-base text-brand-text-muted max-w-[280px] mx-auto leading-relaxed">
          Sua prática clínica automatizada com <span className="text-brand-primary font-semibold">Inteligência Artificial</span>
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="card shadow-2xl shadow-brand-primary/5 py-10 px-6 sm:px-12 bg-white/80 backdrop-blur-sm border-brand-primary/10">
          <div className="space-y-6 mb-8">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Transcreve áudios instantaneamente</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <Files className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Organiza tudo no seu Google Docs</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Prontuários seguros e estruturados</p>
            </div>
          </div>

          <button
            onClick={() => setIsSecurityModalOpen(true)}
            disabled={loading}
            className="btn-primary w-full py-4 text-lg font-semibold tracking-wide shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:shadow-brand-primary/30 transform transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-3"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processando...</span>
              </span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Acessar com Google</span>
              </>
            )}
          </button>
          
          <p className="mt-5 text-center text-[11px] text-brand-text-muted leading-relaxed">
            No primeiro acesso pedimos só o básico para entrar. As permissões do Drive, prontuário e agenda são solicitadas depois, apenas quando você chegar em cada etapa.
          </p>
        </div>

        {/* Botão Voltar para a Home */}
        <div className="mt-6 flex justify-center">
          <Link 
            to="/" 
            className="flex items-center gap-2 px-4 py-2 bg-white/80 hover:bg-white text-brand-text-muted hover:text-brand-primary rounded-xl border border-brand-primary/10 shadow-sm transition-all text-xs font-semibold"
          >
            <ArrowLeft size={14} />
            Voltar para o site
          </Link>
        </div>
      </div>
      
      <div className="mt-auto pt-12 relative z-10 text-center flex flex-col items-center gap-3">
        <div className="inline-block px-4 py-1.5 bg-white/50 backdrop-blur-md rounded-full border border-brand-primary/5 shadow-sm">
          <AppVersion />
        </div>
        <div className="flex gap-4 text-xs font-medium text-brand-text-muted">
          <Link to="/privacy" className="hover:text-brand-primary transition-colors">Política de Privacidade</Link>
          <span className="text-brand-border">|</span>
          <Link to="/terms" className="hover:text-brand-primary transition-colors">Termos de Serviço</Link>
        </div>
      </div>

      <GoogleSecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onConfirm={executeGoogleLogin}
        mode="login"
      />
    </div>
  );
}
