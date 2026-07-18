(function () {
  const storageKey = 'evolucao-clinica:site-config';
  const trackingStorageKey = 'evolucao-clinica:tracking-config';
  const defaultTitle = 'Evolução Clínica - Prontuários e Evoluções com IA';
  const defaultDescription = 'Grave consultas por áudio, transcreva com inteligência artificial e salve tudo de forma organizada e segura em seu próprio Google Drive.';
  
  let supabaseUrl = '';
  let supabaseAnonKey = '';
  const configMeta = document.getElementById('supabase-config');
  if (configMeta) {
    supabaseUrl = configMeta.getAttribute('data-url') || '';
    supabaseAnonKey = configMeta.getAttribute('data-anon-key') || '';
  }

  const hashString = function (value) {
    let hash = 0;

    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  };

  const appendVersion = function (url, signature) {
    if (!url) return '';
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(signature)}`;
  };

  const applyColors = function (colors) {
    if (!colors) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--color-brand-primary', colors.primary);
    rootStyle.setProperty('--color-brand-primary-hover', colors.primary_hover);
    rootStyle.setProperty('--color-brand-secondary', colors.secondary);
    rootStyle.setProperty('--color-brand-secondary-hover', colors.secondary_hover);
    rootStyle.setProperty('--color-brand-accent', colors.accent);
    rootStyle.setProperty('--color-brand-accent-hover', colors.accent_hover);
    rootStyle.setProperty('--color-brand-bg', colors.bg);
    rootStyle.setProperty('--color-brand-surface', colors.surface);
    rootStyle.setProperty('--color-brand-text', colors.text);
    rootStyle.setProperty('--color-brand-text-muted', colors.text_muted);
    rootStyle.setProperty('--color-brand-border', colors.border);
  };

  const setLink = function (selector, rel, href, type, sizes) {
    if (!href) return;

    let link = document.querySelector(selector);
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', rel);
      document.head.appendChild(link);
    }

    link.rel = rel;
    if (type) link.type = type;
    if (sizes) link.setAttribute('sizes', sizes);
    link.href = href;
  };

  const updateThemeMeta = function (themeColor) {
    if (!themeColor) return;
    let meta = document.querySelector("meta[name='theme-color']");
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', themeColor);
  };

  const updateMeta = function (selector, attr, value, content) {
    if (!content) return;
    let meta = document.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attr, value);
      document.head.appendChild(meta);
    }
    meta.setAttribute(attr, value);
    meta.setAttribute('content', content);
  };

  const applyBrandAssets = function (config) {
    const assetSignature = hashString([
      config.logo_light_url || '',
      config.logo_dark_url || '',
      config.favicon_url || '',
      config.pwa_icon_192_url || '',
      config.pwa_icon_512_url || '',
      config.pwa_maskable_icon_url || '',
      config.pwa_install_logo_url || '',
      config.pwa_loading_logo_url || '',
      config.social_share_url || '',
      config.version || ''
    ].join('|'));

    const faviconUrl = appendVersion('/api/favicon', assetSignature);
    const appleTouchIconUrl = appendVersion('/api/apple-touch-icon', assetSignature);
    const socialImageUrl = appendVersion(config.social_share_url || 'https://www.evolucaoclinica.app.br/og-image-social.png', assetSignature);
    const title = config.pwa_app_name || defaultTitle;
    const description = config.pwa_description || defaultDescription;

    setLink("link[rel='icon']", 'icon', faviconUrl, undefined, '32x32');
    setLink("link[rel='shortcut icon']", 'shortcut icon', faviconUrl);
    setLink("link[rel='apple-touch-icon']", 'apple-touch-icon', appleTouchIconUrl, 'image/png');
    setLink("link[rel='manifest']", 'manifest', appendVersion('/manifest.webmanifest', assetSignature), 'application/manifest+json');
    updateThemeMeta(config.pwa_theme_color || '#005C13');
    updateMeta("meta[name='apple-mobile-web-app-title']", 'name', 'apple-mobile-web-app-title', title);
    updateMeta("meta[property='og:url']", 'property', 'og:url', window.location.href);
    updateMeta("meta[property='og:title']", 'property', 'og:title', title);
    updateMeta("meta[property='og:description']", 'property', 'og:description', description);
    updateMeta("meta[property='og:image']", 'property', 'og:image', socialImageUrl);
    updateMeta("meta[property='og:image:alt']", 'property', 'og:image:alt', title);
    updateMeta("meta[name='twitter:title']", 'name', 'twitter:title', title);
    updateMeta("meta[name='twitter:description']", 'name', 'twitter:description', description);
    updateMeta("meta[name='twitter:image']", 'name', 'twitter:image', socialImageUrl);
  };

  const injectTracking = function (tracking) {
    if (!tracking) return;

    // Evita dupla injeção se rodar múltiplas vezes
    if (document.querySelector("[data-tracking-injected='gtm']") || document.querySelector("[data-tracking-injected='fb-pixel']")) {
      return;
    }

    const injectHtmlContent = function (htmlString, target, locationTag) {
      if (!htmlString) return;
      if (!target) {
        document.addEventListener('DOMContentLoaded', function () {
          const actualTarget = locationTag === 'head' ? document.head : document.body;
          if (actualTarget) {
            injectHtmlContent(htmlString, actualTarget, locationTag);
          }
        });
        return;
      }
      const temp = document.createElement('div');
      temp.innerHTML = htmlString;
      Array.from(temp.childNodes).forEach(function (node) {
        if (node.tagName === 'SCRIPT') {
          const script = document.createElement('script');
          script.setAttribute('data-tracking-injected', locationTag || 'true');
          if (node.src) {
            script.src = node.src;
            script.async = node.async;
            script.defer = node.defer;
          } else {
            script.textContent = node.textContent;
          }
          target.appendChild(script);
        } else {
          if (node.nodeType === 1) { // ELEMENT_NODE
            node.setAttribute('data-tracking-injected', locationTag || 'true');
          }
          target.appendChild(node.cloneNode(true));
        }
      });
    };

    // 1. Google Tag Manager
    if (tracking.gtm_id) {
      const gtmId = tracking.gtm_id.trim();
      const gtmScript = document.createElement('script');
      gtmScript.setAttribute('data-tracking-injected', 'gtm');
      gtmScript.textContent = "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':" +
        "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0]," +
        "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=" +
        "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);" +
        "})(window,document,'script','dataLayer','" + gtmId + "');";
      document.head.appendChild(gtmScript);

      const gtmNoscript = document.createElement('noscript');
      gtmNoscript.setAttribute('data-tracking-injected', 'gtm');
      const gtmIframe = document.createElement('iframe');
      gtmIframe.src = "https://www.googletagmanager.com/ns.html?id=" + gtmId;
      gtmIframe.height = "0";
      gtmIframe.width = "0";
      gtmIframe.style.display = "none";
      gtmIframe.style.visibility = "hidden";
      gtmNoscript.appendChild(gtmIframe);
      
      if (document.body) {
        document.body.insertBefore(gtmNoscript, document.body.firstChild);
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          if (document.body) {
            document.body.insertBefore(gtmNoscript, document.body.firstChild);
          }
        });
      }
    }

    // 2. Facebook Pixel
    if (tracking.fb_pixel_id) {
      const pixelId = tracking.fb_pixel_id.trim();
      const pixelScript = document.createElement('script');
      pixelScript.setAttribute('data-tracking-injected', 'fb-pixel');
      pixelScript.textContent = "!function(f,b,e,v,n,t,s)" +
        "{if(f.fbq)return;n=f.fbq=function(){n.callMethod?" +
        "n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
        "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';" +
        "n.queue=[];t=b.createElement(e);t.async=!0;" +
        "t.src=v;s=b.getElementsByTagName(e)[0];" +
        "s.parentNode.insertBefore(t,s)}(window, document,'script'," +
        "'https://connect.facebook.net/en_US/fbevents.js');" +
        "fbq('init', '" + pixelId + "');" +
        "fbq('track', 'PageView');";
      document.head.appendChild(pixelScript);

      const pixelNoscript = document.createElement('noscript');
      pixelNoscript.setAttribute('data-tracking-injected', 'fb-pixel');
      const pixelImg = document.createElement('img');
      pixelImg.height = "1";
      pixelImg.width = "1";
      pixelImg.style.display = "none";
      pixelImg.src = "https://www.facebook.com/tr?id=" + pixelId + "&ev=PageView&noscript=1";
      pixelNoscript.appendChild(pixelImg);
      
      if (document.body) {
        document.body.insertBefore(pixelNoscript, document.body.firstChild);
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          if (document.body) {
            document.body.insertBefore(pixelNoscript, document.body.firstChild);
          }
        });
      }
    }

    // 3. Custom Head scripts
    if (tracking.head_scripts) {
      injectHtmlContent(tracking.head_scripts, document.head, 'head');
    }

    // 4. Custom Body scripts
    if (tracking.body_scripts) {
      injectHtmlContent(tracking.body_scripts, document.body, 'body');
    }

    // 5. Custom Footer scripts
    if (tracking.footer_scripts) {
      injectHtmlContent(tracking.footer_scripts, document.body, 'footer');
    }
  };

  const hydrate = function (config) {
    if (!config || !config.colors) return false;
    window.__INITIAL_SITE_CONFIG__ = config;
    applyColors(config.colors);
    applyBrandAssets(config);
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (error) {
      // Ignora falhas de storage e segue com a configuração já aplicada.
    }
    return true;
  };

  // 1. CARREGAMENTO INICIAL IMEDIATO VIA CACHE LOCAL (SÍNCRONO)
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      hydrate(JSON.parse(stored));
    }
    const storedTracking = localStorage.getItem(trackingStorageKey);
    if (storedTracking) {
      injectTracking(JSON.parse(storedTracking));
    }
  } catch (error) {
    // Cache não disponível, segue com tema padrão compilado
  }

  // 2. BUSCA AS ATUALIZAÇÕES DO SUPABASE DE FORMA TOTALMENTE ASSÍNCRONA
  const fetchBrandSettingsAsync = function (callback) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return callback(null);
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/settings?id=eq.brand_settings&select=api_key`;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', endpoint, true); // assíncrono
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('Accept', 'application/vnd.pgrst.object+json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            callback(parsed && parsed.api_key ? JSON.parse(parsed.api_key) : null);
          } catch (e) {
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    };
    xhr.send(null);
  };

  const fetchBrandSettingsFromApiAsync = function (callback) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/brand-bootstrap', true); // assíncrono
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          try {
            callback(JSON.parse(xhr.responseText));
          } catch (e) {
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    };
    xhr.send(null);
  };

  const fetchTrackingSettingsAsync = function (callback) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return callback(null);
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/settings?id=eq.tracking_settings&select=api_key`;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', endpoint, true); // assíncrono
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('Accept', 'application/vnd.pgrst.object+json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            callback(parsed && parsed.api_key ? JSON.parse(parsed.api_key) : null);
          } catch (e) {
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    };
    xhr.send(null);
  };

  // Dispara requisições assíncronas em background de forma deferida (após load da página)
  const initBackgroundFetch = function () {
    fetchBrandSettingsAsync(function (publicConfig) {
      if (publicConfig) {
        hydrate(publicConfig);
        
        // Busca o tracking sequencialmente de forma assíncrona
        fetchTrackingSettingsAsync(function (trackingConfig) {
          if (trackingConfig) {
            injectTracking(trackingConfig);
            try {
              localStorage.setItem(trackingStorageKey, JSON.stringify(trackingConfig));
            } catch (e) {}
          }
        });
      } else {
        // Se o Supabase falhar, tenta da API local de forma assíncrona
        fetchBrandSettingsFromApiAsync(function (apiConfig) {
          if (apiConfig) {
            hydrate(apiConfig);
          }
        });
      }
    });
  };

  if (window.addEventListener) {
    window.addEventListener('load', function() {
      setTimeout(initBackgroundFetch, 1000); // Executa 1 segundo após o load para não concorrer com LCP
    });
  } else {
    setTimeout(initBackgroundFetch, 2000);
  }
})();
