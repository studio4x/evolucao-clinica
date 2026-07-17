import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Check, CirclePause, CirclePlay, Eraser, FileText, Heading2, Italic, List, ListChecks, Loader2, Pencil, RefreshCw, Save, ScrollText, Settings, Users, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Tab = 'overview' | 'campaigns' | 'rules' | 'preferences' | 'settings';
type CampaignTab = 'flows' | 'templates' | 'instances' | 'logs';
type TemplateDraft = {
  subject_template: string;
  preheader_template: string;
  body_markdown: string;
  cta_label_template: string;
  cta_route_template: string;
  fallback_cta_route: string;
  category: string;
};

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (data.session?.access_token || ''),
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Falha ao consultar o lifecycle.');
  return payload;
}

function campaignStatusLabel(status: string) {
  return ({ active: 'Ativo', paused: 'Pausado', draft: 'Rascunho', archived: 'Arquivado' } as Record<string, string>)[status] || status;
}

function campaignStatusClass(status: string) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'paused') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'archived') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

function stepType(step: any) {
  return step.eligibility_rule_key || step.skip_rule_key ? 'conditional' : 'always';
}

function stepCondition(step: any) {
  return step.eligibility_rule_key || step.skip_rule_key || '—';
}

function waitHours(step: any) {
  return `${Number(step.day_offset || 0) * 24}h`;
}

function templateDraftFromStep(step: any): TemplateDraft {
  return {
    subject_template: step.subject_template || '',
    preheader_template: step.preheader_template || '',
    body_markdown: step.body_markdown || '',
    cta_label_template: step.cta_label_template || '',
    cta_route_template: step.cta_route_template || '',
    fallback_cta_route: step.fallback_cta_route || '',
    category: step.category || 'education'
  };
}

function escapeEditorHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markdownInlineToEditorHtml(value: string) {
  return escapeEditorHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToEditorHtml(markdown: string) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${markdownInlineToEditorHtml(listItem[1])}</li>`);
      continue;
    }
    closeList();
    if (!trimmed) continue;
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      html.push(`<h${heading[1].length}>${markdownInlineToEditorHtml(heading[2])}</h${heading[1].length}>`);
    } else {
      html.push(`<p>${markdownInlineToEditorHtml(trimmed)}</p>`);
    }
  }
  closeList();
  return html.join('') || '<p><br></p>';
}

function richTextNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\u00a0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const content = Array.from(element.childNodes).map(richTextNodeToMarkdown).join('');
  switch (element.tagName.toLowerCase()) {
    case 'br': return '\n';
    case 'strong':
    case 'b': return content.trim() ? `**${content.trim()}**` : '';
    case 'em':
    case 'i': return content.trim() ? `*${content.trim()}*` : '';
    case 'code': return content.trim() ? `\`${content.trim()}\`` : '';
    case 'h1': return `# ${content.trim()}\n\n`;
    case 'h2': return `## ${content.trim()}\n\n`;
    case 'h3': return `### ${content.trim()}\n\n`;
    case 'li': return `- ${content.trim()}\n`;
    case 'ul':
    case 'ol': return `${content}\n`;
    case 'p':
    case 'div': return `${content.trim()}\n\n`;
    default: return content;
  }
}

function richTextHtmlToMarkdown(html: string) {
  const documentRoot = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
  if (!documentRoot) return '';
  return Array.from(documentRoot.childNodes)
    .map(richTextNodeToMarkdown)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-brand-border bg-white p-10 text-center">
    <Icon className="mx-auto mb-3 text-brand-primary" size={28} />
    <strong className="block text-sm text-brand-text">{title}</strong>
    <span className="mt-1 block text-xs text-brand-text-muted">{description}</span>
  </div>;
}

