import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface SiteConfig {
  pwa_app_name: string;
  pwa_short_name: string;
  pwa_description: string;
  pwa_theme_color: string;
  pwa_background_color: string;
  pwa_icon_192_url: string;
  pwa_icon_512_url: string;
  pwa_maskable_icon_url: string;
  pwa_install_title: string;
  pwa_install_description: string;
  logo_light_url: string;
  logo_dark_url: string;
  favicon_url: string;
  version: string;
}

const defaultConfig: SiteConfig = {
  pwa_app_name: "Evolução Clínica",
  pwa_short_name: "Evolução Clínica",
  pwa_description: "Gerenciamento de Evoluções Clínicas com IA e Google Docs - Conexão Seres",
  pwa_theme_color: "#005C13",
  pwa_background_color: "#ffffff",
  pwa_icon_192_url: "/icon-192x192.png",
  pwa_icon_512_url: "/icon-512x512.png",
  pwa_maskable_icon_url: "/icon-512x512-maskable.png",
  pwa_install_title: "Instale o app Evolução Clínica",
  pwa_install_description: "Acesse seus prontuários rapidamente pela tela inicial com o app oficial.",
  logo_light_url: "/logotipo-transparente-1024.png",
  logo_dark_url: "/logotipo-transparente-1024.png",
  favicon_url: "/favicon.png",
  version: "1.0"
};

// Global cache variable to avoid multiple queries
let cachedConfig: SiteConfig | null = null;
const listeners = new Set<(config: SiteConfig) => void>();

export const useSiteConfig = () => {
  const [config, setConfig] = useState<SiteConfig>(cachedConfig || defaultConfig);

  useEffect(() => {
    const handleUpdate = (newConfig: SiteConfig) => {
      setConfig(newConfig);
    };

    listeners.add(handleUpdate);

    if (cachedConfig) {
      setConfig(cachedConfig);
    } else {
      void fetchConfig();
    }

    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  return config;
};

const fetchConfig = async () => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('api_key')
      .eq('id', 'brand_settings')
      .single();

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      const merged: SiteConfig = {
        ...defaultConfig,
        logo_light_url: parsed.logo_light_url || defaultConfig.logo_light_url,
        logo_dark_url: parsed.logo_dark_url || defaultConfig.logo_dark_url,
        favicon_url: parsed.favicon_url || defaultConfig.favicon_url,
        version: parsed.version || defaultConfig.version,
      };
      cachedConfig = merged;
      listeners.forEach(l => l(merged));
    }
  } catch (err) {
    console.error('Error fetching site config:', err);
  }
};

// Helper function to force reload configuration
export const reloadSiteConfig = async () => {
  cachedConfig = null;
  await fetchConfig();
};
