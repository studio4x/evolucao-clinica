import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AppVersion } from '../components/layout/AppVersion';
import { useState, useEffect } from 'react';
import { ShieldCheck, Zap, Files, ArrowLeft, KeyRound } from 'lucide-react';
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

  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
    {
      id: 'slide-audio',
      icon: <Zap className="w-6 h-6 text-brand-primary" />,
      title: "Transcrições com IA",
      description: "Grave o áudio das consultas e nossa Inteligência Artificial gera prontuários estruturados em segundos."
    },
    {
      id: 'slide-google',
      icon: <Files className="w-6 h-6 text-brand-primary" />,
      title: "Google Docs Integrado",
      description: "Organização automatizada direto na sua conta do Google Docs, acessível de qualquer dispositivo."
    },
    {
      id: 'slide-secure',
      icon: <ShieldCheck className="w-6 h-6 text-brand-primary" />,
      title: "Prontuários Seguros",
      description: "Privacidade garantida com dados criptografados e estruturados com segurança de nível médico."
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [slides.length]);

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
        navigate('/checkout', { replace: true });
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
    <div className="min-h-screen bg-slate-50 md:bg-slate-900/5 flex items-center justify-center p-0 md:p-4">
      {/* Moldura de Smartphone para Desktop, Tela Cheia Imersiva no Mobile */}
      <div className="w-full min-h-screen md:min-h-[760px] md:max-h-[820px] md:h-[90vh] md:max-w-md md:rounded-[32px] md:shadow-2xl md:border md:border-brand-border/50 bg-brand-bg flex flex-col justify-between relative overflow-hidden transition-all">
        
        {/* Elementos de Brilho Orgânicos (Glow Background) */}
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[40%] bg-brand-primary/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-[20%] right-[-30%] w-[80%] h-[40%] bg-brand-accent/15 rounded-full blur-[100px] pointer-events-none" />

        {/* Seção Superior: Logo e Carrossel */}
        <div className="flex-1 flex flex-col items-center justify-center pt-8 pb-4 relative z-10 w-full">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
              <div className="p-3 bg-white rounded-2xl shadow-lg shadow-brand-primary/5 border border-brand-primary/5">
                <img
                  src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                  alt="Evolução Clínica"
                  className="h-14 w-auto object-contain"
                />
              </div>
            ) : (
              <h2 className="text-2xl font-display font-extrabold text-brand-primary text-center tracking-tight">
                {siteConfig.pwa_app_name || "Evolução Clínica"}
              </h2>
            )}
          </div>

          {/* Carrossel de Onboarding */}
          <div className="w-full relative">
            <div className="relative w-full h-[180px] flex items-center justify-center overflow-hidden">
              {slides.map((slide, index) => {
                const isActive = index === currentSlide;
                return (
                  <div
                    key={slide.id}
                    className={`absolute w-full px-8 text-center flex flex-col items-center transition-all duration-700 ease-in-out transform ${
                      isActive 
                        ? 'opacity-100 translate-x-0 scale-100' 
                        : 'opacity-0 pointer-events-none translate-x-12 scale-95'
                    }`}
                  >
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-md border border-brand-primary/5 flex items-center justify-center mb-3 text-brand-primary">
                      {slide.icon}
                    </div>
                    <h3 className="text-lg font-bold text-brand-text mb-1.5 tracking-tight">
                      {slide.title}
                    </h3>
                    <p className="text-xs text-brand-text-muted leading-relaxed max-w-[280px]">
                      {slide.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Dots Indicadores */}
            <div className="flex justify-center space-x-1.5 mt-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlide 
                      ? 'w-6 bg-brand-primary' 
                      : 'w-1.5 bg-brand-primary/20'
                  }`}
                  aria-label={`Ir para slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Seção Inferior: Gaveta (Bottom Sheet) de Ação */}
        <div className="w-full bg-white rounded-t-[32px] shadow-[0_-8px_30px_rgb(0,0,0,0.04)] border-t border-brand-border/40 p-6 md:p-8 flex flex-col items-center z-10">
          <div className="w-12 h-1 bg-slate-200 rounded-full mb-6 pointer-events-none md:hidden" />
          
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            disabled={loading}
            className="btn-primary w-full py-4 text-base font-semibold tracking-wide shadow-lg shadow-brand-primary/10 hover:shadow-xl hover:shadow-brand-primary/20 transform transition-all active:translate-y-0.5 flex items-center justify-center space-x-3 rounded-2xl"
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

          <Link
            to="/admin"
            className="mt-3 w-full py-3 px-4 text-xs font-semibold text-brand-text-muted hover:text-brand-primary bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <KeyRound size={14} className="opacity-70" />
            <span>Entrar com e-mail e senha</span>
          </Link>
          
          <p className="mt-4 text-center text-[10px] text-brand-text-muted leading-relaxed max-w-[320px]">
            No primeiro acesso pedimos só o básico para entrar. As permissões do Drive, prontuário e agenda são solicitadas depois, apenas quando você chegar em cada etapa.
          </p>

          {/* Botão Voltar para a Home */}
          <div className="mt-5 w-full flex justify-center">
            <Link 
              to="/" 
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-brand-text-muted hover:text-brand-primary rounded-xl border border-brand-border shadow-sm transition-all text-xs font-semibold"
            >
              <ArrowLeft size={14} />
              Voltar para o site
            </Link>
          </div>

          {/* Versão e Links de Rodapé */}
          <div className="mt-6 w-full text-center flex flex-col items-center gap-2 border-t border-slate-100 pt-5">
            <AppVersion />
            <div className="flex gap-3 text-[10px] font-medium text-brand-text-muted">
              <Link to="/privacy" className="hover:text-brand-primary transition-colors">Política de Privacidade</Link>
              <span className="text-slate-200">|</span>
              <Link to="/terms" className="hover:text-brand-primary transition-colors">Termos de Serviço</Link>
            </div>
          </div>
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
