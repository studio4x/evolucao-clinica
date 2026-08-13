import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BriefcaseBusiness, Loader2, Stethoscope } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { getOnboardingState, isOnboardingComplete } from '../../utils/onboarding';
import {
  PROFESSIONAL_OPTIONS,
  WORK_CONTEXT_OPTIONS,
  type WorkContext,
  isDeclaredProfessionalTitle,
  isValidWorkContext,
} from '../../constants/professionalProfile';
import { trackEvent } from '../../services/analytics';

type GrowthProfileGateProps = {
  children: ReactNode;
};

type GrowthProfileData = {
  professional_title: string | null;
  work_context: string | null;
  onboarding_completed: boolean | null;
};

const POLL_INTERVAL_MS = 300;

const isMissingWorkContextColumn = (message?: string | null) => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('work_context') && (
    normalized.includes('column') ||
    normalized.includes('schema cache') ||
    normalized.includes('does not exist')
  );
};

export function GrowthProfileGate({ children }: GrowthProfileGateProps) {
  const { user, isAuthReady, profileRole } = useAuthStore();
  const checkedUserRef = useRef<string | null>(null);
  const [isEligibleOnboardingStep, setIsEligibleOnboardingStep] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [professionalOption, setProfessionalOption] = useState('');
  const [customProfessional, setCustomProfessional] = useState('');
  const [workContext, setWorkContext] = useState<WorkContext | ''>('');

  useEffect(() => {
    checkedUserRef.current = null;
    setShowGate(false);
    setErrorMessage('');
    setProfessionalOption('');
    setCustomProfessional('');
    setWorkContext('');
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthReady || !user || profileRole === 'admin') {
      setIsEligibleOnboardingStep(false);
      return;
    }

    const evaluate = () => {
      if (isOnboardingComplete(user.id)) {
        setIsEligibleOnboardingStep(false);
        return;
      }

      const state = getOnboardingState(user.id);
      setIsEligibleOnboardingStep(Boolean(
        state?.step === 'patient' ||
        state?.step === 'evolution' ||
        state?.step === 'agenda'
      ));
    };

    evaluate();
    const timer = window.setInterval(evaluate, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isAuthReady, profileRole, user]);

  useEffect(() => {
    if (!user || !isEligibleOnboardingStep || profileRole === 'admin') return;
    if (checkedUserRef.current === user.id) return;

    checkedUserRef.current = user.id;
    setCheckingProfile(true);

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('professional_title, work_context, onboarding_completed')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        if (!isMissingWorkContextColumn(error.message)) {
          console.warn('[GrowthProfileGate] Não foi possível consultar o perfil de Growth:', error.message);
        }
        // Falha aberta: schema/telemetria nunca pode bloquear o uso principal.
        setShowGate(false);
        return;
      }

      const profileData = data as GrowthProfileData | null;

      if (!profileData || profileData.onboarding_completed === true) {
        setShowGate(false);
        return;
      }

      const title = profileData.professional_title?.trim() || '';
      const hasDeclaredTitle = isDeclaredProfessionalTitle(title);
      const hasDeclaredWorkContext = isValidWorkContext(profileData.work_context);

      if (hasDeclaredTitle) {
        if ((PROFESSIONAL_OPTIONS as readonly string[]).includes(title)) {
          setProfessionalOption(title);
        } else {
          setProfessionalOption('Outro');
          setCustomProfessional(title);
        }
      }

      if (hasDeclaredWorkContext) {
        setWorkContext(profileData.work_context as WorkContext);
      }

      setShowGate(!(hasDeclaredTitle && hasDeclaredWorkContext));
    };

    void loadProfile().finally(() => setCheckingProfile(false));
  }, [isEligibleOnboardingStep, profileRole, user]);

  const handleSave = async () => {
    if (!user) return;

    const finalProfessional = professionalOption === 'Outro'
      ? customProfessional.trim()
      : professionalOption.trim();

    if (!finalProfessional) {
      setErrorMessage('Selecione sua profissão para continuar.');
      return;
    }

    if (!workContext) {
      setErrorMessage('Selecione como você atua profissionalmente hoje.');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const { error } = await supabase
        .from('professionals')
        .update({
          professional_title: finalProfessional,
          work_context: workContext,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          professional_title: finalProfessional,
        },
      });

      if (authError) {
        // O banco é a fonte de verdade para segmentação; metadata é compatibilidade.
        console.warn('[GrowthProfileGate] Perfil salvo, mas metadata do Auth não foi sincronizada:', authError.message);
      }

      trackEvent('professional_profile_complete', {
        professional_segment: finalProfessional,
        work_context: workContext
      }, { dedupeKey: `professional_profile_complete:${user.id}`, persistDedupe: true });
      setShowGate(false);
    } catch (error: any) {
      console.error('[GrowthProfileGate] Erro ao salvar perfil de Growth:', error);
      setErrorMessage(error?.message || 'Não foi possível salvar essas informações. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {children}

      {showGate && !checkingProfile && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="growth-profile-title"
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#105576]/10 px-3 py-1.5 text-xs font-semibold text-[#105576]">
                <Stethoscope className="h-4 w-4" />
                Configuração do perfil
              </div>
              <h2 id="growth-profile-title" className="text-2xl font-bold tracking-tight text-slate-900">
                Antes de começar, conte um pouco sobre sua atuação
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                São duas informações rápidas para adaptar melhor sua experiência no Evolução Clínica.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="growth-profession" className="mb-2 block text-sm font-semibold text-slate-800">
                  Qual é a sua profissão?
                </label>
                <select
                  id="growth-profession"
                  value={professionalOption}
                  onChange={(event) => {
                    setProfessionalOption(event.target.value);
                    setErrorMessage('');
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-[#105576] focus:ring-2 focus:ring-[#105576]/20"
                  disabled={saving}
                >
                  <option value="">Selecione...</option>
                  {PROFESSIONAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  <option value="Outro">Outro</option>
                </select>

                {professionalOption === 'Outro' && (
                  <input
                    type="text"
                    value={customProfessional}
                    onChange={(event) => {
                      setCustomProfessional(event.target.value);
                      setErrorMessage('');
                    }}
                    placeholder="Informe sua profissão"
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-[#105576] focus:ring-2 focus:ring-[#105576]/20"
                    disabled={saving}
                    autoComplete="organization-title"
                  />
                )}
              </div>

              <fieldset>
                <legend className="mb-2 block text-sm font-semibold text-slate-800">
                  Como você atua profissionalmente hoje?
                </legend>
                <div className="space-y-2.5">
                  {WORK_CONTEXT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                        workContext === option.value
                          ? 'border-[#105576] bg-[#105576]/5 ring-1 ring-[#105576]/15'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="growth-work-context"
                        value={option.value}
                        checked={workContext === option.value}
                        onChange={() => {
                          setWorkContext(option.value);
                          setErrorMessage('');
                        }}
                        className="mt-0.5 h-4 w-4 accent-[#105576]"
                        disabled={saving}
                      />
                      <span className="text-sm leading-5 text-slate-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#105576] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d4967] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Continuar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
