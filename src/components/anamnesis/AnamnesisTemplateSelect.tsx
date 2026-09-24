import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { AnamnesisTemplate } from '../../services/anamnesis';

type AnamnesisTemplateSelectProps = {
  options: AnamnesisTemplate[];
  value: string;
  ownerProfessionalId?: string | null;
  disabled?: boolean;
  onChange: (templateId: string) => void;
};

export function AnamnesisTemplateSelect({
  options,
  value,
  ownerProfessionalId,
  disabled = false,
  onChange,
}: AnamnesisTemplateSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.id === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.id === value) || null;

  useEffect(() => {
    const selectedIndex = options.findIndex((option) => option.id === value);
    setActiveIndex(Math.max(0, selectedIndex));
  }, [options, value]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectOption = (option: AnamnesisTemplate) => {
    setOpen(false);
    onChange(option.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) selectOption(options[activeIndex] || options[0]);
      else setOpen(true);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((currentIndex) => (currentIndex + direction + options.length) % options.length);
    }
  };

  const isOwnedByUser = (template: AnamnesisTemplate) => Boolean(ownerProfessionalId && template.ownerProfessionalId === ownerProfessionalId);

  return <div ref={rootRef} className="relative w-full">
    <button
      type="button"
      onClick={() => !disabled && setOpen((currentOpen) => !currentOpen)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-label="Modelo do formulário"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-brand-border bg-white px-3.5 py-3 text-left text-sm font-semibold text-brand-text outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{selected?.name || 'Selecione um modelo'}</span>
        {selected && isOwnedByUser(selected) && <span className="shrink-0 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">Criada por você</span>}
      </span>
      <ChevronDown size={18} className={`shrink-0 text-brand-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>

    {open && <div id={listboxId} role="listbox" aria-label="Modelos de anamnese" className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-brand-border bg-white p-1.5 shadow-xl">
      {options.map((option, index) => {
        const isSelected = option.id === value;
        const isActive = index === activeIndex;
        return <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={isSelected}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => selectOption(option)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${isActive ? 'bg-brand-bg' : ''} ${isSelected ? 'font-semibold text-brand-primary' : 'text-brand-text'}`}
        >
          <span className="min-w-0 truncate">{option.name}</span>
          <span className="flex shrink-0 items-center gap-2">
            {isOwnedByUser(option) && <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">Criada por você</span>}
            {isSelected && <Check size={15} className="text-brand-primary" aria-hidden="true" />}
          </span>
        </button>;
      })}
    </div>}
  </div>;
}
