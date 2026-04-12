import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { usePWAStore } from './store/pwaStore';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker
registerSW({ immediate: true });

// Capture the install prompt globally before React even renders
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  usePWAStore.getState().setDeferredPrompt(e);
});

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
