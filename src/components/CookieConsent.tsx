import React, { useState, useEffect } from 'react';
import { Shield, Check } from 'lucide-react';

export const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    } else {
      try {
        const parsed = JSON.parse(consent);
        if (parsed && typeof parsed === 'object') {
          setAnalyticsConsent(!!parsed.analytics);
        }
      } catch (e) {
        // Se for string antiga 'true', significa consentimento total
        setAnalyticsConsent(consent === 'true');
      }
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({ necessary: true, analytics: true }));
    setIsVisible(false);
    window.dispatchEvent(new Event("cookie-consent-accepted"));
  };

  const handleSavePreferences = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({ necessary: true, analytics: analyticsConsent }));
    setIsVisible(false);
    setShowPreferences(false);
    window.dispatchEvent(new Event("cookie-consent-accepted"));
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Banner Principal no Rodapé */}
      {!showPreferences && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-[70] shadow-2xl animate-in slide-in-from-bottom-full duration-500">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-gray-600 leading-relaxed">
                Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência, analisar o desempenho e garantir a segurança da plataforma. Ao continuar navegando, você concorda com nosso uso.
              </p>
            </div>
            <div className="flex gap-3 shrink-0 w-full md:w-auto">
              <button 
                onClick={() => setShowPreferences(true)}
                className="flex-1 md:flex-none px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors cursor-pointer text-center"
              >
                Preferências
              </button>
              <button 
                onClick={handleAcceptAll}
                className="flex-1 md:flex-none bg-brand-primary text-white px-8 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-sm cursor-pointer text-center"
              >
                Aceitar Todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Preferências de Cookies */}
      {showPreferences && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full p-6 space-y-6 animate-in zoom-in-95 duration-200">
            {/* Cabeçalho */}
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2.5 bg-brand-primary/10 rounded-xl text-brand-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-brand-primary">Preferências de Cookies</h3>
                <p className="text-xs text-gray-500">Personalize como coletamos dados de navegação.</p>
              </div>
            </div>

            {/* Lista de Preferências */}
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {/* Item 1: Cookies Necessários */}
              <div className="flex items-start space-x-4 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-800">Essenciais (Obrigatório)</span>
                    <span className="text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">Ativo</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Cookies necessários para ativar recursos básicos, como autenticação de conta, segurança e as próprias preferências de privacidade.
                  </p>
                </div>
              </div>

              {/* Item 2: Analytics & Estatísticas */}
              <label className="flex items-start space-x-4 p-3 rounded-2xl border border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer select-none">
                <div className="pt-1.5 shrink-0">
                  <input 
                    type="checkbox"
                    checked={analyticsConsent}
                    onChange={(e) => setAnalyticsConsent(e.target.checked)}
                    className="w-4.5 h-4.5 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer accent-brand-primary"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-800">Estatísticas & Analytics</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${analyticsConsent ? 'text-brand-accent-hover bg-brand-accent/10' : 'text-gray-400 bg-gray-100'}`}>
                      {analyticsConsent ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Ajudam-nos a compreender o desempenho da plataforma, a analisar páginas populares e a melhorar a usabilidade geral de forma totalmente anônima.
                  </p>
                </div>
              </label>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 gap-3">
              <button
                onClick={() => setShowPreferences(false)}
                className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl font-semibold text-xs hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptAll}
                  className="px-5 py-2.5 border border-brand-primary/20 text-brand-primary rounded-xl font-bold text-xs hover:bg-brand-primary/5 transition-colors cursor-pointer"
                >
                  Aceitar Todos
                </button>
                <button
                  onClick={handleSavePreferences}
                  className="bg-brand-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:opacity-90 transition-all shadow-sm cursor-pointer"
                >
                  Salvar Escolhas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
