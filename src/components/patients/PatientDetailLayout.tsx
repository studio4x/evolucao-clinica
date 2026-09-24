import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PanelPageHeader } from '../layout/PanelPageHeader';

export type PatientDetailMobileTab = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type PatientDetailHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  tabs: readonly PatientDetailMobileTab[];
  activeTab: string;
  onTabChange: (tabId: string, direction: 'next' | 'previous') => void;
};

export function PatientDetailHeader({ icon, title, description, actions, tabs, activeTab, onTabChange }: PatientDetailHeaderProps) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <>
      <div className="xl:hidden h-40" aria-hidden="true" />
      <div className="fixed inset-x-0 top-0 z-50 space-y-3 border-b border-brand-border/70 bg-brand-bg/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-xl xl:static xl:space-y-0 xl:border-0 xl:bg-transparent xl:px-0 xl:pb-0 xl:pt-0 xl:shadow-none xl:backdrop-blur-none">
        <PanelPageHeader icon={icon} title={title} description={description} mobileActionsInline actions={actions} />
        <nav className="xl:hidden w-full overflow-hidden" aria-label="Seções do paciente">
          <div className="grid w-full items-stretch rounded-2xl border border-brand-border bg-white/80 p-1.5 shadow-sm backdrop-blur" style={{ gridTemplateColumns: `repeat(${Math.max(tabs.length, 1)}, minmax(0, 1fr))` }}>
            {tabs.map(({ id, label, icon: TabIcon }) => {
              const isActive = activeTab === id;
              const tabIndex = tabs.findIndex((tab) => tab.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id, tabIndex > activeIndex ? 'next' : 'previous')}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none transition-all ${isActive ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/25' : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'}`}
                >
                  <TabIcon size={16} aria-hidden="true" />
                  <span className="max-w-full truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}

export function PatientDetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">{children}</div>;
}
