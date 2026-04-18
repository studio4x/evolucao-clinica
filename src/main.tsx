import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APP_VERSION } from './components/layout/AppVersion';

// Registro do Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: '/' }).then(reg => {
      console.log("[PWA] Service Worker registrado com escopo:", reg.scope);
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