export default function LifecycleAdmin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [campaignTab, setCampaignTab] = useState<CampaignTab>('flows');
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<any[]>([]);
  const [runtime, setRuntime] = useState({ send_enabled: false, dry_run: true, max_batch_size: 25 });
  const [steps, setSteps] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [richTextHtml, setRichTextHtml] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const richTextEditorRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewData, campaignData, rulesData, usersData, deliveryData, preferencesData, settingsData] = await Promise.all([
        api('/api/admin/lifecycle/overview'),
        api('/api/admin/lifecycle/campaigns'),
        api('/api/admin/lifecycle/rules'),
        api('/api/admin/lifecycle/users'),
        api('/api/admin/lifecycle/deliveries'),
        api('/api/admin/lifecycle/preferences'),
        api('/api/admin/lifecycle/settings')
      ]);
      const campaignList = campaignData.campaigns || [];
      const stepEntries = await Promise.all(campaignList.map(async (campaign: any) => {
        try {
          const data = await api('/api/admin/lifecycle/campaigns/' + campaign.id + '/steps');
          return [campaign.id, data.steps || []] as const;
        } catch {
          return [campaign.id, []] as const;
        }
      }));

      setOverview(overviewData);
      setCampaigns(campaignList);
      setSteps(Object.fromEntries(stepEntries));
      setRules(rulesData.rules || []);
      setUsers(usersData.users || []);
      setDeliveries(deliveryData.deliveries || []);
      setPreferences(preferencesData.preferences || []);
      setRuntime((current) => settingsData.runtime || current);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar Jornada de Usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (editingTemplateId && richTextEditorRef.current && richTextEditorRef.current.innerHTML !== richTextHtml) {
      richTextEditorRef.current.innerHTML = richTextHtml;
    }
  }, [editingTemplateId, richTextHtml]);

  const updateCampaign = async (campaign: any, status: string) => {
    try {
      await api('/api/admin/lifecycle/campaigns/' + campaign.id, { method: 'PUT', body: JSON.stringify({ status }) });
      setMessage('Campanha atualizada.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateStep = async (step: any) => {
    try {
      await api('/api/admin/lifecycle/steps/' + step.id, { method: 'PUT', body: JSON.stringify({ status: step.status === 'active' ? 'draft' : 'active' }) });
      setMessage('Passo atualizado.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startTemplateEdit = (step: any) => {
    setEditingTemplateId(step.id);
    setTemplateDraft(templateDraftFromStep(step));
    setRichTextHtml(markdownToEditorHtml(step.body_markdown || ''));
    setError('');
    setMessage('');
  };

  const cancelTemplateEdit = () => {
    setEditingTemplateId(null);
    setTemplateDraft(null);
    setRichTextHtml('');
  };

  const syncRichTextDraft = () => {
    const html = richTextEditorRef.current?.innerHTML || '';
    setRichTextHtml(html);
    setTemplateDraft((current) => current ? { ...current, body_markdown: richTextHtmlToMarkdown(html) } : current);
  };

  const applyRichTextCommand = (command: string, value?: string) => {
    const editor = richTextEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    syncRichTextDraft();
  };

  const saveTemplate = async () => {
    if (!editingTemplateId || !templateDraft) return;
    if (!templateDraft.subject_template.trim() || !templateDraft.body_markdown.trim()) {
      setError('O assunto e o conteúdo do template são obrigatórios.');
      return;
    }

    setTemplateSaving(true);
    setError('');
    try {
      await api('/api/admin/lifecycle/steps/' + editingTemplateId, {
        method: 'PUT',
        body: JSON.stringify({
          ...templateDraft,
          subject_template: templateDraft.subject_template.trim(),
          preheader_template: templateDraft.preheader_template.trim() || null,
          body_markdown: templateDraft.body_markdown.trim(),
          cta_label_template: templateDraft.cta_label_template.trim() || null,
          cta_route_template: templateDraft.cta_route_template.trim() || null,
          fallback_cta_route: templateDraft.fallback_cta_route.trim() || null,
          category: templateDraft.category.trim() || 'education'
        })
      });
      setMessage('Template atualizado com sucesso.');
      cancelTemplateEdit();
      await load();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar o template.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const updateRule = async (rule: any) => {
    try {
      await api('/api/admin/lifecycle/rules/' + rule.id, { method: 'PUT', body: JSON.stringify({ enabled: !rule.enabled }) });
      setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const userAction = async (user: any, action: 'pause' | 'resume' | 'recalculate' | 'enroll') => {
    try {
      await api('/api/admin/lifecycle/users/' + user.id + '/' + action, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Usuário atualizado.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveRuntime = async () => {
    try {
      await api('/api/admin/lifecycle/settings', { method: 'PUT', body: JSON.stringify(runtime) });
      setMessage('Configuração salva.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const tabs: Array<[Tab, string]> = [
    ['overview', 'Visão geral'],
    ['campaigns', 'Campanhas e passos'],
    ['rules', 'Regras condicionais'],
    ['preferences', 'Preferências'],
    ['settings', 'Configurações']
  ];
  const campaignTabs: Array<[CampaignTab, string, typeof ListChecks]> = [
    ['flows', 'Fluxos e Passos', ListChecks],
    ['templates', 'Templates', FileText],
    ['instances', 'Usuários no Fluxo', Users],
    ['logs', 'Logs de Envio', ScrollText]
  ];
  const templateRows = campaigns.flatMap((campaign) => (steps[campaign.id] || []).map((step) => ({ ...step, campaign })));
  const editingTemplate = templateRows.find((step) => step.id === editingTemplateId);

  if (loading && !overview) return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin text-brand-primary" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-brand-text">Jornada de Usuários</h2>
        <p className="text-sm text-brand-text-muted mt-1">Automação individual, dry-run, fila e métricas de relacionamento.</p>
      </div>
      <button onClick={() => void load()} className="btn-outline inline-flex items-center gap-2 self-start"><RefreshCw size={16} /> Atualizar</button>
    </div>

    {error && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    {message && <div className="rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm flex items-center gap-2"><Check size={16} />{message}</div>}

    <div className="flex gap-2 overflow-x-auto border-b border-brand-border pb-2">
      {tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={'px-3 py-2 rounded-lg text-sm whitespace-nowrap ' + (tab === key ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:bg-brand-bg')}>{label}</button>)}
    </div>

    {tab === 'overview' && <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Matriculados', overview?.metrics?.enrolled], ['Ativos', overview?.metrics?.active], ['Na fila', overview?.metrics?.queued], ['Enviados', overview?.metrics?.sent],
          ['Concluídos', overview?.metrics?.completed], ['Falhas', overview?.metrics?.failed], ['Suprimidos', overview?.metrics?.suppressed], ['Cooldown', '24h']
        ].map(([label, value]) => <div key={String(label)} className="bg-white border border-brand-border rounded-xl p-4"><span className="text-xs text-brand-text-muted block">{label}</span><strong className="text-2xl text-brand-text">{value ?? '—'}</strong></div>)}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Modo atual:</strong> {runtime.dry_run ? 'dry-run / observação' : runtime.send_enabled ? 'envio habilitado' : 'envio desabilitado'} — campanha e passos começam em draft.</div>
    </div>}

    {tab === 'campaigns' && <div className="space-y-6">
      <div role="tablist" aria-label="Seções de campanhas e passos" className="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-xl bg-brand-bg p-1 max-w-3xl">
        {campaignTabs.map(([key, label, Icon]) => <button key={key} type="button" role="tab" aria-selected={campaignTab === key} onClick={() => setCampaignTab(key)} className={'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ' + (campaignTab === key ? 'bg-white text-brand-primary shadow-sm' : 'text-brand-text-muted hover:text-brand-text')}><Icon size={15} />{label}</button>)}
      </div>

      {campaignTab === 'flows' && <div className="space-y-6">
        {campaigns.length === 0 && <EmptyState icon={ListChecks} title="Nenhuma campanha cadastrada" description="Crie uma campanha para organizar os passos da jornada." />}
        {campaigns.map((campaign) => <section key={campaign.id} className="rounded-xl border border-brand-border bg-white overflow-hidden shadow-sm">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border bg-slate-50/70 p-5 md:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-brand-text">{campaign.name}</h3><span className={'rounded-full border px-2.5 py-1 text-xs font-semibold ' + campaignStatusClass(campaign.status)}>{campaignStatusLabel(campaign.status)}</span></div>
              <p className="mt-1 text-sm text-brand-text-muted">Público-alvo: {campaign.enrollment_mode || 'profissionais'} · {campaign.description || campaign.key}</p>
            </div>
            <div className="flex gap-2">
              {campaign.status === 'active' ? <button onClick={() => void updateCampaign(campaign, 'paused')} className="btn-outline inline-flex items-center gap-1.5 text-xs"><CirclePause size={14} /> Pausar</button> : campaign.status !== 'archived' && <button onClick={() => void updateCampaign(campaign, 'active')} className="btn-primary inline-flex items-center gap-1.5 text-xs"><CirclePlay size={14} /> Ativar</button>}
            </div>
          </header>
          {(steps[campaign.id] || []).length === 0 ? <div className="p-6 text-sm text-brand-text-muted">Nenhum passo encontrado nesta campanha.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-brand-border text-brand-text-muted"><tr><th className="w-16 px-4 py-3 text-center font-medium">Ordem</th><th className="px-4 py-3 text-left font-medium">Template</th><th className="px-4 py-3 text-left font-medium">Espera (h)</th><th className="px-4 py-3 text-left font-medium">Tipo</th><th className="px-4 py-3 text-left font-medium">Condição</th><th className="px-4 py-3 text-left font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Ação</th></tr></thead><tbody className="divide-y divide-brand-border">{[...(steps[campaign.id] || [])].sort((a, b) => a.position - b.position).map((step) => <tr key={step.id} className="hover:bg-brand-bg/40"><td className="bg-slate-50/60 px-4 py-4 text-center font-bold text-brand-text">{step.position}</td><td className="px-4 py-4"><strong className="block max-w-[360px] truncate font-medium text-brand-text">{step.subject_template}</strong><span className="mt-0.5 block max-w-[360px] truncate text-xs text-brand-text-muted">{step.preheader_template || step.step_key}</span></td><td className="px-4 py-4 whitespace-nowrap">{waitHours(step)}</td><td className="px-4 py-4"><span className="rounded-full border border-brand-border px-2.5 py-1 text-xs font-medium">{stepType(step)}</span></td><td className="px-4 py-4"><span className={stepCondition(step) === '—' ? 'text-brand-text-muted' : 'font-mono text-xs text-brand-text-muted'}>{stepCondition(step)}</span></td><td className="px-4 py-4"><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (step.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{step.status === 'active' ? 'Ativo' : 'Rascunho'}</span></td><td className="px-4 py-4 text-right"><button onClick={() => void updateStep(step)} className="btn-outline whitespace-nowrap text-xs">{step.status === 'active' ? 'Voltar para draft' : 'Validar e ativar'}</button></td></tr>)}</tbody></table></div>}
        </section>)}
      </div>}

      {campaignTab === 'templates' && <div className="space-y-4">
        {templateRows.length === 0 ? <EmptyState icon={FileText} title="Nenhum template disponível" description="Os templates dos passos aparecerão aqui quando houver campanhas cadastradas." /> : <div className="overflow-x-auto rounded-xl border border-brand-border bg-white"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Template</th><th className="p-3">Campanha</th><th className="p-3">Categoria</th><th className="p-3">Estado</th><th className="p-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-brand-border">{templateRows.map((step) => <tr key={step.id} className="hover:bg-brand-bg/40"><td className="p-3"><strong className="block max-w-[360px] truncate text-brand-text">{step.subject_template}</strong><span className="block max-w-[360px] truncate text-xs text-brand-text-muted">{step.preheader_template || 'Sem preheader cadastrado'}</span></td><td className="p-3">{step.campaign.name}<span className="block text-xs text-brand-text-muted">Passo {step.position}</span></td><td className="p-3"><span className="rounded-full border border-brand-border px-2 py-1 text-xs">{step.category || 'education'}</span></td><td className="p-3">{step.status === 'active' ? <span className="text-emerald-700">Ativo</span> : <span className="text-brand-text-muted">Rascunho</span>}</td><td className="p-3 text-right"><div className="inline-flex gap-2"><button onClick={() => startTemplateEdit(step)} className="btn-outline inline-flex items-center gap-1.5 text-xs"><Pencil size={13} /> Editar</button><button onClick={() => void updateStep(step)} className="btn-outline text-xs">{step.status === 'active' ? 'Desativar' : 'Validar e ativar'}</button></div></td></tr>)}</tbody></table></div>}

        {editingTemplate && templateDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !templateSaving) cancelTemplateEdit(); }}>
          <form onSubmit={(event) => { event.preventDefault(); void saveTemplate(); }} role="dialog" aria-modal="true" aria-labelledby="lifecycle-template-editor-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-brand-border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-brand-border bg-slate-50/80 p-5 md:p-6">
              <div><span className="text-xs font-semibold uppercase tracking-wide text-brand-primary">Editor de template</span><h3 id="lifecycle-template-editor-title" className="mt-1 text-lg font-semibold text-brand-text">Passo {editingTemplate.position} · {editingTemplate.campaign.name}</h3><p className="mt-1 text-xs text-brand-text-muted">As alterações serão aplicadas ao próximo processamento deste passo.</p></div>
              <button type="button" onClick={cancelTemplateEdit} disabled={templateSaving} className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-bg hover:text-brand-text disabled:opacity-50" aria-label="Fechar editor"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto p-5 md:p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block"><span className="text-sm font-semibold text-brand-text">Assunto</span><input required value={templateDraft.subject_template} onChange={(event) => setTemplateDraft({ ...templateDraft, subject_template: event.target.value })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
                <label className="block"><span className="text-sm font-semibold text-brand-text">Preheader</span><input value={templateDraft.preheader_template} onChange={(event) => setTemplateDraft({ ...templateDraft, preheader_template: event.target.value })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
              </div>

              <div>
                <span className="text-sm font-semibold text-brand-text">Conteúdo do e-mail</span>
                <div className="mt-1 overflow-hidden rounded-lg border border-brand-border focus-within:border-brand-primary">
                  <div className="flex flex-wrap items-center gap-1 border-b border-brand-border bg-brand-bg/60 p-2" role="toolbar" aria-label="Formatação do conteúdo">
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); applyRichTextCommand('bold'); }} className="rounded p-2 text-brand-text-muted hover:bg-white hover:text-brand-primary" title="Negrito"><Bold size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); applyRichTextCommand('italic'); }} className="rounded p-2 text-brand-text-muted hover:bg-white hover:text-brand-primary" title="Itálico"><Italic size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); applyRichTextCommand('formatBlock', 'h2'); }} className="rounded p-2 text-brand-text-muted hover:bg-white hover:text-brand-primary" title="Título"><Heading2 size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); applyRichTextCommand('insertUnorderedList'); }} className="rounded p-2 text-brand-text-muted hover:bg-white hover:text-brand-primary" title="Lista"><List size={16} /></button>
                    <button type="button" onMouseDown={(event) => { event.preventDefault(); applyRichTextCommand('removeFormat'); }} className="rounded p-2 text-brand-text-muted hover:bg-white hover:text-brand-primary" title="Limpar formatação"><Eraser size={16} /></button>
                  </div>
                  <div ref={richTextEditorRef} contentEditable suppressContentEditableWarning onInput={syncRichTextDraft} className="min-h-[280px] max-h-[48vh] overflow-y-auto px-4 py-3 text-sm leading-7 text-brand-text focus:outline-none [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3" />
                </div>
                <p className="mt-1.5 text-xs text-brand-text-muted">Use a barra acima para formatar. Variáveis do lifecycle, como <code>{'{{primeiro_nome}}'}</code>, continuam disponíveis.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block"><span className="text-sm font-semibold text-brand-text">Texto do botão</span><input value={templateDraft.cta_label_template} onChange={(event) => setTemplateDraft({ ...templateDraft, cta_label_template: event.target.value })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
                <label className="block"><span className="text-sm font-semibold text-brand-text">Categoria</span><input value={templateDraft.category} onChange={(event) => setTemplateDraft({ ...templateDraft, category: event.target.value })} placeholder="activation" className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
                <label className="block"><span className="text-sm font-semibold text-brand-text">Rota principal do botão</span><input value={templateDraft.cta_route_template} onChange={(event) => setTemplateDraft({ ...templateDraft, cta_route_template: event.target.value })} placeholder="/painel/dashboard" className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
                <label className="block"><span className="text-sm font-semibold text-brand-text">Rota alternativa</span><input value={templateDraft.fallback_cta_route} onChange={(event) => setTemplateDraft({ ...templateDraft, fallback_cta_route: event.target.value })} placeholder="/painel/dashboard" className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none" /></label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-brand-border bg-slate-50/50 p-4 md:p-5"><button type="button" onClick={cancelTemplateEdit} disabled={templateSaving} className="btn-outline text-sm">Cancelar</button><button type="submit" disabled={templateSaving} className="btn-primary inline-flex items-center gap-2 text-sm">{templateSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{templateSaving ? 'Salvando...' : 'Salvar template'}</button></div>
          </form>
        </div>}
      </div>}

      {campaignTab === 'instances' && <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">{users.length === 0 ? <EmptyState icon={Users} title="Nenhum usuário no fluxo" description="Os usuários matriculados em campanhas aparecerão aqui." /> : <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Usuário</th><th className="p-3">Estágio</th><th className="p-3">Plano</th><th className="p-3">Jornada</th><th className="p-3">Ações</th></tr></thead><tbody className="divide-y divide-brand-border">{users.map((user) => { const enrollment = user.enrollments?.[0]; return <tr key={user.id} className="hover:bg-brand-bg/40"><td className="p-3"><strong>{user.full_name || 'Profissional'}</strong><span className="block text-xs text-brand-text-muted">{user.google_email}</span></td><td className="p-3">{user.state?.activation_status || '—'}<span className="block text-xs text-brand-text-muted">Nível {user.state?.activation_level ?? 0}</span></td><td className="p-3">{user.subscription_plan || '—'} / {user.subscription_status || '—'}</td><td className="p-3">{enrollment?.status || 'não matriculado'}<span className="block text-xs text-brand-text-muted">{enrollment?.current_position ? `Passo ${enrollment.current_position}` : 'Sem passo iniciado'}</span></td><td className="p-3"><div className="flex flex-wrap gap-1"><button title="Recalcular" onClick={() => void userAction(user, 'recalculate')} className="btn-outline p-1.5"><RefreshCw size={14} /></button>{enrollment?.status === 'active' ? <button title="Pausar" onClick={() => void userAction(user, 'pause')} className="btn-outline p-1.5"><CirclePause size={14} /></button> : <button title="Matricular/retomar" onClick={() => void userAction(user, enrollment?.status === 'paused' ? 'resume' : 'enroll')} className="btn-outline p-1.5"><CirclePlay size={14} /></button>}</div></td></tr>; })}</tbody></table>}</div>}

      {campaignTab === 'logs' && <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">{deliveries.length === 0 ? <EmptyState icon={ScrollText} title="Nenhum log de envio" description="Os disparos processados pela fila aparecerão aqui." /> : <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Mensagem</th><th className="p-3">Status</th><th className="p-3">Agendada</th><th className="p-3">Tentativas</th><th className="p-3">Motivo</th></tr></thead><tbody className="divide-y divide-brand-border">{deliveries.map((item) => <tr key={item.id} className="hover:bg-brand-bg/40"><td className="p-3"><strong>{item.message_key}</strong><span className="block text-xs text-brand-text-muted">{item.dispatch_type}</span></td><td className="p-3"><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (item.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : item.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600')}>{item.status}</span></td><td className="p-3 whitespace-nowrap">{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString('pt-BR') : '—'}</td><td className="p-3">{item.attempt_count}/{item.max_attempts}</td><td className="p-3 max-w-xs truncate">{item.skip_reason || item.failure_reason || '—'}</td></tr>)}</tbody></table>}</div>}
    </div>}

    {tab === 'rules' && <div className="bg-white border border-brand-border rounded-xl divide-y">{rules.map((rule) => <div key={rule.id} className="p-4 flex items-center justify-between gap-4"><div><strong className="text-sm text-brand-text">{rule.name}</strong><span className="block text-xs text-brand-text-muted">{rule.rule_key} · prioridade {rule.priority} · cooldown {rule.cooldown_hours}h</span></div><button onClick={() => void updateRule(rule)} className={'text-xs px-3 py-1.5 rounded-lg ' + (rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>{rule.enabled ? 'Ativa' : 'Desativada'}</button></div>)}</div>}

    {tab === 'preferences' && <div className="overflow-x-auto rounded-xl border border-brand-border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Usuário</th><th className="p-3">Lifecycle</th><th className="p-3">Educativo</th><th className="p-3">Comercial</th><th className="p-3">Atualizado</th></tr></thead><tbody className="divide-y divide-brand-border">{preferences.map((item) => <tr key={item.user_id}><td className="p-3">{item.user_id}</td><td className="p-3">{item.lifecycle_enabled ? 'Ativo' : 'Descadastrado'}</td><td className="p-3">{item.product_education_enabled ? 'Sim' : 'Não'}</td><td className="p-3">{item.commercial_enabled ? 'Sim' : 'Não'}</td><td className="p-3">{item.updated_at ? new Date(item.updated_at).toLocaleString('pt-BR') : '—'}</td></tr>)}</tbody></table></div>}

    {tab === 'settings' && <div className="max-w-xl bg-white border border-brand-border rounded-xl p-5 space-y-5"><div className="flex items-center gap-2"><Settings size={18} className="text-brand-primary" /><h3 className="font-semibold">Configurações de rollout</h3></div><label className="flex items-center justify-between gap-4"><span><strong className="block">Dry-run / observação</strong><small className="text-brand-text-muted">Calcula decisões, mas não entrega e-mails.</small></span><input type="checkbox" className="h-5 w-5 accent-brand-primary" checked={runtime.dry_run} onChange={(event) => setRuntime({ ...runtime, dry_run: event.target.checked })} /></label><label className="flex items-center justify-between gap-4"><span><strong className="block">Permitir envio real</strong><small className="text-brand-text-muted">Exige campanha e passos ativos.</small></span><input type="checkbox" className="h-5 w-5 accent-brand-primary" checked={runtime.send_enabled} onChange={(event) => setRuntime({ ...runtime, send_enabled: event.target.checked })} /></label><label className="block"><span className="text-sm font-semibold">Batch do worker</span><input type="number" min={1} max={100} value={runtime.max_batch_size} onChange={(event) => setRuntime({ ...runtime, max_batch_size: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" /></label><button onClick={() => void saveRuntime()} className="btn-primary inline-flex items-center gap-2"><Save size={16} /> Salvar configuração</button><p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">Ative o envio somente após validar links, planos, templates, preferências e uma coorte interna.</p></div>}
  </div>;
}
