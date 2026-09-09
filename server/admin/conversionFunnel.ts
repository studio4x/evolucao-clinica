type ProfessionalRow = {
  id: string;
  created_at: string;
  onboarding_completed?: boolean | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
};

type PatientRow = { professional_id: string; google_doc_id?: string | null };
type EvolutionRow = { professional_id: string; created_at: string; updated_at?: string | null; transcription_status?: string | null; google_doc_append_status?: string | null };
type OtpRow = { user_id: string; verified_at?: string | null };
type StateRow = { user_id: string; usage_days_count?: number | string | null };
type ErrorRow = { user_id: string; metadata?: Record<string, unknown> | null };
type CheckoutRow = { professional_id: string; status: string; provider: string; created_at: string };

const uniqueCount = (values: string[]) => new Set(values.filter(Boolean)).size;
const rate = (value: number, total: number) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

export function buildConversionFunnel(input: {
  professionals: ProfessionalRow[];
  patients: PatientRow[];
  evolutions: EvolutionRow[];
  otps: OtpRow[];
  states: StateRow[];
  errors: ErrorRow[];
  checkoutAttempts: CheckoutRow[];
  since: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const registered = input.professionals.length;
  const onboardingComplete = input.professionals.filter(item => item.onboarding_completed === true).length;
  const whatsappVerified = uniqueCount(input.otps.filter(item => Boolean(item.verified_at)).map(item => item.user_id));
  const withPatient = uniqueCount(input.patients.map(item => item.professional_id));
  const withLinkedRecord = uniqueCount(input.patients.filter(item => Boolean(item.google_doc_id?.trim())).map(item => item.professional_id));
  const completedEvolutions = input.evolutions.filter(item => item.transcription_status === 'completed' && item.google_doc_append_status === 'completed');
  const withFirstEvolution = uniqueCount(completedEvolutions.map(item => item.professional_id));
  const professionalCreatedAt = new Map(input.professionals.map(item => [item.id, new Date(item.created_at).getTime()]));
  const firstEvolutionWithin48h = uniqueCount(completedEvolutions
    .filter(item => {
      const registeredAt = professionalCreatedAt.get(item.professional_id) || 0;
      const completedAt = new Date(item.updated_at || item.created_at).getTime();
      return registeredAt > 0 && completedAt >= registeredAt && completedAt - registeredAt <= 48 * 60 * 60 * 1000;
    })
    .map(item => item.professional_id));
  const returnedSecondDay = input.states.filter(item => Number(item.usage_days_count || 0) >= 2).length;
  const paid = input.professionals.filter(item => item.subscription_status === 'active' && !['trial', 'courtesy', 'none'].includes(String(item.subscription_plan || ''))).length;
  const matured = input.professionals.filter(item => (
    (item.subscription_status === 'active' && !['trial', 'courtesy', 'none'].includes(String(item.subscription_plan || '')))
    || Boolean(item.trial_ends_at && new Date(item.trial_ends_at).getTime() <= now.getTime())
  )).length;
  const googleScopeErrors = uniqueCount(input.errors
    .filter(item => item.metadata?.error_code === 'google_insufficient_scopes')
    .map(item => item.user_id));

  const checkoutByStatus = input.checkoutAttempts.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const checkoutUsers = uniqueCount(input.checkoutAttempts.map(item => item.professional_id));

  return {
    since: input.since,
    generatedAt: now.toISOString(),
    stages: {
      registered,
      whatsappVerified,
      withPatient,
      withLinkedRecord,
      onboardingComplete,
      withFirstEvolution,
      firstEvolutionWithin48h,
      returnedSecondDay,
      paid,
      matured,
    },
    rates: {
      whatsappVerification: rate(whatsappVerified, registered),
      patientCreation: rate(withPatient, registered),
      recordLink: rate(withLinkedRecord, registered),
      firstEvolution: rate(withFirstEvolution, registered),
      firstEvolutionWithin48h: rate(firstEvolutionWithin48h, registered),
      secondDayReturn: rate(returnedSecondDay, registered),
      paidConversion: rate(paid, matured),
    },
    blockers: { googleScopeErrors },
    checkout: { users: checkoutUsers, total: input.checkoutAttempts.length, byStatus: checkoutByStatus },
  };
}

export async function getConversionFunnel(supabaseAdmin: any, days = 30) {
  const boundedDays = Math.min(180, Math.max(7, Math.trunc(days || 30)));
  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: professionals, error: professionalsError } = await supabaseAdmin
    .from('professionals')
    .select('id, created_at, onboarding_completed, subscription_plan, subscription_status, trial_ends_at')
    .or('role.is.null,role.neq.admin')
    .or('subscription_plan.is.null,subscription_plan.neq.courtesy')
    .gte('created_at', since);
  if (professionalsError) throw professionalsError;

  const ids = (professionals || []).map((item: ProfessionalRow) => item.id);
  if (ids.length === 0) return buildConversionFunnel({ professionals: [], patients: [], evolutions: [], otps: [], states: [], errors: [], checkoutAttempts: [], since });

  const [patients, evolutions, otps, states, errors, checkoutAttempts] = await Promise.all([
    supabaseAdmin.from('patients').select('professional_id, google_doc_id').in('professional_id', ids),
    supabaseAdmin.from('evolutions').select('professional_id, created_at, updated_at, transcription_status, google_doc_append_status').in('professional_id', ids),
    supabaseAdmin.from('whatsapp_otp_challenges').select('user_id, verified_at').in('user_id', ids),
    supabaseAdmin.from('lifecycle_user_state').select('user_id, usage_days_count').in('user_id', ids),
    supabaseAdmin.from('lifecycle_events').select('user_id, metadata').in('user_id', ids).eq('event_name', 'onboarding_step_error').gte('occurred_at', since),
    supabaseAdmin.from('checkout_attempts').select('professional_id, status, provider, created_at').in('professional_id', ids).gte('created_at', since),
  ]);
  const queryError = patients.error || evolutions.error || otps.error || states.error || errors.error || checkoutAttempts.error;
  if (queryError) throw queryError;

  return buildConversionFunnel({
    professionals: professionals || [],
    patients: patients.data || [],
    evolutions: evolutions.data || [],
    otps: otps.data || [],
    states: states.data || [],
    errors: errors.data || [],
    checkoutAttempts: checkoutAttempts.data || [],
    since,
  });
}
