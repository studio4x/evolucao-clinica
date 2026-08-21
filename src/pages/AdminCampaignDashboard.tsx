import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Filter,
  Loader2,
  MessageCircleReply,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  UserRoundCheck
} from 'lucide-react';
import { supabase } from '../supabaseClient';

type VariantMetric = {
  variant: 'A' | 'B';
  template: string;
  planned: number;
  processed: number;
  delivered: number;
  pending_meta: number;
  failures: number;
  responses: number;
  interested: number;
  no_interest: number;
  group_members: number;
  delivery_rate: number;
  response_rate: number;
  interest_rate: number;
  response_to_interest_rate: number;
  maturity: string;
};

type DashboardContact = {
  source_row: number;
  name: string;
  phone_masked: string;
  confidence: string;
  group_count: number;
  variant: 'A' | 'B';
  template: string;
  dispatch_status: string;
  meta_status: string;
  response: string;
  label: string;
  current_group_status: string;
  sent_at: string;
  response_at: string;
  attempts: number;
  status_category: string;
};

type DashboardPayload = {
  ok: boolean;
  error?: string;
  round?: number;
  phase?: string;
  scope?: string;
  read_only?: boolean;
  workflow?: string;
  updated_at?: string;
  sample_size?: number;
  overall?: {
    planned: number;
    processed: number;
    delivered: number;
    pending_meta: number;
    failures: number;
    responses: number;
    interested: number;
    no_interest: number;
    group_members: number;
    delivery_rate: number;
    response_rate: number;
    interest_rate: number;
    response_to_interest_rate: number;
  };
  variants?: {
    A: VariantMetric;
    B: VariantMetric;
  };
  funnel?: Array<{
    key: string;
    label: string;
    value: number;
  }>;
  decision?: {
    final: boolean;
    text: string;
    sample_status: string;
    reason: string;
  };
  maturation?: {
    window_hours: number;
    last_send_at: string;
    closes_at: string;
    mature: boolean;
    remaining_minutes: number;
  };
  contacts?: DashboardContact[];
};

const errorLabels: Record<string, string> = {
  authentication_required: 'Sua sessão não foi encontrada. Faça login novamente.',
  invalid_session: 'Sua sessão expirou. Faça login novamente.',
  admin_only: 'Esta página é restrita a administradores.',
  admin_validation_failed: 'Não foi possível validar a permissão administrativa.',
  server_configuration_missing: 'Configuração server-side indisponível.',
  dispatch_integration_not_configured: 'A integração server-side com o n8n ainda não foi configurada.',
  unsupported_round: 'Esta versão do dashboard está disponível somente para a Rodada 2.',
  n8n_dashboard_rejected: 'O n8n recusou a consulta do dashboard.',
  n8n_dashboard_timeout: 'A consulta do dashboard demorou além do esperado.',
  n8n_dashboard_unavailable: 'Não foi possível consultar os dados do dashboard neste momento.',
  round2_data_incomplete: 'Os dados da Rodada 2 ainda não estão completos na fonte.'
};

const templateLabels: Record<string, string> = {
  convite_jornada_ec_15dias_v1: 'A — Jornada 15 dias',
  convite_jornada_ec_organizacao_v2: 'B — Organização v2'
};

const formatPercent = (value: number | undefined) =>
  `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
};

const formatRemaining = (minutes: number) => {
  if (minutes <= 0) return 'Janela concluída';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days}d ${restHours}h`;
  }
  return `${hours}h ${mins}min`;
};

const statusLabel = (status: string) => {
  const labels: Record<string, string> = {
    ENTREGUE: 'Entregue',
    AGUARDANDO_META: 'Aguardando Meta',
    FALHA: 'Falha',
    INTERESSADO: 'Interessado',
    SEM_INTERESSE: 'Sem interesse',
    MEMBRO: 'No grupo',
    ENVIADO: 'Enviado',
    PENDENTE: 'Pendente'
  };
  return labels[status] || status || '—';
};

const statusBadgeClass = (status: string) => {
  if (status === 'MEMBRO' || status === 'INTERESSADO' || status === 'ENTREGUE') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'FALHA') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (status === 'AGUARDANDO_META') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (status === 'SEM_INTERESSE') {
    return 'border-slate-200 bg-slate-100 text-slate-700';
  }
  return 'border-brand-border bg-brand-bg text-brand-text-muted';
};

function MetricCard({
  label,
  value,
  helper,
  icon
}: {
  label: string;
  value: number;
  helper?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-text-muted">{label}</p>
        <span className="text-brand-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-display font-bold text-brand-text">{value}</p>
      {helper ? <p className="mt-1 text-xs text-brand-text-muted">{helper}</p> : null}
    </div>
  );
}

