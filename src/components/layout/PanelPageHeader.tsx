import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type PanelPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
};

/** Cabeçalho visual comum das páginas autenticadas do painel. */
export function PanelPageHeader({ title, description, icon: Icon, actions }: PanelPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center text-3xl font-display font-bold text-brand-text">
          {Icon && <Icon className="mr-3 shrink-0 text-brand-primary" size={32} />}
          <span>{title}</span>
        </h1>
        {description && <p className="mt-1 text-sm text-brand-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">{actions}</div>}
    </div>
  );
}
