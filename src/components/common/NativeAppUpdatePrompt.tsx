import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import {
  getNativeAppUpdateSnapshot,
  initializeNativeAppUpdateCheck,
  isNativeAndroidApp,
  openGooglePlay,
  subscribeToNativeAppUpdate
} from '../../utils/androidAppUpdate';

const DISMISSED_SESSION_KEY = 'evolucao-clinica:native-app-update-dismissed';

const readDismissed = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(DISMISSED_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeDismissed = () => {
  try {
    window.sessionStorage.setItem(DISMISSED_SESSION_KEY, 'true');
  } catch {
    // A indisponibilidade do storage não pode bloquear o aplicativo.
  }
};

export function NativeAppUpdatePrompt() {
  const [snapshot, setSnapshot] = useState(getNativeAppUpdateSnapshot);
  const [dismissed, setDismissed] = useState(readDismissed);
  const isAndroid = isNativeAndroidApp();

  useEffect(() => {
    if (!isAndroid) return undefined;
    initializeNativeAppUpdateCheck();
    const unsubscribe = subscribeToNativeAppUpdate(() => setSnapshot(getNativeAppUpdateSnapshot()));
    setSnapshot(getNativeAppUpdateSnapshot());
    return unsubscribe;
  }, [isAndroid]);

  if (!isAndroid || dismissed || snapshot.state !== 'update_available') return null;

  const closeForSession = () => {
    writeDismissed();
    setDismissed(true);
  };

  const update = () => {
    closeForSession();
    openGooglePlay();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="native-app-update-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-brand-border bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-border bg-brand-primary/5 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <Download size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="native-app-update-title" className="text-lg font-display font-semibold text-brand-text">
                Nova versão disponível
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">
                Uma nova versão do Evolução Clínica está disponível. Atualize o aplicativo para receber as melhorias e correções mais recentes.
              </p>
            </div>
          </div>
          <button type="button" onClick={closeForSession} aria-label="Agora não" className="rounded-lg p-1.5 text-brand-text-muted hover:bg-white hover:text-brand-text">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {snapshot.availableVersionCode !== null && (
          <p className="px-5 pt-4 text-xs font-medium text-brand-text-muted sm:px-6">
            Versão disponível: {snapshot.availableVersionName || `1.0.${snapshot.availableVersionCode}`}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-brand-border bg-brand-bg/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={closeForSession} className="btn-outline w-full sm:w-auto">
            Agora não
          </button>
          <button type="button" onClick={update} className="btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
            Atualizar aplicativo
            <Download size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
