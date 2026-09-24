import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface GooglePermissionRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReview: () => void;
  isLoading?: boolean;
  resourceLabel?: string;
}

export const GooglePermissionRecoveryModal: React.FC<GooglePermissionRecoveryModalProps> = ({
  isOpen,
  onClose,
  onReview,
  isLoading = false,
  resourceLabel = 'Google Drive',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-permission-recovery-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-brand-border bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-border bg-brand-primary/5 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <AlertTriangle size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="google-permission-recovery-title" className="text-lg font-display font-semibold text-brand-text">
                Permissões do Google necessárias
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">
                A conexão foi concluída, mas o Google não liberou todas as permissões necessárias para o {resourceLabel}.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Agora não" className="rounded-lg p-1.5 text-brand-text-muted hover:bg-white hover:text-brand-text">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <p className="text-sm leading-relaxed text-brand-text">
            Para usar o {resourceLabel}, o Evolução Clínica precisa das permissões solicitadas durante a conexão com o Google.
          </p>
          <ol className="space-y-2.5 text-sm text-brand-text-muted">
            {[
              'Avance pelas telas de autorização do Google.',
              'Mantenha selecionadas as permissões solicitadas pelo Evolução Clínica.',
              'Confirme no botão equivalente exibido pelo Google.',
            ].map((step) => (
              <li key={step} className="flex items-start gap-2.5">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-primary" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3.5 py-3 text-xs leading-relaxed text-brand-text-muted">
            Sem essas permissões, o recurso não poderá ser usado pelo Evolução Clínica.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-brand-border bg-brand-bg/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn-outline w-full sm:w-auto">
            Agora não
          </button>
          <button type="button" onClick={onReview} disabled={isLoading} className="btn-primary w-full sm:w-auto">
            {isLoading ? 'Abrindo Google...' : 'Revisar permissões do Google'}
          </button>
        </div>
      </div>
    </div>
  );
};
