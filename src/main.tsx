import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AdminCampaignDispatch from './pages/AdminCampaignDispatch';
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

// Mantém o acesso à Central de Disparos dentro do agrupamento
// "Comunicação & Jornada" do menu administrativo, tanto desktop quanto mobile.
// O painel atual gera os itens de navegação internamente; este atalho é instalado
// somente no DOM administrativo e usa navegação normal para a rota dedicada.
const installCampaignDispatchAdminShortcut = () => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (!normalizedPath.startsWith('/admin') || normalizedPath === '/admin/captacao-disparos') {
    return () => undefined;
  }

  const shortcutSelector = '[data-admin-campaign-dispatch-shortcut="true"]';

  const install = () => {
    const headings = Array.from(document.querySelectorAll('h3'))
      .filter((heading) => heading.textContent?.trim().toLocaleLowerCase('pt-BR') === 'comunicação & jornada');

    headings.forEach((heading) => {
      const group = heading.parentElement;
      const itemsContainer = group?.children.item(1);
      if (!(itemsContainer instanceof HTMLElement)) return;
      if (itemsContainer.querySelector(shortcutSelector)) return;

      const link = document.createElement('a');
      link.href = '/admin/captacao-disparos';
      link.dataset.adminCampaignDispatchShortcut = 'true';
      link.className = 'flex w-full min-w-0 items-center justify-start gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-200 cursor-pointer text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary';
      link.setAttribute('aria-label', 'Abrir Disparos da Captação');

      const icon = document.createElement('span');
      icon.className = 'inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs font-bold opacity-85';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '➤';

      const label = document.createElement('span');
      label.className = 'min-w-0 leading-tight truncate';
      label.textContent = 'Disparos da Captação';

      link.append(icon, label);
      itemsContainer.appendChild(link);
    });
  };

  install();

  const observer = new MutationObserver(() => install());
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.querySelectorAll(shortcutSelector).forEach((element) => element.remove());
  };
};

const removeCampaignDispatchShortcut = installCampaignDispatchAdminShortcut();
window.addEventListener('pagehide', removeCampaignDispatchShortcut, { once: true });

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminCampaignDispatch ? (
      <AdminCampaignDispatch />
    ) : (
      <GrowthProfileGate>
        <App />
      </GrowthProfileGate>
    )}
  </StrictMode>,
);
