import { supabase } from '../supabaseClient';

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
}

const STORAGE_KEY = 'evolucao-clinica:acquisition';

/**
 * Calcula o nome legível do canal de aquisição com base em UTMs e Referrer
 */
export function calculateAcquisitionChannel(data: AcquisitionData): string {
  const source = (data.utm_source || '').toLowerCase();
  const medium = (data.utm_medium || '').toLowerCase();
  const referrer = (data.referrer || '').toLowerCase();

  if (data.gclid || source === 'google_ads' || (source === 'google' && medium === 'cpc')) {
    return 'Google Ads (Tráfego Pago)';
  }
  if (data.fbclid || source === 'facebook_ads' || source === 'meta' || (source === 'facebook' && medium === 'cpc')) {
    return 'Meta / Facebook Ads';
  }
  if (source === 'instagram' || referrer.includes('instagram.com')) {
    return medium === 'bio' || medium === 'profile' ? 'Instagram (Link na Bio)' : 'Instagram (Social)';
  }
  if (source === 'facebook' || referrer.includes('facebook.com')) {
    return 'Facebook (Social)';
  }
  if (source === 'youtube' || referrer.includes('youtube.com')) {
    return 'YouTube';
  }
  if (source === 'pwa' || medium === 'pwa') {
    return 'Aplicativo PWA / Android';
  }
  if (source === 'google' || referrer.includes('google.com')) {
    return 'Google (Busca Orgânica)';
  }
  if (source) {
    return `${source.toUpperCase()}${medium ? ` (${medium})` : ''}`;
  }
  if (referrer && !referrer.includes(window.location.hostname)) {
    try {
      const url = new URL(referrer);
      return `Referral (${url.hostname})`;
    } catch {
      return 'Site Referenciador';
    }
  }
  return 'Tráfego Direto';
}

/**
 * Captura e armazena os dados de origem/UTM do visitante no primeiro acesso
 */
export function captureAcquisitionData(): AcquisitionData {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && (parsed.utm_source || parsed.referrer || parsed.landing_page)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler dados de aquisição existentes:', err);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const utm_source = urlParams.get('utm_source') || undefined;
  const utm_medium = urlParams.get('utm_medium') || undefined;
  const utm_campaign = urlParams.get('utm_campaign') || undefined;
  const utm_term = urlParams.get('utm_term') || undefined;
  const utm_content = urlParams.get('utm_content') || undefined;
  const gclid = urlParams.get('gclid') || undefined;
  const fbclid = urlParams.get('fbclid') || undefined;

  let referrer: string | undefined = undefined;
  if (document.referrer && !document.referrer.includes(window.location.hostname)) {
    referrer = document.referrer;
  }

  const landing_page = window.location.href;
  const first_seen_at = new Date().toISOString();

  const data: AcquisitionData = {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    gclid,
    fbclid,
    referrer,
    landing_page,
    first_seen_at
  };

  data.channel = calculateAcquisitionChannel(data);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Erro ao salvar dados de aquisição:', err);
  }

  return data;
}

/**
 * Obtém os dados de aquisição locais (ou força a captura se necessário)
 */
export function getLocalAcquisitionData(): AcquisitionData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Erro ao carregar aquisição local:', err);
  }
  return captureAcquisitionData();
}

/**
 * Sincroniza os dados de aquisição locais com o perfil do profissional no Supabase
 */
export async function syncAcquisitionWithDatabase(userId: string, currentInfo?: AcquisitionData | null): Promise<void> {
  if (!userId) return;

  // Se o perfil no banco já tiver dados gravados e válidos, não sobrescreve a primeira origem
  if (currentInfo && typeof currentInfo === 'object' && (currentInfo.utm_source || currentInfo.channel || currentInfo.referrer)) {
    return;
  }

  const localData = getLocalAcquisitionData();
  if (!localData || Object.keys(localData).length === 0) return;

  try {
    const { error } = await supabase
      .from('professionals')
      .update({ acquisition_info: localData })
      .eq('id', userId);

    if (error) {
      console.warn('Falha ao sincronizar dados de aquisição com o perfil:', error.message);
    } else {
      console.log('[AcquisitionTracking] Dados de origem registrados no perfil com sucesso:', localData.channel);
    }
  } catch (err) {
    console.error('Erro na sincronização de aquisição:', err);
  }
}