function VariantCard({ metric }: { metric: VariantMetric }) {
  const isA = metric.variant === 'A';
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${isA ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {metric.variant}
          </span>
          <div>
            <h3 className="font-display text-lg font-bold text-brand-text">Variante {metric.variant}</h3>
            <p className="text-xs text-brand-text-muted">{templateLabels[metric.template] || metric.template}</p>
          </div>
        </div>
        <span className="self-start rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">
          {metric.maturity || 'AMOSTRA'}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Processados', metric.processed],
          ['Entregues', metric.delivered],
          ['Respostas', metric.responses],
          ['Interessados', metric.interested],
          ['No grupo', metric.group_members]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-brand-bg p-3">
            <p className="text-xs text-brand-text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold text-brand-text">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-brand-border p-3"><p className="text-xs text-brand-text-muted">Taxa de entrega</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(metric.delivery_rate)}</p></div>
        <div className="rounded-2xl border border-brand-border p-3"><p className="text-xs text-brand-text-muted">Resposta / entregues</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(metric.response_rate)}</p></div>
        <div className="rounded-2xl border border-brand-border p-3"><p className="text-xs text-brand-text-muted">Interesse / entregues</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(metric.interest_rate)}</p></div>
        <div className="rounded-2xl border border-brand-border p-3"><p className="text-xs text-brand-text-muted">Interesse / respostas</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(metric.response_to_interest_rate)}</p></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">Sem confirmação Meta: {metric.pending_meta}</span>
        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-semibold text-red-800">Falhas: {metric.failures}</span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 font-semibold text-slate-700">Sem interesse: {metric.no_interest}</span>
      </div>
    </section>
  );
}

