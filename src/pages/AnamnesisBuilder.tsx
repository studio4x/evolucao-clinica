import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, CheckCircle2, Eye, GripVertical, Info, Layers3, Loader2, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useBeforeUnload, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { FeatureGuideButton } from '../components/common/FeatureGuideButton';
import { FeatureGuideModal, type FeatureGuideStep } from '../components/common/FeatureGuideModal';
import { AnamnesisFieldInput, AnamnesisRenderer } from '../components/anamnesis/AnamnesisRenderer';
import { useAuthStore } from '../store/authStore';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  createPersonalAnamnesisTemplate,
  fetchAnamnesisTemplates,
  publishPersonalAnamnesisTemplate,
  type AnamnesisTemplate,
} from '../services/anamnesis';
import type { AnamnesisAnswers } from '../services/anamnesis';
import type { AnamnesisField, AnamnesisFieldType, AnamnesisSection, AnamnesisTemplateSchema } from '../services/anamnesisSchema';
import {
  clearBuilderDraft,
  cloneSchemaWithFreshIds,
  createBasicInformationSection,
  createEmptyBuilderSchema,
  createFieldKey,
  createStableId,
  hasBasicInformationSection,
  normalizeBuilderSchema,
  readBuilderDraft,
  validateBuilderSchema,
  writeBuilderDraft,
} from '../services/anamnesisBuilder';

const INPUT = 'w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10';
const FIELD_TYPES: Array<{ value: AnamnesisFieldType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Seleção múltipla' },
  { value: 'yes_no', label: 'Sim / Não' },
];

const fieldLabel = (type: AnamnesisFieldType) => FIELD_TYPES.find((item) => item.value === type)?.label || 'Campo';
const getDraftSignature = (name: string, schema: AnamnesisTemplateSchema) => JSON.stringify({ name, schema });

type DraftSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const BUILDER_GUIDE_STEPS: FeatureGuideStep[] = [
  { title: 'Organize por seções', description: 'Crie seções para agrupar informações relacionadas e facilitar o preenchimento da Anamnese.', icon: Layers3 },
  { title: 'Adicione os campos', description: 'Dentro de cada seção, escolha os campos necessários e configure as opções disponíveis.', icon: Plus },
  { title: 'Use “Informações básicas”', description: 'A seção Informações básicas reúne dados cadastrais do paciente que já existem no Evolução Clínica. Quando utilizada, esses dados podem ser preenchidos automaticamente a partir do cadastro do paciente, conforme o comportamento atualmente implementado. Você também pode adicionar campos personalizados nessa seção.', icon: Info },
  { title: 'Visualize antes de publicar', description: 'Use a visualização do modelo para conferir como a Anamnese ficará para preenchimento.', icon: Eye },
  { title: 'Publique para reutilizar', description: 'Depois de publicar, o modelo ficará disponível para utilização com seus pacientes.', icon: CheckCircle2 },
  { title: 'Atualize quando precisar', description: 'Você poderá continuar ajustando seu modelo. Ao publicar alterações, uma nova versão deve ser utilizada nos próximos usos, preservando os registros anteriores conforme as regras de versionamento já implementadas.', icon: Sparkles },
];

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

