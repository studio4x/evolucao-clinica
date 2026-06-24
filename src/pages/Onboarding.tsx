import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, CheckCircle2, FileText, Mic, Sparkles, Users, ArrowRight, RefreshCw, Loader2, ShieldCheck, ChevronRight, ChevronLeft, Volume2, Award } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { completeOnboarding, ensureOnboardingState, getOnboardingDestination, getOnboardingState, setOnboardingState } from '../utils/onboarding';
import { listGoogleCalendarEvents } from '../services/googleCalendar';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';

const normalizeText = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const matchPatientWithEvent = (patient: any, summary: string, description: string): boolean => {
  const normSummary = normalizeText(summary);
  const normDesc = normalizeText(description);
  const normFullName = normalizeText(patient.full_name || '');

  if (normFullName && (normSummary.includes(normFullName) || normDesc.includes(normFullName))) {
    return true;
  }

  const ignoreWords = ['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'em'];
  const nameParts = normFullName.split(/\s+/).filter((part) => part.length >= 2 && !ignoreWords.includes(part));

  if (nameParts.length > 0) {
    const firstName = nameParts[0];
    const firstRegex = new RegExp(`\\b${firstName}\\b`, 'i');
    if (firstRegex.test(normSummary) || firstRegex.test(normDesc)) {
      return true;
    }

    if (firstName.length >= 4 && (normSummary.includes(firstName) || normDesc.includes(firstName))) {
      return true;
    }

    for (let i = 1; i < nameParts.length; i += 1) {
      const part = nameParts[i];
      const partRegex = new RegExp(`\\b${part}\\b`, 'i');
      if (partRegex.test(normSummary) || partRegex.test(normDesc)) {
        return true;
      }

      if (part.length >= 4 && (normSummary.includes(part) || normDesc.includes(part))) {
        return true;
      }
    }
  }

  return false;
};

type AgendaSyncSummary = {
  patientsCount: number;
  evolutionsCount: number;
  matchedEventsCount: number;
  syncedAt: string;
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, googleAccessToken, setGoogleAccessToken, isAuthReady } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [syncingAgenda, setSyncingAgenda] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSummary, setSyncSummary] = useState<AgendaSyncSummary | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Controle local do Slider de Apresentação (passo 'intro')
  const [activeSlide, setActiveSlide] = useState(0);

  // Referências para capturar gestos de swipe (toque)
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const onboardingState = user?.id ? getOnboardingState(user.id) : null;
  const activeStep = (searchParams.get('step') as 'intro' | 'agenda' | 'complete' | null) || onboardingState?.step || 'intro';
  const isAgendaStep = activeStep === 'agenda';
  const agendaAlreadySynced = Boolean(onboardingState?.agendaSyncedAt);
  const isCompleteStep = activeStep === 'complete';

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (onboardingState?.step === 'complete') {
      navigate('/painel/dashboard', { replace: true });
      return;
    }

    if (onboardingState?.step === 'patient' || onboardingState?.step === 'evolution') {
      const destination = getOnboardingDestination(user.id);
      if (destination !== '/onboarding') {
        navigate(destination, { replace: true });
      }
    }
  }, [isAuthReady, navigate, onboardingState?.step, user]);

  useEffect(() => {
    if (user?.id && !onboardingState) {
      ensureOnboardingState(user.id);
    }
  }, [onboardingState, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    if (activeStep === 'agenda') {
      setOnboardingState(user.id, { step: 'agenda' });
    } else if (activeStep === 'intro' && onboardingState?.step !== 'intro') {
      setOnboardingState(user.id, { step: 'intro' });
    }
  }, [activeStep, onboardingState?.step, user?.id]);

  const handleStartOnboarding = () => {
    if (!user?.id) return;
    setOnboardingState(user.id, { step: 'patient' });
    navigate('/painel/patients/new?onboarding=1', { replace: true });
  };

  const handleConnectGoogleCalendar = async () => {
    setIsSecurityModalOpen(true);
  };

  const executeGoogleConnection = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events.readonly',
          redirectTo: window.location.origin + '/onboarding?step=agenda'
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao conectar Google Agenda:', error);
      alert('Erro ao iniciar conexão com o Google.');
    }
  };

  const handleSyncAgenda = async () => {
    if (!user?.id) return;
    if (!googleAccessToken) {
      alert('Sua sessão do Google precisa ser renovada antes de sincronizar a agenda.');
      return;
    }

    setSyncingAgenda(true);
    setSyncError('');

    try {
      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('id, full_name, birth_date, phone')
        .eq('professional_id', user.id)
        .eq('status', 'active');

      if (patientsError) throw patientsError;

      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0);

      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);

      const formatDateStr = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startOfWeekStr = formatDateStr(startOfWeek);
      const localTomorrowStr = formatDateStr(tomorrow);

      const { data: evolutionsThisWeek, error: evolutionsError } = await supabase
        .from('evolutions')
        .select('id, patient_id, session_date')
        .eq('professional_id', user.id)
        .gte('session_date', startOfWeekStr)
        .lte('session_date', localTomorrowStr);

      if (evolutionsError) throw evolutionsError;

      const events = await listGoogleCalendarEvents(
        googleAccessToken,
        startOfWeek.toISOString(),
        endOfTomorrow.toISOString()
      );

      const matchedEvents = events.filter((event) => {
        return (patientsData || []).some((patient) =>
          matchPatientWithEvent(patient, event.summary || '', event.description || '')
        );
      });

      setSyncSummary({
        patientsCount: patientsData?.length || 0,
        evolutionsCount: evolutionsThisWeek?.length || 0,
        matchedEventsCount: matchedEvents.length,
        syncedAt: new Date().toISOString()
      });

      if (user.id) {
        setOnboardingState(user.id, {
          step: 'agenda',
          agendaSyncedAt: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar agenda no onboarding:', error);
      const message = error?.message || 'Não foi possível sincronizar a agenda.';
      if (message.includes('401') || message.includes('UNAUTHENTICATED') || message.includes('Invalid Credentials')) {
        setGoogleAccessToken(null);
      }
      setSyncError(message);
    } finally {
      setSyncingAgenda(false);
    }
  };

  const handleFinish = () => {
    if (!user?.id) return;
    completeOnboarding(user.id);
    navigate('/painel/dashboard', { replace: true });
  };

  // Funções para controle de toque (swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 50) {
      // Swipe para a esquerda -> Próximo Slide (apenas se for intro)
      if (activeStep === 'intro' && activeSlide < 3) {
        setActiveSlide((prev) => prev + 1);
      }
    } else if (diff < -50) {
      // Swipe para a direita -> Slide Anterior
      if (activeStep === 'intro' && activeSlide > 0) {
        setActiveSlide((prev) => prev - 1);
      }
    }
  };

  // Determinar qual é o status de cada etapa para a barra lateral do desktop
  const getStepStatus = (stepName: 'intro' | 'patient' | 'evolution' | 'agenda' | 'complete') => {
    const currentStepOrder = {
      intro: 0,
      patient: 1,
      evolution: 2,
      agenda: 3,
      complete: 4
    };

    const userCurrentStep = onboardingState?.step || 'intro';
    const userStepIndex = currentStepOrder[userCurrentStep];
    const targetStepIndex = currentStepOrder[stepName];

    // Lógica especial para 'agenda' e 'complete'
    if (stepName === 'agenda' && (agendaAlreadySynced || syncSummary)) {
      return 'completed';
    }

    if (userStepIndex > targetStepIndex) {
      return 'completed';
    } else if (userStepIndex === targetStepIndex) {
      // Se estamos na rota de agenda, mas o activeStep é 'agenda'
      if (stepName === 'agenda' && activeStep === 'agenda') return 'current';
      if (stepName === 'complete' && activeStep === 'complete') return 'current';
      if (stepName === 'intro' && activeStep === 'intro') return 'current';
      return 'completed';
    } else {
      return 'pending';
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-brand-bg flex items-center justify-center overflow-x-hidden p-0 md:p-6 select-none font-sans">
      {/* Estilos CSS embutidos para micro-animações personalizadas */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.18); opacity: 0.35; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes floatDelayed {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes slideIntoFolder {
          0% { transform: translateY(-24px) scale(0.85); opacity: 0; }
          35%, 65% { transform: translateY(-8px) scale(1); opacity: 1; }
          100% { transform: translateY(0px) scale(0.9); opacity: 0.25; }
        }
        @keyframes wavePulse {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.35; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes rotateSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(140px) rotate(360deg); opacity: 0; }
        }
        .anim-pulse-glow { animation: pulseGlow 4s infinite ease-in-out; }
        .anim-float { animation: float 3.5s infinite ease-in-out; }
        .anim-float-delayed { animation: floatDelayed 3.5s infinite ease-in-out 1.2s; }
        .anim-slide-folder { animation: slideIntoFolder 2.8s infinite ease-in-out; }
        .anim-wave-1 { animation: wavePulse 2.2s infinite ease-out; }
        .anim-wave-2 { animation: wavePulse 2.2s infinite ease-out 0.7s; }
        .anim-wave-3 { animation: wavePulse 2.2s infinite ease-out 1.4s; }
        .anim-rotate-slow { animation: rotateSlow 12s infinite linear; }
      `}</style>

      {/* Gradientes decorativos de fundo para desktop */}
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none hidden md:block" />
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-brand-accent/5 rounded-full blur-[100px] pointer-events-none hidden md:block animate-pulse" />
      <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-brand-primary/5 rounded-full blur-[100px] pointer-events-none hidden md:block animate-pulse" />

      {/* Container Principal: Funciona como Modal no Desktop e Fullscreen no Mobile */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full min-h-screen md:min-h-0 md:h-[620px] md:max-w-4xl bg-white md:rounded-[32px] md:shadow-[0_20px_60px_-15px_rgba(0,92,19,0.12)] border-0 md:border border-brand-border/40 overflow-hidden flex flex-col md:grid md:grid-cols-12 relative z-10 transition-all duration-350"
      >
        
        {/* COLUNA ESQUERDA: Barra de Progresso Lateral (Apenas Desktop) */}
        <div className="hidden md:flex md:col-span-4 bg-gradient-to-b from-brand-primary/95 to-brand-primary-hover/95 p-8 flex-col justify-between text-white relative overflow-hidden">
          {/* Luz interna decorativa */}
          <div className="absolute -top-20 -left-20 w-48 h-48 bg-brand-accent/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-brand-accent/10 rounded-full blur-2xl pointer-events-none" />

          {/* Topo: Logo & Título */}
          <div className="relative z-10 space-y-6">
            {(siteConfig.logo_dark_url || siteConfig.logo_light_url) && (
              <div className="inline-flex items-center gap-3 p-2 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                <img
                  src={appendBrandAssetVersion(siteConfig.logo_dark_url || siteConfig.logo_light_url, assetSignature)}
                  alt="Evolução Clínica"
                  className="h-8 w-auto object-contain brightness-0 invert p-0.5"
                />
              </div>
            )}
            <div>
              <h2 className="text-xl font-display font-bold text-white leading-tight">Sua jornada de configuração</h2>
              <p className="text-xs text-white/70 mt-1">Siga os passos simples para automatizar sua clínica.</p>
            </div>
          </div>

          {/* Meio: Checklist de Passos */}
          <div className="relative z-10 py-6 space-y-5">
            {[
              { id: 'intro', label: 'Conhecer Recursos', desc: 'Visão geral da plataforma' },
              { id: 'patient', label: 'Criar Paciente', desc: 'Prontuário no Google Docs' },
              { id: 'evolution', label: 'Registrar Evolução', desc: 'Transcrição por inteligência artificial' },
              { id: 'agenda', label: 'Sincronizar Agenda', desc: 'Conectar com Google Agenda' },
              { id: 'complete', label: 'Conclusão', desc: 'Painel liberado' }
            ].map((step, idx) => {
              const status = getStepStatus(step.id as any);
              const isCompleted = status === 'completed';
              const isCurrent = status === 'current';

              return (
                <div key={step.id} className="flex items-start gap-3 group relative">
                  {/* Linha vertical conectora */}
                  {idx < 4 && (
                    <div 
                      className={`absolute left-[12px] top-[26px] w-[2px] h-[34px] transition-colors duration-300 ${
                        isCompleted ? 'bg-brand-accent' : 'bg-white/10'
                      }`}
                    />
                  )}
                  
                  {/* Círculo do passo */}
                  <div className={`relative z-10 w-[26px] h-[26px] rounded-full flex items-center justify-center border transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-brand-accent border-brand-accent text-brand-primary' 
                      : isCurrent 
                        ? 'bg-white border-white text-brand-primary shadow-lg shadow-white/20' 
                        : 'bg-white/5 border-white/20 text-white/50'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 size={14} className="stroke-[3px]" />
                    ) : (
                      <span className="text-[10px] font-bold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Textos */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold leading-none transition-colors ${
                      isCurrent ? 'text-white' : isCompleted ? 'text-white/90' : 'text-white/50'
                    }`}>
                      {step.label}
                    </p>
                    <p className={`text-[10px] mt-1.5 transition-colors ${
                      isCurrent ? 'text-brand-accent' : isCompleted ? 'text-white/60' : 'text-white/40'
                    }`}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rodapé: Suporte */}
          <div className="relative z-10 pt-4 border-t border-white/10">
            <span className="text-[10px] text-white/50 flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-brand-accent" />
              Ambiente Seguro
            </span>
          </div>
        </div>

        {/* COLUNA DIREITA: Slider de Conteúdo (Fullscreen no Mobile) */}
        <div className="col-span-12 md:col-span-8 flex flex-col justify-between h-full min-h-screen md:min-h-0 bg-white relative">
          
          {/* Cabeçalho Mobile: Progresso horizontal e botão Pular */}
          <div className="p-5 flex items-center justify-between border-b border-brand-border/40 md:border-b-0 relative z-10">
            <div className="flex items-center gap-2">
              {(siteConfig.logo_light_url || siteConfig.logo_dark_url) && (
                <img
                  src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                  alt="Logo"
                  className="h-8 w-auto object-contain md:hidden p-0.5"
                />
              )}
              <span className="text-[10px] uppercase font-bold tracking-wider text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full hidden md:inline-block">
                Onboarding Clínico
              </span>
            </div>

            {/* Progresso por dots simples no topo para mobile */}
            <div className="flex items-center gap-1.5 md:hidden">
              {[...Array(activeStep === 'intro' ? 4 : 1)].map((_, idx) => {
                const isDotActive = activeStep === 'intro' ? idx === activeSlide : true;
                return (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isDotActive ? 'w-4 bg-brand-primary' : 'w-1.5 bg-brand-border'
                    }`}
                  />
                );
              })}
            </div>

            {/* Botão de Pular a Intro (apenas na apresentação) */}
            {activeStep === 'intro' && (
              <button
                onClick={handleStartOnboarding}
                className="text-xs font-semibold text-brand-text-muted hover:text-brand-primary px-3 py-1.5 rounded-xl hover:bg-brand-bg transition-colors"
              >
                Pular
              </button>
            )}
          </div>

          {/* SLIDER DE SLIDES */}
          <div className="flex-1 flex items-center justify-center px-6 sm:px-10 py-4 relative overflow-hidden">
            
            {/* 1. SLIDES DA INTRODUÇÃO */}
            {activeStep === 'intro' && (
              <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center space-y-6 md:space-y-8 transition-all duration-500">
                
                {/* Visual / Ilustração Animada por CSS */}
                <div className="w-44 h-44 rounded-full bg-brand-bg/50 border border-brand-border/20 flex items-center justify-center relative">
                  
                  {/* SLIDE 0: Bem-vindo */}
                  {activeSlide === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-36 h-36 rounded-full border border-brand-primary/10 anim-rotate-slow" />
                      <div className="absolute w-28 h-28 rounded-full border border-brand-accent/20 anim-rotate-slow" style={{ animationDirection: 'reverse' }} />
                      <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center relative z-10 anim-float shadow-lg shadow-brand-primary/5">
                        <Sparkles size={32} className="text-brand-primary stroke-[1.5]" />
                      </div>
                      <div className="absolute top-8 right-8 w-2 h-2 rounded-full bg-brand-accent animate-ping" />
                      <div className="absolute bottom-10 left-8 w-3 h-3 rounded-full bg-brand-primary/30 anim-float-delayed" />
                    </div>
                  )}

                  {/* SLIDE 1: Pacientes */}
                  {activeSlide === 1 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-32 h-32 rounded-full bg-brand-primary/5 anim-pulse-glow" />
                      <div className="w-20 h-20 bg-brand-bg rounded-2xl border border-brand-border flex items-center justify-center relative z-10 shadow-md anim-float">
                        <FolderIcon className="w-12 h-12 text-brand-primary" />
                        <div className="absolute -top-3 -right-2 w-10 h-10 bg-white border border-brand-border rounded-xl flex items-center justify-center shadow-sm anim-slide-folder">
                          <FileText size={18} className="text-brand-accent" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 2: Evoluções por Voz */}
                  {activeSlide === 2 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-28 h-28 rounded-full border border-brand-accent/20 anim-wave-1" />
                      <div className="absolute w-28 h-28 rounded-full border border-brand-accent/30 anim-wave-2" />
                      <div className="absolute w-28 h-28 rounded-full border border-brand-accent/15 anim-wave-3" />
                      <div className="w-16 h-16 rounded-full bg-brand-primary text-white flex items-center justify-center relative z-10 shadow-lg shadow-brand-primary/25 anim-float">
                        <Mic size={26} className="stroke-[2]" />
                      </div>
                    </div>
                  )}

                  {/* SLIDE 3: O Caminho Prático */}
                  {activeSlide === 3 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-36 h-36 rounded-full bg-brand-primary/5 anim-pulse-glow" />
                      <div className="relative flex flex-col items-center gap-1 z-10 anim-float">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center text-brand-primary">
                            <Users size={18} />
                          </div>
                          <div className="h-[2px] w-6 bg-brand-border" />
                          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/10 flex items-center justify-center text-brand-accent">
                            <Mic size={18} />
                          </div>
                        </div>
                        <div className="text-[10px] font-semibold text-brand-text-muted mt-2 uppercase tracking-wider">
                          Fluxo Integrado
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Conteúdo textual com transição suave */}
                <div className="space-y-3 px-4 min-h-[140px] flex flex-col justify-center">
                  
                  {/* SLIDE 0: Bem-vindo */}
                  {activeSlide === 0 && (
                    <>
                      <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                        Sua evolução clínica com IA
                      </h1>
                      <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                        Grave ou envie áudios das suas consultas. Nossa Inteligência Artificial transcreve e estrutura a evolução clínica no prontuário oficial em segundos.
                      </p>
                    </>
                  )}

                  {/* SLIDE 1: Pacientes */}
                  {activeSlide === 1 && (
                    <>
                      <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                        Prontuários no Google Docs
                      </h1>
                      <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                        Esqueça papéis e planilhas. Integramos o prontuário diretamente com o Google Docs para que os documentos dos seus pacientes fiquem seguros e fáceis de editar.
                      </p>
                    </>
                  )}

                  {/* SLIDE 2: Evoluções por Voz */}
                  {activeSlide === 2 && (
                    <>
                      <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                        Gravador Inteligente Integrado
                      </h1>
                      <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                        Use o microfone direto do celular ou desktop. Grave a sua voz ou envie arquivos de áudio existentes para gerar evoluções sob medida.
                      </p>
                    </>
                  )}

                  {/* SLIDE 3: O Caminho Prático */}
                  {activeSlide === 3 && (
                    <>
                      <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                        Vamos dar os primeiros passos?
                      </h1>
                      <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                        Para começar a usar a plataforma, vamos criar seu primeiro paciente e registrar a primeira evolução de teste. Faremos tudo em um fluxo interativo.
                      </p>
                    </>
                  )}

                </div>
              </div>
            )}

            {/* 2. SLIDE DA AGENDA (step === 'agenda') */}
            {isAgendaStep && !isCompleteStep && (
              <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center space-y-6 md:space-y-7">
                
                {/* Visual Calendário com Animação */}
                <div className="w-36 h-36 rounded-full bg-brand-bg flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-brand-primary/5 rounded-full anim-pulse-glow" />
                  
                  {syncingAgenda ? (
                    <div className="w-16 h-16 rounded-2xl bg-brand-primary text-white flex items-center justify-center shadow-lg relative z-10">
                      <RefreshCw size={28} className="animate-spin" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-white border border-brand-border text-brand-primary flex items-center justify-center shadow-md relative z-10 anim-float">
                      <Calendar size={28} className="text-brand-primary stroke-[1.5]" />
                      <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-brand-accent text-white flex items-center justify-center shadow-sm">
                        <RefreshCw size={12} className="stroke-[2.5] anim-rotate-slow" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 px-2">
                  <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                    Integração com Google Agenda
                  </h1>
                  <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                    Sincronize a agenda para importar seus compromissos que coincidem com os pacientes ativos diretamente no painel.
                  </p>
                </div>

                {/* Bloco de Ação de Agenda */}
                <div className="w-full max-w-md px-2">
                  {!googleAccessToken ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                      <p className="text-xs text-amber-800 leading-normal">
                        Conecte a sua conta Google para podermos buscar os compromissos da agenda e as pastas do drive.
                      </p>
                      <button
                        type="button"
                        onClick={handleConnectGoogleCalendar}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-sm active:scale-[0.98]"
                      >
                        <ShieldCheck size={14} />
                        Conectar com o Google
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-brand-border bg-brand-bg/40 p-4 space-y-3 flex flex-col items-center">
                      <p className="text-xs text-brand-text-muted flex items-center justify-center gap-1">
                        Sessão conectada como: <span className="font-semibold text-brand-primary">{user?.email}</span>
                      </p>
                      
                      {!syncSummary && !agendaAlreadySynced && (
                        <button
                          type="button"
                          onClick={handleSyncAgenda}
                          disabled={syncingAgenda}
                          className="btn-primary inline-flex items-center justify-center gap-2 w-full max-w-[240px] py-3 text-xs font-bold shadow-md disabled:opacity-60"
                        >
                          {syncingAgenda ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Buscando eventos...
                            </>
                          ) : (
                            <>
                              <RefreshCw size={14} />
                              Sincronizar agenda agora
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {syncError && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-700">
                      {syncError}
                    </div>
                  )}

                  {/* Resumo da Agenda Sincronizada */}
                  {(syncSummary || agendaAlreadySynced) && (
                    <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3 text-left">
                      <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600 stroke-[2.5]" />
                        Agenda sincronizada com sucesso!
                      </div>
                      
                      {syncSummary && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white border border-emerald-100/60 rounded-xl p-2.5 text-center shadow-xs">
                            <span className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold block">Pacientes</span>
                            <span className="text-sm font-black text-brand-primary">{syncSummary.patientsCount}</span>
                          </div>
                          <div className="bg-white border border-emerald-100/60 rounded-xl p-2.5 text-center shadow-xs">
                            <span className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold block">Evoluções</span>
                            <span className="text-sm font-black text-brand-primary">{syncSummary.evolutionsCount}</span>
                          </div>
                          <div className="bg-white border border-emerald-100/60 rounded-xl p-2.5 text-center shadow-xs">
                            <span className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold block">Eventos</span>
                            <span className="text-sm font-black text-brand-accent">{syncSummary.matchedEventsCount}</span>
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-brand-text-muted text-center italic">
                        Clique em avançar para finalizar a sua configuração.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* 3. SLIDE DE CONCLUSÃO (step === 'complete') */}
            {(isCompleteStep || (isAgendaStep && (agendaAlreadySynced || syncSummary))) && (
              <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center space-y-6 md:space-y-7 relative">
                
                {/* Confetes em CSS */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none -mx-10 -my-6">
                  {[...Array(16)].map((_, i) => {
                    const colors = ['bg-brand-accent', 'bg-brand-primary', 'bg-amber-400', 'bg-blue-400', 'bg-pink-400'];
                    const color = colors[i % colors.length];
                    const left = `${(i * 7) % 100}%`;
                    const delay = `${(i * 0.18).toFixed(2)}s`;
                    const duration = `${(1.8 + (i % 2.5)).toFixed(2)}s`;
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 w-2 h-4 ${color} rounded-sm opacity-0`}
                        style={{
                          left,
                          animation: `confettiFall ${duration} infinite linear`,
                          animationDelay: delay,
                          transform: `rotate(${(i * 45) % 360}deg)`
                        }}
                      />
                    );
                  })}
                </div>

                {/* Ilustração Troféu / Sucesso */}
                <div className="w-36 h-36 rounded-full bg-emerald-50 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-full anim-pulse-glow" />
                  <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg relative z-10 anim-float">
                    <Award size={32} className="stroke-[1.5]" />
                  </div>
                </div>

                <div className="space-y-2 px-2 relative z-10">
                  <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-primary">
                    Tudo Pronto!
                  </h1>
                  <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                    Você configurou o seu ambiente e já sabe como funciona. A partir de agora, a sua clínica está pronta para registrar evoluções com Inteligência Artificial.
                  </p>
                </div>

                {/* Lista rápida de etapas concluídas */}
                <div className="w-full max-w-sm bg-brand-bg/50 border border-brand-border/30 rounded-2xl p-4 text-left space-y-2 relative z-10">
                  <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block border-b border-brand-border/40 pb-1 mb-2">Progresso do Treinamento</span>
                  {[
                    'Apresentação da plataforma',
                    'Criação do primeiro paciente com prontuário',
                    'Criação da evolução clínica por voz de teste',
                    'Sincronização de agenda com Google Calendar'
                  ].map((label, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-brand-text">
                      <CheckCircle2 size={14} className="text-emerald-600 stroke-[2.5]" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>

          {/* Rodapé do Slider: Controles e Dots de Navegação */}
          <div className="p-6 border-t border-brand-border/30 flex items-center justify-between relative z-10 bg-white">
            
            {/* Se for introdução, exibe botões clássicos do slider */}
            {activeStep === 'intro' ? (
              <>
                {/* Botão Voltar */}
                <button
                  type="button"
                  disabled={activeSlide === 0}
                  onClick={() => setActiveSlide((prev) => prev - 1)}
                  className="px-4 py-2 text-xs font-bold text-brand-text-muted hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-colors disabled:opacity-0 disabled:pointer-events-none"
                >
                  <ChevronLeft size={16} className="inline mr-1" />
                  Voltar
                </button>

                {/* Dots centralizados no Desktop */}
                <div className="hidden md:flex items-center gap-1.5">
                  {[...Array(4)].map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        idx === activeSlide ? 'w-5 bg-brand-primary' : 'w-2 bg-brand-border hover:bg-brand-text-muted/30'
                      }`}
                    />
                  ))}
                </div>

                {/* Botão Próximo / Começar */}
                {activeSlide < 3 ? (
                  <button
                    type="button"
                    onClick={() => setActiveSlide((prev) => prev + 1)}
                    className="btn-primary px-5 py-2.5 text-xs font-bold inline-flex items-center gap-1 shadow-sm"
                  >
                    Avançar
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartOnboarding}
                    className="btn-primary px-6 py-2.5 text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-brand-primary/15"
                  >
                    Iniciar Configuração
                    <ArrowRight size={14} />
                  </button>
                )}
              </>
            ) : isAgendaStep && !syncSummary && !agendaAlreadySynced ? (
              // Se for a etapa da agenda e ainda não foi sincronizada, pode permitir avançar como pulado ou botão secundário
              <>
                <button
                  type="button"
                  onClick={() => navigate('/painel/dashboard')}
                  className="px-4 py-2 text-xs font-bold text-brand-text-muted hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-colors"
                >
                  Sincronizar Depois
                </button>

                <button
                  type="button"
                  onClick={handleSyncAgenda}
                  disabled={syncingAgenda}
                  className="btn-primary px-6 py-2.5 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  {syncingAgenda ? 'Sincronizando...' : 'Sincronizar Agora'}
                  <RefreshCw size={14} className={syncingAgenda ? 'animate-spin' : ''} />
                </button>
              </>
            ) : (
              // Etapa de conclusão ou agenda sincronizada com sucesso
              <button
                type="button"
                onClick={handleFinish}
                className="btn-primary w-full py-3 text-xs font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/10"
              >
                Acessar o Painel de Controle
                <ArrowRight size={16} />
              </button>
            )}

          </div>

        </div>

      </div>
      
      <GoogleSecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onConfirm={executeGoogleConnection}
        confirmLabel="Conectar com Google"
      />
    </div>
  );
}

// Subcomponente de Desenho de Pasta em CSS
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
    </svg>
  );
}
