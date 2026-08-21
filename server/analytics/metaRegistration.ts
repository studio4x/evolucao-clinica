const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^registration-[a-f0-9]{32}$/;

export type MetaRegistrationClaimResult = {
  eventId: string | null;
  status: 'claimed' | 'consent_denied' | 'not_pending';
};

export async function claimMetaRegistrationEvent(
  supabaseAdmin: any,
  userId: string
): Promise<MetaRegistrationClaimResult> {
  if (!USER_ID_PATTERN.test(userId)) throw new Error('Invalid authenticated user id');

  const { data: consent, error: consentError } = await supabaseAdmin
    .from('analytics_consents')
    .select('marketing_granted')
    .eq('user_id', userId)
    .maybeSingle();

  if (consentError) throw consentError;
  if (consent?.marketing_granted !== true) {
    return { eventId: null, status: 'consent_denied' };
  }

  const { data, error } = await supabaseAdmin.rpc('claim_meta_registration_event', {
    p_user_id: userId
  });
  if (error) throw error;

  const eventId = Array.isArray(data) && typeof data[0]?.event_id === 'string'
    ? data[0].event_id
    : null;
  if (!eventId) return { eventId: null, status: 'not_pending' };
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error('Invalid Meta registration event id');
  return { eventId, status: 'claimed' };
}
