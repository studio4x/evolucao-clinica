import { useCallback, useEffect, useState } from 'react';
import { Activity, Check, ChevronDown, ChevronUp, CirclePause, CirclePlay, Eye, Loader2, Mail, RefreshCw, Save, Settings, ShieldCheck, Users, XCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Tab = 'overview' | 'campaigns' | 'rules' | 'users' | 'queue' | 'preferences' | 'settings';

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || ''), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Falha ao consultar o lifecycle.');
  return payload;
}

export default function LifecycleAdmin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<any[]>([]);
  const [runtime, setRuntime] = useState({ send_enabled: false, dry_run: true, max_batch_size: 25 });
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [overviewData, campaignData, rulesData, usersData, deliveryData, preferencesData, settingsData] = await Promise.all([
        api('/api/admin/lifecycle/overview'), api('/api/admin/lifecycle/campaigns'), api('/api/admin/lifecycle/rules'), api('/api/admin/lifecycle/users'), api('/api/admin/lifecycle/deliveries'), api('/api/admin/lifecycle/preferences'), api('/api/admin/lifecycle/settings')
      ]);
      setOverview(overviewData); setCampaigns(campaignData.campaigns || []); setRules(rulesData.rules || []); setUsers(usersData.users || []); setDeliveries(deliveryData.deliveries || []); setPreferences(preferencesData.preferences || []); setRuntime((current) => settingsData.runtime || current);
    } catch (err: any) { setError(err.message || 'Falha ao carregar Jornada de Usuários.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateCampaign = async (campaign: any, status: string) => {
    try { await api('/api/admin/lifecycle/campaigns/' + campaign.id, { method: 'PUT', body: JSON.stringify({ status }) }); setMessage('Campanha atualizada.'); await load(); }
    catch (err: any) { setError(err.message); }
  };

  const toggleSteps = async (campaign: any) => {
    try {
      const data = await api('/api/admin/lifecycle/campaigns/' + campaign.id + '/steps');
      setSteps({ ...steps, [campaign.id]: data.steps || [] }); setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id);
    } catch (err: any) { setError(err.message); }
  };

  const updateStep = async (step: any) => {
    try { await api('/api/admin/lifecycle/steps/' + step.id, { method: 'PUT', body: JSON.stringify({ status: step.status === 'active' ? 'draft' : 'active' }) }); setMessage('Passo atualizado.'); if (expandedCampaign) await toggleSteps({ id: expandedCampaign }); }
    catch (err: any) { setError(err.message); }
  };

  const updateRule = async (rule: any) => {
    try { await api('/api/admin/lifecycle/rules/' + rule.id, { method: 'PUT', body: JSON.stringify({ enabled: !rule.enabled }) }); setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item)); }
    catch (err: any) { setError(err.message); }
  };

  const userAction = async (user: any, action: 'pause' | 'resume' | 'recalculate' | 'enroll') => {
    try { await api('/api/admin/lifecycle/users/' + user.id + '/' + action, { method: 'POST', body: JSON.stringify({}) }); setMessage('Usuário atualizado.'); await load(); }
    catch (err: any) { setError(err.message); }
  };

  const saveRuntime = async () => {
    try { await api('/api/admin/lifecycle/settings', { method: 'PUT', body: JSON.stringify(runtime) }); setMessage('Configuração salva.'); await load(); }
    catch (err: any) { setError(err.message); }
  };

  const tabs: Array<[Tab, string]> = [['overview', 'Visão geral'], ['campaigns', 'Campanhas e passos'], ['rules', 'Regras condicionais'], ['users', 'Usuários'], ['queue', 'Fila e entregas'], ['preferences', 'Preferências'], ['settings', 'Configurações']];
  if (loading && !overview) return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin text-brand-primary" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-brand-text">Jornada de Usuários</h2><p className="text-sm text-brand-text-muted mt-1">Automação individual, dry-run, fila e métricas de relacionamento.</p></div><button onClick={() => void load()} className="btn-outline inline-flex items-center gap-2 self-start"><RefreshCw size={16} /> Atualizar</button></div>
    {error && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    {message && <div className="rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm flex items-center gap-2"><Check size={16} />{message}</div>}
    <div className="flex gap-2 overflow-x-auto border-b border-brand-border pb-2">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={'px-3 py-2 rounded-lg text-sm whitespace-nowrap ' + (tab === key ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:bg-brand-bg')}>{label}</button>)}</div>

    {tab === 'overview' && <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Matriculados', overview?.metrics?.enrolled], ['Ativos', overview?.metrics?.active], ['Na fila', overview?.metrics?.queued], ['Enviados', overview?.metrics?.sent], ['Concluídos', overview?.metrics?.completed], ['Falhas', overview?.metrics?.failed], ['Suprimidos', overview?.metrics?.suppressed], ['Cooldown', '24h']].map(([label, value]) => <div key={String(label)} className="bg-white border border-brand-border rounded-xl p-4"><span className="text-xs text-brand-text-muted block">{label}</span><strong className="text-2xl text-brand-text">{value ?? '—'}</strong></div>)}</div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Modo atual:</strong> {runtime.dry_run ? 'dry-run / observação' : runtime.send_enabled ? 'envio habilitado' : 'envio desabilitado'} — campanha e passos começam em draft.</div></div>}

    {tab === 'campaigns' && <div className="space-y-3">{campaigns.map((campaign) => <div key={campaign.id} className="bg-white border border-brand-border rounded-xl overflow-hidden"><div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-brand-text">{campaign.name}</h3><span className="text-xs px-2 py-1 rounded-full bg-brand-bg">{campaign.status}</span></div><p className="text-xs text-brand-text-muted mt-1">{campaign.key} · {campaign.campaign_type} · {campaign.enrollment_mode}</p></div><div className="flex gap-2"><button onClick={() => void toggleSteps(campaign)} className="btn-outline text-xs inline-flex items-center gap-1">{expandedCampaign === campaign.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Passos</button>{campaign.status === 'active' ? <button onClick={() => void updateCampaign(campaign, 'paused')} className="btn-outline text-xs inline-flex items-center gap-1"><CirclePause size={14} /> Pausar</button> : campaign.status !== 'archived' && <button onClick={() => void updateCampaign(campaign, 'active')} className="btn-primary text-xs inline-flex items-center gap-1"><CirclePlay size={14} /> Ativar</button>}</div></div>{expandedCampaign === campaign.id && <div className="border-t border-brand-border divide-y">{(steps[campaign.id] || []).map((step) => <div key={step.id} className="p-3 flex items-center justify-between gap-3"><div><span className="text-sm font-medium">{step.position}. {step.subject_template}</span><span className="block text-xs text-brand-text-muted">{step.step_key} · {step.status}</span></div><button onClick={() => void updateStep(step)} className="btn-outline text-xs">{step.status === 'active' ? 'Voltar para draft' : 'Validar e ativar'}</button></div>)}</div>}</div>)}</div>}

    {tab === 'rules' && <div className="bg-white border border-brand-border rounded-xl divide-y">{rules.map((rule) => <div key={rule.id} className="p-4 flex items-center justify-between gap-4"><div><strong className="text-sm text-brand-text">{rule.name}</strong><span className="block text-xs text-brand-text-muted">{rule.rule_key} · prioridade {rule.priority} · cooldown {rule.cooldown_hours}h</span></div><button onClick={() => void updateRule(rule)} className={'text-xs px-3 py-1.5 rounded-lg ' + (rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>{rule.enabled ? 'Ativa' : 'Desativada'}</button></div>)}</div>}

    {tab === 'users' && <div className="bg-white border border-brand-border rounded-xl overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Usuário</th><th className="p-3">Estágio</th><th className="p-3">Plano</th><th className="p-3">Jornada</th><th className="p-3">Ações</th></tr></thead><tbody className="divide-y">{users.map((user) => { const enrollment = user.enrollments?.[0]; return <tr key={user.id}><td className="p-3"><strong>{user.full_name || 'Profissional'}</strong><span className="block text-xs text-brand-text-muted">{user.google_email}</span></td><td className="p-3">{user.state?.activation_status || '—'}<span className="block text-xs text-brand-text-muted">Nível {user.state?.activation_level ?? 0}</span></td><td className="p-3">{user.subscription_plan || '—'} / {user.subscription_status || '—'}</td><td className="p-3">{enrollment?.status || 'não matriculado'}</td><td className="p-3"><div className="flex gap-1 flex-wrap"><button title="Recalcular" onClick={() => void userAction(user, 'recalculate')} className="btn-outline p-1.5"><RefreshCw size={14} /></button>{enrollment?.status === 'active' ? <button title="Pausar" onClick={() => void userAction(user, 'pause')} className="btn-outline p-1.5"><CirclePause size={14} /></button> : <button title="Matricular/retomar" onClick={() => void userAction(user, enrollment?.status === 'paused' ? 'resume' : 'enroll')} className="btn-outline p-1.5"><CirclePlay size={14} /></button>}</div></td></tr>; })}</tbody></table></div>}

    {tab === 'queue' && <div className="bg-white border border-brand-border rounded-xl overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Mensagem</th><th className="p-3">Status</th><th className="p-3">Agendada</th><th className="p-3">Tentativas</th><th className="p-3">Motivo</th></tr></thead><tbody className="divide-y">{deliveries.map((item) => <tr key={item.id}><td className="p-3">{item.message_key}<span className="block text-xs text-brand-text-muted">{item.dispatch_type}</span></td><td className="p-3">{item.status}</td><td className="p-3">{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString('pt-BR') : '—'}</td><td className="p-3">{item.attempt_count}/{item.max_attempts}</td><td className="p-3 max-w-xs truncate">{item.skip_reason || item.failure_reason || '—'}</td></tr>)}</tbody></table></div>}

    {tab === 'preferences' && <div className="bg-white border border-brand-border rounded-xl overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-brand-bg text-xs uppercase text-brand-text-muted"><tr><th className="p-3">Usuário</th><th className="p-3">Lifecycle</th><th className="p-3">Educativo</th><th className="p-3">Comercial</th><th className="p-3">Atualizado</th></tr></thead><tbody className="divide-y">{preferences.map((item) => <tr key={item.user_id}><td className="p-3">{item.user_id}</td><td className="p-3">{item.lifecycle_enabled ? 'Ativo' : 'Descadastrado'}</td><td className="p-3">{item.product_education_enabled ? 'Sim' : 'Não'}</td><td className="p-3">{item.commercial_enabled ? 'Sim' : 'Não'}</td><td className="p-3">{item.updated_at ? new Date(item.updated_at).toLocaleString('pt-BR') : '—'}</td></tr>)}</tbody></table></div>}

    {tab === 'settings' && <div className="max-w-xl bg-white border border-brand-border rounded-xl p-5 space-y-5"><div className="flex items-center gap-2"><Settings size={18} className="text-brand-primary" /><h3 className="font-semibold">Configurações de rollout</h3></div><label className="flex items-center justify-between gap-4"><span><strong className="block">Dry-run / observação</strong><small className="text-brand-text-muted">Calcula decisões, mas não entrega e-mails.</small></span><input type="checkbox" className="h-5 w-5 accent-brand-primary" checked={runtime.dry_run} onChange={(event) => setRuntime({ ...runtime, dry_run: event.target.checked })} /></label><label className="flex items-center justify-between gap-4"><span><strong className="block">Permitir envio real</strong><small className="text-brand-text-muted">Exige campanha e passos ativos.</small></span><input type="checkbox" className="h-5 w-5 accent-brand-primary" checked={runtime.send_enabled} onChange={(event) => setRuntime({ ...runtime, send_enabled: event.target.checked })} /></label><label className="block"><span className="text-sm font-semibold">Batch do worker</span><input type="number" min={1} max={100} value={runtime.max_batch_size} onChange={(event) => setRuntime({ ...runtime, max_batch_size: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-brand-border px-3 py-2" /></label><button onClick={() => void saveRuntime()} className="btn-primary inline-flex items-center gap-2"><Save size={16} /> Salvar configuração</button><p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">Ative o envio somente após validar links, planos, templates, preferências e uma coorte interna.</p></div>}
  </div>;
}
