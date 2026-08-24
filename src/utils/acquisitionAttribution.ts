export interface AcquisitionData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_page?: string;
  first_seen_at?: string;
  channel?: string;
  attribution_method?: 'url' | 'google_play_install_referrer';
  referrer_click_at?: string;
  install_begin_at?: string;
  platform?: 'web' | 'pwa' | 'android';
  distribution?: 'google_play';
}

const PAID_MEDIA = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'social_paid']);
const ORGANIC_SOCIAL_MEDIA = new Set(['organic', 'organic_social', 'social', 'bio', 'profile']);
const TECHNICAL_PLATFORM_MARKERS = new Set(['pwa', 'android', 'app', 'mobile', 'google_play', 'google-play']);
const TRACKING_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid'
]);

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

export const normalizeAcquisitionSource = (value?: string | null): string => {
  const source = normalize(value);
  if (source === 'ig') return 'instagram';
  if (source === 'fb') return 'facebook';
  if (source === 'facebook_ads') return 'meta';
  if (source === 'meta_ads') return 'meta';
  if (source === 'google_ads') return 'google';
  return source;
};

export const normalizeAcquisitionMedium = (value?: string | null): string => normalize(value);

export const isTechnicalPlatformMarker = (value?: string | null): boolean => (
  TECHNICAL_PLATFORM_MARKERS.has(normalize(value))
);

const safeHostname = (value?: string | null): string => {
  if (!value) return '';
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const isValidAcquisitionData = (value: unknown): value is AcquisitionData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as AcquisitionData;
  return Boolean(
    data.utm_source ||
      data.utm_medium ||
      data.utm_campaign ||
      data.gclid ||
      data.fbclid ||
      data.referrer ||
      data.landing_page ||
      data.channel ||
      data.platform ||
      data.distribution
  );
};

export const hasAttributableSignal = (data: AcquisitionData): boolean => {
  const source = normalizeAcquisitionSource(data.utm_source);
  const medium = normalizeAcquisitionMedium(data.utm_medium);
  const technicalSource = isTechnicalPlatformMarker(source);
  return Boolean(
    (source && source !== 'direct' && !technicalSource) ||
    (medium && medium !== 'direct' && !isTechnicalPlatformMarker(medium) && !(technicalSource && medium === 'organic')) ||
    data.utm_campaign ||
    data.utm_term ||
    data.utm_content ||
    data.gclid ||
    data.fbclid ||
    data.referrer
  );
};

export const isGenericAppFallback = (data?: AcquisitionData | null): boolean => {
  const source = normalizeAcquisitionSource(data?.utm_source);
  const medium = normalizeAcquisitionMedium(data?.utm_medium);
  return (isTechnicalPlatformMarker(source) || isTechnicalPlatformMarker(medium))
    && !hasAttributableSignal(data || {});
};

export function calculateAcquisitionChannel(data: AcquisitionData): string {
  const source = normalizeAcquisitionSource(data.utm_source);
  const medium = normalizeAcquisitionMedium(data.utm_medium);
  const referrerHost = safeHostname(data.referrer);
  const isPaid = PAID_MEDIA.has(medium);

  // O gclid é um identificador emitido pelo Google Ads. Ele prevalece sobre
  // fontes genéricas que o Google Play possa anexar ao install referrer.
  if (data.gclid) return 'Google Ads (Tráfego Pago)';

  if (source === 'google') {
    if (isPaid) return 'Google Ads (Tráfego Pago)';
    return 'Google (Busca Orgânica)';
  }

  if (source === 'instagram') {
    if (isPaid) return 'Meta Ads (Instagram)';
    if (medium === 'bio' || medium === 'profile') return 'Instagram (Link na Bio)';
    return 'Instagram (Orgânico/Social)';
  }

  if (source === 'facebook') {
    if (isPaid) return 'Meta Ads (Facebook)';
    return 'Facebook (Orgânico/Social)';
  }

  if (source === 'meta') {
    return isPaid ? 'Meta Ads (Tráfego Pago)' : 'Meta (Social)';
  }

  if (source === 'youtube') return 'YouTube';
  if (source === 'whatsapp' || medium === 'whatsapp') return 'WhatsApp';
  if (source === 'email' || medium === 'email') return 'E-mail';
  if (source === 'direct') return 'Tráfego Direto';

  if (source && !isTechnicalPlatformMarker(source)) {
    if (isPaid) return `${source.toUpperCase()} (Tráfego Pago)`;
    if (ORGANIC_SOCIAL_MEDIA.has(medium)) return `${source.toUpperCase()} (Orgânico/Social)`;
    return `${source.toUpperCase()}${medium ? ` (${medium})` : ''}`;
  }

  if (referrerHost.includes('instagram.com')) return 'Instagram (Orgânico/Social)';
  if (referrerHost.includes('facebook.com')) return 'Facebook (Orgânico/Social)';
  if (referrerHost.includes('google.')) return 'Google (Busca Orgânica)';
  if (referrerHost.includes('youtube.com') || referrerHost.includes('youtu.be')) return 'YouTube';

  if (data.fbclid) {
    return 'Meta / Facebook (Origem não determinada)';
  }

  if (data.referrer) return `Referral (${referrerHost || 'site externo'})`;
  if (isGenericAppFallback(data)) return 'Origem não informada';
  if (data.utm_campaign || data.utm_term || data.utm_content || (medium && !isTechnicalPlatformMarker(medium))) {
    return isPaid ? 'Mídia paga (origem não informada)' : 'Campanha (origem não informada)';
  }
  if (isTechnicalPlatformMarker(source) || isTechnicalPlatformMarker(medium)) return 'Origem não informada';
  return 'Tráfego Direto';
}

