import { HelpCircle } from 'lucide-react';

type FeatureGuideButtonProps = {
  label: string;
  compact?: boolean;
  expanded: boolean;
  onOpen: () => void;
};

export function FeatureGuideButton({ label, compact = false, expanded, onOpen }: FeatureGuideButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Abrir guia de como funciona ${label}`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={compact
        ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-primary/25 bg-brand-primary/5 text-brand-primary transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30'
        : 'inline-flex items-center gap-2 rounded-xl border border-brand-primary/25 bg-brand-primary/5 px-3 py-2 text-xs font-bold text-brand-primary transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30'}
      title={compact ? 'Como funciona' : undefined}
    >
      <HelpCircle size={16} />
      {!compact && <span>Como funciona</span>}
    </button>
  );
}
