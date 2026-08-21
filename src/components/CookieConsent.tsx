import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Cookie, ExternalLink, Shield } from 'lucide-react';
import { getConsentPreferences, setConsentPreferences } from '../services/analytics';

const PUBLIC_PRIVACY_WIDGET_EXACT_PATHS = new Set([
  '/',
  '/login',
  '/privacy',
  '/terms',
  '/delete-account',
  '/descadastro',
  '/feedback/continuidade',
  '/reativar-teste',
  '/jornada-15-dias'
]);

export const isPublicPrivacyWidgetPath = (pathname: string) => (
  PUBLIC_PRIVACY_WIDGET_EXACT_PATHS.has(pathname)
  || pathname === '/jornada'
  || pathname.startsWith('/jornada/')
);

export const CookieConsent = () => {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const load = () => {
    const current = getConsentPreferences();
    setAnalytics(current?.analytics ?? false);
    setMarketing(current?.marketing ?? false);
    setVisible(current === null);
    setReady(true);
    return current;
  };

  useEffect(() => {
    const openPreferences = () => {
      load();
      setPreferencesOpen(true);
      setVisible(true);
    };

    load();
    window.addEventListener('cookie-consent-open', openPreferences);
    return () => window.removeEventListener('cookie-consent-open', openPreferences);
  }, []);

  const save = (nextAnalytics = analytics, nextMarketing = marketing) => {
    setConsentPreferences({ analytics: nextAnalytics, marketing: nextMarketing });
    setVisible(false);
    setPreferencesOpen(false);
    window.dispatchEvent(new Event('cookie-consent-accepted'));
  };

  const closePreferences = () => {
    const hasRecordedChoice = getConsentPreferences() !== null;
    setPreferencesOpen(false);
    setVisible(!hasRecordedChoice);
  };

  const item = (
    label: string,
    description: string,
    checked: boolean,
    onChange: (checked: boolean) => void
  ) => (
    <label className="flex items-start space-x-4 p-3 rounded-2xl border border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer select-none">
      <div className="pt-1.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="w-4.5 h-4.5 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer accent-brand-primary"
        />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-gray-800">{label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${checked ? 'text-brand-accent-hover bg-brand-accent/10' : 'text-gray-400 bg-gray-100'}`}>
            {checked ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </label>
  );

  if (!ready) return null;

  const showFloatingPrivacyWidget = isPublicPrivacyWidgetPath(location.pathname);

  return (
    <>
      {!visible && showFloatingPrivacyWidget && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('cookie-consent-open'))}
          className="fixed bottom-4 left-4 z-[60] hidden h-10 items-center gap-2 rounded-full border border-brand-border/70 bg-white/95 px-3 text-xs font-semibold text-brand-primary shadow-md backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 md:inline-flex"
          aria-label="Abrir preferências de privacidade e cookies"
          title="Privacidade e cookies"
        >
          <Cookie className="h-4 w-4" aria-hidden="true" />
          <span>Privacidade e cookies</span>
        </button>
      )}

      {visible && !preferencesOpen && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-[70] shadow-2xl">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              Usamos tecnologias opcionais somente com sua autorização para medir desempenho e, separadamente, ativar recursos de publicidade.
            </p>
            <div className="flex gap-3 shrink-0 w-full md:w-auto">
              <button onClick={() => setPreferencesOpen(true)} className="flex-1 md:flex-none px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm">
                Preferências
              </button>
              <button onClick={() => save(true, true)} className="flex-1 md:flex-none bg-brand-primary text-white px-8 py-2.5 rounded-xl font-bold text-sm">
                Aceitar Todos
              </button>
            </div>
          </div>
        </div>
      )}

      {preferencesOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div
            className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full p-6 space-y-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-preferences-title"
          >
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2.5 bg-brand-primary/10 rounded-xl text-brand-primary">
                <Shield className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="privacy-preferences-title" className="text-lg font-bold font-display text-brand-primary">
                  Preferências de privacidade
                </h3>
                <p className="text-xs text-gray-500">Você pode alterar estas escolhas a qualquer momento.</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              <div className="flex items-start space-x-4 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary mt-0.5">
                  <Check className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-800">Essenciais (obrigatório)</span>
                    <span className="text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">Ativo</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Autenticação, segurança e suas preferências.</p>
                </div>
              </div>
              {item('Estatísticas & Analytics', 'Medição com Firebase/GA4, sem conteúdo clínico; pode usar identificadores pseudônimos.', analytics, setAnalytics)}
              {item('Marketing', 'Google Ads/remarketing e Meta Pixel, quando configurados, sem conteúdo clínico.', marketing, setMarketing)}
            </div>

            <Link
              to="/privacy"
              onClick={closePreferences}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
            >
              Ler a Política de Privacidade
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={closePreferences} className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl font-semibold text-xs">
                Voltar
              </button>
              <div className="flex gap-2">
                <button onClick={() => save(true, true)} className="flex-1 px-5 py-2.5 border border-brand-primary/20 text-brand-primary rounded-xl font-bold text-xs sm:flex-none">
                  Aceitar Todos
                </button>
                <button onClick={() => save()} className="flex-1 bg-brand-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:flex-none">
                  Salvar escolhas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
