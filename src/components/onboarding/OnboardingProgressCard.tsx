import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Check, ChevronDown, ChevronUp, Circle, FileText, Loader2, Sparkles, UserRound, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  getNextOnboardingTarget,
  getOnboardingDestinationForState,
  hasCompletedEssentialOnboardingSteps,
} from '../../utils/onboardingState';
import { completeOnboarding, resumeOnboarding } from '../../utils/onboarding';

type OnboardingProgressCardProps = {
  userId: string;
};

type ProgressSnapshot = {
  onboardingCompleted: boolean;
  profileReady: boolean;
  patients: Array<{ id: string; google_doc_id: string | null }>;
  evolutionsCount: number;
};

const getCollapseKey = (userId: string) => `onboarding-progress-card-collapsed:${userId}`;

export function OnboardingProgressCard({ userId }: OnboardingProgressCardProps) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const completionReconciledRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(getCollapseKey(userId)) === '1'
  ));

  useEffect(() => {
    let active = true;

    const loadProgress = async () => {
      setLoading(true);
      const [profileResult, patientsResult, evolutionsResult] = await Promise.all([
        supabase
          .from('professionals')
          .select('onboarding_completed, professional_title, work_context')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('patients')
          .select('id, google_doc_id')
          .eq('professional_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: true }),
        supabase
          .from('evolutions')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', userId)
          .eq('transcription_status', 'completed'),
      ]);

      if (!active) return;
      if (profileResult.error || patientsResult.error || evolutionsResult.error) {
        console.warn('[OnboardingProgress] Não foi possível carregar o checklist.');
        setLoading(false);
        return;
      }

      setSnapshot({
        onboardingCompleted: profileResult.data?.onboarding_completed === true,
        profileReady: Boolean(
          profileResult.data?.professional_title?.trim()
          && profileResult.data?.work_context?.trim()
        ),
        patients: patientsResult.data || [],
        evolutionsCount: evolutionsResult.count || 0,
      });
      setLoading(false);
    };

    void loadProgress();
    return () => { active = false; };
  }, [userId]);

  const steps = useMemo(() => {
    const patients = snapshot?.patients || [];
    return [
      { key: 'profile', label: 'Perfil profissional', complete: snapshot?.profileReady === true, icon: UserRound },
      { key: 'patient', label: 'Primeiro paciente', complete: patients.length > 0, icon: Users },
      { key: 'record', label: 'Prontuário no Google Docs', complete: patients.some(patient => Boolean(patient.google_doc_id)), icon: FileText },
      { key: 'evolution', label: 'Primeira evolução', complete: Boolean(snapshot && snapshot.evolutionsCount > 0), icon: Sparkles },
    ];
  }, [snapshot]);

  const essentialStepsCompleted = Boolean(snapshot && hasCompletedEssentialOnboardingSteps(snapshot));

  useEffect(() => {
    if (
      !snapshot
      || snapshot.onboardingCompleted
      || !essentialStepsCompleted
      || completionReconciledRef.current
    ) return;
    completionReconciledRef.current = true;
    completeOnboarding(userId);
  }, [essentialStepsCompleted, snapshot, userId]);

  if (loading || !snapshot || snapshot.onboardingCompleted || essentialStepsCompleted) return null;

  const completedCount = steps.filter(step => step.complete).length;
  const progressPercentage = Math.round((completedCount / steps.length) * 100);
  const handleResume = async () => {
    setResuming(true);
    setErrorMessage('');
    try {
      const target = getNextOnboardingTarget(snapshot);
      const nextState = await resumeOnboarding(userId, target);
      navigate(getOnboardingDestinationForState(nextState));
    } catch (error) {
      console.error('[OnboardingProgress] Falha ao retomar configuração:', error);
      setErrorMessage('Não foi possível retomar agora. Verifique a conexão e tente novamente.');
    } finally {
      setResuming(false);
    }
  };

  const handleToggleCollapsed = () => {
    const nextCollapsed = !collapsed;
    window.localStorage.setItem(getCollapseKey(userId), nextCollapsed ? '1' : '0');
    setCollapsed(nextCollapsed);
  };

  return (
    <section className={`relative overflow-hidden rounded-3xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/[0.06] via-white to-brand-accent/10 shadow-sm ${collapsed ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}>
      <button
        type="button"
        onClick={handleToggleCollapsed}
        aria-label={collapsed ? 'Expandir configuração flexível' : 'Recolher configuração flexível'}
        aria-expanded={!collapsed}
        aria-controls="onboarding-progress-details"
        className="absolute right-4 top-4 rounded-full p-2 text-brand-text-muted transition hover:bg-white hover:text-brand-text"
      >
        {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>

      {collapsed ? (
        <div className="flex min-h-9 flex-col items-start gap-2 pr-11 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/15 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
            <Sparkles size={12} />
            Configuração flexível
          </div>
          <p className="text-sm font-semibold text-brand-primary">{completedCount}/{steps.length} etapas</p>
        </div>
      ) : (
        <div id="onboarding-progress-details">
          <div className="pr-10 sm:flex sm:items-start sm:justify-between sm:gap-8">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-primary/15 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                <Sparkles size={12} />
                Configuração flexível
              </div>
              <h2 className="font-display text-xl font-bold text-brand-text">Prepare seu espaço clínico no seu ritmo</h2>
              <p className="mt-2 text-sm leading-6 text-brand-text-muted">
                Você já pode conhecer o aplicativo. Quando quiser, retome a configuração guiada exatamente do próximo passo.
              </p>
            </div>
            <div className="mt-4 min-w-[150px] sm:mt-0 sm:text-right">
              <p className="text-2xl font-bold text-brand-primary">{completedCount}/{steps.length}</p>
              <p className="text-xs font-medium text-brand-text-muted">etapas essenciais</p>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-brand-border/70">
            <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${progressPercentage}%` }} />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map(step => {
              const Icon = step.icon;
              return (
                <div key={step.key} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${step.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-brand-border bg-white text-brand-text-muted'}`}>
                  {step.complete ? <Check size={15} /> : <Icon size={15} />}
                  <span>{step.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand-border bg-white/70 px-3 py-2.5 text-xs font-semibold text-brand-text-muted">
              <Calendar size={15} />
              <span>Google Agenda <span className="font-normal">(opcional)</span></span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-brand-text-muted">
              <Circle size={8} className="fill-current" />
              O acesso ao painel não depende da conclusão deste checklist.
            </p>
            <button
              type="button"
              onClick={() => void handleResume()}
              disabled={resuming}
              className="btn-primary justify-center whitespace-nowrap px-5 py-2.5 disabled:opacity-60"
            >
              {resuming ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ArrowRight size={16} className="mr-2" />}
              {completedCount === 0 ? 'Iniciar configuração' : 'Continuar configuração'}
            </button>
          </div>

          {errorMessage && <p className="mt-3 text-right text-xs font-medium text-red-600">{errorMessage}</p>}
        </div>
      )}
    </section>
  );
}
