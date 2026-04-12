import { create } from 'zustand';

interface PWAStore {
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
  isStandalone: boolean;
  setIsStandalone: (isStandalone: boolean) => void;
}

export const usePWAStore = create<PWAStore>((set) => ({
  deferredPrompt: null,
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt }),
  isStandalone: false,
  setIsStandalone: (isStandalone) => set({ isStandalone }),
}));
