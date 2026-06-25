import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { defaultSiteConfig, normalizeSiteConfig, type BrandColors, type SiteConfig } from '../utils/brandConfig';

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
let fetchInFlight: Promise<void> | null = null;
const listeners = new Set<(config: SiteConfig) => void>();

const getInitialConfig = (): SiteConfig => {
  if (cachedConfig) return cachedConfig;

  if (typeof window !== 'undefined' && window.__INITIAL_SITE_CONFIG__) {
    cachedConfig = normalizeSiteConfig(window.__INITIAL_SITE_CONFIG__);
    return cachedConfig;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        cachedConfig = normalizeSiteConfig(parsed);
        return cachedConfig;
      }
    } catch (e) {
      console.error('Error reading site config from localStorage:', e);
    }
  }

  return defaultSiteConfig;
};

export const useSiteConfig = () => {
  const [config, setConfig] = useState<SiteConfig>(getInitialConfig);

  useEffect(() => {
    const handleUpdate = (newConfig: SiteConfig) => {
      setConfig(newConfig);
    };

    listeners.add(handleUpdate);

    if (!cachedConfig) {
      void fetchConfig();
    } else {
      setConfig(cachedConfig);
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
  if (fetchInFlight) {
    return fetchInFlight;
  }

  fetchInFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('api_key')
        .eq('id', 'brand_settings')
        .single();

      if (!error && data?.api_key) {
        const parsed = JSON.parse(data.api_key);
        const merged = normalizeSiteConfig(parsed);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
        }

        cachedConfig = merged;
        applyThemeColors(merged.colors);
        listeners.forEach((listener) => listener(merged));
        return;
      }

      const response = await fetch('/api/brand-bootstrap', {
        cache: 'no-store'
      });

      if (response.ok) {
        const parsed = await response.json();
        const merged = normalizeSiteConfig(parsed);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
        }

        cachedConfig = merged;
        applyThemeColors(merged.colors);
        listeners.forEach((listener) => listener(merged));
      }
    } catch (err) {
      console.error('Error fetching site config:', err);
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
};

// Helper function to force reload configuration
export const reloadSiteConfig = async () => {
  cachedConfig = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CONFIG_STORAGE_KEY);
  }
  await fetchConfig();
};
