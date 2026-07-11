import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandIconUrl } from '../../utils/brandAssets';

export const InstallPrompt = () => {
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.sessionStorage.getItem('pwa-install-dismissed') === 'true';
    }
    return false;
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('pwa-install-dismissed', 'true');
    }
  };

  useEffect(() => {
    setMounted(true);
    
    // 1. Detectar se já está rodando em modo standalone (instalado)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true;
      setIsInstalled(isStandaloneMode);
    };

    checkStandalone();

    // 2. Escutar o evento de prompt de instalação do browser (Chrome/Edge/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // 3. Escutar o evento de instalação concluída
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Polling simples de display-mode para atualizar se o estado mudar
    const interval = setInterval(checkStandalone, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearInterval(interval);
    };
  }, []);

  if (!mounted || isInstalled || isDismissed) {
    return null;
  }

  // Detecta se é dispositivo iOS
  const isIOS = () => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  };

  const appName = siteConfig.pwa_app_name || "Evolução Clínica";
  const installTitle = siteConfig.pwa_install_title || `Instalar ${appName}`;
  const installDesc = siteConfig.pwa_install_description || "Acesse seus prontuários rapidamente e offline direto da tela inicial.";
  const installLogoUrl = appendBrandAssetVersion(getBrandIconUrl(siteConfig), assetSignature);
  const canInstallNatively = Boolean(deferredPrompt);

  if (!canInstallNatively) {
    return null;
  }

  return (
    <>
      {/* ── BANNER PERSISTENTE (Mobile e Desktop: Flutuante na parte inferior) ── */}
      <div className="fixed bottom-0 left-0 right-0 md:left-auto md:bottom-6 md:right-6 z-[9999] p-4 md:p-0 pointer-events-none">
        <div className="w-full md:max-w-md bg-white/95 backdrop-blur-md rounded-2xl md:rounded-3xl border border-brand-border/60 shadow-2xl p-4 flex items-center justify-between gap-4 pointer-events-auto transition-all duration-300 transform translate-y-0 scale-100 hover:shadow-brand-primary/10">
          
          {/* Lado Esquerdo: Ícone da Marca e Textos */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white border border-brand-primary/10 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-2">
              {installLogoUrl ? (
                <img
                  src={installLogoUrl}
                  alt="App Icon"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Download size={18} className="stroke-[2]" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-brand-text truncate">
                {installTitle}
              </h4>
              <p className="text-[10px] text-brand-text-muted leading-tight mt-0.5 line-clamp-2 md:line-clamp-1">
                {installDesc}
              </p>
            </div>
          </div>

          {/* Lado Direito: Botões de Ação */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap shadow-sm shadow-brand-primary/15 flex items-center gap-1.5 active:scale-95"
            >
              Instalar
              <Download size={12} className="stroke-[2.5]" />
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 text-brand-text-muted hover:text-brand-primary hover:bg-brand-bg rounded-xl border border-transparent hover:border-brand-border/60 transition-all active:scale-95 flex items-center justify-center"
              title="Fechar"
              aria-label="Fechar mensagem de instalação"
            >
              <X size={16} className="stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
