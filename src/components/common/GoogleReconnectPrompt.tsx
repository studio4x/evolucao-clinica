import { Loader2, RefreshCw } from 'lucide-react';

interface GoogleReconnectPromptProps {
  onReconnect: () => void;
  isLoading?: boolean;
  description?: string;
}

export const GoogleReconnectPrompt = ({
  onReconnect,
  isLoading = false,
  description = 'Sua conexão com o Google expirou. Seus dados permanecem preservados; reconecte para continuar.',
}: GoogleReconnectPromptProps) => (
  <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.04] p-4" role="status">
    <div className="flex items-start gap-3">
      <RefreshCw size={18} className="mt-0.5 shrink-0 text-brand-primary" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-brand-text">Reconexão do Google necessária</p>
        <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">{description}</p>
        <button
          type="button"
          onClick={onReconnect}
          disabled={isLoading}
          className="mt-3 btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Reconectar Google
        </button>
      </div>
    </div>
  </div>
);
