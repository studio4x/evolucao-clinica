import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AppVersion } from '../components/layout/AppVersion';
import { useState, useEffect } from 'react';
import { ShieldCheck, Mic, Lock, ArrowRight, CheckCircle2, User, KeyRound, ArrowLeft } from 'lucide-react';
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
  const [isLoaded, setIsLoaded] = useState(false);

  const slides = [
    {
      id: 'transcriptions',
      titleHighlight: 'IA',
      titlePre: 'Transcrições com ',
      titlePost: '',
      description: 'Grave suas consultas e nossa Inteligência Artificial transforma o áudio em prontuários completos em segundos.'
    },
    {
      id: 'docs',
      titleHighlight: 'Integrado',
      titlePre: 'Google Docs ',
      titlePost: '',
      description: 'Organização automatizada direto na sua conta do Google Docs, acessível de qualquer dispositivo.'
    },
    {
      id: 'security',
      titleHighlight: 'Seguros',
      titlePre: 'Prontuários ',
      titlePost: '',
      description: 'Privacidade garantida com dados criptografados e estruturados com segurança de nível médico.'
    },
    {
      id: 'automation',
      titleHighlight: 'Clínica',
      titlePre: 'Automatização ',
      titlePost: '',
      description: 'Ganhe tempo em cada atendimento e foque no que realmente importa: o cuidado com seu paciente.'
    }
  ];

  useEffect(() => {
    setIsLoaded(true);
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
    <div className="min-h-screen bg-[#edf4fa] md:bg-slate-900/10 flex items-center justify-center p-0 md:p-4 font-sans select-none">
      {/* Definidor de Animações CSS Customizadas */}
      <style>{`
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        @keyframes pulseGlowIa {
          0%, 100% { box-shadow: 0 0 12px rgba(13, 171, 168, 0.25); border-color: #0daba4; }
          50% { box-shadow: 0 0 24px rgba(13, 171, 168, 0.55); border-color: #00c2b2; }
        }
        @keyframes waveHeight1 {
          0%, 100% { height: 10px; }
          50% { height: 22px; }
        }
        @keyframes waveHeight2 {
          0%, 100% { height: 26px; }
          50% { height: 12px; }
        }
        @keyframes waveHeight3 {
          0%, 100% { height: 16px; }
          50% { height: 28px; }
        }
        .animate-float-card {
          animation: floatCard 4s ease-in-out infinite;
        }
        .animate-glow-ia {
          animation: pulseGlowIa 3s ease-in-out infinite;
        }
        .animate-wave-1 {
          animation: waveHeight1 1.2s ease-in-out infinite;
        }
        .animate-wave-2 {
          animation: waveHeight2 1.4s ease-in-out infinite;
        }
        .animate-wave-3 {
          animation: waveHeight3 1.1s ease-in-out infinite;
        }
      `}</style>

      {/* Container Principal Simulador de Celular no Desktop, Tela Cheia em Telas Móveis */}
      <div className="w-full min-h-screen md:min-h-[780px] md:max-h-[840px] md:h-[92vh] md:max-w-[420px] md:rounded-[36px] md:shadow-2xl md:border md:border-slate-200/60 bg-[#edf4fa] flex flex-col justify-between relative overflow-hidden">

        {/* Elementos Decorativos Vetoriais no Fundo (Grid de Pontos + Nuvenzinha com Animação) */}
        <div className={`absolute top-12 left-6 grid grid-cols-4 gap-1.5 opacity-30 pointer-events-none transition-all duration-1000 ${isLoaded ? 'translate-y-0 opacity-30' : '-translate-y-4 opacity-0'}`}>
          {[...Array(12)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-[#0b5cad]" />
          ))}
        </div>
        <div className={`absolute top-16 right-6 opacity-25 pointer-events-none transition-all duration-1000 delay-200 ${isLoaded ? 'translate-x-0 opacity-25' : 'translate-x-4 opacity-0'}`}>
          <svg className="w-12 h-12 text-[#0b5cad]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
          </svg>
        </div>

        {/* Cabeçalho com Logotipo (Animado na entrada) */}
        <div className={`pt-10 pb-2 flex justify-center relative z-10 transition-all duration-700 ease-out transform ${isLoaded ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'}`}>
          {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
            <img
              src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
              alt="Evolução Clínica"
              className="h-16 w-auto object-contain hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0b5cad] to-[#0daba4] flex items-center justify-center text-white font-bold shadow-md">
                EC
              </div>
              <span className="text-2xl font-bold text-[#0b5cad] tracking-tight">
                {siteConfig.pwa_app_name || "Evolução Clínica"}
              </span>
            </div>
          )}
        </div>

        {/* Ilustração Visual do Fluxo de IA com Animações de Transição */}
        <div className={`flex-1 flex flex-col items-center justify-center px-4 relative z-10 transition-all duration-1000 delay-150 transform ${isLoaded ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
          <div className="w-full flex items-center justify-center gap-2 py-4">
            {/* Ícone de Microfone com efeito de respiro de gravação */}
            <div className="w-14 h-14 rounded-full bg-white shadow-lg shadow-blue-500/10 border border-slate-100 flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform">
              <Mic className="w-6 h-6 text-[#0b5cad] animate-pulse" />
            </div>

            {/* Onda Sonora de Áudio com Barras Animadas estilo Equalizador Real */}
            <div className="flex items-center gap-0.5 text-[#0daba4]">
              <span className="text-xs opacity-40">•</span>
              <span className="w-0.5 bg-[#0daba4] rounded-full animate-wave-1"></span>
              <span className="w-0.5 bg-[#0daba4] rounded-full animate-wave-2"></span>
              <span className="w-0.5 bg-[#0daba4] rounded-full animate-wave-1"></span>
              <span className="w-0.5 bg-[#0daba4] rounded-full animate-wave-3"></span>
              <span className="w-0.5 bg-[#0daba4] rounded-full animate-wave-2"></span>
              <span className="text-xs font-bold text-[#0daba4] ml-0.5">+</span>
            </div>

            {/* Círculo IA com brilho de néon pulsante */}
            <div className="w-14 h-14 rounded-full bg-white shadow-lg border-2 border-[#0daba4] flex items-center justify-center flex-shrink-0 animate-glow-ia">
              <span className="text-lg font-black text-[#0daba4] tracking-tight">IA</span>
            </div>

            {/* Seta de Transição */}
            <div className="flex items-center text-[#0daba4] gap-0.5">
              <span className="text-xs font-bold">+</span>
              <ArrowRight className="w-4 h-4 text-[#0daba4] translate-x-0 animate-pulse" />
            </div>

            {/* Cartão de Prontuário Flutuante com Animação Orgânica 'float' */}
            <div className="w-36 bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-slate-100 p-2.5 relative flex-shrink-0 text-left animate-float-card">
              {/* Cabeçalho do Card */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <User className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800">Consulta</span>
                </div>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>

              {/* Rótulos & Barras Skeleton */}
              <div className="space-y-1.5 text-[9px] text-slate-500">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-600 w-12">Anamnese</span>
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1"></div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-600 w-12">Conduta</span>
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1 max-w-[60%]"></div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-600 w-12">CID</span>
                  <div className="h-1.5 bg-slate-100 rounded-full flex-1 max-w-[40%]"></div>
                </div>
              </div>

              {/* Rodapé do Card com Rubrica & Badge Verde */}
              <div className="mt-2.5 pt-1 border-t border-slate-50 flex items-center justify-between">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                </div>
                <span className="text-[10px] italic font-serif text-[#0b5cad]">Der</span>
              </div>

              {/* Badge Verde Check Sobressaindo no Canto */}
              <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md animate-bounce">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Carrossel de Texto com Transição Horizontal e Opacidade Suave */}
          <div className="mt-4 w-full px-6 text-center min-h-[100px] flex flex-col items-center justify-center overflow-hidden">
            {slides.map((slide, index) => {
              const isActive = index === currentSlide;
              return (
                <div
                  key={slide.id}
                  className={`transition-all duration-500 ease-in-out transform ${
                    isActive
                      ? 'opacity-100 translate-x-0 relative'
                      : 'opacity-0 translate-x-8 absolute pointer-events-none'
                  }`}
                >
                  <h3 className="text-xl font-bold text-[#0b5cad] mb-2 tracking-tight">
                    {slide.titlePre}
                    <span className="text-[#0daba4]">{slide.titleHighlight}</span>
                    {slide.titlePost}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-[300px] mx-auto font-normal">
                    {slide.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Indicadores de Progresso (4 Dots com Transição de Largura) */}
          <div className="flex justify-center items-center gap-1.5 mt-4">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`transition-all duration-500 ${
                  index === currentSlide
                    ? 'w-6 h-1.5 bg-[#0b5cad] rounded-full shadow-sm'
                    : 'w-1.5 h-1.5 bg-[#b2d1e8] rounded-full hover:bg-[#0b5cad]/50'
                }`}
                aria-label={`Slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Gaveta Inferior (Bottom Sheet Branco com Transição de Subida) */}
        <div className={`w-full bg-white rounded-t-[36px] shadow-[0_-10px_30px_rgba(0,0,0,0.03)] border-t border-slate-100 p-6 flex flex-col items-center z-20 transition-all duration-700 ease-out transform ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
          {/* Puxador da Gaveta */}
          <div className="w-12 h-1 bg-slate-300/80 rounded-full mb-5" />

          {/* Botão Acessar com Google */}
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            disabled={loading}
            className="w-full bg-[#0b5cad] hover:bg-[#094c8f] active:bg-[#073d74] text-white font-semibold text-base py-3.5 px-4 rounded-2xl shadow-md shadow-blue-900/10 flex items-center justify-center gap-3 transition-all cursor-pointer hover:shadow-lg"
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
                <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Acessar com Google</span>
              </>
            )}
          </button>

          {/* Card de Esclarecimento de Permissões */}
          <div className="w-full bg-[#f4f8fb] border border-[#e1edf5] rounded-2xl p-3.5 flex items-start gap-3 mt-3.5">
            <ShieldCheck className="w-6 h-6 text-[#0daba4] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed font-normal text-left">
              No primeiro acesso pedimos só o básico para entrar. As permissões do Drive, prontuário e agenda são solicitadas depois, apenas quando você chegar em cada etapa.
            </p>
          </div>

          {/* Rodapé de Segurança e Termos */}
          <div className="mt-4 flex flex-col items-center text-center gap-1.5 w-full">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Seus dados estão protegidos com segurança de ponta a ponta.</span>
            </div>

            <div className="flex items-center justify-center gap-3 text-xs font-semibold text-[#0b5cad] mt-1">
              <Link to="/privacy" className="hover:underline">Política de Privacidade</Link>
              <span className="text-slate-300 font-normal">|</span>
              <Link to="/terms" className="hover:underline">Termos de Serviço</Link>
            </div>
          </div>

          {/* Links Secundários e Versão (Acesso Admin / Voltar) */}
          <div className="mt-4 pt-3 border-t border-slate-100 w-full flex items-center justify-between px-1 text-[11px] text-slate-400">
            <Link to="/admin" className="flex items-center gap-1 hover:text-[#0b5cad] transition-colors">
              <KeyRound size={12} />
              <span>Login Admin</span>
            </Link>
            <AppVersion />
            <Link to="/" className="flex items-center gap-1 hover:text-[#0b5cad] transition-colors">
              <ArrowLeft size={12} />
              <span>Site</span>
            </Link>
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
