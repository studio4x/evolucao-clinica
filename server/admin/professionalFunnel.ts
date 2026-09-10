export const PROFESSIONAL_FUNNEL_STAGES = [
  { key: 'registered', label: 'Cadastro criado', description: 'Conta criada, sem avanço clínico registrado.' },
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
  last_sign_in_at?: string | null;
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

export type ProfessionalFunnelPreferenceRow = {
  user_id: string;
  whatsapp_number?: string | null;
  whatsapp_opt_in?: boolean | null;
};

export type ProfessionalFunnelContactLogRow = {
  target_id: string;
  metadata?: { channel?: string; sent?: boolean } | null;
  created_at: string;
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
  return 'registered';
}

export function buildProfessionalFunnelBoard(input: {
  professionals: ProfessionalFunnelProfessionalRow[];
  states: ProfessionalFunnelStateRow[];
  otps: ProfessionalFunnelOtpRow[];
  preferences?: ProfessionalFunnelPreferenceRow[];
  contactLogs?: ProfessionalFunnelContactLogRow[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const stateByProfessional = new Map(input.states.map((state) => [state.user_id, state]));
  const preferencesByProfessional = new Map((input.preferences || []).map((preferences) => [preferences.user_id, preferences]));
  const contactStatusByProfessional = new Map<string, { whatsappSentAt: string | null; emailSentAt: string | null }>();
  const contactStatusSeen = new Set<string>();
  [...(input.contactLogs || [])]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .forEach((log) => {
      const channel = log.metadata?.channel;
      if (channel !== 'whatsapp' && channel !== 'email') return;
      const seenKey = `${log.target_id}:${channel}`;
      if (contactStatusSeen.has(seenKey)) return;
      contactStatusSeen.add(seenKey);
      const current = contactStatusByProfessional.get(log.target_id) || { whatsappSentAt: null, emailSentAt: null };
      const key = channel === 'whatsapp' ? 'whatsappSentAt' : 'emailSentAt';
      current[key] = log.metadata?.sent === true ? log.created_at : null;
      contactStatusByProfessional.set(log.target_id, current);
    });
  const verifiedAtByProfessional = new Map<string, string>();

  input.otps.forEach((otp) => {
    if (!otp.verified_at) return;
    const current = verifiedAtByProfessional.get(otp.user_id);
    if (!current || new Date(otp.verified_at).getTime() < new Date(current).getTime()) {
      verifiedAtByProfessional.set(otp.user_id, otp.verified_at);
    }
  });

  const professionals = input.professionals
    .filter((professional) => professional.role !== 'admin' && professional.subscription_plan !== 'courtesy')
    .map((professional) => {
      const state = stateByProfessional.get(professional.id) || null;
      const preferences = preferencesByProfessional.get(professional.id) || null;
      const contactStatus = contactStatusByProfessional.get(professional.id) || { whatsappSentAt: null, emailSentAt: null };
      const whatsappVerifiedAt = verifiedAtByProfessional.get(professional.id) || null;
      const stage = getProfessionalFunnelStage({ professional, state, whatsappVerifiedAt });
      const stageReachedAtByKey: Partial<Record<ProfessionalFunnelStageKey, string | null | undefined>> = {
        registered: professional.created_at,
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
        whatsappNumber: String(preferences?.whatsapp_number || '').replace(/\D/g, '') || null,
        whatsappVerifiedAt,
        whatsappOptIn: preferences?.whatsapp_opt_in === true,
        whatsappSentAt: contactStatus.whatsappSentAt,
        emailSentAt: contactStatus.emailSentAt,
        accountStatus: professional.status || 'pending',
        createdAt: professional.created_at,
        lastAccessAt: professional.last_sign_in_at || null,
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

async function fetchAuthLastSignIns(supabaseAdmin: any) {
  const lastSignInByProfessional = new Map<string, string | null>();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    users.forEach((user: any) => {
      lastSignInByProfessional.set(user.id, user.last_sign_in_at || null);
    });
    if (users.length < perPage) break;
  }
  return lastSignInByProfessional;
}

export async function getProfessionalFunnelBoard(supabaseAdmin: any) {
  const professionals = await fetchAllProfessionals(supabaseAdmin);
  let lastSignInByProfessional = new Map<string, string | null>();
  try {
    lastSignInByProfessional = await fetchAuthLastSignIns(supabaseAdmin);
  } catch (error: any) {
    console.warn('[ProfessionalFunnel] Não foi possível carregar o último acesso pelo Auth:', error?.message || error);
  }
  const professionalsWithAccess = professionals.map((professional) => ({
    ...professional,
    last_sign_in_at: lastSignInByProfessional.get(professional.id) || null,
  }));
  const ids = professionalsWithAccess.map((professional) => professional.id);
  if (ids.length === 0) return buildProfessionalFunnelBoard({ professionals: [], states: [], otps: [], preferences: [], contactLogs: [] });

  const states: ProfessionalFunnelStateRow[] = [];
  const otps: ProfessionalFunnelOtpRow[] = [];
  const preferences: ProfessionalFunnelPreferenceRow[] = [];
  const contactLogs: ProfessionalFunnelContactLogRow[] = [];
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const [stateResult, otpResult, preferencesResult, contactLogsResult] = await Promise.all([
      supabaseAdmin
        .from('lifecycle_user_state')
        .select('user_id, usage_days_count, patients_count, first_patient_at, linked_records_count, first_record_linked_at, evolutions_count, first_evolution_completed_at, last_activity_at, subscription_started_at')
        .in('user_id', chunk),
      supabaseAdmin
        .from('whatsapp_otp_challenges')
        .select('user_id, verified_at')
        .in('user_id', chunk)
        .not('verified_at', 'is', null),
      supabaseAdmin
        .from('communication_preferences')
        .select('user_id, whatsapp_number, whatsapp_opt_in')
        .in('user_id', chunk),
      supabaseAdmin
        .from('admin_audit_logs')
        .select('target_id, metadata, created_at')
        .eq('event_type', 'professional_funnel_contact_status')
        .eq('target_type', 'professional')
        .in('target_id', chunk)
        .order('created_at', { ascending: false }),
    ]);
    if (stateResult.error) throw stateResult.error;
    if (otpResult.error) throw otpResult.error;
    if (preferencesResult.error) throw preferencesResult.error;
    if (contactLogsResult.error) throw contactLogsResult.error;
    states.push(...(stateResult.data || []));
    otps.push(...(otpResult.data || []));
    preferences.push(...(preferencesResult.data || []));
    contactLogs.push(...(contactLogsResult.data || []));
  }

  return buildProfessionalFunnelBoard({ professionals: professionalsWithAccess, states, otps, preferences, contactLogs });
}
