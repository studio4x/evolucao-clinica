import React, { useState, useEffect } from 'react';
import { Download, X, Share2, PlusSquare, ArrowUp, Info, HelpCircle } from 'lucide-react';
import { useSiteConfig } from '../../hooks/useSiteConfig';

export const InstallPrompt = () => {
  const siteConfig = useSiteConfig();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showGenericModal, setShowGenericModal] = useState(false);
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
      setShowIOSModal(false);
      setShowGenericModal(false);
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
    if (deferredPrompt) {
      // Disparar instalação nativa se disponível (Android/Chrome/Edge/Windows)
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsInstalled(true);
      }
    } else if (isIOS()) {
      // Mostrar guia de instalação do iOS
      setShowIOSModal(true);
    } else {
      // Mostrar instrução genérica para outros navegadores/desktops
      setShowGenericModal(true);
    }
  };

  const appName = siteConfig.pwa_app_name || "Evolução Clínica";
  const installTitle = siteConfig.pwa_install_title || `Instalar ${appName}`;
  const installDesc = siteConfig.pwa_install_description || "Acesse seus prontuários rapidamente e offline direto da tela inicial.";

  return (
    <>
      {/* ── BANNER PERSISTENTE (Mobile e Desktop: Flutuante na parte inferior) ── */}
      <div className="fixed bottom-0 left-0 right-0 md:left-auto md:bottom-6 md:right-6 z-[9999] p-4 md:p-0 pointer-events-none">
        <div className="w-full md:max-w-md bg-white/95 backdrop-blur-md rounded-2xl md:rounded-3xl border border-brand-border/60 shadow-2xl p-4 flex items-center justify-between gap-4 pointer-events-auto transition-all duration-300 transform translate-y-0 scale-100 hover:shadow-brand-primary/10">
          
          {/* Lado Esquerdo: Ícone da Marca e Textos */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0 animate-pulse">
              <Download size={20} className="stroke-[2]" />
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

      {/* ── MODAL GUIA DE INSTALAÇÃO DO IOS ── */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[10000] p-4 animate-fade-in">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 shadow-2xl border border-brand-border/30 relative flex flex-col items-center text-center space-y-6 animate-scale-up">
            
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-2 text-brand-text-muted hover:text-brand-primary hover:bg-brand-bg rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            {/* Ícone de Cabeçalho */}
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <Share2 size={26} className="stroke-[1.8]" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-display font-black text-brand-primary">Instalar no iPhone / iPad</h3>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                Adicione o aplicativo oficial à sua tela de início usando o Safari:
              </p>
            </div>

            {/* Passos ilustrados */}
            <div className="w-full text-left space-y-4 bg-brand-bg/50 border border-brand-border/30 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0">1</div>
                <p className="text-xs text-brand-text-muted leading-normal">
                  Toque no botão de <strong>Compartilhar</strong> <Share2 size={13} className="inline-block text-brand-primary mx-0.5" /> na barra inferior do Safari.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0">2</div>
                <p className="text-xs text-brand-text-muted leading-normal">
                  Role a lista e toque em <strong>Adicionar à Tela de Início</strong> <PlusSquare size={13} className="inline-block text-brand-primary mx-0.5" />.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0">3</div>
                <p className="text-xs text-brand-text-muted leading-normal">
                  Toque em <strong>Adicionar</strong> no canto superior direito para confirmar.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="btn-primary w-full py-3 rounded-xl text-xs font-bold shadow-md shadow-brand-primary/10"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL GUIA GENÉRICO DE INSTALAÇÃO ── */}
      {showGenericModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 shadow-2xl border border-brand-border/30 relative flex flex-col items-center text-center space-y-5">
            
            <button
              onClick={() => setShowGenericModal(false)}
              className="absolute top-4 right-4 p-2 text-brand-text-muted hover:text-brand-primary hover:bg-brand-bg rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <Info size={26} className="stroke-[1.8]" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-display font-black text-brand-primary">Como instalar o App</h3>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                Você pode instalar o aplicativo {appName} direto pelo navegador:
              </p>
            </div>

            <div className="w-full text-left bg-brand-bg/50 border border-brand-border/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-brand-text-muted leading-relaxed">
                • <strong>No Desktop (Chrome/Edge):</strong> Clique no ícone de instalação <Download size={12} className="inline text-brand-primary" /> na barra de endereços (ao lado da estrela de favoritos) e confirme.
              </p>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                • <strong>No Android (Chrome):</strong> Toque nos três pontinhos no topo direito do navegador e selecione a opção <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
              </p>
            </div>

            <button
              onClick={() => setShowGenericModal(false)}
              className="btn-primary w-full py-3 rounded-xl text-xs font-bold"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
