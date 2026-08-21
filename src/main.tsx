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