import { HelpCircle } from 'lucide-react';

type FeatureGuideButtonProps = {
  label: string;
  compact?: boolean;
  expanded: boolean;
  onOpen: () => void;
};

export function FeatureGuideButton({ label, compact = false, expanded, onOpen }: FeatureGuideButtonProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir guia de como funciona ${label}`}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        className="app-floating-help-mobile md:hidden md:static inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-primary/25 bg-white/95 text-brand-primary shadow-md backdrop-blur-sm transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        title="Como funciona"
      >
        <HelpCircle size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Abrir guia de como funciona ${label}`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/25 bg-brand-primary/5 px-3 py-2 text-xs font-bold text-brand-primary transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      title="Como funciona"
    >
      <HelpCircle size={16} />
      <span>Como funciona</span>
    </button>
  );
}
