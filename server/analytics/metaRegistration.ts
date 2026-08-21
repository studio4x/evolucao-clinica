const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^registration-[a-f0-9]{32}$/;

export type MetaRegistrationPreferences = {
  analyticsGranted: boolean;
  marketingGranted: boolean;
};

export type MetaRegistrationPendingResult = {
  eventId: string | null;
  status: 'pending' | 'consent_denied' | 'not_pending';
};

export type MetaRegistrationCompletionResult = {
  eventId: string | null;
  status: 'delivered' | 'consent_denied' | 'not_pending';
};

function assertUserId(userId: string) {
  if (!USER_ID_PATTERN.test(userId)) throw new Error('Invalid authenticated user id');
}

function parseEventId(data: unknown) {
  const eventId = Array.isArray(data) && typeof data[0]?.event_id === 'string'
    ? data[0].event_id
    : null;
  if (eventId && !EVENT_ID_PATTERN.test(eventId)) throw new Error('Invalid Meta registration event id');
  return eventId;
}

async function hasStoredMarketingConsent(supabaseAdmin: any, userId: string) {
  const { data: consent, error: consentError } = await supabaseAdmin
    .from('analytics_consents')
    .select('marketing_granted')
    .eq('user_id', userId)
    .maybeSingle();

  if (consentError) throw consentError;
  return consent?.marketing_granted === true;
}

async function readPendingEventId(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin.rpc('get_pending_meta_registration_event', {
    p_user_id: userId
  });
  if (error) throw error;
  return parseEventId(data);
}

export async function prepareMetaRegistrationEvent(
  supabaseAdmin: any,
  userId: string,
  preferences: MetaRegistrationPreferences
): Promise<MetaRegistrationPendingResult> {
  assertUserId(userId);

  const { error: consentError } = await supabaseAdmin
    .from('analytics_consents')
    .upsert({
      user_id: userId,
      analytics_granted: preferences.analyticsGranted === true,
      marketing_granted: preferences.marketingGranted === true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (consentError) throw consentError;
  if (preferences.marketingGranted !== true) {
    return { eventId: null, status: 'consent_denied' };
  }

  const eventId = await readPendingEventId(supabaseAdmin, userId);
  return eventId
    ? { eventId, status: 'pending' }
    : { eventId: null, status: 'not_pending' };
}

// Compatibility with cached bundles from before the prepare/complete flow.
// Reading no longer consumes the marker; the current client acknowledges it.
export async function readPendingMetaRegistrationEvent(
  supabaseAdmin: any,
  userId: string
): Promise<MetaRegistrationPendingResult> {
  assertUserId(userId);
  if (!await hasStoredMarketingConsent(supabaseAdmin, userId)) {
    return { eventId: null, status: 'consent_denied' };
  }

  const eventId = await readPendingEventId(supabaseAdmin, userId);
  return eventId
    ? { eventId, status: 'pending' }
    : { eventId: null, status: 'not_pending' };
}

export async function completeMetaRegistrationEvent(
  supabaseAdmin: any,
  userId: string,
  eventId: string
): Promise<MetaRegistrationCompletionResult> {
  assertUserId(userId);
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error('Invalid Meta registration event id');
  if (!await hasStoredMarketingConsent(supabaseAdmin, userId)) {
    return { eventId: null, status: 'consent_denied' };
  }

  const { data, error } = await supabaseAdmin.rpc('complete_meta_registration_event', {
    p_user_id: userId,
    p_event_id: eventId
  });
  if (error) throw error;

  const completedEventId = parseEventId(data);
  return completedEventId
    ? { eventId: completedEventId, status: 'delivered' }
    : { eventId: null, status: 'not_pending' };
}
