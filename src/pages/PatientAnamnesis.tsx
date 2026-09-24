import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useBeforeUnload,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  AlertTriangle,
  Copy,
  Download,
  Eye,
  FilePlus2,
  History as HistoryIcon,
  HelpCircle,
  Loader2,
  Lock,
  PlusCircle,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { FeatureGuideModal, type FeatureGuideStep } from '../components/common/FeatureGuideModal';
import { FeatureGuideButton } from '../components/common/FeatureGuideButton';
import { showAlert, showConfirm } from '../store/modalStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';
import { downloadPdfFile } from '../utils/prontuarioPdf';
import {
  filterAnamnesisAnswersForSchema,
  generateAnamnesisPDF,
  getAnamnesisPdfFileName,
} from '../utils/anamnesisPdf';
import {
  fetchAnamnesisTemplates,
  fetchCurrentPatientAnamnesis,
  fetchPatientAnamnesisHistory,
  fetchPatientAnamnesisRevisions,
  getRecommendedAnamnesisTemplate,
  hasMeaningfulAnamnesisAnswers,
  savePatientAnamnesis,
  startPatientAnamnesis,
  type AnamnesisAnswers,
  type AnamnesisField,
  type AnamnesisSection,
  type AnamnesisTemplate,
  type PatientAnamnesis,
  type PatientAnamnesisRevision,
} from '../services/anamnesis';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 900;
const AUTOSAVE_MAX_ATTEMPTS = 3;
const SAVE_NOTICE_DISPLAY_MS = 1800;

const ANAMNESIS_GUIDE_STEPS: FeatureGuideStep[] = [
  {
    title: 'Escolha o modelo mais adequado',
    description: 'O formulário começa com uma sugestão baseada no seu perfil profissional. Se precisar, troque o modelo antes de preencher; a versão anterior será preservada quando já houver um registro.',
    icon: ClipboardList,
  },
  {
    title: 'Preencha as seções por etapas',
    description: 'Abra cada seção para responder aos campos. O indicador de preenchimento ajuda a acompanhar o progresso e os tipos de campo mudam conforme a informação solicitada.',
    icon: FilePlus2,
  },
  {
    title: 'Continue com salvamento automático',
    description: 'As respostas são salvas automaticamente enquanto você trabalha. O aviso no canto inferior informa se há alterações pendentes, se o registro está sendo salvo ou se já está sincronizado.',
    icon: Save,
  },
  {
    title: 'Crie novas versões sem perder o histórico',
    description: 'Use “Iniciar nova anamnese” para começar do zero ou copiar a última versão. A avaliação atual permanece disponível em “Anamneses anteriores”.',
    icon: HistoryIcon,
  },
  {
    title: 'Conclua, revise e baixe o PDF',
    description: 'Ao terminar, conclua o registro para bloquear as respostas e preservar a versão. Você pode visualizar versões anteriores, baixar o PDF e reabrir a anamnese quando precisar corrigir algo.',
    icon: CheckCircle2,
  },
];

const ANAMNESIS_SUPPORT_HREF = `/painel/support?${new URLSearchParams({
  new: '1',
  subject: 'Dúvida sobre a Anamnese',
  category: 'general',
  description: 'Olá! Estou com uma dúvida sobre a funcionalidade de Anamnese.\n\nMinha dúvida:\n\n',
}).toString()}`;

type AnamnesisGuideButtonProps = {
  compact?: boolean;
  expanded: boolean;
  onOpen: () => void;
};

function AnamnesisGuideButton({ compact = false, expanded, onOpen }: AnamnesisGuideButtonProps) {
  return (
    <FeatureGuideButton
      label="a Anamnese"
      compact={compact}
      expanded={expanded}
      onOpen={onOpen}
    />
  );
}

const getBase64ImageFromUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar o logotipo do PDF.');
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Não foi possível preparar o logotipo.'));
    reader.readAsDataURL(blob);
  });
};

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

const answerSignature = (answers: AnamnesisAnswers) => JSON.stringify(answers || {});

const orderSections = (sections: AnamnesisSection[] = []) => {
  const goals = sections.filter((section) => section.key === 'goals');
  const others = sections.filter((section) => section.key !== 'goals');
  return [...others, ...goals];
};

const formatAnswer = (value: AnamnesisAnswers[string]) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value === null || value === undefined || value === '') return 'Não informado';
  return String(value);
};

