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
}

const PAID_MEDIA = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'social_paid']);
const ORGANIC_SOCIAL_MEDIA = new Set(['organic', 'organic_social', 'social', 'bio', 'profile']);
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
      data.channel
  );
};

export const hasAttributableSignal = (data: AcquisitionData): boolean => Boolean(
  data.utm_source ||
    data.utm_medium ||
    data.utm_campaign ||
    data.utm_term ||
    data.utm_content ||
    data.gclid ||
    data.fbclid ||
    data.referrer
);

export const isGenericAppFallback = (data?: AcquisitionData | null): boolean => {
  const source = normalizeAcquisitionSource(data?.utm_source);
  const medium = normalizeAcquisitionMedium(data?.utm_medium);
  return (source === 'pwa' || medium === 'pwa') && !data?.gclid && !data?.fbclid && !data?.utm_campaign;
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
  if (source === 'pwa' || medium === 'pwa') return 'Aplicativo PWA / Android';

  if (source) {
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
  return 'Tráfego Direto';
}

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

  const firstTouch = existingFirstTouch && !(isGenericAppFallback(existingFirstTouch) && candidateReplacesAppFallback)
    ? existingFirstTouch
    : candidate;

  let currentTouch = candidate;
  if (returningFromOAuth && existingCurrentTouch) {
    currentTouch = existingCurrentTouch;
  } else if (isGenericAppFallback(candidate) && existingCurrentTouch && !isGenericAppFallback(existingCurrentTouch)) {
    // Reabrir o WebView com utm_source=pwa não pode apagar a referência paga
    // recuperada do Google Play durante a mesma instalação.
    currentTouch = existingCurrentTouch;
  }

  return { firstTouch, currentTouch };
};

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