export const normalizeAcquisitionCandidate = (data: AcquisitionData): AcquisitionData => {
  const normalized: AcquisitionData = { ...data };
  const technicalSource = isTechnicalPlatformMarker(normalized.utm_source);
  if (technicalSource) delete normalized.utm_source;
  if (isTechnicalPlatformMarker(normalized.utm_medium) || (technicalSource && normalize(normalized.utm_medium) === 'organic')) {
    delete normalized.utm_medium;
  }
  normalized.channel = calculateAcquisitionChannel(normalized);
  return normalized;
};

export const getAcquisitionPlatform = (data?: AcquisitionData | null): AcquisitionData['platform'] | undefined => {
  if (data?.platform === 'web' || data?.platform === 'pwa' || data?.platform === 'android') return data.platform;
  if (normalize(data?.utm_source) === 'pwa' || normalize(data?.utm_medium) === 'pwa') return 'pwa';
  if (normalize(data?.utm_source) === 'android' || normalize(data?.utm_medium) === 'android') return 'android';
  if (data?.attribution_method === 'google_play_install_referrer') return 'android';
  return undefined;
};

export const getAcquisitionDistribution = (
  data?: AcquisitionData | null
): AcquisitionData['distribution'] | undefined => {
  if (data?.distribution === 'google_play') return data.distribution;
  if (data?.attribution_method === 'google_play_install_referrer') return 'google_play';
  return undefined;
};

export const getAcquisitionChannelLabel = (data?: AcquisitionData | null): string => (
  data && isValidAcquisitionData(data) ? calculateAcquisitionChannel(data) : 'Origem não informada'
);

const mergeAccessContext = (touch: AcquisitionData, access: AcquisitionData): AcquisitionData => ({
  ...touch,
  ...(access.platform ? { platform: access.platform } : {}),
  ...(access.distribution ? { distribution: access.distribution } : {}),
});

export const sanitizeTrackingUrl = (rawUrl?: string | null, baseOrigin?: string): string | undefined => {
  if (!rawUrl) return undefined;

  try {
    const url = baseOrigin ? new URL(rawUrl, baseOrigin) : new URL(rawUrl);
    const sanitized = new URL(`${url.origin}${url.pathname}`);

    url.searchParams.forEach((value, key) => {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        sanitized.searchParams.set(key, value);
      }
    });

    return sanitized.toString();
  } catch {
    return undefined;
  }
};

export const resolveAcquisitionTouches = ({
  existingFirstTouch,
  existingCurrentTouch,
  candidate,
  returningFromOAuth,
}: {
  existingFirstTouch?: AcquisitionData | null;
  existingCurrentTouch?: AcquisitionData | null;
  candidate: AcquisitionData;
  returningFromOAuth: boolean;
}): { firstTouch: AcquisitionData; currentTouch: AcquisitionData } => {
  const candidateReplacesAppFallback = hasAttributableSignal(candidate) && !isGenericAppFallback(candidate);
  const candidateResolvesNativeInstall = candidate.attribution_method === 'google_play_install_referrer'
    && hasAttributableSignal(candidate)
    && getAcquisitionPlatform(existingFirstTouch) === 'android'
    && !hasAttributableSignal(existingFirstTouch || {});

  const firstTouch = existingFirstTouch
    && !(isGenericAppFallback(existingFirstTouch) && candidateReplacesAppFallback)
    && !candidateResolvesNativeInstall
    ? existingFirstTouch
    : candidate;

  let currentTouch = candidate;
  if (
    existingCurrentTouch
    && !isGenericAppFallback(existingCurrentTouch)
    && (returningFromOAuth || !hasAttributableSignal(candidate))
  ) {
    // OAuth, reload e uma abertura direta pelo app atualizam somente o contexto
    // técnico. A última origem real de marketing continua sendo o signup touch.
    currentTouch = mergeAccessContext(existingCurrentTouch, candidate);
  }

  return { firstTouch, currentTouch };
};

export const shouldPersistFirstTouch = (
  persisted?: AcquisitionData | null,
  candidate?: AcquisitionData | null
): boolean => {
  if (!candidate || !isValidAcquisitionData(candidate)) return false;
  if (!persisted || !isValidAcquisitionData(persisted)) return true;
  return (isGenericAppFallback(persisted) && hasAttributableSignal(candidate)) || (
    candidate.attribution_method === 'google_play_install_referrer'
    && hasAttributableSignal(candidate)
    && getAcquisitionPlatform(persisted) === 'android'
    && !hasAttributableSignal(persisted)
  );
};

export const shouldPersistSignupTouch = shouldPersistFirstTouch;

export const isLikelyOAuthReturn = (rawUrl?: string | null, referrer?: string | null): boolean => {
  try {
    if (rawUrl) {
      const url = new URL(rawUrl);
      const callbackKeys = [
        'code',
        'state',
        'access_token',
        'refresh_token',
        'id_token',
        'error',
        'error_description'
      ];
      if (callbackKeys.some((key) => url.searchParams.has(key) || url.hash.includes(`${key}=`))) {
        return true;
      }
    }
  } catch {
    // URL inválida não deve interferir no tracking.
  }

  const referrerHost = safeHostname(referrer);
  return referrerHost.includes('accounts.google.com') || referrerHost.includes('supabase.co');
};