const revisionLabel = (eventType: PatientAnamnesisRevision['eventType']) => {
  switch (eventType) {
    case 'completed':
      return 'Anamnese concluída';
    case 'reopened':
      return 'Anamnese reaberta';
    case 'archived':
      return 'Versão arquivada';
    default:
      return 'Alteração salva';
  }
};

type FieldProps = {
  field: AnamnesisField;
  value: AnamnesisAnswers[string];
  disabled?: boolean;
  onChange: (value: AnamnesisAnswers[string]) => void;
};

function AnamnesisFieldInput({ field, value, disabled = false, onChange }: FieldProps) {
  const baseClass =
    'w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 text-sm text-brand-text outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 disabled:cursor-not-allowed disabled:bg-brand-bg/60 disabled:text-brand-text-muted disabled:opacity-80';

  if (field.type === 'textarea') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={4}
        disabled={disabled}
        className={`${baseClass} min-h-[110px] resize-y disabled:resize-none`}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
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
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                disabled
                  ? 'cursor-not-allowed bg-brand-bg/60 text-brand-text-muted opacity-80'
                  : checked
                    ? 'cursor-pointer border-brand-primary/30 bg-brand-primary/5 text-brand-primary'
                    : 'cursor-pointer border-brand-border bg-white text-brand-text'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
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
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
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
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
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
      disabled={disabled}
      className={baseClass}
    />
  );
}

