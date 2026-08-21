import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AdminCampaignDispatch from './pages/AdminCampaignDispatch';
import AdminCampaignDashboard from './pages/AdminCampaignDashboard';
import './index.css';
import { APP_VERSION } from './components/layout/AppVersion';
import { GrowthProfileGate } from './components/onboarding/GrowthProfileGate';
import { initAnalytics } from './services/analytics';
import { installWebViewAudioCompatibility } from './utils/audioWebViewCompatibility';
import { installGlobalChunkRecovery } from './utils/lazyWithRetry';

// Inicializa o Google Analytics
initAnalytics();
installGlobalChunkRecovery();

// Detecta se esta rodando no WebView do App
const isNativeWebView = /EvolucaoClinicaApp/i.test(navigator.userAgent);
const NATIVE_VERSION_STORAGE_KEY = 'evolucao-clinica:native-version-code';
if (isNativeWebView) {
  document.documentElement.classList.add('is-webview');
  installWebViewAudioCompatibility();

  // O LauncherActivity envia o versionCode na primeira URL. Persistimos esse
  // valor porque a navegação SPA remove os parâmetros da URL inicial.
  try {
    const nativeVersion = new URLSearchParams(window.location.search).get('native_version');
    if (nativeVersion && /^\d+$/.test(nativeVersion) && Number(nativeVersion) > 0) {
      window.sessionStorage.setItem(NATIVE_VERSION_STORAGE_KEY, nativeVersion);
    }
  } catch (error) {
    console.warn('[AppInfo] Não foi possível persistir a versão nativa.', error);
  }
}

// Mantém os atalhos operacionais da captação dentro do agrupamento
// "Comunicação & Jornada" do menu administrativo, tanto desktop quanto mobile.
// O painel atual gera os itens de navegação internamente; estes atalhos são
// instalados somente no DOM administrativo e usam navegação normal para as rotas dedicadas.
const installCampaignAdminShortcuts = () => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const dedicatedPaths = new Set([
    '/admin/captacao-disparos',
    '/admin/captacao-dashboard'
  ]);

  if (!normalizedPath.startsWith('/admin') || dedicatedPaths.has(normalizedPath)) {
    return () => undefined;
  }

  const shortcuts = [
    {
      key: 'dashboard',
      href: '/admin/captacao-dashboard',
      label: 'Dashboard de Captação',
      icon: '▦',
      ariaLabel: 'Abrir Dashboard de Captação'
    },
    {
      key: 'dispatch',
      href: '/admin/captacao-disparos',
      label: 'Disparos da Captação',
      icon: '➤',
      ariaLabel: 'Abrir Disparos da Captação'
    }
  ] as const;

  const install = () => {
    const headings = Array.from(document.querySelectorAll('h3'))
      .filter((heading) => heading.textContent?.trim().toLocaleLowerCase('pt-BR') === 'comunicação & jornada');

    headings.forEach((heading) => {
      const group = heading.parentElement;
      const itemsContainer = group?.children.item(1);
      if (!(itemsContainer instanceof HTMLElement)) return;

      shortcuts.forEach((shortcut) => {
        const selector = `[data-admin-campaign-shortcut="${shortcut.key}"]`;
        if (itemsContainer.querySelector(selector)) return;

        const link = document.createElement('a');
        link.href = shortcut.href;
        link.dataset.adminCampaignShortcut = shortcut.key;
        link.className = 'flex w-full min-w-0 items-center justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-200 cursor-pointer text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary';
        link.setAttribute('aria-label', shortcut.ariaLabel);

        const icon = document.createElement('span');
        icon.className = 'inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs font-bold opacity-85';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = shortcut.icon;

        const label = document.createElement('span');
        label.className = 'min-w-0 leading-tight truncate';
        label.textContent = shortcut.label;

        link.append(icon, label);
        itemsContainer.appendChild(link);
      });
    });
  };

  install();

  const observer = new MutationObserver(() => install());
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.querySelectorAll('[data-admin-campaign-shortcut]').forEach((element) => element.remove());
  };
};

const removeCampaignAdminShortcuts = installCampaignAdminShortcuts();
window.addEventListener('pagehide', removeCampaignAdminShortcuts, { once: true });

// Registro do Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = `/sw.js?v=${encodeURIComponent(APP_VERSION)}`;
    void navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: '/',
      updateViaCache: 'none'
    }).then(reg => {
      void reg.update();
    }).catch((error) => {
      console.warn("[PWA] Falha ao registrar service worker:", error);
    });
  });
}

const normalizedEntryPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isAdminCampaignDispatch = normalizedEntryPath === '/admin/captacao-disparos';
const isAdminCampaignDashboard = normalizedEntryPath === '/admin/captacao-dashboard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminCampaignDispatch ? (
      <AdminCampaignDispatch />
    ) : isAdminCampaignDashboard ? (
      <AdminCampaignDashboard />
    ) : (
      <GrowthProfileGate>
        <App />
      </GrowthProfileGate>
    )}
  </StrictMode>,
);
