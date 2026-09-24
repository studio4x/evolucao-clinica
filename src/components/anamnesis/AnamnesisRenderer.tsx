import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnamnesisAnswers, AnamnesisField, AnamnesisSection } from '../../services/anamnesis';
import { resolveAnamnesisFieldValue, isNativePatientField, getAnamnesisFieldAnswerKey } from '../../services/anamnesisValueResolver';
import type { AnamnesisPatientContext } from '../../services/anamnesisSchema';

type Props = {
  sections: AnamnesisSection[];
  answers: AnamnesisAnswers;
  patient?: Partial<AnamnesisPatientContext> | null;
  disabled?: boolean;
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
  onChange: (key: string, value: AnamnesisAnswers[string]) => void;
  fieldHasValue: (value: AnamnesisAnswers[string]) => boolean;
};

const baseClass = 'w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 text-sm text-brand-text outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:bg-brand-bg/60 disabled:text-brand-text-muted disabled:opacity-80';

export function AnamnesisFieldInput({ field, value, disabled, onChange }: { field: AnamnesisField; value: AnamnesisAnswers[string]; disabled: boolean; onChange: (value: AnamnesisAnswers[string]) => void }) {
  if (field.type === 'textarea') return <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={4} disabled={disabled} className={`${baseClass} min-h-[110px] resize-y disabled:resize-none`} />;
  if (field.type === 'select') return <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={baseClass}><option value="">Selecione...</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <div className="grid gap-2 sm:grid-cols-2">{(field.options || []).map((option) => { const checked = selected.includes(option); return <label key={option} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors ${disabled ? 'cursor-not-allowed bg-brand-bg/60 text-brand-text-muted opacity-80' : checked ? 'cursor-pointer border-brand-primary/30 bg-brand-primary/5 text-brand-primary' : 'cursor-pointer border-brand-border bg-white text-brand-text'}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary" />{option}</label>; })}</div>;
  }
  if (field.type === 'yes_no') return <div className="grid grid-cols-2 gap-2">{[{ label: 'Sim', value: true }, { label: 'Não', value: false }].map((option) => <button key={option.label} type="button" disabled={disabled} onClick={() => onChange(option.value)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${value === option.value ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border bg-white text-brand-text'}`}>{option.label}</button>)}</div>;
  if (field.type === 'scale') {
    const min = Number.isFinite(field.min) ? Number(field.min) : 0; const max = Number.isFinite(field.max) ? Number(field.max) : 10; const numeric = typeof value === 'number' ? value : min;
    return <div className="space-y-2"><input type="range" min={min} max={max} value={numeric} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-brand-primary disabled:cursor-not-allowed disabled:opacity-60" /><div className="flex justify-between text-[10px] text-brand-text-muted"><span>{min}</span><span className="font-bold text-brand-primary">{numeric}</span><span>{max}</span></div></div>;
  }
  return <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} placeholder={field.placeholder} min={field.type === 'number' ? field.min : undefined} max={field.type === 'number' ? field.max : undefined} disabled={disabled} className={baseClass} />;
}

export function AnamnesisRenderer({ sections, answers, patient, disabled = false, expandedSections, onToggleSection, onChange, fieldHasValue }: Props) {
  return <div className="space-y-4">{sections.map((section, sectionIndex) => {
    const sectionKey = section.id || section.key;
    const expanded = expandedSections.has(sectionKey);
    const sectionFilled = section.fields.filter((field) => fieldHasValue(resolveAnamnesisFieldValue(field, answers, patient))).length;
    return <section key={sectionKey} className="card !overflow-visible border border-brand-border/70 bg-white">
      <button type="button" onClick={() => onToggleSection(sectionKey)} aria-expanded={expanded} className="flex w-full items-start justify-between gap-3 p-5 text-left sm:p-6">
        <div className="flex min-w-0 gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">{sectionIndex + 1}</span><div><h2 className="text-sm font-bold text-brand-text">{section.title}</h2>{section.description && <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">{section.description}</p>}<p className="mt-1 text-[10px] font-semibold text-brand-text-muted">{sectionFilled} de {section.fields.length} campos preenchidos</p></div></div>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-brand-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="space-y-5 border-t border-brand-border/50 px-5 py-5 sm:px-6">{section.fields.map((field) => { const native = isNativePatientField(field); const value = resolveAnamnesisFieldValue(field, answers, patient); return <div key={field.id || field.key}><label className="mb-1.5 block text-xs font-bold text-brand-text">{field.label}{field.required && <span className="ml-1 text-brand-primary">*</span>}</label>{field.helpText && <p className="mb-1.5 text-[10px] leading-relaxed text-brand-text-muted">{field.helpText}</p>}{native && <p className="mb-2 text-[10px] text-brand-text-muted">Dado integrado ao cadastro do paciente · somente leitura</p>}<AnamnesisFieldInput field={field} value={value} disabled={disabled || native} onChange={(next) => onChange(getAnamnesisFieldAnswerKey(field), next)} /></div>; })}</div>}
    </section>;
  })}</div>;
}
