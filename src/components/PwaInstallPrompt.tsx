import React, { useState, useEffect } from 'react';
import { usePWAStore } from '../store/pwaStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { Download, X, Share, MoreVertical, RefreshCw } from 'lucide-react';

export const PwaInstallPrompt = () => {
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const config = useSiteConfig();
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [swJustInstalled, setSwJustInstalled] = useState(false);
  const [promptReady, setPromptReady] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios');
    else if (/android/.test(ua)) setPlatform('android');
  }, []);

  useEffect(() => {
    if (deferredPrompt) {
      setPromptReady(true);
    }
  }, [deferredPrompt]);

  // Detect when SW installs for the first time (needs reload to enable beforeinstallprompt)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handle = async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) return;
      const isFirstInstall = localStorage.getItem('sw-installed') !== 'true';
      if (reg.installing && isFirstInstall) {
        reg.installing.addEventListener('statechange', (e: any) => {
          if (e.target.state === 'activated') {
            localStorage.setItem('sw-installed', 'true');
            setSwJustInstalled(true);
          }
        });
      } else {
        // SW already active
        localStorage.setItem('sw-installed', 'true');
      }
    };
    handle();
  }, []);

  useEffect(() => {
    const isDismissed = localStorage.getItem('hcm-pwa-dismissed') === 'true';
    if (isStandalone || isDismissed) return;

    // If native prompt is ready — show after 3s
    if (deferredPrompt) {
      const t = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(t);
    }

    // iOS: always show manual instructions after 5s
    if (platform === 'ios') {
      const t = setTimeout(() => setIsVisible(true), 5000);
      return () => clearTimeout(t);
    }

    // Android: if SW was already installed on a previous session,
    // Chrome should have fired beforeinstallprompt. If it hasn't after 8s,
    // show the reload suggestion first, then manual instructions.
    if (platform === 'android' && localStorage.getItem('sw-installed') === 'true') {
      const t = setTimeout(() => setIsVisible(true), 8000);
      return () => clearTimeout(t);
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
      window.dispatchEvent(new Event('hcm-pwa-prompt-handled'));
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('hcm-pwa-dismissed', 'true');
    window.dispatchEvent(new Event('hcm-pwa-prompt-handled'));
  };

  const handleReload = () => {
    // Clear dismissed flag and reload to retry
    localStorage.removeItem('hcm-pwa-dismissed');
    window.location.reload();
  };

  // Try to use the Web Share API to hint at install (works on some Android browsers)
  const handleShareFallback = async () => {
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({
          title: config.pwa_app_name,
          text: config.pwa_install_description,
          url: window.location.origin
        });
      }
    } catch (e) {
      // User cancelled or not supported — that's fine
    }
  };

  if (!isVisible && !swJustInstalled) return null;
  if (isStandalone) return null;

  // Show reload prompt if SW just installed for the first time
  if (swJustInstalled && !deferredPrompt) {
    return (
      <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md border border-gray-100 p-1">
              <img src={config.pwa_icon_192_url} alt="App Icon" className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">App pronto para instalar!</h3>
              <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Recarregue para ativar</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">O app foi configurado neste dispositivo. Recarregue a página e o botão de instalação aparecerá automaticamente.</p>
        <button onClick={handleReload}
          className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all flex items-center justify-center space-x-2">
          <RefreshCw size={16} />
          <span>Recarregar e Instalar</span>
        </button>
      </div>
    );
  }

  if (!isVisible) return null;

  const isManualMode = platform === 'ios' || (platform === 'android' && !deferredPrompt);

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5 animate-in slide-in-from-bottom-full duration-500">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden border border-gray-100 p-1">
            <img src={config.pwa_icon_192_url} alt="App Icon" className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">{config.pwa_app_name}</h3>
            <p className="text-[10px] text-brand-primary font-medium tracking-wider uppercase">App Oficial</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
          <X size={20} />
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-5 leading-relaxed font-medium">
        {platform === 'ios' ? "Acesse mais rápido pelo seu iPhone."
          : deferredPrompt ? "Instale o app e acesse direto da sua tela inicial."
          : "Instale o app para uma experiência completa."}
      </p>

      {isManualMode ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start space-x-3 text-blue-700">
            {platform === 'ios' ? <Share size={20} className="shrink-0 mt-0.5" /> : <MoreVertical size={20} className="shrink-0 mt-0.5" />}
            <div className="text-xs space-y-1">
              <p className="font-bold uppercase tracking-tight">Como instalar:</p>
              {platform === 'ios' ? (
                <p className="leading-normal">Toque no botão <strong>Compartilhar</strong> do Safari e selecione <u><strong>"Adicionar à Tela de Início"</strong></u>.</p>
              ) : (
                <p className="leading-normal">Toque nos <strong>três pontinhos</strong> do Chrome e selecione <u><strong>"Instalar aplicativo"</strong></u>.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleReload}
              className="bg-gray-800 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw size={15} />
              <span>Recarregar</span>
            </button>
            <button
              type="button"
              onClick={handleShareFallback}
              className="bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              <Share size={15} />
              <span>Compartilhar</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex space-x-3">
          <button onClick={handleInstall}
            className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2">
            <Download size={18} />
            <span>Instalar Agora</span>
          </button>
          <button onClick={handleDismiss}
            className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors">
            Pular
          </button>
        </div>
      )}
    </div>
  );
};