export default function PatientAnamnesis() {
  const { id: patientId } = useParams();
  const navigate = useNavigate();
  const {
    user,
    profileRole,
    subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt,
  } = useAuthStore();
  const hasYearlyAccess = hasActiveYearlyAccess({
    profileRole,
    subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt,
  });
  const siteConfig = useSiteConfig();

  const [patientName, setPatientName] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professional, setProfessional] = useState<any>(null);
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [current, setCurrent] = useState<PatientAnamnesis | null>(null);
  const [history, setHistory] = useState<PatientAnamnesis[]>([]);
  const [revisions, setRevisions] = useState<PatientAnamnesisRevision[]>([]);
  const [historyPreview, setHistoryPreview] = useState<PatientAnamnesis | null>(null);
  const [answers, setAnswers] = useState<AnamnesisAnswers>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [switchingTemplate, setSwitchingTemplate] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [newAnamnesisChoiceOpen, setNewAnamnesisChoiceOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const [dirty, setDirty] = useState(false);

  const currentRef = useRef<PatientAnamnesis | null>(null);
  const answersRef = useRef<AnamnesisAnswers>({});
  const dirtyRef = useRef(false);
  const selectedTemplateIdRef = useRef('');
  const startPromiseRef = useRef<Promise<PatientAnamnesis> | null>(null);
  const saveQueueRef = useRef<Promise<PatientAnamnesis | null>>(Promise.resolve(null));
  const debounceTimerRef = useRef<number | null>(null);
  const pendingSavesRef = useRef(0);
  const lastPersistedSignatureRef = useRef(answerSignature({}));
  const lastQueuedSignatureRef = useRef('');
  const allowNavigationRef = useRef(false);
  const saveNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  useEffect(() => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
      saveNoticeTimerRef.current = null;
    }

    if (saveState === 'saving' || saveState === 'error') {
      setSaveNoticeVisible(true);
      return;
    }

    if (saveState === 'saved' && saveNoticeVisible) {
      saveNoticeTimerRef.current = window.setTimeout(() => {
        setSaveNoticeVisible(false);
        saveNoticeTimerRef.current = null;
      }, SAVE_NOTICE_DISPLAY_MS);
      return;
    }

    if (saveState === 'idle') {
      setSaveNoticeVisible(false);
    }
  }, [saveNoticeVisible, saveState]);

  useEffect(() => () => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
    }
  }, []);

  const templateOptions = useMemo(() => {
    if (!current || templates.some((template) => template.id === current.templateId)) return templates;

    return [
      {
        id: current.templateId,
        templateKey: current.templateKey,
        name: `${current.templateName} · versão utilizada`,
        professionalGroup: current.templateName,
        professionalTitles: [],
        version: current.templateVersion,
        schema: current.templateSnapshot,
      },
      ...templates,
    ];
  }, [current, templates]);

  const activeTemplate = useMemo(
    () => templateOptions.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templateOptions]
  );

  const activeSections = useMemo(
    () => orderSections(current?.templateSnapshot.sections || activeTemplate?.schema.sections || []),
    [activeTemplate, current]
  );

  const totalFields = useMemo(
    () => activeSections.reduce((total, section) => total + section.fields.length, 0),
    [activeSections]
  );

  const filledFields = useMemo(
    () => activeSections.reduce(
      (total, section) =>
        total + section.fields.filter((field) => fieldHasValue(answers[field.key])).length,
      0
    ),
    [activeSections, answers]
  );

  const isCompleted = current?.status === 'completed';

  const loadHistory = useCallback(async () => {
    if (!patientId) return;
    setHistory(await fetchPatientAnamnesisHistory(patientId));
  }, [patientId]);

  const loadRevisions = useCallback(async () => {
    if (!patientId) return;
    setRevisions(await fetchPatientAnamnesisRevisions(patientId));
  }, [patientId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!patientId || !user || !hasYearlyAccess) {
        if (!hasYearlyAccess) setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const [
          patientResult,
          profileResult,
          availableTemplates,
          currentAnamnesis,
          previous,
          revisionHistory,
        ] = await Promise.all([
          supabase.from('patients').select('id, full_name').eq('id', patientId).single(),
          supabase
            .from('professionals')
            .select('full_name, professional_title, professional_register, custom_logo_url, custom_logo_settings, role, subscription_plan, subscription_status, subscription_ends_at')
            .eq('id', user.id)
            .single(),
          fetchAnamnesisTemplates(),
          fetchCurrentPatientAnamnesis(patientId),
          fetchPatientAnamnesisHistory(patientId),
          fetchPatientAnamnesisRevisions(patientId),
        ]);

        if (patientResult.error) throw patientResult.error;
        if (profileResult.error) throw profileResult.error;
        if (!active) return;

        const title = profileResult.data?.professional_title || '';
        const recommended = getRecommendedAnamnesisTemplate(availableTemplates, title);
        const initialAnswers = currentAnamnesis?.answers || {};

        setPatientName(patientResult.data?.full_name || 'Paciente');
        setProfessionalTitle(title);
        setProfessional(profileResult.data || null);
        setTemplates(availableTemplates);
        setCurrent(currentAnamnesis);
        currentRef.current = currentAnamnesis;
        setHistory(previous);
        setRevisions(revisionHistory);
        setAnswers(initialAnswers);
        answersRef.current = initialAnswers;
        setDirty(false);
        dirtyRef.current = false;
        lastPersistedSignatureRef.current = answerSignature(initialAnswers);

        if (currentAnamnesis) {
          setSelectedTemplateId(currentAnamnesis.templateId);
          selectedTemplateIdRef.current = currentAnamnesis.templateId;
          const first = orderSections(currentAnamnesis.templateSnapshot.sections)?.[0]?.key;
          setExpandedSections(new Set(first ? [first] : []));
        } else if (recommended) {
          setSelectedTemplateId(recommended.id);
          selectedTemplateIdRef.current = recommended.id;
          const first = orderSections(recommended.schema.sections)?.[0]?.key;
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
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [hasYearlyAccess, navigate, patientId, user]);

  const ensureCurrent = useCallback(async () => {
    if (!patientId || !selectedTemplateIdRef.current) {
      throw new Error('Selecione um modelo de anamnese.');
    }
    if (currentRef.current) return currentRef.current;
    if (startPromiseRef.current) return startPromiseRef.current;

    startPromiseRef.current = startPatientAnamnesis(
      patientId,
      selectedTemplateIdRef.current,
      false
    );

    try {
      const created = await startPromiseRef.current;
      currentRef.current = created;
      setCurrent(created);
      return created;
    } finally {
      startPromiseRef.current = null;
    }
  }, [patientId]);

  const queueSave = useCallback(async (snapshot: AnamnesisAnswers) => {
    const signature = answerSignature(snapshot);

    if (currentRef.current?.status === 'completed') {
      throw new Error('Reabra a anamnese antes de alterar um registro concluído.');
    }

    if (!currentRef.current && !hasMeaningfulAnamnesisAnswers(snapshot)) {
      lastPersistedSignatureRef.current = signature;
      setDirty(false);
      dirtyRef.current = false;
      setSaveState('saved');
      return null;
    }

    if (
      signature === lastPersistedSignatureRef.current
      && currentRef.current
      && pendingSavesRef.current === 0
    ) {
      setDirty(false);
      dirtyRef.current = false;
      setSaveState('saved');
      return currentRef.current;
    }

    if (
      signature === lastQueuedSignatureRef.current
      && pendingSavesRef.current > 0
    ) {
      return saveQueueRef.current;
    }

    lastQueuedSignatureRef.current = signature;
    pendingSavesRef.current += 1;
    setSaveState('saving');

    const task = saveQueueRef.current
      .catch(() => currentRef.current)
      .then(async () => {
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= AUTOSAVE_MAX_ATTEMPTS; attempt += 1) {
          try {
            const record = await ensureCurrent();
            const updated = await savePatientAnamnesis(record.id, { answers: snapshot });
            currentRef.current = updated;
            setCurrent(updated);
            lastPersistedSignatureRef.current = signature;

            if (answerSignature(answersRef.current) === signature) {
              setDirty(false);
              dirtyRef.current = false;
              setSaveState('saved');
            }

            return updated;
          } catch (error) {
            lastError = error;
            if (attempt < AUTOSAVE_MAX_ATTEMPTS) {
              await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
            }
          }
        }

        if (answerSignature(answersRef.current) === signature) {
          setDirty(true);
          dirtyRef.current = true;
          setSaveState('error');
        }

        throw lastError instanceof Error
          ? lastError
          : new Error('Não foi possível salvar a anamnese.');
      })
      .finally(() => {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
      });

    saveQueueRef.current = task.catch(() => currentRef.current);
    return task;
  }, [ensureCurrent]);

  const flushPendingSave = useCallback(async () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const snapshot = answersRef.current;
    const signature = answerSignature(snapshot);

    if (
      dirtyRef.current
      && currentRef.current?.status !== 'completed'
      && signature !== lastPersistedSignatureRef.current
    ) {
      await queueSave(snapshot);
    }

    await saveQueueRef.current;

    if (
      hasMeaningfulAnamnesisAnswers(snapshot)
      && signature !== lastPersistedSignatureRef.current
    ) {
      throw new Error('Ainda existem alterações que não foram salvas.');
    }

    return currentRef.current;
  }, [queueSave]);

  const handleSafeNavigate = useCallback(async (target: string) => {
    try {
      await flushPendingSave();
      allowNavigationRef.current = true;
      navigate(target);
      window.setTimeout(() => {
        allowNavigationRef.current = false;
      }, 0);
    } catch (error: any) {
      console.error('[Anamnesis] Navegação bloqueada por falha de salvamento:', error);
      await showAlert(
        'Não foi possível salvar as últimas alterações. A página foi mantida aberta para evitar perda de dados. Tente novamente antes de sair.',
        {
          title: 'Alterações ainda não salvas',
          variant: 'warning',
          icon: 'warning',
        }
      );
    }
  }, [flushPendingSave, navigate]);

  useBeforeUnload(
    useCallback((event) => {
      if (
        dirtyRef.current
        || pendingSavesRef.current > 0
        || saveState === 'error'
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    }, [saveState])
  );

  useEffect(() => {
    const flushBestEffort = () => {
      if (!dirtyRef.current && pendingSavesRef.current === 0) return;
      void flushPendingSave().catch((error) => {
        console.error('[Anamnesis] Salvamento preventivo falhou:', error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushBestEffort();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushBestEffort);
    window.addEventListener('popstate', flushBestEffort);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushBestEffort);
      window.removeEventListener('popstate', flushBestEffort);
    };
  }, [flushPendingSave]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        allowNavigationRef.current
        || (!dirtyRef.current && pendingSavesRef.current === 0 && saveState !== 'error')
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      void handleSafeNavigate(`${url.pathname}${url.search}${url.hash}`);
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [handleSafeNavigate, saveState]);

  const setCurrentRecord = useCallback((record: PatientAnamnesis) => {
    const nextAnswers = record.answers || {};
    currentRef.current = record;
    setCurrent(record);
    setSelectedTemplateId(record.templateId);
    selectedTemplateIdRef.current = record.templateId;
    setAnswers(nextAnswers);
    answersRef.current = nextAnswers;
    setDirty(false);
    dirtyRef.current = false;
    lastPersistedSignatureRef.current = answerSignature(nextAnswers);
    lastQueuedSignatureRef.current = '';
    setSaveState('saved');
    const first = orderSections(record.templateSnapshot.sections)?.[0]?.key;
    setExpandedSections(new Set(first ? [first] : []));
  }, []);

  const handleFieldChange = (key: string, value: AnamnesisAnswers[string]) => {
    if (currentRef.current?.status === 'completed') return;

    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    setDirty(true);
    dirtyRef.current = true;
    setSaveState('idle');

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void queueSave(next).catch((error) => {
        console.error('[Anamnesis] Autosave falhou após tentativas:', error);
      });
    }, AUTOSAVE_DELAY_MS);
  };

  const handleTemplateChange = async (nextTemplateId: string) => {
    if (!patientId || !nextTemplateId || nextTemplateId === selectedTemplateId || switchingTemplate) return;

    const nextTemplate = templates.find((template) => template.id === nextTemplateId);
    if (!nextTemplate) return;

    const hasCurrentOrContent =
      Boolean(currentRef.current)
      || hasMeaningfulAnamnesisAnswers(answersRef.current);

    if (!hasCurrentOrContent) {
      setSelectedTemplateId(nextTemplateId);
      selectedTemplateIdRef.current = nextTemplateId;
      setAnswers({});
      answersRef.current = {};
      setDirty(false);
      dirtyRef.current = false;
      lastPersistedSignatureRef.current = answerSignature({});
      const first = orderSections(nextTemplate.schema.sections)?.[0]?.key;
      setExpandedSections(new Set(first ? [first] : []));
      return;
    }

    const confirmed = await showConfirm(
      `Trocar para o modelo “${nextTemplate.name}” iniciará uma nova anamnese. A atual será preservada no histórico, sem apagar as respostas. Deseja continuar?`,
      {
        title: 'Trocar modelo de anamnese',
        confirmLabel: 'Trocar modelo',
        cancelLabel: 'Cancelar',
        variant: 'warning',
        icon: 'question',
      }
    );

    if (!confirmed) return;

    setSwitchingTemplate(true);
    try {
      if (dirtyRef.current) {
        await flushPendingSave();
      } else {
        await saveQueueRef.current;
      }

      if (!currentRef.current) {
        setSelectedTemplateId(nextTemplateId);
        selectedTemplateIdRef.current = nextTemplateId;
        setAnswers({});
        answersRef.current = {};
        lastPersistedSignatureRef.current = answerSignature({});
        setDirty(false);
        dirtyRef.current = false;
        return;
      }

      const created = await startPatientAnamnesis(patientId, nextTemplateId, true);
      setCurrentRecord(created);
      await Promise.all([loadHistory(), loadRevisions()]);
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

  const handleStartNew = async (mode: 'blank' | 'copy') => {
    if (!patientId || !currentRef.current || startingNew) return;

    const latestTemplate =
      templates.find((template) => template.templateKey === currentRef.current?.templateKey)
      || templates.find((template) => template.id === selectedTemplateId);

    if (!latestTemplate) {
      setNewAnamnesisChoiceOpen(false);
      await showAlert('O modelo desta anamnese não está mais disponível para novos registros.', {
        title: 'Modelo indisponível',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    setStartingNew(true);
    try {
      await flushPendingSave();
      const sourceAnswers = { ...answersRef.current };
      const created = await startPatientAnamnesis(patientId, latestTemplate.id, true);

      // A troca para o novo registro acontece imediatamente após a criação.
      // Assim, se a cópia falhar depois, a interface nunca continua editando
      // a anamnese anterior que já foi preservada no histórico.
      setCurrentRecord(created);

      if (mode === 'copy') {
        const copiedAnswers = filterAnamnesisAnswersForSchema(
          sourceAnswers,
          latestTemplate.schema.sections
        );

        if (Object.keys(copiedAnswers).length > 0) {
          try {
            const copiedRecord = await savePatientAnamnesis(created.id, {
              answers: copiedAnswers,
            });
            setCurrentRecord(copiedRecord);
          } catch (copyError) {
            console.error('[Anamnesis] Nova anamnese criada, mas a cópia falhou:', copyError);
            setNewAnamnesisChoiceOpen(false);
            await Promise.allSettled([loadHistory(), loadRevisions()]);
            await showAlert(
              'A nova anamnese foi criada e a anterior está preservada no histórico, mas não foi possível copiar as respostas. A nova versão foi mantida em branco para evitar inconsistências.',
              {
                title: 'Não foi possível copiar as respostas',
                variant: 'warning',
                icon: 'warning',
              }
            );
            return;
          }
        }
      }

      setNewAnamnesisChoiceOpen(false);
      await Promise.all([loadHistory(), loadRevisions()]);
    } catch (error: any) {
      console.error('[Anamnesis] Erro ao iniciar nova anamnese:', error);
      await showAlert(
        error?.message || 'Não foi possível iniciar uma nova anamnese.',
        {
          title: 'Falha ao iniciar',
          variant: 'danger',
          icon: 'warning',
        }
      );
    } finally {
      setStartingNew(false);
    }
  };

  const handleDownloadPdf = async (record: PatientAnamnesis) => {
    if (downloadingPdfId) return;

    setDownloadingPdfId(record.id);
    try {
      let pdfRecord = record;

      if (currentRef.current?.id === record.id) {
        await flushPendingSave();
        const syncedRecord = currentRef.current || record;
        pdfRecord = {
          ...syncedRecord,
          answers: { ...answersRef.current },
        };
      }

      const hasCustomLogoAccess = hasActiveYearlyAccess({
        profileRole: professional?.role,
        subscriptionPlan: professional?.subscription_plan,
        subscriptionStatus: professional?.subscription_status,
        subscriptionEndsAt: professional?.subscription_ends_at,
      });
      const logoUrl =
        hasCustomLogoAccess && professional?.custom_logo_url
          ? professional.custom_logo_url
          : siteConfig.logo_light_url;

      let logoBase64: string | null = null;
      if (logoUrl) {
        try {
          logoBase64 = await getBase64ImageFromUrl(logoUrl);
        } catch (logoError) {
          console.warn('[Anamnesis PDF] Logotipo indisponível; usando cabeçalho textual.', logoError);
        }
      }

      const doc = generateAnamnesisPDF({
        record: pdfRecord,
        patient: { full_name: patientName },
        professional,
        siteConfig,
        logoBase64,
        customLogoSettings: professional?.custom_logo_settings,
      });

      const saved = await downloadPdfFile(
        doc,
        getAnamnesisPdfFileName(patientName, pdfRecord)
      );

      if (!saved) {
        await showAlert(
          'Não foi possível salvar o PDF neste dispositivo. Tente novamente pelo navegador ou verifique as permissões de download.',
          {
            title: 'Falha ao baixar PDF',
            variant: 'warning',
            icon: 'warning',
          }
        );
      }
    } catch (error: any) {
      console.error('[Anamnesis PDF] Erro ao gerar PDF:', error);
      await showAlert(error?.message || 'Não foi possível gerar o PDF da anamnese.', {
        title: 'Falha ao gerar PDF',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setDownloadingPdfId(null);
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
      const record = await flushPendingSave() || await ensureCurrent();
      const completedAt = new Date().toISOString();
      const updated = await savePatientAnamnesis(record.id, {
        status: 'completed',
        completedAt,
      });
      currentRef.current = updated;
      setCurrent(updated);
      setDirty(false);
      dirtyRef.current = false;
      setSaveState('saved');
      await loadRevisions();
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

    const confirmed = await showConfirm(
      'A anamnese voltará ao estado de rascunho e os campos poderão ser editados novamente. Essa reabertura ficará registrada no histórico.',
      {
        title: 'Reabrir anamnese',
        confirmLabel: 'Reabrir',
        cancelLabel: 'Cancelar',
        variant: 'warning',
        icon: 'question',
      }
    );

    if (!confirmed) return;

    setSaveState('saving');
    try {
      const updated = await savePatientAnamnesis(currentRef.current.id, {
        status: 'draft',
        completedAt: null,
      });
      currentRef.current = updated;
      setCurrent(updated);
      setSaveState('saved');
      await loadRevisions();
    } catch (error: any) {
      console.error('[Anamnesis] Erro ao reabrir:', error);
      setSaveState('error');
      await showAlert(error?.message || 'Não foi possível reabrir a anamnese.', {
        title: 'Falha ao reabrir',
        variant: 'danger',
        icon: 'warning',
      });
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

  if (!hasYearlyAccess) {
    return (
      <div className="w-full space-y-5 pb-8">
        <button
          type="button"
          onClick={() => navigate(`/painel/patients/${patientId}`)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
        >
          <ArrowLeft size={14} />
          Voltar para o paciente
        </button>

        <div className="card mx-auto max-w-2xl p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-brand-primary/10 p-3 text-brand-primary">
              <Lock size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-brand-text">Geração de anamnese</h1>
              <p className="mt-2 text-sm leading-relaxed text-brand-text-muted">
                Esta funcionalidade é somente para assinantes do Plano Anual. A geração estruturada, o histórico e o PDF ficam disponíveis após a assinatura.
              </p>
              <button
                type="button"
                onClick={() => navigate('/painel/subscription')}
                className="btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                Conhecer o Plano Anual
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSafeNavigate(`/painel/patients/${patientId}`)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
        >
          <ArrowLeft size={14} />
          Voltar para o paciente
        </button>
      </div>

      <PanelPageHeader
        icon={ClipboardList}
        title={`Anamnese — ${patientName}`}
        description="Organize informações iniciais e dados relevantes para o acompanhamento. Revise e atualize os registros sempre que necessário."
        titleActions={
          <AnamnesisGuideButton
            expanded={guideOpen}
            onOpen={() => setGuideOpen(true)}
          />
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="md:hidden">
              <AnamnesisGuideButton
                compact
                expanded={guideOpen}
                onOpen={() => setGuideOpen(true)}
              />
            </span>

            {current && (
              <button
                type="button"
                onClick={() => void handleDownloadPdf(current)}
                disabled={Boolean(downloadingPdfId) || saveState === 'saving'}
                className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
              >
                {downloadingPdfId === current.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Baixar PDF
              </button>
            )}

            {current?.status === 'completed' ? (
              <button
                type="button"
                onClick={() => void handleReopen()}
                disabled={saveState === 'saving'}
                className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
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
            )}
          </div>
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
                  disabled={switchingTemplate || startingNew || templates.length === 0}
                  className="w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 text-sm font-semibold text-brand-text outline-none focus:border-brand-primary disabled:opacity-50"
                >
                  {templateOptions.map((template) => (
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


              </div>
            </div>

            {current && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-border/50 pt-4">
                <p className="text-[10px] leading-relaxed text-brand-text-muted">
                  Precisa registrar uma nova avaliação usando este modelo? A versão atual será preservada no histórico.
                </p>
                <button
                  type="button"
                  onClick={() => setNewAnamnesisChoiceOpen(true)}
                  disabled={startingNew || switchingTemplate || saveState === 'saving'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-primary/30 px-3 py-2 text-xs font-bold text-brand-primary transition-colors hover:bg-brand-primary/5 disabled:opacity-50"
                >
                  {startingNew ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                  Iniciar nova anamnese
                </button>
              </div>
            )}

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

          {isCompleted && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
              <strong>Anamnese concluída.</strong> Os campos estão bloqueados para preservar o registro. Use “Reabrir como rascunho” se precisar fazer alterações; a reabertura ficará registrada no histórico.
            </div>
          )}

          {activeSections.map((section, sectionIndex) => {
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
                          disabled={isCompleted}
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
              As respostas são salvas automaticamente. O profissional permanece responsável pela revisão e pelo conteúdo registrado.
            </p>
          </div>

          {history.length > 0 && (
            <details className="card overflow-hidden bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 text-sm font-bold text-brand-text">
                <span className="flex items-center gap-2">
                  <HistoryIcon size={16} className="text-brand-primary" />
                  Anamneses anteriores
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
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setHistoryPreview(item)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline"
                      >
                        <Eye size={12} />
                        Visualizar registro
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf(item)}
                        disabled={Boolean(downloadingPdfId)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline disabled:opacity-50"
                      >
                        {downloadingPdfId === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        Baixar PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {revisions.length > 0 && (
            <details className="card overflow-hidden bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 text-sm font-bold text-brand-text">
                <span className="flex items-center gap-2">
                  <Clock3 size={16} className="text-brand-primary" />
                  Histórico de alterações
                </span>
                <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] text-brand-text-muted">{revisions.length}</span>
              </summary>
              <div className="max-h-80 space-y-2 overflow-y-auto border-t border-brand-border/50 p-4">
                {revisions.map((revision) => (
                  <div key={revision.id} className="rounded-xl border border-brand-border/60 bg-brand-bg/20 p-3">
                    <p className="text-[11px] font-semibold text-brand-text">{revisionLabel(revision.eventType)}</p>
                    <p className="mt-1 text-[10px] text-brand-text-muted">
                      {formatDateTime(revision.changedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </aside>
      </div>

      <div
        className={`app-anamnesis-save-notice fixed right-4 z-40 flex min-w-[220px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl md:z-[105] ${
          saveNoticeVisible ? 'is-visible' : ''
        } ${
          saveState === 'error'
            ? 'border-red-200'
            : saveState === 'saving' || dirty
              ? 'border-amber-200'
              : 'border-emerald-200'
        }`}
        aria-live="polite"
        aria-label="Status do salvamento automático"
        aria-hidden={!saveNoticeVisible}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          saveState === 'error'
            ? 'bg-red-50 text-red-600'
            : saveState === 'saving' || dirty
              ? 'bg-amber-50 text-amber-700'
              : 'bg-emerald-50 text-emerald-700'
        }`}>
          {saveState === 'saving' ? (
            <Loader2 size={17} className="animate-spin" />
          ) : saveState === 'error' ? (
            <AlertTriangle size={17} />
          ) : dirty ? (
            <Clock3 size={17} />
          ) : (
            <Save size={17} />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
            Salvamento automático
          </p>
          <p className={`mt-0.5 text-xs font-bold ${
            saveState === 'error'
              ? 'text-red-700'
              : saveState === 'saving' || dirty
                ? 'text-amber-800'
                : 'text-emerald-700'
          }`}>
            {saveState === 'saving'
              ? 'Salvando alterações...'
              : saveState === 'error'
                ? 'Falha ao salvar'
                : dirty
                  ? 'Alterações pendentes'
                  : current
                    ? 'Salvo automaticamente'
                    : 'Salvamento ativo'}
          </p>
        </div>
      </div>

      {newAnamnesisChoiceOpen && current && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Como iniciar a nova anamnese"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !startingNew) {
              setNewAnamnesisChoiceOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                  Nova anamnese
                </p>
                <h2 className="mt-1 text-lg font-bold text-brand-text">
                  Como deseja começar?
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
                  A anamnese atual será preservada integralmente no histórico em qualquer uma das opções.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewAnamnesisChoiceOpen(false)}
                disabled={startingNew}
                className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-bg disabled:opacity-50"
                aria-label="Cancelar nova anamnese"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleStartNew('blank')}
                disabled={startingNew}
                className="rounded-2xl border border-brand-border p-4 text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  {startingNew ? <Loader2 size={17} className="animate-spin" /> : <FilePlus2 size={17} />}
                </span>
                <span className="mt-3 block text-sm font-bold text-brand-text">Começar do zero</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-brand-text-muted">
                  Cria uma nova anamnese vazia usando a versão mais recente deste modelo.
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleStartNew('copy')}
                disabled={startingNew}
                className="rounded-2xl border border-brand-border p-4 text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  {startingNew ? <Loader2 size={17} className="animate-spin" /> : <Copy size={17} />}
                </span>
                <span className="mt-3 block text-sm font-bold text-brand-text">Copiar última anamnese</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-brand-text-muted">
                  Cria uma nova versão preenchida com as respostas da anamnese atual para você revisar.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {historyPreview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização de anamnese anterior"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryPreview(null);
          }}
        >
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Anamnese anterior</p>
                <h2 className="mt-1 text-lg font-bold text-brand-text">{historyPreview.templateName}</h2>
                <p className="mt-1 text-[11px] text-brand-text-muted">
                  Versão {historyPreview.templateVersion} · {historyPreview.status === 'completed' ? 'Concluída' : 'Rascunho preservado'} · atualizada em {formatDateTime(historyPreview.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf(historyPreview)}
                  disabled={Boolean(downloadingPdfId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-bold text-brand-primary hover:bg-brand-bg disabled:opacity-50"
                >
                  {downloadingPdfId === historyPreview.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPreview(null)}
                  className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-bg hover:text-brand-text"
                  aria-label="Fechar visualização"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(88vh-92px)] space-y-5 overflow-y-auto p-5 sm:p-6">
              {orderSections(historyPreview.templateSnapshot.sections).map((section) => (
                <section key={section.key}>
                  <h3 className="text-sm font-bold text-brand-text">{section.title}</h3>
                  <div className="mt-3 space-y-3">
                    {section.fields.map((field) => (
                      <div key={field.key} className="rounded-xl border border-brand-border/60 bg-brand-bg/20 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">{field.label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-brand-text">
                          {formatAnswer(historyPreview.answers[field.key])}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <FeatureGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        eyebrow="Anamnese estruturada"
        title="Como funciona a Anamnese"
        description="Siga este fluxo para registrar, revisar e manter o histórico das informações iniciais do paciente."
        steps={ANAMNESIS_GUIDE_STEPS}
        note="A anamnese é um apoio ao registro clínico. Revise o conteúdo antes de concluir e mantenha a responsabilidade profissional sobre as informações registradas."
        supportHref={ANAMNESIS_SUPPORT_HREF}
      />
    </div>
  );
}
