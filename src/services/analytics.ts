declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/**
 * Inicializa o Google Analytics (GA4) dinamicamente caso o ID de Medição esteja configurado.
 */
export const initAnalytics = () => {
  if (typeof window === 'undefined') return;
  if (!GA_MEASUREMENT_ID) {
    if (import.meta.env.DEV) {
      console.log('[Analytics] VITE_GA_MEASUREMENT_ID não configurado. Rastreamento ignorado.');
    }
    return;
  }

  if (window.gtag) return;

  try {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: any[]) {
      window.dataLayer.push(arguments as any);
    };
    
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);

    if (import.meta.env.DEV) {
      console.log(`[Analytics] GA4 Inicializado com ID: ${GA_MEASUREMENT_ID}`);
    }
  } catch (error) {
    console.error('[Analytics] Erro ao carregar script do Google Analytics:', error);
  }
};

/**
 * Dispara o evento de "Initiate Checkout" (Início do Checkout) no GA4 (via dataLayer) e Facebook Pixel (se disponível).
 */
export const trackBeginCheckout = (planId: string, planName: string, price: number) => {
  if (typeof window === 'undefined') return;

  // 1. Google Analytics / Google Tag Manager (via dataLayer)
  const dl = (window.dataLayer = window.dataLayer || []);
  dl.push({
    event: 'begin_checkout',
    ecommerce: {
      value: price,
      currency: 'BRL',
      items: [{
        item_id: planId,
        item_name: planName,
        price: price,
        quantity: 1
      }]
    }
  });

  // 2. Facebook Pixel (se disponível no escopo global)
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'InitiateCheckout', {
      value: price,
      currency: 'BRL',
      content_name: planName,
      content_category: 'Subscription',
      content_ids: [planId],
      content_type: 'product'
    });
  }

  if (import.meta.env.DEV) {
    console.log(`[Analytics] Evento 'begin_checkout' / 'InitiateCheckout' disparado:`, {
      planId,
      planName,
      price
    });
  }
};

/**
 * Dispara eventos de analytics customizados para o módulo Jornada de Conteúdos.
 */
export const trackJourneyEvent = (eventName: string, params?: Record<string, any>) => {
  if (typeof window === 'undefined') return;

  // 1. Google Analytics (via window.gtag se disponível)
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }

  // 2. dataLayer (para Google Tag Manager)
  const dl = (window.dataLayer = window.dataLayer || []);
  dl.push({
    event: eventName,
    ...params
  });

  if (import.meta.env.DEV) {
    console.log(`[Analytics] Evento da Jornada '${eventName}' disparado:`, params);
  }
};
