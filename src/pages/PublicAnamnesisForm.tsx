import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Save, Send, WifiOff } from 'lucide-react';
import { useParams } from 'react-router-dom';

type Field = { id: string; label: string; type: string; required?: boolean; helpText?: string; placeholder?: string; options?: string[]; min?: number; max?: number; patientReference?: string };
type Section = { id: string; title: string; description?: string; fields: Field[] };
type Snapshot = { templateName: string; versionNumber: number; sections: Section[] };
type Bootstrap = { session: string; expiresAt: string; respondentType: 'patient' | 'responsible'; identity: { patientInitials: string; professionalFirstName: string; professionalTitle: string | null }; snapshot: Snapshot; draft: Record<string, unknown>; revision: number; respondentName: string; respondentRelationship: string };
type ErrorMap = Record<string, string>;

const sessionStorageKey = 'evolucao-clinica-anamnesis-public-session';
const draftDelay = 900;

const valueIsFilled = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
const displayAnswer = (value: unknown) => Array.isArray(value) ? value.join(', ') : value === true ? 'Sim' : value === false ? 'Não' : String(value ?? 'Não informado');

function FieldInput({ field, value, error, disabled, onChange }: { field: Field; value: unknown; error?: string; disabled?: boolean; onChange: (value: unknown) => void }) {
  const inputClass = `w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-brand-text outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 ${error ? 'border-red-400' : 'border-brand-border'}`;
  const id = `public-${field.id}`;
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-brand-text">{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</label>
    {field.helpText && <p className="mb-2 text-xs leading-relaxed text-brand-text-muted">{field.helpText}</p>}
    {field.type === 'textarea' && <textarea id={id} rows={5} value={typeof value === 'string' ? value : ''} placeholder={field.placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${inputClass} resize-y`} aria-invalid={Boolean(error)} />}
    {field.type === 'select' && <select id={id} value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass} aria-invalid={Boolean(error)}><option value="">Selecione...</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>}
    {field.type === 'multiselect' && <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">{field.label}</legend>{(field.options || []).map((option) => { const selected = Array.isArray(value) && value.includes(option); return <label key={option} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2.5 text-sm"><input type="checkbox" checked={selected} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value.filter((item) => item !== option) : []))} className="h-4 w-4 accent-brand-primary" />{option}</label>; })}</fieldset>}
    {field.type === 'yes_no' && <fieldset className="grid grid-cols-2 gap-2"><legend className="sr-only">{field.label}</legend>{[{ label: 'Sim', value: true }, { label: 'Não', value: false }].map((option) => <button type="button" key={option.label} disabled={disabled} onClick={() => onChange(option.value)} className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-bold ${value === option.value ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-border bg-white text-brand-text'}`}>{option.label}</button>)}</fieldset>}
    {field.type === 'scale' && <div><input id={id} type="range" min={field.min ?? 0} max={field.max ?? 10} value={typeof value === 'number' ? value : field.min ?? 0} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-brand-primary" /><div className="flex justify-between text-xs text-brand-text-muted"><span>{field.min ?? 0}</span><span className="font-bold text-brand-primary">{typeof value === 'number' ? value : field.min ?? 0}</span><span>{field.max ?? 10}</span></div></div>}
    {['text', 'date', 'number'].includes(field.type) && <input id={id} type={field.type === 'number' ? 'number' : field.type} value={typeof value === 'string' || typeof value === 'number' ? value : ''} placeholder={field.placeholder} min={field.type === 'number' ? field.min : undefined} max={field.type === 'number' ? field.max : undefined} disabled={disabled} onChange={(event) => onChange(field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} className={inputClass} aria-invalid={Boolean(error)} />}
    {error && <p className="mt-1.5 text-xs font-semibold text-red-700" role="alert">{error}</p>}
  </div>;
}

export default function PublicAnamnesisForm() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [revision, setRevision] = useState(0);
  const [respondentName, setRespondentName] = useState('');
  const [respondentRelationship, setRespondentRelationship] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ErrorMap>({});
  const hydrated = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/public/anamnesis-link/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.code === 'submitted' ? 'submitted' : 'unavailable');
      const boot = payload as Bootstrap;
      sessionStorage.setItem(sessionStorageKey, boot.session);
      window.history.replaceState({}, document.title, '/preencher/anamnese');
      setData(boot);
      setAnswers(boot.draft || {});
      setRevision(boot.revision || 0);
      setRespondentName(boot.respondentName || '');
      setRespondentRelationship(boot.respondentRelationship || '');
      hydrated.current = true;
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'submitted' ? 'submitted' : 'unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);
  useEffect(() => { const online = () => setOffline(false); const offlineHandler = () => setOffline(true); window.addEventListener('online', online); window.addEventListener('offline', offlineHandler); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineHandler); }; }, []);

  const save = async (nextAnswers = answers, nextName = respondentName, nextRelationship = respondentRelationship) => {
    if (!data || !hydrated.current || submitted || offline) return;
    setSaving(true); setSaved(false);
    try {
      const response = await fetch('/api/public/anamnesis-link/draft', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(sessionStorageKey) || ''}` }, body: JSON.stringify({ answers: nextAnswers, baseRevision: revision, respondentName: nextName, respondentRelationship: nextRelationship }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) { setMessage('conflict'); return; }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar agora.');
      setRevision(payload.revision); setSaved(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar agora.'); } finally { setSaving(false); }
  };

  const scheduleSave = (nextAnswers = answers, nextName = respondentName, nextRelationship = respondentRelationship) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void save(nextAnswers, nextName, nextRelationship); }, draftDelay);
  };

  const updateAnswer = (fieldId: string, value: unknown) => { const next = { ...answers, [fieldId]: value }; setAnswers(next); setSaved(false); scheduleSave(next); };
  const sections = data?.snapshot.sections || [];
  const reviewStep = sections.length + 1;
  const currentSection = step > 0 && step <= sections.length ? sections[step - 1] : null;
  const progress = data ? Math.round((Math.min(step, sections.length) / Math.max(sections.length, 1)) * 100) : 0;
  const filled = useMemo(() => sections.reduce((total, section) => total + section.fields.filter((field) => valueIsFilled(answers[field.id])).length, 0), [sections, answers]);

  const submit = async () => {
    if (!data) return;
    setSubmitting(true); setErrors({});
    try {
      const response = await fetch('/api/public/anamnesis-link/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(sessionStorageKey) || ''}` }, body: JSON.stringify({ answers, baseRevision: revision, respondentName, respondentRelationship, idempotencyKey: crypto.randomUUID() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { if (payload.fieldErrors) setErrors(Object.fromEntries(payload.fieldErrors.map((item: { fieldId: string; message: string }) => [item.fieldId, item.message]))); throw new Error(payload.error || 'Não foi possível enviar o formulário.'); }
      setSubmitted(true); setStep(reviewStep); sessionStorage.removeItem(sessionStorageKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o formulário.'); } finally { setSubmitting(false); }
  };

  if (loading) return <PublicShell><div className="flex items-center justify-center gap-3 py-20 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={20} />Carregando formulário...</div></PublicShell>;
  if (message === 'submitted') return <PublicShell><StateCard title="Formulário já enviado" text="Este formulário já foi encaminhado ao profissional responsável." /> </PublicShell>;
  if (message === 'unavailable') return <PublicShell><StateCard title="Formulário indisponível" text="O link não está disponível. Verifique se ele está correto ou solicite um novo link ao profissional." /></PublicShell>;
  if (!data) return <PublicShell><StateCard title="Não foi possível carregar" text={message || 'Tente novamente em alguns instantes.'} /></PublicShell>;

  if (submitted) return <PublicShell><div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-10"><CheckCircle2 className="mx-auto text-emerald-600" size={48} /><h1 className="mt-5 text-2xl font-bold text-emerald-950">Formulário enviado</h1><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-emerald-900">As informações foram encaminhadas ao profissional responsável para revisão.</p></div></PublicShell>;

  const renderFields = (fields: Field[]) => <div className="space-y-6">{fields.map((field) => <FieldInput key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={(value) => updateAnswer(field.id, value)} />)}</div>;
  const title = step === 0 ? 'Antes de começar' : step === reviewStep ? 'Revise suas respostas' : currentSection?.title || 'Formulário';

  return <PublicShell>
    <div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-primary">{data.snapshot.templateName}</p><p className="mt-1 text-xs text-brand-text-muted">{filled} campos preenchidos</p></div><div className="text-right text-xs text-brand-text-muted" aria-live="polite">{saving ? <span className="inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" />Salvando...</span> : saved ? <span className="inline-flex items-center gap-1 text-emerald-700"><Save size={13} />Salvo</span> : offline ? <span className="inline-flex items-center gap-1 text-amber-700"><WifiOff size={13} />Offline</span> : 'Rascunho automático'}</div></div>
    <div className="mb-6" aria-label="Progresso do formulário"><div className="mb-2 flex justify-between text-xs font-semibold text-brand-text-muted"><span>Etapa {Math.min(step + 1, reviewStep + 1)} de {reviewStep + 1}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-brand-border/50"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${step === reviewStep ? 100 : Math.max(progress, 4)}%` }} /></div></div>
    <div className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm sm:p-8"><h1 className="text-2xl font-bold text-brand-text">{title}</h1>
      {step === 0 && <div className="mt-5 space-y-4 text-sm leading-relaxed text-brand-text-muted"><p>Este formulário foi enviado pelo profissional responsável pelo seu acompanhamento. Preencha as informações solicitadas e revise suas respostas antes de enviar.</p><div className="rounded-2xl bg-brand-bg/60 p-4 text-sm text-brand-text"><p>Formulário destinado a <strong>{data.identity.patientInitials}</strong>.</p><p className="mt-1">Enviado por <strong>{data.identity.professionalFirstName}</strong>{data.identity.professionalTitle ? `, ${data.identity.professionalTitle}` : ''}.</p></div></div>}
      {currentSection && <div className="mt-5">{currentSection.description && <p className="mb-5 text-sm leading-relaxed text-brand-text-muted">{currentSection.description}</p>}{renderFields(currentSection.fields)}</div>}
      {step === reviewStep && <div className="mt-5 space-y-5"><p className="text-sm leading-relaxed text-brand-text-muted">Confira as respostas. O envio só acontece quando você tocar no botão abaixo.</p>{sections.map((section) => <div key={section.id} className="rounded-2xl border border-brand-border/70 p-4"><h2 className="text-sm font-bold text-brand-text">{section.title}</h2><dl className="mt-3 space-y-3">{section.fields.map((field) => <div key={field.id} className="border-t border-brand-border/50 pt-3 first:border-0 first:pt-0"><dt className="text-xs font-semibold text-brand-text-muted">{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-brand-text">{displayAnswer(answers[field.id])}</dd></div>)}</dl><button type="button" onClick={() => setStep(sections.findIndex((item) => item.id === section.id) + 1)} className="mt-4 text-xs font-bold text-brand-primary hover:underline">Editar seção</button></div>)}</div>}
      {data.respondentType === 'responsible' && (step === 0 || step === reviewStep) && <div className="mt-6 grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-bold text-brand-text" htmlFor="respondent-name">Seu nome <span className="text-red-600">*</span></label><input id="respondent-name" value={respondentName} onChange={(event) => { setRespondentName(event.target.value); scheduleSave(answers, event.target.value, respondentRelationship); }} className="w-full rounded-xl border border-brand-border px-3.5 py-3 text-sm" /></div><div><label className="mb-1.5 block text-sm font-bold text-brand-text" htmlFor="respondent-relationship">Vínculo com o paciente <span className="text-red-600">*</span></label><input id="respondent-relationship" value={respondentRelationship} onChange={(event) => { setRespondentRelationship(event.target.value); scheduleSave(answers, respondentName, event.target.value); }} className="w-full rounded-xl border border-brand-border px-3.5 py-3 text-sm" /></div></div>}
      {message && message !== 'conflict' && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{message}</p>}
      {message === 'conflict' && <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="alert">Este formulário foi alterado em outra aba. Recarregue a versão mais recente para continuar.</p>}
      <div className="mt-8 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-border px-4 py-2.5 text-sm font-bold text-brand-text disabled:opacity-40"><ChevronLeft size={17} />Voltar</button>{step < reviewStep ? <button type="button" onClick={() => setStep(Math.min(reviewStep, step + 1))} disabled={submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">{step === 0 ? 'Começar' : 'Próxima seção'}<ChevronRight size={17} /></button> : <button type="button" onClick={() => void submit()} disabled={submitting || offline} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50">{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}Enviar formulário</button>}</div>
    </div>
  </PublicShell>;
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-brand-bg px-4 py-6 sm:px-6 sm:py-10"><div className="mx-auto w-full max-w-3xl"><div className="mb-6 text-center"><p className="text-lg font-bold text-brand-text">Evolução Clínica</p><p className="mt-1 text-xs text-brand-text-muted">Preenchimento de formulário</p></div>{children}<p className="mt-6 text-center text-[11px] leading-relaxed text-brand-text-muted">Suas respostas serão enviadas ao profissional responsável para revisão.</p></div></main>;
}

function StateCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-3xl border border-brand-border bg-white p-6 text-center shadow-sm sm:p-10"><h1 className="text-2xl font-bold text-brand-text">{title}</h1><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-text-muted">{text}</p></div>;
}
