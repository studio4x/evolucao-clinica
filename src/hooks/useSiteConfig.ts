import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export interface BrandColors {
  primary: string;
  primary_hover: string;
  secondary: string;
  secondary_hover: string;
  accent: string;
  accent_hover: string;
  bg: string;
  surface: string;
  text: string;
  text_muted: string;
  border: string;
}

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
  pwa_install_logo_url: string;
  pwa_loading_logo_url: string;
  logo_light_url: string;
  logo_dark_url: string;
  favicon_url: string;
  version: string;
  colors: BrandColors;
}

export const defaultColors: BrandColors = {
  primary: "#005C13",
  primary_hover: "#00470e",
  secondary: "#5C4716",
  secondary_hover: "#4a3912",
  accent: "#8CC63F",
  accent_hover: "#7ab332",
  bg: "#fdfbf7",
  surface: "#ffffff",
  text: "#1c1917",
  text_muted: "#57534e",
  border: "#e7e5e4"
};

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
  pwa_install_logo_url: "",
  pwa_loading_logo_url: "",
  logo_light_url: "",
  logo_dark_url: "",
  favicon_url: "/favicon.png",
  version: "1.0",
  colors: defaultColors
};

export const applyThemeColors = (colors: BrandColors) => {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--color-brand-primary', colors.primary);
  root.style.setProperty('--color-brand-primary-hover', colors.primary_hover);
  root.style.setProperty('--color-brand-secondary', colors.secondary);
  root.style.setProperty('--color-brand-secondary-hover', colors.secondary_hover);
  root.style.setProperty('--color-brand-accent', colors.accent);
  root.style.setProperty('--color-brand-accent-hover', colors.accent_hover);
  root.style.setProperty('--color-brand-bg', colors.bg);
  root.style.setProperty('--color-brand-surface', colors.surface);
  root.style.setProperty('--color-brand-text', colors.text);
  root.style.setProperty('--color-brand-text-muted', colors.text_muted);
  root.style.setProperty('--color-brand-border', colors.border);
};

const CONFIG_STORAGE_KEY = 'evolucao-clinica:site-config';

// Global cache variable to avoid multiple queries
let cachedConfig: SiteConfig | null = null;
const listeners = new Set<(config: SiteConfig) => void>();

const getInitialConfig = (): SiteConfig => {
  if (cachedConfig) return cachedConfig;
  
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged: SiteConfig = {
          ...defaultConfig,
          ...parsed,
          colors: parsed.colors ? {
            ...defaultColors,
            ...parsed.colors
          } : defaultColors
        };
        cachedConfig = merged;
        applyThemeColors(merged.colors);
        return merged;
      }
    } catch (e) {
      console.error('Error reading site config from localStorage:', e);
    }
  }
  applyThemeColors(defaultConfig.colors);
  return defaultConfig;
};

export const useSiteConfig = () => {
  const [config, setConfig] = useState<SiteConfig>(getInitialConfig);

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

  // Aplica as cores na inicialização/mudança das configurações
  useEffect(() => {
    if (config.colors) {
      applyThemeColors(config.colors);
    }
  }, [config.colors]);

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
        logo_light_url: parsed.logo_light_url || "",
        logo_dark_url: parsed.logo_dark_url || "",
        favicon_url: parsed.favicon_url || defaultConfig.favicon_url,
        pwa_icon_192_url: parsed.pwa_icon_192_url || defaultConfig.pwa_icon_192_url,
        pwa_icon_512_url: parsed.pwa_icon_512_url || defaultConfig.pwa_icon_512_url,
        pwa_maskable_icon_url: parsed.pwa_maskable_icon_url || defaultConfig.pwa_maskable_icon_url,
        pwa_install_logo_url: parsed.pwa_install_logo_url || "",
        pwa_loading_logo_url: parsed.pwa_loading_logo_url || "",
        version: parsed.version || defaultConfig.version,
        colors: parsed.colors ? {
          ...defaultColors,
          ...parsed.colors
        } : defaultColors
      };
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
      }
      
      cachedConfig = merged;
      applyThemeColors(merged.colors);
      listeners.forEach(l => l(merged));
    }
  } catch (err) {
    console.error('Error fetching site config:', err);
  }
};

// Helper function to force reload configuration
export const reloadSiteConfig = async () => {
  cachedConfig = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CONFIG_STORAGE_KEY);
  }
  await fetchConfig();
};

// Configura o BroadcastChannel para atualizar/reprocessar outras abas do site em tempo real
if (typeof window !== 'undefined') {
  const channel = new BroadcastChannel('brand_settings_channel');
  channel.onmessage = (event) => {
    if (event.data === 'reload') {
      console.log('[Brand Settings] Identidade visual alterada. Recarregando página...');
      window.location.reload();
    }
  };

  // Escuta alterações de autenticação para recarregar as configurações de marca com o token correto
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      void fetchConfig();
    }
  });
}
