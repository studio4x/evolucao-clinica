export type AcquisitionTelemetryEvent =
  | 'acquisition_arrival'
  | 'consent_banner_shown'
  | 'marketing_consent_granted'
  | 'meta_config_loaded'
  | 'meta_config_failed'
  | 'meta_script_requested'
  | 'meta_pixel_initialized'
  | 'meta_pageview_queued';

export type AcquisitionTelemetryContext = {
  pathname?: string;
  channel?: string;
  campaignPresent?: boolean;
  platform?: 'web' | 'pwa' | 'android';
  distribution?: 'google_play';
  dedupeKey?: string;
};

const sentKeys = new Set<string>();
const EVENT_NAMES = new Set<AcquisitionTelemetryEvent>([
  'acquisition_arrival',
  'consent_banner_shown',
  'marketing_consent_granted',
  'meta_config_loaded',
  'meta_config_failed',
  'meta_script_requested',
  'meta_pixel_initialized',
  'meta_pageview_queued'
]);
const PUBLIC_ACQUISITION_PATHS = new Set(['/','/login','/jornada','/jornada-15-dias']);

export const isPublicAcquisitionPathname = (pathname: string) => {
  const normalized = pathname.trim() || '/';
  return PUBLIC_ACQUISITION_PATHS.has(normalized) || normalized.startsWith('/jornada/');
};

const normalizePathname = (pathname?: string) => {
  const value = (pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')).split(/[?#]/, 1)[0] || '/';
  return value.replace(/[^A-Za-z0-9/_-]/g, '').slice(0, 120) || '/';
};

const normalizeChannel = (channel?: string) => {
  const value = (channel || '').toLowerCase();
  if (value.includes('google ads')) return 'google_ads';
  if (value.includes('meta ads') || value.includes('facebook') || value.includes('instagram')) return 'meta_ads';
  if (value.includes('google')) return 'google_organic';
  if (value.includes('youtube')) return 'youtube';
  if (value.includes('whatsapp')) return 'whatsapp';
  if (value.includes('e-mail')) return 'email';
  if (value.includes('referral')) return 'referral';
  if (value.includes('direto')) return 'direct';
  return value ? 'other' : 'unknown';
};

export const sendAcquisitionTelemetry = (eventName: AcquisitionTelemetryEvent, context: AcquisitionTelemetryContext = {}) => {
  if (!EVENT_NAMES.has(eventName) || typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  const dedupeKey = context.dedupeKey || `${eventName}:${normalizePathname(context.pathname)}`;
  if (sentKeys.has(dedupeKey)) return false;
  sentKeys.add(dedupeKey);

  const payload = {
    eventName,
    pathname: normalizePathname(context.pathname),
    channel: normalizeChannel(context.channel),
    campaignPresent: context.campaignPresent === true,
    platform: context.platform,
    distribution: context.distribution
  };
  void window.fetch('/api/analytics/acquisition-telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
  return true;
};

export const resetAcquisitionTelemetryForTests = () => sentKeys.clear();