export default function AnamnesisBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { templateId } = useParams<{ templateId?: string }>();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [name, setName] = useState('');
  const [schema, setSchema] = useState<AnamnesisTemplateSchema>(createEmptyBuilderSchema());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>('idle');
  const draftSaveTimerRef = useRef<number | null>(null);
  const persistedDraftSignatureRef = useRef('');
  const dirtyRef = useRef(false);
  const nameRef = useRef(name);
  const schemaRef = useRef(schema);
  const requestedReturnTo = typeof location.state?.from === 'string' ? location.state.from : null;
  const returnTo = requestedReturnTo && requestedReturnTo.startsWith('/painel/') && requestedReturnTo !== location.pathname
    ? requestedReturnTo
    : '/painel';
  const returnToModels = () => navigate('/painel/anamnesis/modelos', { state: { from: returnTo } });

  const sourceTemplate = useMemo(
    () => templates.find((template) => template.id === searchParams.get('source')) || null,
    [searchParams, templates]
  );
  const editingTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) || null,
    [templateId, templates]
  );

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { schemaRef.current = schema; }, [schema]);

  useEffect(() => {
    let active = true;
    void fetchAnamnesisTemplates({ includeArchived: true }).then((items) => {
      if (!active) return;
      setTemplates(items);
      const base = templateId ? items.find((item) => item.id === templateId) : sourceTemplate;
      const draft = user?.id ? readBuilderDraft(user.id, templateId || null) : null;
      if (draft) {
        setName(draft.name);
        setSchema(draft.schema);
        persistedDraftSignatureRef.current = getDraftSignature(draft.name, draft.schema);
        setDraftSaveState('saved');
      } else if (base) {
        setName(templateId ? base.name : `Cópia de ${base.name}`);
        setSchema(cloneSchemaWithFreshIds(base.schema));
        persistedDraftSignatureRef.current = '';
      }
      setLoaded(true);
    }).catch((error) => showAlert(error instanceof Error ? error.message : 'Não foi possível carregar os modelos.'));
    return () => { active = false; };
  }, [sourceTemplate, templateId, user?.id]);

  const flushDraft = useCallback(async () => {
    if (!loaded || !user?.id || !dirtyRef.current) return;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    const nextSignature = getDraftSignature(nameRef.current, schemaRef.current);
    if (nextSignature === persistedDraftSignatureRef.current) {
      setDirty(false);
      setDraftSaveState('saved');
      return;
    }

    setDraftSaveState('saving');
    try {
      writeBuilderDraft(user.id, templateId || null, { name: nameRef.current, schema: schemaRef.current });
      persistedDraftSignatureRef.current = nextSignature;
      setDirty(false);
      setDraftSaveState('saved');
    } catch (error) {
      setDraftSaveState('error');
      throw error;
    }
  }, [loaded, templateId, user?.id]);

  useEffect(() => {
    if (!loaded || !user?.id || !dirty) return undefined;
    setDraftSaveState('pending');
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      void flushDraft().catch((error) => console.error('[AnamnesisBuilder] Não foi possível salvar o rascunho:', error));
    }, 500);
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [dirty, flushDraft, loaded, name, schema, user?.id]);

  useBeforeUnload(useCallback((event) => {
    if (!dirtyRef.current || !user?.id) return;
    try {
      writeBuilderDraft(user.id, templateId || null, { name: nameRef.current, schema: schemaRef.current });
    } catch { /* o aviso do navegador ainda protege a alteração local */ }
    event.preventDefault();
    event.returnValue = '';
  }, [templateId, user?.id]));

  useEffect(() => {
    const flushOnHide = () => {
      if (dirtyRef.current) void flushDraft().catch((error) => console.error('[AnamnesisBuilder] Salvamento preventivo falhou:', error));
    };
    const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushOnHide(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, [flushDraft]);

  const updateSchema = (next: AnamnesisTemplateSchema) => {
    setSchema(normalizeBuilderSchema(next));
    setDirty(true);
  };

  const addSection = () => updateSchema({ ...schema, sections: [...schema.sections, { id: createStableId(), key: createFieldKey('seção'), title: 'Nova seção', description: '', order: schema.sections.length, kind: 'standard', fields: [] }] });

  const addBasicInformation = () => {
    if (hasBasicInformationSection(schema)) return;
    updateSchema({ ...schema, sections: [createBasicInformationSection(), ...schema.sections].map((section, index) => ({ ...section, order: index })) });
  };

  const updateSection = (sectionId: string, patch: Partial<AnamnesisSection>) => updateSchema({ ...schema, sections: schema.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) });

  const removeSection = async (section: AnamnesisSection) => {
    if (section.kind === 'basic_information') return;
    if (!(await showConfirm('Excluir esta seção e os campos personalizados dela?', { title: 'Excluir seção', confirmLabel: 'Excluir', variant: 'danger', icon: 'trash' }))) return;
    updateSchema({ ...schema, sections: schema.sections.filter((item) => item.id !== section.id) });
  };

  const moveSection = (index: number, direction: -1 | 1) => updateSchema({ ...schema, sections: moveItem(schema.sections, index, direction) });

  const addField = (section: AnamnesisSection) => {
    const field: AnamnesisField = { id: createStableId(), key: createFieldKey('campo'), label: 'Novo campo', type: 'text', required: false, order: section.fields.length };
    updateSection(section.id || section.key, { fields: [...section.fields, field] });
  };

  const updateField = (section: AnamnesisSection, fieldId: string, patch: Partial<AnamnesisField>) => updateSection(section.id || section.key, { fields: section.fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field) });

  const removeField = async (section: AnamnesisSection, field: AnamnesisField) => {
    if (field.patientReference) return;
    if (!(await showConfirm('Excluir este campo da próxima versão do modelo?', { title: 'Excluir campo', confirmLabel: 'Excluir', variant: 'danger', icon: 'trash' }))) return;
    updateSection(section.id || section.key, { fields: section.fields.filter((item) => item.id !== field.id) });
  };

  const moveField = (section: AnamnesisSection, index: number, direction: -1 | 1) => updateSection(section.id || section.key, { fields: moveItem(section.fields, index, direction) });

  const handleBack = async () => {
    try {
      await flushDraft();
      returnToModels();
    } catch {
      await showAlert('Não foi possível salvar o último rascunho. A página foi mantida aberta para evitar perda de dados.', { title: 'Rascunho não salvo', variant: 'warning', icon: 'warning' });
    }
  };

  const save = async () => {
    const normalized = normalizeBuilderSchema(schema);
    const errors = validateBuilderSchema(name, normalized);
    if (errors.length) {
      await showAlert(errors.join('\n'), { title: 'Revise o modelo', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await flushDraft();
      if (editingTemplate) await publishPersonalAnamnesisTemplate(editingTemplate.id, { name, schema: normalized });
      else await createPersonalAnamnesisTemplate({
        name,
        schema: normalized,
        sourceTemplateId: sourceTemplate?.kind === 'system' ? sourceTemplate.id : null,
        sourceTemplateVersionId: sourceTemplate?.kind === 'system' ? sourceTemplate.currentVersionId : null,
      });
      if (user?.id) clearBuilderDraft(user.id, templateId || null);
      persistedDraftSignatureRef.current = '';
      setDraftSaveState('idle');
      setDirty(false);
      await showAlert(editingTemplate ? 'Nova versão publicada. Anamneses anteriores continuam preservadas.' : 'Modelo salvo e disponível para todos os seus pacientes.', { title: 'Modelo salvo', variant: 'success', icon: 'success' });
      returnToModels();
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Não foi possível salvar o modelo.', { title: 'Erro ao salvar', variant: 'danger' });
    } finally { setSaving(false); }
  };

  const previewAnswers: AnamnesisAnswers = Object.fromEntries(schema.sections.flatMap((section) => section.fields.filter((field) => !field.patientReference).map((field) => [field.id || field.key, field.type === 'multiselect' ? [] : field.type === 'yes_no' ? null : field.type === 'scale' ? field.min ?? 0 : '']))) as AnamnesisAnswers;
  const previewSections = schema.sections.map((section) => ({ ...section, fields: section.fields.map((field) => field.patientReference ? { ...field } : field) }));
  const previewPatient = { full_name: 'Nome do paciente', birth_date: '1990-01-01', phone: '(00) 00000-0000', cpf: '000.000.000-00', postal_code: '00000-000', street: 'Rua de exemplo', address_number: '100', address_complement: null, neighborhood: 'Centro', city: 'Cidade', state: 'UF' };
  const renderFieldPreview = (field: AnamnesisField) => {
    const fieldKey = field.id || field.key;
    const value = previewAnswers[fieldKey];
    const choiceField = field.type === 'select' || field.type === 'multiselect';

    return <div className="rounded-lg border border-brand-border/70 bg-white/80 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Pré-visualização</p>
      <label className="mb-1.5 block text-xs font-bold text-brand-text">{field.label.trim() || 'Nome do campo'}{field.required && <span className="ml-1 text-brand-primary">*</span>}</label>
      {field.helpText && <p className="mb-1.5 text-[10px] leading-relaxed text-brand-text-muted">{field.helpText}</p>}
      {choiceField && !(field.options || []).length ? <p className="rounded-lg border border-dashed border-brand-border px-3 py-2 text-xs text-brand-text-muted">Adicione opções para visualizar este campo.</p> : <AnamnesisFieldInput field={field} value={value} disabled onChange={() => undefined} />}
    </div>;
  };

  if (!loaded) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>;

  return <div className="w-full space-y-5 pb-10">
    <button type="button" onClick={() => void handleBack()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"><ArrowLeft size={14} />Voltar para meus modelos</button>
    <PanelPageHeader title={editingTemplate ? 'Editar modelo de anamnese' : sourceTemplate ? 'Personalizar modelo' : 'Criar minha própria anamnese'} description={sourceTemplate ? 'Você está usando um modelo existente como ponto de partida. As alterações serão feitas na sua própria versão, sem modificar o modelo original.' : 'Monte seções e campos do jeito que você trabalha. O modelo ficará disponível para todos os seus pacientes.'} titleActions={<FeatureGuideButton label="o Builder de Anamnese" expanded={guideOpen} onOpen={() => setGuideOpen(true)} />} actions={<div className="flex flex-wrap items-center justify-end gap-2"><span aria-live="polite" className={`text-[10px] font-semibold ${draftSaveState === 'error' ? 'text-red-600' : draftSaveState === 'saved' ? 'text-emerald-700' : 'text-brand-text-muted'}`}>{draftSaveState === 'pending' ? 'Alterações pendentes' : draftSaveState === 'saving' ? 'Salvando rascunho...' : draftSaveState === 'saved' ? 'Rascunho salvo' : draftSaveState === 'error' ? 'Rascunho não salvo' : ''}</span><span className="md:hidden"><FeatureGuideButton compact label="o Builder de Anamnese" expanded={guideOpen} onOpen={() => setGuideOpen(true)} /></span><button type="button" onClick={() => setPreviewOpen(true)} className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs"><Eye size={15} />Visualizar</button><button type="button" onClick={() => void save()} disabled={saving} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar modelo</button></div>} />

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="space-y-4">
        <section className="card space-y-4 p-5 sm:p-6">
          <div><label htmlFor="anamnesis-model-name" className="mb-1.5 block text-xs font-bold text-brand-text">Nome do modelo</label><input id="anamnesis-model-name" value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} placeholder="Ex.: Anamnese de Fisioterapia Pélvica" className={INPUT} /></div>
          {sourceTemplate && <div className="flex gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3 text-xs leading-relaxed text-brand-text"><Info size={16} className="mt-0.5 shrink-0 text-brand-primary" />Você está criando uma cópia pessoal. O modelo oficial continuará intacto.</div>}
        </section>

        {schema.sections.map((section, sectionIndex) => <section key={section.id} className="card overflow-visible border border-brand-border/70 p-4 sm:p-5">
          <div className="flex items-start gap-2"><GripVertical className="mt-2 hidden shrink-0 text-brand-text-muted sm:block" size={18} /><div className="min-w-0 flex-1 space-y-3"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><input aria-label={`Título da seção ${sectionIndex + 1}`} value={section.title} onChange={(event) => updateSection(section.id || section.key, { title: event.target.value })} className={`${INPUT} font-bold`} /><div className="flex items-center justify-end gap-1"><button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="Mover seção para cima" className="rounded-lg border border-brand-border p-2 text-brand-text-muted disabled:opacity-30"><ArrowUp size={15} /></button><button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === schema.sections.length - 1} aria-label="Mover seção para baixo" className="rounded-lg border border-brand-border p-2 text-brand-text-muted disabled:opacity-30"><ArrowDown size={15} /></button>{section.kind !== 'basic_information' && <button type="button" onClick={() => void removeSection(section)} aria-label="Excluir seção" className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={15} /></button>}</div></div><textarea aria-label={`Descrição da seção ${sectionIndex + 1}`} value={section.description || ''} onChange={(event) => updateSection(section.id || section.key, { description: event.target.value })} placeholder="Descrição opcional da seção" rows={2} className={`${INPUT} resize-y text-xs`} /></div></div>
          {section.kind === 'basic_information' && <div className="mt-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3 text-xs leading-relaxed text-brand-text"><strong>Informações básicas</strong> usa os dados já cadastrados do paciente. Os campos nativos permanecem somente leitura; você pode acrescentar campos personalizados abaixo.</div>}
          <div className="mt-4 space-y-3">{section.fields.map((field, fieldIndex) => <div key={field.id} className={`rounded-xl border p-3 ${field.patientReference ? 'border-brand-primary/20 bg-brand-primary/5' : 'border-brand-border bg-brand-bg/20'}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1 space-y-3"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><input aria-label="Nome do campo" value={field.label} disabled={Boolean(field.patientReference)} onChange={(event) => updateField(section, field.id || field.key, { label: event.target.value })} className={`${INPUT} ${field.patientReference ? 'cursor-not-allowed bg-brand-bg/60' : ''}`} /><select aria-label="Tipo do campo" value={field.type} disabled={Boolean(field.patientReference)} onChange={(event) => updateField(section, field.id || field.key, { type: event.target.value as AnamnesisFieldType, options: ['select', 'multiselect'].includes(event.target.value) ? (field.options?.length ? field.options : ['Opção 1']) : undefined })} className={INPUT}>{FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{fieldLabel(type.value)}</option>)}</select></div><div className="grid gap-3 sm:grid-cols-2"><input aria-label="Orientação do campo" value={field.helpText || ''} onChange={(event) => updateField(section, field.id || field.key, { helpText: event.target.value })} placeholder="Texto de orientação (opcional)" className={`${INPUT} text-xs`} /><input aria-label="Placeholder do campo" value={field.placeholder || ''} onChange={(event) => updateField(section, field.id || field.key, { placeholder: event.target.value })} placeholder="Placeholder (opcional)" className={`${INPUT} text-xs`} /></div>{['select', 'multiselect'].includes(field.type) && <div className="space-y-2 rounded-lg border border-brand-border/70 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Opções</p>{(field.options || []).map((option, optionIndex) => <div key={`${field.id}-${optionIndex}`} className="flex gap-2"><input aria-label={`Opção ${optionIndex + 1}`} value={option} onChange={(event) => updateField(section, field.id || field.key, { options: (field.options || []).map((item, index) => index === optionIndex ? event.target.value : item) })} className={`${INPUT} text-xs`} /><button type="button" onClick={() => updateField(section, field.id || field.key, { options: (field.options || []).filter((_, index) => index !== optionIndex) })} aria-label="Remover opção" className="rounded-lg border border-red-200 px-2 text-red-600"><X size={14} /></button></div>)}<button type="button" onClick={() => updateField(section, field.id || field.key, { options: [...(field.options || []), `Opção ${(field.options?.length || 0) + 1}`] })} className="text-xs font-bold text-brand-primary">+ Adicionar opção</button></div>}<label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-text"><input type="checkbox" checked={Boolean(field.required)} disabled={Boolean(field.patientReference)} onChange={(event) => updateField(section, field.id || field.key, { required: event.target.checked })} className="h-4 w-4 rounded border-brand-border text-brand-primary" />Campo obrigatório</label>{renderFieldPreview(field)}</div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => moveField(section, fieldIndex, -1)} disabled={fieldIndex === 0} aria-label="Mover campo para cima" className="rounded-lg border border-brand-border p-2 text-brand-text-muted disabled:opacity-30"><ArrowUp size={14} /></button><button type="button" onClick={() => moveField(section, fieldIndex, 1)} disabled={fieldIndex === section.fields.length - 1} aria-label="Mover campo para baixo" className="rounded-lg border border-brand-border p-2 text-brand-text-muted disabled:opacity-30"><ArrowDown size={14} /></button>{!field.patientReference && <button type="button" onClick={() => void removeField(section, field)} aria-label="Excluir campo" className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={14} /></button>}</div></div></div>)}</div>
          <button type="button" onClick={() => addField(section)} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary"><Plus size={15} />Adicionar campo</button>
        </section>)}

        <div className="flex flex-wrap gap-2"><button type="button" onClick={addSection} className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-xs"><Plus size={15} />Adicionar seção</button>{!hasBasicInformationSection(schema) && <button type="button" onClick={addBasicInformation} className="btn-outline inline-flex items-center gap-2 border-brand-primary/30 px-3 py-2 text-xs text-brand-primary"><Plus size={15} />Adicionar Informações básicas</button>}</div>
      </main>
      <aside className="card h-fit space-y-3 p-5"><h2 className="text-sm font-bold text-brand-text">Como funciona</h2><p className="text-xs leading-relaxed text-brand-text-muted">Edite o rascunho livremente. A versão só é criada quando você clicar em “Salvar modelo”.</p><ul className="space-y-2 text-xs text-brand-text-muted"><li>• IDs permanecem estáveis ao renomear ou reordenar.</li><li>• Cada publicação cria uma nova versão.</li><li>• Anamneses antigas não mudam.</li></ul>{dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800">Alterações não publicadas preservadas neste dispositivo.</p>}</aside>
    </div>

    <FeatureGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} eyebrow="Builder de Anamnese" title="Como criar seu modelo de Anamnese?" description={sourceTemplate ? 'Você está usando um modelo existente como ponto de partida. As alterações serão feitas na sua própria versão, sem modificar o modelo original.' : 'Monte uma estrutura de Anamnese que faça sentido para a sua rotina. Você pode organizar o modelo em seções e adicionar os campos que deseja preencher durante o atendimento.'} steps={BUILDER_GUIDE_STEPS} note="A estrutura do modelo ajuda a organizar o registro, mas o profissional continua responsável por definir quais informações são adequadas ao seu atendimento e por revisar o conteúdo registrado." />
    {previewOpen && <div role="dialog" aria-modal="true" aria-label="Visualização do modelo" className="fixed inset-0 z-[120] overflow-y-auto bg-slate-900/50 p-4 sm:p-8"><div className="mx-auto max-w-4xl rounded-2xl bg-brand-bg p-4 shadow-2xl sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Visualização</p><h2 className="text-xl font-bold text-brand-text">{name || 'Modelo de anamnese'}</h2></div><button type="button" onClick={() => setPreviewOpen(false)} aria-label="Fechar visualização" className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-border/50"><X size={18} /></button></div><AnamnesisRenderer sections={previewSections} answers={previewAnswers} patient={previewPatient} disabled expandedSections={new Set(previewSections.map((section) => section.id || section.key))} onToggleSection={() => undefined} onChange={() => undefined} fieldHasValue={(value) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)} /></div></div>}
  </div>;
}