export default function AdminCampaignDashboard() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [variantFilter, setVariantFilter] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!mounted) return;
      const session = sessionData.session;
      if (!session?.access_token) {
        window.location.assign('/login');
        return;
      }
      setAccessToken(session.access_token);
      setAuthLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const loadDashboard = async (silent = false) => {
    if (!accessToken) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch('/api/admin/campaign-dashboard?round=2', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DashboardPayload;
      if (!response.ok || !body.ok) {
        setErrorMessage(errorLabels[String(body.error || '')] || 'Não foi possível carregar o dashboard agora.');
        return;
      }
      setData(body);
      setErrorMessage('');
    } catch (error) {
      console.error('[AdminCampaignDashboard] Falha ao carregar dashboard:', error);
      setErrorMessage('Falha de comunicação ao atualizar o dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    void loadDashboard(false);
    const timer = window.setInterval(() => void loadDashboard(true), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken]);

  const filteredContacts = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return (data?.contacts || []).filter(contact => {
      if (variantFilter !== 'ALL' && contact.variant !== variantFilter) return false;
      if (statusFilter !== 'ALL' && contact.status_category !== statusFilter) return false;
      if (!term) return true;
      return contact.name.toLocaleLowerCase('pt-BR').includes(term) || String(contact.source_row).includes(term) || contact.phone_masked.toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [data?.contacts, searchTerm, statusFilter, variantFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-brand-border bg-white px-5 py-4 shadow-sm text-sm text-brand-text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          Validando sessão administrativa...
        </div>
      </div>
    );
  }

  const overall = data?.overall;
  const variants = data?.variants;
  const funnelBase = Math.max(1, Number(overall?.processed || 0));

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <a href="/admin/jornada" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Voltar para Jornada 15 dias
            </a>
            <h1 className="text-2xl font-display font-bold text-brand-primary md:text-3xl">Dashboard de Captação</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">Rodada 2 • Fase 1 • Psicologia e Saúde Mental. Esta primeira versão é somente leitura e não mistura dados de outras rodadas.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/captacao-disparos" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm hover:bg-brand-bg">
              <Send className="h-4 w-4" /> Central de Disparos
            </a>
            <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4" /> Somente leitura
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-bold">Não foi possível atualizar os dados.</p><p className="mt-1">{errorMessage}</p></div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm">
            <div className="flex items-center gap-3 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Lendo a Rodada 2 pelo n8n...</div>
          </div>
        ) : null}

        {data && overall && variants ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 2 — visão geral</h2></div>
                  <p className="mt-1 text-xs text-brand-text-muted">Fonte: Dashboard + Rodada 2 - Controle + aba de origem, consultadas pelo workflow {data.workflow || 'n8n'}.</p>
                </div>
                <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Atualização automática a cada 60 s</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="Processados" value={overall.processed} helper={`${overall.planned} planejados`} icon={<Activity className="h-5 w-5" />} />
                <MetricCard label="Entregues" value={overall.delivered} helper={`${formatPercent(overall.delivery_rate)} de entrega`} icon={<CheckCircle2 className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos entregues`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos entregues`} icon={<UserRoundCheck className="h-5 w-5" />} />
                <MetricCard label="No grupo agora" value={overall.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Sem confirmação Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{overall.pending_meta}</p></div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">Falhas</p><p className="mt-1 text-2xl font-bold text-red-900">{overall.failures}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{overall.no_interest}</p></div>
              </div>
            </section>

            <section className={`rounded-3xl border p-5 shadow-sm ${data.maturation?.mature ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <Clock3 className={`mt-0.5 h-5 w-5 shrink-0 ${data.maturation?.mature ? 'text-emerald-700' : 'text-amber-700'}`} />
                  <div>
                    <h2 className={`font-display font-bold ${data.maturation?.mature ? 'text-emerald-900' : 'text-amber-900'}`}>{data.maturation?.mature ? 'Janela de maturação concluída' : 'Análise A/B ainda em maturação'}</h2>
                    <p className={`mt-1 text-sm ${data.maturation?.mature ? 'text-emerald-800' : 'text-amber-800'}`}>{data.decision?.reason || 'Aguardar 48 horas após o último envio antes da decisão final.'}</p>
                    {data.decision?.text ? <p className="mt-2 text-xs font-semibold text-brand-text-muted">Dashboard atual: {data.decision.text}</p> : null}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm shadow-sm"><p className="text-xs text-brand-text-muted">Fechamento da janela</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.maturation?.closes_at)}</p><p className="mt-1 text-xs font-semibold text-brand-primary">{formatRemaining(Number(data.maturation?.remaining_minutes || 0))}</p></div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Comparativo A × B</h2></div>
              <div className="grid gap-4 xl:grid-cols-2"><VariantCard metric={variants.A} /><VariantCard metric={variants.B} /></div>
            </section>

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brand-primary"><Activity className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Funil da Rodada 2</h2></div>
              <p className="mt-1 text-xs text-brand-text-muted">O último estágio representa presença atual no grupo e não atribuição causal ao template.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-5">
                {(data.funnel || []).map((step, index) => {
                  const percent = Math.min(100, Math.max(0, Math.round((Number(step.value || 0) / funnelBase) * 100)));
                  return (
                    <div key={step.key} className="relative rounded-2xl border border-brand-border p-4">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-brand-text-muted">{index + 1}</span><span className="text-xs font-semibold text-brand-primary">{percent}%</span></div>
                      <p className="mt-3 text-sm font-bold text-brand-text">{step.label}</p><p className="mt-1 text-2xl font-display font-bold text-brand-primary">{step.value}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${percent}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-brand-primary"><FileSpreadsheet className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Contatos da Rodada 2</h2></div>
                  <p className="mt-1 text-xs text-brand-text-muted">{filteredContacts.length} de {data.sample_size || 0} contatos • telefone mascarado • nenhuma ação de escrita disponível.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label><span className="sr-only">Buscar</span><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nome ou linha" className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-sm outline-none focus:border-brand-primary sm:w-48" /></label>
                  <label><span className="sr-only">Filtrar variante</span><select value={variantFilter} onChange={event => setVariantFilter(event.target.value as 'ALL' | 'A' | 'B')} className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold text-brand-text outline-none focus:border-brand-primary"><option value="ALL">Todas variantes</option><option value="A">Variante A</option><option value="B">Variante B</option></select></label>
                  <label><span className="sr-only">Filtrar status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold text-brand-text outline-none focus:border-brand-primary"><option value="ALL">Todos status</option><option value="ENTREGUE">Entregue</option><option value="AGUARDANDO_META">Aguardando Meta</option><option value="FALHA">Falha</option><option value="INTERESSADO">Interessado</option><option value="SEM_INTERESSE">Sem interesse</option><option value="MEMBRO">No grupo</option></select></label>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-brand-border">
                <table className="min-w-full divide-y divide-brand-border text-left text-sm">
                  <thead className="bg-brand-bg"><tr className="text-xs uppercase tracking-wide text-brand-text-muted"><th className="px-4 py-3 font-bold">Linha</th><th className="px-4 py-3 font-bold">Contato</th><th className="px-4 py-3 font-bold">Variante</th><th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold">Meta</th><th className="px-4 py-3 font-bold">Resposta</th><th className="px-4 py-3 font-bold">Grupo</th><th className="px-4 py-3 font-bold">Enviado em</th></tr></thead>
                  <tbody className="divide-y divide-brand-border bg-white">
                    {filteredContacts.map(contact => (
                      <tr key={`${contact.variant}-${contact.source_row}`} className="align-top hover:bg-brand-bg/60">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand-text-muted">{contact.source_row}</td>
                        <td className="min-w-52 px-4 py-3"><p className="font-semibold text-brand-text">{contact.name || 'Sem nome'}</p><p className="mt-0.5 text-xs text-brand-text-muted">{contact.phone_masked || '—'}</p></td>
                        <td className="whitespace-nowrap px-4 py-3"><span className="inline-flex rounded-lg bg-brand-bg px-2 py-1 text-xs font-bold text-brand-primary">{contact.variant}</span></td>
                        <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadgeClass(contact.status_category)}`}>{statusLabel(contact.status_category)}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-brand-text-muted">{contact.meta_status || '—'}</td>
                        <td className="max-w-56 px-4 py-3 text-xs text-brand-text">{contact.response || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-brand-text-muted">{contact.current_group_status || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-text-muted">{formatDateTime(contact.sent_at)}</td>
                      </tr>
                    ))}
                    {!filteredContacts.length ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-brand-text-muted"><Filter className="mx-auto mb-2 h-5 w-5" />Nenhum contato corresponde aos filtros atuais.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="flex flex-col gap-2 pb-4 text-xs text-brand-text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>Rodada 2 isolada para validação. Rodadas 1, 3 e futuras ainda não participam destes números.</span>
              <span className="inline-flex items-center gap-1.5 font-semibold">{refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualização a cada 60 s</span>
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
