import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, CheckCircle2, FileText, Mic, Sparkles, Users, ArrowRight, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { completeOnboarding, ensureOnboardingState, getOnboardingDestination, getOnboardingState, setOnboardingState } from '../utils/onboarding';
import { listGoogleCalendarEvents } from '../services/googleCalendar';

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

  const steps = [
    'Funcionalidades',
    'Paciente + prontuário',
    'Evolução',
    'Agenda',
    'Conclusão'
  ];

  const currentStepIndex = isCompleteStep || syncSummary || agendaAlreadySynced ? 4 : isAgendaStep ? 3 : 0;

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="flex flex-col items-center text-center gap-5">
          <div className="p-3 bg-white rounded-3xl shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
            <img
              src={appendBrandAssetVersion(siteConfig.logo_light_url || '/logotipo-transparente-1024.png', assetSignature)}
              alt="Evolução Clínica"
              className="h-16 sm:h-20 w-auto object-contain"
            />
          </div>
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-primary/10 text-brand-primary">
              <Sparkles size={14} />
              Onboarding guiado
            </span>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-brand-primary">
              Vamos configurar sua primeira jornada na plataforma
            </h1>
            <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
              Em poucos passos você verá as funcionalidades, criará seu primeiro paciente com prontuário,
              gerará uma evolução e sincronizará a agenda para começar com o fluxo completo.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {steps.map((label, index) => {
            const isDone = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <div
                key={label}
                className={`rounded-2xl border p-3 text-center text-xs sm:text-sm font-semibold transition-all ${
                  isDone
                    ? 'border-brand-primary/20 bg-brand-primary/5 text-brand-primary'
                    : isCurrent
                      ? 'border-brand-primary bg-white shadow-sm text-brand-primary'
                      : 'border-brand-border bg-white/70 text-brand-text-muted'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {isDone ? <CheckCircle2 size={14} /> : <span className="text-[10px]">{String(index + 1).padStart(2, '0')}</span>}
                  <span>{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          {!isAgendaStep && !isCompleteStep && (
            <div className="card p-6 sm:p-8 bg-white border border-brand-border shadow-2xl shadow-brand-primary/5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold">
                    <ShieldCheck size={14} />
                    Primeiro acesso
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-display font-bold text-brand-text">
                    Conheça o que a plataforma faz antes de começar
                  </h2>
                  <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                    Depois vamos criar seu primeiro paciente já com prontuário e, em seguida,
                    passar pela evolução clínica para deixar tudo pronto para uso real.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartOnboarding}
                    className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold shadow-lg shadow-brand-primary/20"
                  >
                    Começar onboarding
                    <ArrowRight size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      icon: Users,
                      title: 'Pacientes',
                      description: 'Cadastre e organize pacientes com dados clínicos e lembretes.'
                    },
                    {
                      icon: FileText,
                      title: 'Prontuário',
                      description: 'Crie o documento do paciente no Google Docs em poucos cliques.'
                    },
                    {
                      icon: Mic,
                      title: 'Evoluções',
                      description: 'Grave ou envie áudios para gerar evoluções clínicas com IA.'
                    },
                    {
                      icon: Calendar,
                      title: 'Agenda',
                      description: 'Sincronize os atendimentos do Google Agenda com o painel.'
                    }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="rounded-2xl border border-brand-border bg-brand-bg/40 p-4">
                        <div className="w-11 h-11 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-3">
                          <Icon size={20} />
                        </div>
                        <h3 className="font-semibold text-brand-text">{item.title}</h3>
                        <p className="mt-1 text-xs sm:text-sm text-brand-text-muted leading-relaxed">{item.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {isAgendaStep && !isCompleteStep && (
            <div className="card p-6 sm:p-8 bg-white border border-brand-border shadow-2xl shadow-brand-primary/5">
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold">
                    <RefreshCw size={14} />
                    Sincronização de agenda
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-2xl sm:text-3xl font-display font-bold text-brand-text">
                      Sincronize sua agenda para levar os atendimentos para o painel
                    </h2>
                    <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                      O próximo passo é conectar o Google Agenda e importar os compromissos que coincidem com os pacientes ativos.
                    </p>
                  </div>

                  {!googleAccessToken ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
                      <p className="text-sm font-medium text-amber-800">
                        Sua conexão com o Google precisa ser renovada antes de sincronizar a agenda.
                      </p>
                      <button
                        type="button"
                        onClick={handleConnectGoogleCalendar}
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
                      >
                        Renovar conexão com Google
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-brand-border bg-brand-bg/40 p-5 space-y-4">
                      <p className="text-sm text-brand-text-muted">
                        Conectado como <span className="font-semibold text-brand-primary">{user?.email}</span>
                      </p>
                      <button
                        type="button"
                        onClick={handleSyncAgenda}
                        disabled={syncingAgenda}
                        className="btn-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold shadow-lg shadow-brand-primary/20 disabled:opacity-60"
                      >
                        {syncingAgenda ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Sincronizando...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={16} />
                            Sincronizar agenda
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {syncError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {syncError}
                    </div>
                  )}

                  {syncSummary && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
                      <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                        <CheckCircle2 size={18} />
                        Agenda sincronizada com sucesso
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-white border border-emerald-100 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">Pacientes</p>
                          <p className="text-lg font-bold text-emerald-900">{syncSummary.patientsCount}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-emerald-100 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">Evoluções</p>
                          <p className="text-lg font-bold text-emerald-900">{syncSummary.evolutionsCount}</p>
                        </div>
                        <div className="rounded-xl bg-white border border-emerald-100 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">Eventos encontrados</p>
                          <p className="text-lg font-bold text-emerald-900">{syncSummary.matchedEventsCount}</p>
                        </div>
                      </div>
                      <p className="text-xs text-emerald-700">
                        Sincronizado em {new Date(syncSummary.syncedAt).toLocaleString('pt-BR')}.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl bg-brand-bg/50 border border-brand-border p-5 sm:p-6 flex flex-col justify-between gap-5">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                      <Calendar size={28} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-display font-bold text-brand-text">Resumo do fluxo</h3>
                      <p className="text-sm text-brand-text-muted leading-relaxed">
                        Você já passou pela apresentação da plataforma, criou um paciente, gerou a evolução e agora está concluindo a integração com a agenda.
                      </p>
                    </div>
                    <ul className="space-y-2 text-sm text-brand-text-muted">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Funcionalidades apresentadas
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Paciente com prontuário criado
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Evolução inicial finalizada
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Agenda preparada para sincronização
                      </li>
                    </ul>
                  </div>

                  {(syncSummary || agendaAlreadySynced) ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
                      <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                        <Sparkles size={18} />
                        Você concluiu o onboarding
                      </div>
                      <p className="text-sm text-emerald-700 leading-relaxed">
                        Agora você pode entrar no painel e usar a plataforma normalmente.
                      </p>
                      <button
                        type="button"
                        onClick={handleFinish}
                        className="btn-primary w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold"
                      >
                        Ir para o painel
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-brand-border bg-white p-5 text-sm text-brand-text-muted leading-relaxed">
                      Depois de sincronizar, exibiremos a mensagem de conclusão e liberaremos seu acesso ao painel.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isCompleteStep && (
            <div className="card p-6 sm:p-8 bg-white border border-brand-border shadow-2xl shadow-brand-primary/5 text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-3 max-w-xl mx-auto">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-brand-text">Onboarding concluído</h2>
                <p className="text-sm sm:text-base text-brand-text-muted leading-relaxed">
                  Sua conta está pronta. Você já pode acessar o painel, criar novos pacientes e processar evoluções com o fluxo completo configurado.
                </p>
              </div>
              <button
                type="button"
                onClick={handleFinish}
                className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold shadow-lg shadow-brand-primary/20"
              >
                Ir para o painel
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
