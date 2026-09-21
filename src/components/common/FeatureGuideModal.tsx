import React, { useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type FeatureGuideStep = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type FeatureGuideModalProps = {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  description: string;
  steps: FeatureGuideStep[];
  note?: string;
};

export function FeatureGuideModal({
  open,
  onClose,
  eyebrow = 'Guia rápido',
  title,
  description,
  steps,
  note,
}: FeatureGuideModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-guide-title"
        aria-describedby="feature-guide-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-brand-border bg-brand-bg/55 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary sm:h-11 sm:w-11">
            <Info size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              {eyebrow}
            </p>
            <h2 id="feature-guide-title" className="mt-1 text-lg font-display font-bold leading-tight text-brand-text sm:text-xl">
              {title}
            </h2>
            <p id="feature-guide-description" className="mt-2 text-xs leading-relaxed text-brand-text-muted sm:text-sm">
              {description}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-brand-text-muted transition-colors hover:bg-white hover:text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            aria-label="Fechar guia"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <ol className="space-y-3 sm:space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <li key={step.title} className="flex gap-3 rounded-2xl border border-brand-border/70 bg-brand-bg/20 p-3.5 sm:gap-4 sm:p-4">
                  <div className="relative flex shrink-0 flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white shadow-sm">
                      <Icon size={17} />
                    </span>
                    {index < steps.length - 1 && <span className="mt-2 h-full min-h-4 w-px bg-brand-border" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                      Passo {index + 1}
                    </p>
                    <h3 className="mt-1 text-sm font-bold text-brand-text sm:text-base">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-brand-text-muted sm:text-sm">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {note && (
            <div className="mt-4 flex gap-3 rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-3.5 text-xs leading-relaxed text-brand-text-muted sm:mt-5 sm:p-4 sm:text-sm">
              <CheckCircle2 className="mt-0.5 shrink-0 text-brand-primary" size={17} />
              <p>{note}</p>
            </div>
          )}
        </div>

        <div className="border-t border-brand-border bg-brand-bg/30 px-4 py-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2 sm:w-auto"
          >
            Entendi
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
