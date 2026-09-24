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
        ? 'app-floating-help-mobile md:static md:bottom-auto md:left-auto md:z-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-primary/25 bg-white/95 md:bg-brand-primary/5 text-brand-primary shadow-md md:shadow-none backdrop-blur-sm md:backdrop-blur-none transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30'
        : 'app-floating-help-mobile md:static md:bottom-auto md:left-auto md:z-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-primary/25 bg-white/95 md:bg-brand-primary/5 text-brand-primary shadow-md md:shadow-none backdrop-blur-sm md:backdrop-blur-none transition-colors hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 md:h-auto md:w-auto md:rounded-xl md:px-3 md:py-2 md:gap-2'}
      title="Como funciona"
    >
      <HelpCircle size={16} className="shrink-0" />
      {!compact && <span className="hidden text-xs font-bold md:inline">Como funciona</span>}
    </button>
  );
}
