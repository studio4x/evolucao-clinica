import React, { useState, useEffect } from 'react';
import { usePWAStore } from '../store/pwaStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { Download, X, Share } from 'lucide-react';

export const PwaInstallPrompt = () => {
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const config = useSiteConfig();
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');

  useEffect(() => {
    // Detect platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    }
  }, []);

  useEffect(() => {
    // Check if dismissed (localStorage as per spec)
    const isDismissed = localStorage.getItem('hcm-pwa-dismissed') === 'true';
    const hasCookieConsent = localStorage.getItem('cookie-consent') === 'true';
    
    // Auto-show for Android/Chrome when deferredPrompt is available
    if (deferredPrompt && !isStandalone && !isDismissed && hasCookieConsent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        window.dispatchEvent(new Event("hcm-pwa-prompt-visible"));
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Manual show for iOS (since they don't have beforeinstallprompt)
    if (platform === 'ios' && !isStandalone && !isDismissed && hasCookieConsent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 5000);
      return () => clearTimeout(timer);
    }

    // Force show manual instructions for Android if native prompt fails to fire after 15s
    if (platform === 'android' && !deferredPrompt && !isStandalone && !isDismissed && hasCookieConsent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [deferredPrompt, isStandalone, platform]);

  // Listen for cookie consent
  useEffect(() => {
    const handleCookieAccepted = () => {
      const isDismissed = localStorage.getItem('hcm-pwa-dismissed') === 'true';
      if (!isStandalone && !isDismissed && (deferredPrompt || platform === 'ios')) {
        setIsVisible(true);
      }
    };
    window.addEventListener("cookie-consent-accepted", handleCookieAccepted);
    return () => window.removeEventListener("cookie-consent-accepted", handleCookieAccepted);
  }, [deferredPrompt, isStandalone, platform]);

  const handleInstall = async () => {
    if (platform === 'ios') {
      // iOS just stays visible to show instructions
      return;
    }

    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsVisible(false);
      localStorage.setItem('hcm-pwa-prompt-handled', 'true');
      window.dispatchEvent(new Event("hcm-pwa-prompt-handled"));
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('hcm-pwa-dismissed', 'true');
    window.dispatchEvent(new Event("hcm-pwa-prompt-handled"));
  };

  if (!isVisible || isStandalone) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5 animate-in slide-in-from-bottom-full duration-500">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-[#0f172a] rounded-xl flex items-center justify-center text-white shadow-lg overflow-hidden">
            <img src={config.pwa_icon_192_url} alt="App Icon" className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">{config.pwa_app_name}</h3>
            <p className="text-xs text-gray-500">Web App Oficial</p>
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
        {platform === 'ios' 
          ? "Instale o app no seu iPhone: toque no ícone de compartilhar e selecione 'Adicionar à Tela de Início'."
          : (!deferredPrompt && platform === 'android')
            ? "Instale o app no seu Android: toque nos três pontinhos do navegador e selecione 'Instalar aplicativo'."
            : config.pwa_install_description}
      </p>
      
      {platform === 'ios' ? (
        <div className="bg-blue-50 p-3 rounded-xl flex items-center space-x-3 text-blue-700">
          <Share size={20} className="shrink-0" />
          <span className="text-xs font-medium">Toque em compartilhar e 'Adicionar à Tela de Início'</span>
        </div>
      ) : (
        <div className="flex space-x-3">
          <button 
            onClick={handleInstall}
            className="flex-1 bg-[#0f172a] text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2"
          >
            <Download size={18} />
            <span>Instalar Agora</span>
          </button>
          <button 
            onClick={handleDismiss}
            className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Pular
          </button>
        </div>
      )}
    </div>
  );
};
