import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  fetchAnamnesisTemplates,
  fetchCurrentPatientAnamnesis,
  fetchPatientAnamnesisHistory,
  getRecommendedAnamnesisTemplate,
  hasMeaningfulAnamnesisAnswers,
  savePatientAnamnesis,
  startPatientAnamnesis,
  type AnamnesisAnswers,
  type AnamnesisField,
  type AnamnesisTemplate,
  type PatientAnamnesis,
} from '../services/anamnesis';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const fieldHasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined && value !== false;
};

type FieldProps = {
  field: AnamnesisField;
  value: AnamnesisAnswers[string];
  onChange: (value: AnamnesisAnswers[string]) => void;
};

function AnamnesisFieldInput({ field, value, onChange }: FieldProps) {
  const baseClass =
    'w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 text-sm text-brand-text outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10';

  if (field.type === 'textarea') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={4}
        className={`${baseClass} min-h-[110px] resize-y`}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={baseClass}
      >
        <option value="">Selecione...</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {(field.options || []).map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                checked
                  ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary'
                  : 'border-brand-border bg-white text-brand-text'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  onChange(next);
                }}
                className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
              />
              {option}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === 'yes_no') {
    const current = typeof value === 'boolean' ? value : null;
    return (
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Sim', value: true },
          { label: 'Não', value: false },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
              current === option.value
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-brand-border bg-white text-brand-text'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === 'scale') {
    const min = Number.isFinite(field.min) ? Number(field.min) : 0;
    const max = Number.isFinite(field.max) ? Number(field.max) : 10;
    const numeric = typeof value === 'number' ? value : min;
    return (
      <div className="space-y-2">
        <input
          type="range"
          min={min}
          max={max}
          value={numeric}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-brand-primary"
        />
        <div className="flex justify-between text-[10px] text-brand-text-muted">
          <span>{min}</span>
          <span className="font-bold text-brand-primary">{numeric}</span>
          <span>{max}</span>
        </div>
      </div>
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={
        typeof value === 'string' || typeof value === 'number'
          ? value
          : ''
      }
      onChange={(event) =>
        onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)
      }
      placeholder={field.placeholder}
      min={field.type === 'number' ? field.min : undefined}
      max={field.type === 'number' ? field.max : undefined}
      className={baseClass}
    />
  );
}

