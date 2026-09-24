import { useCallback, useEffect, useState } from 'react';
import { Archive, Copy, Edit3, Plus, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { fetchAnamnesisTemplates, setPersonalAnamnesisTemplateStatus, type AnamnesisTemplate } from '../services/anamnesis';
import { showAlert, showConfirm } from '../store/modalStore';

const cardClass = 'rounded-2xl border border-brand-border bg-white p-4 shadow-sm';

export default function AnamnesisModels() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await fetchAnamnesisTemplates({ includeArchived: true })); }
    catch (error) { await showAlert(error instanceof Error ? error.message : 'Não foi possível carregar os modelos.', { title: 'Modelos de anamnese', variant: 'danger' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const personal = templates.filter((template) => template.ownerProfessionalId);
  const standard = templates.filter((template) => !template.ownerProfessionalId && template.status === 'active');
  const archive = async (template: AnamnesisTemplate) => {
    const next = template.status === 'archived' ? 'active' : 'archived';
    if (!(await showConfirm(next === 'archived' ? 'Arquivar este modelo? Ele não aparecerá para novas anamneses, mas seus registros antigos serão preservados.' : 'Restaurar este modelo para novas anamneses?', { title: next === 'archived' ? 'Arquivar modelo' : 'Restaurar modelo', confirmLabel: next === 'archived' ? 'Arquivar' : 'Restaurar', variant: next === 'archived' ? 'danger' : 'info' }))) return;
    try { await setPersonalAnamnesisTemplateStatus(template.id, next); await load(); }
    catch (error) { await showAlert(error instanceof Error ? error.message : 'Não foi possível atualizar o modelo.', { title: 'Modelos de anamnese', variant: 'danger' }); }
  };

  const renderPersonal = (template: AnamnesisTemplate) => (
    <article key={template.id} className={`${cardClass} ${template.status === 'archived' ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-bold text-brand-text">{template.name}</h3><p className="mt-1 text-xs text-brand-text-muted">Versão {template.version} · {template.status === 'archived' ? 'Arquivado' : 'Ativo'}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${template.status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{template.status === 'archived' ? 'Arquivado' : 'Disponível'}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => navigate(`/painel/anamnesis/modelos/${template.id}/editar`)} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs"><Edit3 size={14} />Editar</button>
        <button type="button" onClick={() => navigate(`/painel/anamnesis/modelos/novo?source=${template.id}`)} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs"><Copy size={14} />Duplicar</button>
        <button type="button" onClick={() => void archive(template)} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs">{template.status === 'archived' ? <RotateCcw size={14} /> : <Archive size={14} />}{template.status === 'archived' ? 'Restaurar' : 'Arquivar'}</button>
      </div>
    </article>
  );

  return <div className="w-full space-y-5 pb-10">
    <PanelPageHeader title="Modelos de anamnese" description="Crie modelos pessoais reutilizáveis para todos os seus pacientes, mantendo os modelos oficiais intactos." actions={<button type="button" onClick={() => navigate('/painel/anamnesis/modelos/novo')} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs"><Plus size={15} />Criar minha própria anamnese</button>} />
    {loading ? <div className="card p-6 text-sm text-brand-text-muted">Carregando modelos...</div> : <>
      <section className="space-y-3"><div><h2 className="text-lg font-bold text-brand-text">Meus modelos</h2><p className="text-xs text-brand-text-muted">Modelos privados, disponíveis somente para você e seus próprios pacientes.</p></div>{personal.length ? <div className="grid gap-3 lg:grid-cols-2">{personal.map(renderPersonal)}</div> : <div className="card p-5 text-sm text-brand-text-muted">Você ainda não criou um modelo pessoal.</div>}</section>
      <section className="space-y-3"><div><h2 className="text-lg font-bold text-brand-text">Modelos recomendados</h2><p className="text-xs text-brand-text-muted">Você pode personalizar uma cópia; o modelo oficial não será alterado.</p></div><div className="grid gap-3 lg:grid-cols-2">{standard.map((template) => <article key={template.id} className={cardClass}><h3 className="font-bold text-brand-text">{template.name}</h3><p className="mt-1 text-xs text-brand-text-muted">Modelo oficial · versão {template.version}</p><button type="button" onClick={() => navigate(`/painel/anamnesis/modelos/novo?source=${template.id}`)} className="btn-outline mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-xs"><Copy size={14} />Personalizar modelo</button></article>)}</div></section>
    </>}
  </div>;
}
