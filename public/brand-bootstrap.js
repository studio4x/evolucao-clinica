(function () {
  // This bootstrap is deliberately limited to visual identity. Tracking is
  // initialized only by src/services/analytics.ts after explicit consent.
  const storageKey = 'evolucao-clinica:site-config';
  const defaultTitle = 'Evolução Clínica - Prontuários e Evoluções com IA';
  const defaultDescription = 'Grave consultas por áudio, transcreva com inteligência artificial e salve tudo de forma organizada e segura em seu próprio Google Drive.';
  const configMeta = document.getElementById('supabase-config');
  const supabaseUrl = configMeta ? configMeta.getAttribute('data-url') || '' : '';
  const supabaseAnonKey = configMeta ? configMeta.getAttribute('data-anon-key') || '' : '';
  const hashString = (value) => { let hash = 0; for (let index = 0; index < value.length; index += 1) { hash = ((hash << 5) - hash) + value.charCodeAt(index); hash |= 0; } return Math.abs(hash).toString(36); };
  const appendVersion = (url, signature) => !url ? '' : `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(signature)}`;
  const setLink = (selector, rel, href, type, sizes) => { if (!href) return; let link = document.querySelector(selector); if (!link) { link = document.createElement('link'); link.setAttribute('rel', rel); document.head.appendChild(link); } link.rel = rel; if (type) link.type = type; if (sizes) link.setAttribute('sizes', sizes); link.href = href; };
  const updateMeta = (selector, attr, value, content) => { if (!content) return; let meta = document.querySelector(selector); if (!meta) { meta = document.createElement('meta'); document.head.appendChild(meta); } meta.setAttribute(attr, value); meta.setAttribute('content', content); };
  const applyColors = (colors) => { if (!colors) return; const style = document.documentElement.style; style.setProperty('--color-brand-primary', colors.primary); style.setProperty('--color-brand-primary-hover', colors.primary_hover); style.setProperty('--color-brand-secondary', colors.secondary); style.setProperty('--color-brand-secondary-hover', colors.secondary_hover); style.setProperty('--color-brand-accent', colors.accent); style.setProperty('--color-brand-accent-hover', colors.accent_hover); style.setProperty('--color-brand-bg', colors.bg); style.setProperty('--color-brand-surface', colors.surface); style.setProperty('--color-brand-text', colors.text); style.setProperty('--color-brand-text-muted', colors.text_muted); style.setProperty('--color-brand-border', colors.border); };
  const hydrate = (config) => {
    if (!config || !config.colors) return false;
    window.__INITIAL_SITE_CONFIG__ = config;
    applyColors(config.colors);
    const signature = hashString([config.logo_light_url || '', config.logo_dark_url || '', config.favicon_url || '', config.pwa_icon_192_url || '', config.pwa_icon_512_url || '', config.pwa_maskable_icon_url || '', config.pwa_install_logo_url || '', config.pwa_loading_logo_url || '', config.social_share_url || '', config.version || ''].join('|'));
    const title = config.seo_title || config.pwa_app_name || defaultTitle;
    const description = config.seo_description || config.pwa_description || defaultDescription;
    setLink("link[rel='icon']", 'icon', appendVersion('/api/favicon', signature), undefined, '32x32');
    setLink("link[rel='shortcut icon']", 'shortcut icon', appendVersion('/api/favicon', signature));
    setLink("link[rel='apple-touch-icon']", 'apple-touch-icon', appendVersion('/api/apple-touch-icon', signature), 'image/png');
    setLink("link[rel='manifest']", 'manifest', appendVersion('/manifest.webmanifest', signature), 'application/manifest+json');
    updateMeta("meta[name='theme-color']", 'name', 'theme-color', config.pwa_theme_color || '#005C13');
    updateMeta("meta[name='apple-mobile-web-app-title']", 'name', 'apple-mobile-web-app-title', title);
    updateMeta("meta[property='og:url']", 'property', 'og:url', window.location.href);
    updateMeta("meta[property='og:title']", 'property', 'og:title', title);
    updateMeta("meta[property='og:description']", 'property', 'og:description', description);
    updateMeta("meta[property='og:image']", 'property', 'og:image', appendVersion(config.social_share_url || 'https://www.evolucaoclinica.app.br/og-image-social.png', signature));
    try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch (_) {}
    return true;
  };
  try { const stored = localStorage.getItem(storageKey); if (stored) hydrate(JSON.parse(stored)); } catch (_) {}
  const fetchJson = (url, headers, callback) => { const xhr = new XMLHttpRequest(); xhr.open('GET', url, true); Object.keys(headers || {}).forEach((key) => xhr.setRequestHeader(key, headers[key])); xhr.onreadystatechange = () => { if (xhr.readyState !== 4) return; try { callback(xhr.status >= 200 && xhr.status < 300 && xhr.responseText ? JSON.parse(xhr.responseText) : null); } catch (_) { callback(null); } }; xhr.send(null); };
  const refreshBrand = () => {
    if (!supabaseUrl || !supabaseAnonKey) { fetchJson('/api/brand-bootstrap', {}, hydrate); return; }
    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/settings?id=eq.brand_settings&select=api_key`;
    fetchJson(endpoint, { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Accept: 'application/vnd.pgrst.object+json' }, (payload) => { try { if (payload && payload.api_key) { hydrate(JSON.parse(payload.api_key)); return; } } catch (_) {} fetchJson('/api/brand-bootstrap', {}, hydrate); });
  };
  window.addEventListener('load', () => setTimeout(refreshBrand, 1000));
})();
