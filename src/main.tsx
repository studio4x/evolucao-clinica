import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APP_VERSION } from './components/layout/AppVersion';
import { initAnalytics } from './services/analytics';
import { installWebViewAudioCompatibility } from './utils/audioWebViewCompatibility';

// Inicializa o Google Analytics
initAnalytics();

// Detecta se esta rodando no WebView do App
const isNativeWebView = /EvolucaoClinicaApp/i.test(navigator.userAgent);
if (isNativeWebView) {
  document.documentElement.classList.add('is-webview');
  installWebViewAudioCompatibility();
}


// Registro do Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = `/sw.js?v=${encodeURIComponent(APP_VERSION)}`;
    void navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: '/',
      updateViaCache: 'none'
    }).then(reg => {
      console.log("[PWA] Service Worker registrado com escopo:", reg.scope);
      void reg.update();
    }).catch((error) => {
      console.warn("[PWA] Falha ao registrar service worker:", error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
