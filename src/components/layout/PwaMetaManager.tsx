import { useEffect } from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';

export const PwaMetaManager = () => {
  const config = useSiteConfig();

  useEffect(() => {
    // 1. Título e Descrição
    document.title = config.pwa_app_name;
    
    const updateMeta = (name: string, content: string, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    updateMeta('description', config.pwa_description);
    updateMeta('theme-color', config.pwa_theme_color);

    // 2. Apple / iOS tags
    updateMeta('apple-mobile-web-app-capable', 'yes');
    updateMeta('apple-mobile-web-app-title', config.pwa_short_name);
    updateMeta('apple-mobile-web-app-status-bar-style', 'default');
    
    // 3. Android tags
    updateMeta('mobile-web-app-capable', 'yes');

    // 4. Open Graph / SEO
    updateMeta('og:title', config.pwa_app_name, 'property');
    updateMeta('og:description', config.pwa_description, 'property');
    updateMeta('og:type', 'website', 'property');

    // 5. Twitter
    updateMeta('twitter:title', config.pwa_app_name);
    updateMeta('twitter:description', config.pwa_description);

    // 6. Manifest link (opcional se quiser trocar dinamicamente)
    // const manifestLink = document.querySelector('link[rel="manifest"]');
    // if (manifestLink) manifestLink.setAttribute('href', '/manifest.json');

  }, [config]);

  return null;
};
