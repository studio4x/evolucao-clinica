import React, { useState, useEffect } from 'react';
import { usePWAStore } from '../store/pwaStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { Download, X, Share, MoreVertical } from 'lucide-react';

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
    
    // Auto-show for Android/Chrome when deferredPrompt is available
    if (deferredPrompt && !isStandalone && !isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        window.dispatchEvent(new Event("hcm-pwa-prompt-visible"));
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Manual show for iOS
    if (platform === 'ios' && !isStandalone && !isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 5000);
      return () => clearTimeout(timer);
    }

    // Force show manual instructions for Android if native prompt fails to fire after 15s
    if (platform === 'android' && !deferredPrompt && !isStandalone && !isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [deferredPrompt, isStandalone, platform]);

  const handleInstall = async () => {
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

  const isManualMode = platform === 'ios' || (platform === 'android' && !deferredPrompt);

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5 animate-in slide-in-from-bottom-full duration-500">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden border border-gray-100 p-1">
            <img 
              src={config.pwa_icon_192_url} 
              alt="App Icon" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback direct to logo.svg if something fails
                (e.target as HTMLImageElement).src = '/logo.svg';
              }}
            />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">{config.pwa_app_name}</h3>
            <p className="text-[10px] text-brand-primary font-medium tracking-wider uppercase">App Oficial</p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
        >
          <X size={20} />
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-5 leading-relaxed font-medium">
        {platform === 'ios' 
          ? "Acesse mais rápido pelo seu iPhone."
          : (!deferredPrompt && platform === 'android')
            ? "Instale o app para uma experiência completa."
            : "Instale o app e acesse direto da sua tela inicial."}
      </p>
      
      {isManualMode ? (
        <div className="bg-brand-bg border border-brand-border p-4 rounded-xl flex items-start space-x-3 text-brand-primary shadow-sm">
          {platform === 'ios' ? <Share size={20} className="shrink-0 mt-0.5" /> : <MoreVertical size={20} className="shrink-0 mt-0.5" />}
          <div className="text-xs space-y-2">
            <p className="font-bold uppercase tracking-tight">Instalação Manual:</p>
            {platform === 'ios' ? (
              <p className="leading-normal">Toque no botão <span className="font-bold">Compartilhar</span> na barra do Safari e selecione <span className="underline font-bold">"Adicionar à Tela de Início"</span>.</p>
            ) : (
              <p className="leading-normal">Toque nos <span className="font-bold">três pontinhos</span> do Chrome (topo ou base) e selecione <span className="underline font-bold">"Instalar aplicativo"</span>.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex space-x-3">
          <button 
            onClick={handleInstall}
            className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2"
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
