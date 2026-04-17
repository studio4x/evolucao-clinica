import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APP_VERSION } from './components/layout/AppVersion';

// 1. Limpeza por versao
const previousVersion = window.localStorage.getItem("evolucao-clinica:runtime-version");
if (previousVersion !== APP_VERSION) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => caches.delete(key)));
    });
  }
  window.localStorage.setItem("evolucao-clinica:runtime-version", APP_VERSION);
  // Se quiser que force o recarregamento ao trocar a versão:
  // window.location.reload();
}

// 2. Registro do Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[PWA] Falha ao registrar service worker:", error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
