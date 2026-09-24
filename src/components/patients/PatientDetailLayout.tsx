import type { KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PanelPageHeader } from '../layout/PanelPageHeader';
import { PatientPhoto } from './PatientPhoto';

export type PatientDetailMobileTab = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type PatientDetailHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  photoPath?: string | null;
  status?: 'active' | 'inactive' | 'archived';
  actions?: ReactNode;
  tabs: readonly PatientDetailMobileTab[];
  activeTab: string;
  onTabChange: (tabId: string, direction: 'next' | 'previous') => void;
};

export function PatientDetailHeader({ icon, title, description, photoPath, status, actions, tabs, activeTab, onTabChange }: PatientDetailHeaderProps) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: string) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id, nextIndex >= currentIndex ? 'next' : 'previous');
    requestAnimationFrame(() => document.getElementById(`patient-tab-${nextTab.id}`)?.focus());
  };

  return (
    <>
      <div className="xl:hidden h-40" aria-hidden="true" />
      <div className="fixed inset-x-0 top-0 z-50 space-y-3 border-b border-brand-border/70 bg-brand-bg/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-xl xl:static xl:space-y-0 xl:border-0 xl:bg-transparent xl:px-0 xl:pb-0 xl:pt-0 xl:shadow-none xl:backdrop-blur-none">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <PatientPhoto photoPath={photoPath} patientName={title as string} className="h-12 w-12 sm:h-14 sm:w-14" />
            <div className="min-w-0">
              <PanelPageHeader icon={icon} title={title} description={description} />
              {status && <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status === 'active' ? 'Paciente ativo' : 'Paciente arquivado'}</span>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
        </div>
        <nav className="mt-3 w-full overflow-x-auto overscroll-x-contain" aria-label="Seções do paciente">
          <div className="flex min-w-max items-stretch gap-1 rounded-2xl border border-brand-border bg-white/80 p-1.5 shadow-sm backdrop-blur sm:grid sm:min-w-0 sm:grid-cols-5" role="tablist" aria-label="Seções do paciente">
            {tabs.map(({ id, label, icon: TabIcon }) => {
              const isActive = activeTab === id;
              const tabIndex = tabs.findIndex((tab) => tab.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id, tabIndex > activeIndex ? 'next' : 'previous')}
                  onKeyDown={(event) => handleTabKeyDown(event, id)}
                  id={`patient-tab-${id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`patient-tabpanel-${id}`}
                  tabIndex={isActive ? 0 : -1}
                  className={`flex min-h-14 min-w-[5.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-semibold leading-none transition-all sm:min-w-0 ${isActive ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/25' : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'}`}
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
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">{children}</div>;
}
