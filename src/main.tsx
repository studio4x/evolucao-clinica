import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { usePWAStore } from './store/pwaStore';

// Capture the install prompt globally immediately
if ((window as any).deferredPWAPrompt) {
  usePWAStore.getState().setDeferredPrompt((window as any).deferredPWAPrompt);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  usePWAStore.getState().setDeferredPrompt(e);
});

window.addEventListener('pwa-prompt-ready' as any, (e: any) => {
  usePWAStore.getState().setDeferredPrompt(e.detail);
});

// Manual Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      console.log("[PWA] Service Worker registrado com sucesso:", registration.scope);
    }).catch((error) => {
      console.warn("[PWA] Falha ao registrar service worker:", error);
    });
  });
}

// Check if running as standalone
const checkStandalone = () => {
  const isStandAlone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  usePWAStore.getState().setIsStandalone(isStandAlone);
};
checkStandalone();
window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
