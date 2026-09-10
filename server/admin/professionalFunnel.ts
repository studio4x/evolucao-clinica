export const PROFESSIONAL_FUNNEL_STAGES = [
  { key: 'registered', label: 'Cadastro criado', description: 'Ainda não verificou o WhatsApp.' },
  { key: 'whatsapp_verified', label: 'WhatsApp verificado', description: 'Pronto para escolher como começar.' },
  { key: 'onboarding_choice', label: 'Caminho escolhido', description: 'Escolheu ajuda guiada ou explorar primeiro.' },
  { key: 'first_patient', label: 'Primeiro paciente', description: 'Criou ao menos um paciente.' },
  { key: 'linked_record', label: 'Prontuário vinculado', description: 'Conectou ao menos um prontuário.' },
  { key: 'first_evolution', label: 'Primeira evolução', description: 'Concluiu a primeira evolução clínica.' },
  { key: 'returned', label: 'Retornou ao app', description: 'Usou a plataforma em dois ou mais dias.' },
  { key: 'paid', label: 'Plano assinado', description: 'Possui assinatura mensal ou anual ativa.' },
] as const;

export type ProfessionalFunnelStageKey = typeof PROFESSIONAL_FUNNEL_STAGES[number]['key'];
export type ProfessionalCommercialStatus = 'paid' | 'courtesy' | 'trial_active' | 'trial_expired' | 'no_plan';

export type ProfessionalFunnelProfessionalRow = {
  id: string;
  full_name?: string | null;
  google_email?: string | null;
  role?: string | null;
  status?: string | null;
  created_at: string;
  onboarding_initial_mode?: string | null;
  onboarding_choice_at?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  trial_ends_at?: string | null;
};

export type ProfessionalFunnelStateRow = {
  user_id: string;
  usage_days_count?: number | string | null;
  patients_count?: number | string | null;
  first_patient_at?: string | null;
  linked_records_count?: number | string | null;
  first_record_linked_at?: string | null;
  evolutions_count?: number | string | null;
  first_evolution_completed_at?: string | null;
  last_activity_at?: string | null;
  subscription_started_at?: string | null;
};

export type ProfessionalFunnelOtpRow = {
  user_id: string;
  verified_at?: string | null;
};

const numericValue = (value: number | string | null | undefined) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPaid = (professional: ProfessionalFunnelProfessionalRow) => (
  professional.status === 'active'
  && professional.subscription_status === 'active'
  && (professional.subscription_plan === 'monthly' || professional.subscription_plan === 'yearly')
);

export function getProfessionalCommercialStatus(
  professional: ProfessionalFunnelProfessionalRow,
  now = new Date()
): ProfessionalCommercialStatus {
  if (isPaid(professional)) return 'paid';
  if (professional.subscription_plan === 'courtesy') return 'courtesy';

  const trialEndsAt = professional.trial_ends_at ? new Date(professional.trial_ends_at).getTime() : Number.NaN;
  if (Number.isFinite(trialEndsAt)) return trialEndsAt <= now.getTime() ? 'trial_expired' : 'trial_active';
  if (professional.subscription_plan === 'trial' || professional.subscription_status === 'trialing') return 'trial_active';
  return 'no_plan';
}

export function getProfessionalFunnelStage(input: {
  professional: ProfessionalFunnelProfessionalRow;
  state?: ProfessionalFunnelStateRow | null;
  whatsappVerifiedAt?: string | null;
}): ProfessionalFunnelStageKey {
  const { professional, state } = input;

  if (isPaid(professional)) return 'paid';
  if (numericValue(state?.usage_days_count) >= 2) return 'returned';
  if (state?.first_evolution_completed_at) return 'first_evolution';
  if (state?.first_record_linked_at || numericValue(state?.linked_records_count) > 0) return 'linked_record';
  if (state?.first_patient_at || numericValue(state?.patients_count) > 0) return 'first_patient';
  if (professional.onboarding_initial_mode === 'guided' || professional.onboarding_initial_mode === 'explore') return 'onboarding_choice';
  if (input.whatsappVerifiedAt) return 'whatsapp_verified';
  return 'registered';
}

