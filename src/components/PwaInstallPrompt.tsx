import React, { useState, useEffect } from 'react';
import { usePWAStore } from '../store/pwaStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { Download, X, Share, MoreVertical, CheckCircle } from 'lucide-react';

export const PwaInstallPrompt = () => {
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const config = useSiteConfig();
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios');
    else if (/android/.test(ua)) setPlatform('android');
  }, []);

  useEffect(() => {
    if (isStandalone) return;
    const isDismissed = localStorage.getItem('hcm-pwa-dismissed') === 'true';
    if (isDismissed) return;

    // Native install prompt available → show after 3s
    if (deferredPrompt) {
      const t = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(t);
    }

    // iOS → show manual guide after 5s
    if (platform === 'ios') {
      const t = setTimeout(() => setIsVisible(true), 5000);
      return () => clearTimeout(t);
    }

    // Android without native prompt → show manual guide after 6s
    // but ONLY if we haven't already shown it this session
    if (platform === 'android') {
      const shownThisSession = sessionStorage.getItem('pwa-banner-shown') === 'true';
      if (shownThisSession) return;
      const t = setTimeout(() => {
        sessionStorage.setItem('pwa-banner-shown', 'true');
        setIsVisible(true);
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [deferredPrompt, isStandalone, platform]);

  // Listen for appinstalled event
  useEffect(() => {
    const handleInstalled = () => {
      setInstalled(true);
      setTimeout(() => setIsVisible(false), 3000);
    };
    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setInstalled(true);
      setTimeout(() => setIsVisible(false), 3000);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Only permanently dismiss if user clicked X, not for other actions
    localStorage.setItem('hcm-pwa-dismissed', 'true');
  };

  const handleShare = async () => {
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({
          title: config.pwa_app_name,
          text: 'Acesse o app Evolução Clínica',
          url: window.location.origin
        });
      }
    } catch (e) {
      // cancelled
    }
  };

  if (!isVisible || isStandalone) return null;

  // Success state
  if (installed) {
    return (
      <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-emerald-600 rounded-2xl shadow-2xl z-[60] p-5 flex items-center space-x-4">
        <CheckCircle className="text-white shrink-0" size={28} />
        <div>
          <p className="text-white font-bold">App instalado com sucesso!</p>
          <p className="text-emerald-100 text-sm">Acesse pela sua tela inicial.</p>
        </div>
      </div>
    );
  }

  const isManualMode = platform === 'ios' || (platform === 'android' && !deferredPrompt);

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 bg-white rounded-2xl shadow-2xl z-[60] border border-gray-100 p-5 animate-in slide-in-from-bottom-full duration-500">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-md border border-gray-100 p-1.5 shrink-0">
            <img
              src="/logo.svg"
              alt="App Icon"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm leading-tight">{config.pwa_app_name}</h3>
            <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">App Oficial</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      {/* Native install button */}
      {!isManualMode && (
        <button
          type="button"
          onClick={handleInstall}
          className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all shadow-md flex items-center justify-center space-x-2 mb-3"
        >
          <Download size={18} />
          <span>Instalar Agora</span>
        </button>
      )}

      {/* Manual instructions */}
      {isManualMode && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">
            {platform === 'ios' ? 'Instalar no iPhone / iPad:' : 'Para instalar o app:'}
          </p>

          {platform === 'ios' ? (
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                <span>Toque no ícone <strong>Compartilhar</strong> <Share size={14} className="inline" /> na barra inferior do Safari</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                <span>Selecione <strong>"Adicionar à Tela de Início"</strong></span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                <span>Toque em <strong>"Adicionar"</strong> no canto superior direito</span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                <span>Toque nos <strong>três pontinhos</strong> <MoreVertical size={14} className="inline" /> no canto superior direito</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                <span>Procure e selecione <strong>"Instalar aplicativo"</strong> (não selecione "Add atalho")</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="bg-blue-100 text-blue-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                <span>Toque em <strong>"Instalar"</strong> para transformar em um App nativo</span>
              </li>
            </ol>
          )}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex space-x-2 mt-2">
        {platform === 'android' && isManualMode && (
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center space-x-2"
          >
            <Share size={16} />
            <span>Abrir menu</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
