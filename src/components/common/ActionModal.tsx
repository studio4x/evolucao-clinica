import { Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

type ActionModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ActionModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  loadingLabel = 'Salvando...',
  onConfirm,
  onClose,
}: ActionModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-modal-title"
        aria-describedby="action-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-brand-border bg-brand-bg/55 px-5 py-5 sm:gap-4 sm:px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <Loader2 size={21} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">Orientação</p>
            <h2 id="action-modal-title" className="mt-1 text-lg font-display font-bold leading-tight text-brand-text sm:text-xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar aviso"
            className="shrink-0 rounded-xl p-2 text-brand-text-muted transition-colors hover:bg-white hover:text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-6 sm:px-6">
          <p id="action-modal-description" className="text-sm leading-relaxed text-brand-text-muted sm:text-[15px]">
            {description}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-brand-border bg-brand-bg/30 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-brand-border bg-white px-5 py-2.5 text-sm font-semibold text-brand-text-muted transition-colors hover:bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