export function buildProfessionalFunnelBoard(input: {
  professionals: ProfessionalFunnelProfessionalRow[];
  states: ProfessionalFunnelStateRow[];
  otps: ProfessionalFunnelOtpRow[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const stateByProfessional = new Map(input.states.map((state) => [state.user_id, state]));
  const verifiedAtByProfessional = new Map<string, string>();

  input.otps.forEach((otp) => {
    if (!otp.verified_at) return;
    const current = verifiedAtByProfessional.get(otp.user_id);
    if (!current || new Date(otp.verified_at).getTime() < new Date(current).getTime()) {
      verifiedAtByProfessional.set(otp.user_id, otp.verified_at);
    }
  });

  const professionals = input.professionals
    .filter((professional) => professional.role !== 'admin')
    .map((professional) => {
      const state = stateByProfessional.get(professional.id) || null;
      const whatsappVerifiedAt = verifiedAtByProfessional.get(professional.id) || null;
      const stage = getProfessionalFunnelStage({ professional, state, whatsappVerifiedAt });
      const stageReachedAtByKey: Partial<Record<ProfessionalFunnelStageKey, string | null | undefined>> = {
        registered: professional.created_at,
        whatsapp_verified: whatsappVerifiedAt,
        onboarding_choice: professional.onboarding_choice_at,
        first_patient: state?.first_patient_at,
        linked_record: state?.first_record_linked_at,
        first_evolution: state?.first_evolution_completed_at,
        returned: state?.last_activity_at,
        paid: state?.subscription_started_at,
      };

      return {
        id: professional.id,
        fullName: professional.full_name?.trim() || 'Profissional sem nome',
        email: professional.google_email?.trim() || 'E-mail não informado',
        accountStatus: professional.status || 'pending',
        createdAt: professional.created_at,
        onboardingInitialMode: professional.onboarding_initial_mode || null,
        onboardingChoiceAt: professional.onboarding_choice_at || null,
        subscriptionPlan: professional.subscription_plan || null,
        subscriptionStatus: professional.subscription_status || null,
        subscriptionEndsAt: professional.subscription_ends_at || null,
        trialEndsAt: professional.trial_ends_at || null,
        commercialStatus: getProfessionalCommercialStatus(professional, now),
        stage,
        stageReachedAt: stageReachedAtByKey[stage] || professional.created_at,
        metrics: {
          usageDaysCount: numericValue(state?.usage_days_count),
          patientsCount: numericValue(state?.patients_count),
          linkedRecordsCount: numericValue(state?.linked_records_count),
          evolutionsCount: numericValue(state?.evolutions_count),
        },
      };
    })
    .sort((left, right) => new Date(right.stageReachedAt).getTime() - new Date(left.stageReachedAt).getTime());

  const stageCounts = Object.fromEntries(PROFESSIONAL_FUNNEL_STAGES.map((stage) => [
    stage.key,
    professionals.filter((professional) => professional.stage === stage.key).length,
  ]));
  const commercialCounts = professionals.reduce<Record<ProfessionalCommercialStatus, number>>((counts, professional) => {
    counts[professional.commercialStatus] += 1;
    return counts;
  }, { paid: 0, courtesy: 0, trial_active: 0, trial_expired: 0, no_plan: 0 });

  return {
    generatedAt: now.toISOString(),
    total: professionals.length,
    stageCounts,
    commercialCounts,
    stages: PROFESSIONAL_FUNNEL_STAGES,
    professionals,
  };
}

async function fetchAllProfessionals(supabaseAdmin: any) {
  const rows: ProfessionalFunnelProfessionalRow[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('professionals')
      .select('id, full_name, google_email, role, status, created_at, onboarding_initial_mode, onboarding_choice_at, subscription_plan, subscription_status, subscription_ends_at, trial_ends_at')
      .or('role.is.null,role.neq.admin')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  return rows;
}

export async function getProfessionalFunnelBoard(supabaseAdmin: any) {
  const professionals = await fetchAllProfessionals(supabaseAdmin);
  const ids = professionals.map((professional) => professional.id);
  if (ids.length === 0) return buildProfessionalFunnelBoard({ professionals: [], states: [], otps: [] });

  const states: ProfessionalFunnelStateRow[] = [];
  const otps: ProfessionalFunnelOtpRow[] = [];
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const [stateResult, otpResult] = await Promise.all([
      supabaseAdmin
        .from('lifecycle_user_state')
        .select('user_id, usage_days_count, patients_count, first_patient_at, linked_records_count, first_record_linked_at, evolutions_count, first_evolution_completed_at, last_activity_at, subscription_started_at')
        .in('user_id', chunk),
      supabaseAdmin
        .from('whatsapp_otp_challenges')
        .select('user_id, verified_at')
        .in('user_id', chunk)
        .not('verified_at', 'is', null),
    ]);
    if (stateResult.error) throw stateResult.error;
    if (otpResult.error) throw otpResult.error;
    states.push(...(stateResult.data || []));
    otps.push(...(otpResult.data || []));
  }

  return buildProfessionalFunnelBoard({ professionals, states, otps });
}