export default function PatientAnamnesis() {
  const { id: patientId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [patientName, setPatientName] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [current, setCurrent] = useState<PatientAnamnesis | null>(null);
  const [history, setHistory] = useState<PatientAnamnesis[]>([]);
  const [answers, setAnswers] = useState<AnamnesisAnswers>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [switchingTemplate, setSwitchingTemplate] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);

  const currentRef = useRef<PatientAnamnesis | null>(null);
  const answersRef = useRef<AnamnesisAnswers>({});
  const startPromiseRef = useRef<Promise<PatientAnamnesis> | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const activeSchema = current?.templateSnapshot || activeTemplate?.schema || { sections: [] };

  const totalFields = useMemo(
    () => activeSchema.sections.reduce((total, section) => total + section.fields.length, 0),
    [activeSchema]
  );

  const filledFields = useMemo(
    () => activeSchema.sections.reduce(
      (total, section) =>
        total + section.fields.filter((field) => fieldHasValue(answers[field.key])).length,
      0
    ),
    [activeSchema, answers]
  );

  const loadHistory = async () => {
    if (!patientId) return;
    setHistory(await fetchPatientAnamnesisHistory(patientId));
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!patientId || !user) return;
      setLoading(true);

      try {
        const [patientResult, profileResult, availableTemplates, currentAnamnesis, previous] = await Promise.all([
          supabase.from('patients').select('id, full_name').eq('id', patientId).single(),
          supabase.from('professionals').select('professional_title').eq('id', user.id).single(),
          fetchAnamnesisTemplates(),
          fetchCurrentPatientAnamnesis(patientId),
          fetchPatientAnamnesisHistory(patientId),
        ]);

        if (patientResult.error) throw patientResult.error;
        if (profileResult.error) throw profileResult.error;
        if (!active) return;

        const title = profileResult.data?.professional_title || '';
        const recommended = getRecommendedAnamnesisTemplate(availableTemplates, title);

        setPatientName(patientResult.data?.full_name || 'Paciente');
        setProfessionalTitle(title);
        setTemplates(availableTemplates);
        setCurrent(currentAnamnesis);
        currentRef.current = currentAnamnesis;
        setHistory(previous);

        if (currentAnamnesis) {
          setSelectedTemplateId(currentAnamnesis.templateId);
          setAnswers(currentAnamnesis.answers || {});
          answersRef.current = currentAnamnesis.answers || {};
          const first = currentAnamnesis.templateSnapshot.sections?.[0]?.key;
          setExpandedSections(new Set(first ? [first] : []));
        } else if (recommended) {
          setSelectedTemplateId(recommended.id);
          setAnswers({});
          answersRef.current = {};
          const first = recommended.schema.sections?.[0]?.key;
          setExpandedSections(new Set(first ? [first] : []));
        }
      } catch (error: any) {
        console.error('[Anamnesis] Erro ao carregar:', error);
        await showAlert(error?.message || 'Não foi possível carregar a anamnese deste paciente.', {
          title: 'Anamnese indisponível',
          variant: 'danger',
          icon: 'warning',
        });
        navigate(`/painel/patients/${patientId}`, { replace: true });
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [navigate, patientId, user]);

  const ensureCurrent = async () => {
    if (!patientId || !selectedTemplateId) throw new Error('Selecione um modelo de anamnese.');
    if (currentRef.current) return currentRef.current;
    if (startPromiseRef.current) return startPromiseRef.current;

    startPromiseRef.current = startPatientAnamnesis(patientId, selectedTemplateId, false);
    try {
      const created = await startPromiseRef.current;
      currentRef.current = created;
      setCurrent(created);
      return created;
    } finally {
      startPromiseRef.current = null;
    }
  };

  const persistAnswers = async (snapshot: AnamnesisAnswers) => {
    setSaveState('saving');
    try {
      const record = await ensureCurrent();
      const updated = await savePatientAnamnesis(record.id, { answers: snapshot });
      currentRef.current = updated;
      setCurrent(updated);

      if (answersRef.current === snapshot) {
        setDirty(false);
        setSaveState('saved');
      }
      return updated;
    } catch (error) {
      console.error('[Anamnesis] Erro no autosave:', error);
      setSaveState('error');
      throw error;
    }
  };

  useEffect(() => {
    if (loading || !dirty || !selectedTemplateId) return;

    const snapshot = answers;
    const timeout = window.setTimeout(() => {
      void persistAnswers(snapshot).catch(() => undefined);
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [answers, dirty, loading, selectedTemplateId]);

  const handleFieldChange = (key: string, value: AnamnesisAnswers[string]) => {
    setAnswers((currentAnswers) => {
      const next = { ...currentAnswers, [key]: value };
      answersRef.current = next;
      return next;
    });
    setDirty(true);
    setSaveState('idle');
  };

  const handleTemplateChange = async (nextTemplateId: string) => {
    if (!patientId || !nextTemplateId || nextTemplateId === selectedTemplateId || switchingTemplate) return;

    const nextTemplate = templates.find((template) => template.id === nextTemplateId);
    if (!nextTemplate) return;

    if (!currentRef.current) {
      setSelectedTemplateId(nextTemplateId);
      setAnswers({});
      answersRef.current = {};
      setDirty(false);
      const first = nextTemplate.schema.sections?.[0]?.key;
      setExpandedSections(new Set(first ? [first] : []));
      return;
    }

    const shouldConfirm = hasMeaningfulAnamnesisAnswers(answersRef.current);
    if (shouldConfirm) {
      const confirmed = await showConfirm(
        `Trocar para o modelo “${nextTemplate.name}” iniciará uma nova anamnese. A anamnese atual será preservada no histórico, sem apagar as respostas. Deseja continuar?`,
        {
          title: 'Trocar modelo de anamnese',
          confirmLabel: 'Trocar modelo',
          cancelLabel: 'Cancelar',
          variant: 'warning',
          icon: 'question',
        }
      );
      if (!confirmed) return;
    }

    setSwitchingTemplate(true);
    try {
      if (dirty) {
        await persistAnswers(answersRef.current);
      }

      const created = await startPatientAnamnesis(patientId, nextTemplateId, true);
      currentRef.current = created;
      setCurrent(created);
      setSelectedTemplateId(nextTemplateId);
      setAnswers(created.answers || {});
      answersRef.current = created.answers || {};
      setDirty(false);
      setSaveState('saved');
      const first = created.templateSnapshot.sections?.[0]?.key;
      setExpandedSections(new Set(first ? [first] : []));
      await loadHistory();
    } catch (error: any) {
      console.error('[Anamnesis] Erro ao trocar modelo:', error);
      await showAlert(error?.message || 'Não foi possível trocar o modelo da anamnese.', {
        title: 'Falha ao trocar modelo',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setSwitchingTemplate(false);
    }
  };

  const handleComplete = async () => {
    if (!hasMeaningfulAnamnesisAnswers(answersRef.current)) {
      await showAlert('Preencha pelo menos uma informação antes de concluir a anamnese.', {
        title: 'Anamnese sem conteúdo',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    setSaveState('saving');
    try {
      const record = dirty
        ? await persistAnswers(answersRef.current)
        : await ensureCurrent();
      const completedAt = new Date().toISOString();
      const updated = await savePatientAnamnesis(record.id, {
        status: 'completed',
        completedAt,
        answers: answersRef.current,
      });
      currentRef.current = updated;
      setCurrent(updated);
      setDirty(false);
      setSaveState('saved');
    } catch (error: any) {
      console.error('[Anamnesis] Erro ao concluir:', error);
      setSaveState('error');
      await showAlert(error?.message || 'Não foi possível concluir a anamnese.', {
        title: 'Falha ao concluir',
        variant: 'danger',
        icon: 'warning',
      });
    }
  };

  const handleReopen = async () => {
    if (!currentRef.current) return;
    setSaveState('saving');
    try {
      const updated = await savePatientAnamnesis(currentRef.current.id, {
        status: 'draft',
        completedAt: null,
      });
      currentRef.current = updated;
      setCurrent(updated);
      setSaveState('saved');
    } catch (error: any) {
      console.error('[Anamnesis] Erro ao reabrir:', error);
      setSaveState('error');
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-brand-text-muted">
          <Loader2 size={20} className="animate-spin text-brand-primary" />
          Carregando anamnese...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <Link
          to={`/painel/patients/${patientId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
        >
          <ArrowLeft size={14} />
          Voltar para o paciente
        </Link>
      </div>

      <PanelPageHeader
        icon={ClipboardList}
        title={`Anamnese — ${patientName}`}
        description="Organize informações iniciais e dados relevantes para o acompanhamento. Revise e atualize os registros sempre que necessário."
        actions={
          current?.status === 'completed' ? (
            <button
              type="button"
              onClick={() => void handleReopen()}
              className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs"
            >
              <RotateCcw size={14} />
              Reabrir como rascunho
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={saveState === 'saving'}
              className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              Concluir anamnese
            </button>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="card p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-brand-text">
                  Modelo do formulário
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => void handleTemplateChange(event.target.value)}
                  disabled={switchingTemplate || templates.length === 0}
                  className="w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 text-sm font-semibold text-brand-text outline-none focus:border-brand-primary disabled:opacity-50"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] leading-relaxed text-brand-text-muted">
                  Sugestão inicial baseada no seu perfil profissional{professionalTitle ? `: ${professionalTitle}` : ''}. Você pode escolher outro modelo quando necessário.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  current?.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {current?.status === 'completed' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
                  {current?.status === 'completed' ? 'Concluída' : 'Rascunho'}
                </span>

                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                  saveState === 'error' ? 'text-red-600' : 'text-brand-text-muted'
                }`}>
                  {saveState === 'saving' ? (
                    <>
                      <Loader2 size={11} className="animate-spin" />
                      Salvando...
                    </>
                  ) : saveState === 'error' ? (
                    'Falha ao salvar'
                  ) : dirty ? (
                    'Alterações pendentes'
                  ) : (
                    <>
                      <Save size={11} />
                      Salvo automaticamente
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-brand-text-muted">
                <span>Preenchimento</span>
                <span>{filledFields} de {totalFields} campos</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-brand-border/60">
                <div
                  className="h-full rounded-full bg-brand-primary transition-all"
                  style={{ width: `${totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {activeSchema.sections.map((section, sectionIndex) => {
            const expanded = expandedSections.has(section.key);
            const sectionFilled = section.fields.filter((field) => fieldHasValue(answers[field.key])).length;

            return (
              <section key={section.key} className="card !overflow-visible border border-brand-border/70 bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={expanded}
                  className="flex w-full items-start justify-between gap-3 p-5 text-left sm:p-6"
                >
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                      {sectionIndex + 1}
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-brand-text">{section.title}</h2>
                      {section.description && (
                        <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">{section.description}</p>
                      )}
                      <p className="mt-1 text-[10px] font-semibold text-brand-text-muted">
                        {sectionFilled} de {section.fields.length} campos preenchidos
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`mt-1 shrink-0 text-brand-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {expanded && (
                  <div className="space-y-5 border-t border-brand-border/50 px-5 py-5 sm:px-6">
                    {section.fields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1.5 block text-xs font-bold text-brand-text">
                          {field.label}
                        </label>
                        {field.helpText && (
                          <p className="mb-1.5 text-[10px] leading-relaxed text-brand-text-muted">{field.helpText}</p>
                        )}
                        <AnamnesisFieldInput
                          field={field}
                          value={answers[field.key]}
                          onChange={(value) => handleFieldChange(field.key, value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-brand-text">
              <Save size={16} className="text-brand-primary" />
              Registro estruturado
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
              As respostas são salvas automaticamente no prontuário do paciente. O profissional permanece responsável pela revisão e pelo conteúdo registrado.
            </p>
          </div>

          {history.length > 0 && (
            <details className="card overflow-hidden bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 text-sm font-bold text-brand-text">
                <span className="flex items-center gap-2">
                  <HistoryIcon size={16} className="text-brand-primary" />
                  Modelos anteriores
                </span>
                <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] text-brand-text-muted">{history.length}</span>
              </summary>
              <div className="space-y-2 border-t border-brand-border/50 p-4">
                {history.map((item) => (
                  <div key={item.id} className="rounded-xl border border-brand-border/60 bg-brand-bg/20 p-3">
                    <p className="text-xs font-semibold text-brand-text">{item.templateName}</p>
                    <p className="mt-1 text-[10px] text-brand-text-muted">
                      {item.status === 'completed' ? 'Concluída' : 'Rascunho preservado'} · {formatDateTime(item.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
