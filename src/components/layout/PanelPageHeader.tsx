import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type PanelPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Mantém as ações ao lado do título em telas compactas. */
  mobileActionsInline?: boolean;
};

/** Cabeçalho visual comum das páginas autenticadas do painel. */
export function PanelPageHeader({ title, description, icon: Icon, actions, mobileActionsInline = false }: PanelPageHeaderProps) {
  return (
    <div className={mobileActionsInline ? 'flex items-start justify-between gap-3 sm:items-center' : 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'}>
      <div className={mobileActionsInline ? 'min-w-0' : undefined}>
        <h1 className={`flex items-center font-display font-bold text-brand-text ${mobileActionsInline ? 'min-w-0 text-2xl sm:text-3xl' : 'text-3xl'}`}>
          {Icon && <Icon className="mr-3 shrink-0 text-brand-primary" size={32} />}
          <span className={mobileActionsInline ? 'truncate' : undefined}>{title}</span>
        </h1>
        {description && <p className="mt-1 text-sm text-brand-text-muted">{description}</p>}
      </div>
      {actions && <div className={`flex shrink-0 items-center gap-2 ${mobileActionsInline ? 'pt-0.5 sm:self-auto' : 'self-start sm:self-auto'}`}>{actions}</div>}
    </div>
  );
}
