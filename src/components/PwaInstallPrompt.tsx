import React, { useState, useEffect } from 'react';
import { usePWAStore } from '../store/pwaStore';
import { Download, X } from 'lucide-react';

export const PwaInstallPrompt = () => {
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed');
    const hasCookieConsent = localStorage.getItem('cookie-consent') === 'true';
    
    if (deferredPrompt && !isStandalone && !isDismissed && hasCookieConsent) {
      // Small delay before showing
      const timer = setTimeout(() => {
        setIsVisible(true);
        window.dispatchEvent(new Event("hcm-pwa-prompt-visible"));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [deferredPrompt, isStandalone]);

  // Listen for cookie consent even if already loaded
  useEffect(() => {
    const handleCookieAccepted = () => {
      // Force re-check
      const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed');
      if (deferredPrompt && !isStandalone && !isDismissed) {
        setIsVisible(true);
      }
    };
    window.addEventListener("cookie-consent-accepted", handleCookieAccepted);
    return () => window.removeEventListener("cookie-consent-accepted", handleCookieAccepted);
  }, [deferredPrompt, isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsVisible(false);
      window.dispatchEvent(new Event("hcm-pwa-prompt-handled"));
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    window.dispatchEvent(new Event("hcm-pwa-prompt-handled"));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5 animate-in slide-in-from-bottom-full duration-500">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-brand-primary rounded-xl flex items-center justify-center text-white shadow-lg">
            <Download size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">HomeCare Match</h3>
            <p className="text-xs text-gray-500">Instale nosso App em segundos</p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
        >
          <X size={20} />
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
        Acesse sua agenda e acompanhe seus pacientes com muito mais agilidade direto da sua tela inicial.
      </p>
      
      <div className="flex space-x-3">
        <button 
          onClick={handleInstall}
          className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-95"
        >
          Instalar Agora
        </button>
        <button 
          onClick={handleDismiss}
          className="px-6 py-3 border border-gray-200 text-gray-500 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
        >
          Depois
        </button>
      </div>
    </div>
  );
};
