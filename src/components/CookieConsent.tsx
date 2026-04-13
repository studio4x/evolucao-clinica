import React, { useState, useEffect } from 'react';

export const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'true');
    setIsVisible(false);
    window.dispatchEvent(new Event("cookie-consent-accepted"));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-[70] shadow-2xl animate-in slide-in-from-bottom-full duration-500">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 leading-relaxed">
            Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência, analisar o desempenho e garantir a segurança da plataforma. Ao continuar navegando, você concorda com nosso uso.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button 
            onClick={handleAccept}
            className="bg-brand-primary text-white px-8 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-sm"
          >
            Aceitar Todos
          </button>
          <button 
            onClick={() => setIsVisible(false)}
            className="px-6 py-2.5 border border-gray-200 text-gray-500 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Preferências
          </button>
        </div>
      </div>
    </div>
  );
};
