import { useEffect } from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';

export const PwaMetaManager = () => {
  const config = useSiteConfig();

  useEffect(() => {
    // 1. Atualizar Título e Descrição Fundamental
    document.title = config.pwa_app_name;
    
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', config.pwa_description);

    // 2. Cor do Tema
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', config.pwa_theme_color);

    // 3. Apple Mobile Web App
    const appleTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: config.pwa_short_name },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
    ];

    appleTags.forEach(tag => {
      let el = document.querySelector(`meta[name="${tag.name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', tag.name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', tag.content);
    });

    // 4. Manifest Dinâmico (conforme mencionado na spec - OPCIONAL se arquivo estático existir)
    // Se quiséssemos gerar um Blob URL:
    /*
    const manifest = {
      name: config.pwa_app_name,
      short_name: config.pwa_short_name,
      // ... rest of config
    };
    const stringManifest = JSON.stringify(manifest);
    const blob = new Blob([stringManifest], {type: 'application/json'});
    const manifestURL = URL.createObjectURL(blob);
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestURL);
    */

  }, [config]);

  return null;
};
