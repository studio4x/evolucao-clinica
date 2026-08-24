import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  MessageCircleReply,
  RefreshCw,
  Send,
  ShieldCheck,
  Trophy,
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

type FollowupVariantMetric = {
  template: string;
  sent: number;
  entered_group: number;
  conversion_rate: number;
};

type FollowupQueue = {
  no_response: number;
  group_reminder: number;
  no_registration: number;
  total: number;
  due_total: number;
  waiting_deadline: number;
  due_no_response: number;
  due_group_reminder: number;
  due_no_registration: number;
};

type FollowupPayload = {
  available: boolean;
  scope: string;
  queue: FollowupQueue;
  sent?: {
    no_response: number;
    group_reminder: number;
    no_registration: number;
    pre_group_unique: number;
  };
  conversion: {
    entered_after_no_response: number;
    entered_after_group_reminder: number;
    entered_after_any: number;
    conversion_rate: number;
    received_pre_group?: number;
    current_members?: number;
    direct_entries?: number;
  };
  ab?: {
    no_response: {
      A: FollowupVariantMetric;
      B: FollowupVariantMetric;
    };
    group_reminder: {
      A: FollowupVariantMetric;
      B: FollowupVariantMetric;
    };
    registration: {
      template: string;
      sent: number;
    };
  };
};

type Round1Area = {
  name: string;
  sent: number;
  responses: number;
  interested: number;
  no_interest: number;
  response_rate: number;
  interest_rate: number;
  response_to_interest_rate: number;
  current_group_members: number;
};

type Round1Member = {
  name: string;
  area: string;
  template: string;
};

type SourceSheet = {
  name: string;
  url: string;
};

type DashboardPayload = {
  ok: boolean;
  error?: string;
  round?: 1 | 2;
  phase?: string;
  scope?: string;
  read_only?: boolean;
  workflow?: string;
  updated_at?: string;
  sample_size?: number;
  contacts_sheet_url?: string;
  overall?: {
    planned?: number;
    processed?: number;
    delivered?: number;
    pending_meta?: number;
    failures?: number;
    responses: number;
    interested: number;
    no_interest: number;
    group_members: number;
    delivery_rate?: number;
    response_rate: number;
    interest_rate: number;
    response_to_interest_rate: number;
    sent?: number;
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
    status?: string;
    winner?: string;
    winner_template?: string;
    closed_at_label?: string;
    criterion?: string;
    reason?: string;
  };
  followups?: FollowupPayload;
  areas?: Round1Area[];
  group_members?: Round1Member[];
  source_sheets?: SourceSheet[];
};

const errorLabels: Record<string, string> = {
  authentication_required: 'Sua sessão não foi encontrada. Faça login novamente.',
  invalid_session: 'Sua sessão expirou. Faça login novamente.',
  admin_only: 'Esta página é restrita a administradores.',
  admin_validation_failed: 'Não foi possível validar a permissão administrativa.',
  server_configuration_missing: 'Configuração server-side indisponível.',
  dispatch_integration_not_configured: 'A integração server-side com o n8n ainda não foi configurada.',
  unsupported_round: 'A rodada solicitada ainda não está disponível neste dashboard.',
  n8n_dashboard_rejected: 'O n8n recusou a consulta do dashboard.',
  n8n_dashboard_timeout: 'A consulta do dashboard demorou além do esperado.',
  n8n_dashboard_unavailable: 'Não foi possível consultar os dados do dashboard neste momento.',
  round1_data_incomplete: 'Os dados da Rodada 1 ainda não estão completos na fonte.',
  round2_data_incomplete: 'Os dados da Rodada 2 ainda não estão completos na fonte.'
};

const templateLabels: Record<string, string> = {
  convite_jornada_ec_15dias_v1: 'Jornada 15 dias',
  convite_jornada_ec_app_v1: 'App v1',
  convite_jornada_ec_organizacao_v2: 'Organização v2',
  convite_jornada_evolucao_clinica: 'Evolução Clínica',
  followup_jornada_sem_resposta_v1: 'Sem resposta v1',
  followup_jornada_sem_resposta_v2: 'Sem resposta v2',
  followup_jornada_lembrete_grupo_v1: 'Lembrete de grupo v1',
  followup_jornada_lembrete_grupo_v2: 'Lembrete de grupo v2',
  followup_jornada_sem_cadastro_v1: 'Sem cadastro v1'
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

function VariantCard({
  metric,
  winner
}: {
  metric: VariantMetric;
  winner?: string;
}) {
  const isA = metric.variant === 'A';
  const isWinner = winner === metric.variant;

  return (
    <section className={`rounded-3xl border bg-white p-5 shadow-sm ${isWinner ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-brand-border'}`}>
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
        {isWinner ? (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            <Trophy className="h-3.5 w-3.5" /> Vencedora
          </span>
        ) : (
          <span className="self-start rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">
            {metric.maturity || 'AMOSTRA'}
          </span>
        )}
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

function FollowupABCard({
  title,
  A,
  B
}: {
  title: string;
  A: FollowupVariantMetric;
  B: FollowupVariantMetric;
}) {
  const totalSent = Number(A.sent || 0) + Number(B.sent || 0);

  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-brand-text">{title}</h3>
          <p className="mt-1 text-xs text-brand-text-muted">Comparação por template persistido no workflow.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${totalSent >= 20 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {totalSent >= 20 ? 'Em análise' : 'Amostra inicial'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ['A', A],
          ['B', B]
        ].map(([variant, metric]) => {
          const item = metric as FollowupVariantMetric;
          return (
            <div key={String(variant)} className="rounded-xl bg-brand-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-brand-primary">Variante {variant}</span>
                <span className="text-[11px] text-brand-text-muted">{templateLabels[item.template] || item.template || '—'}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[11px] text-brand-text-muted">Enviados</p><p className="mt-1 text-lg font-bold text-brand-text">{item.sent}</p></div>
                <div><p className="text-[11px] text-brand-text-muted">Entraram</p><p className="mt-1 text-lg font-bold text-brand-text">{item.entered_group}</p></div>
                <div><p className="text-[11px] text-brand-text-muted">Conversão</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(item.conversion_rate)}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FollowupQueueCards({ followups }: { followups: FollowupPayload }) {
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Fila total" value={followups.queue.total} helper={`${followups.queue.no_response} sem resposta`} icon={<MessageCircleReply className="h-5 w-5" />} />
        <MetricCard label="Prazo atingido" value={followups.queue.due_total} helper="Elegíveis pelo prazo" icon={<AlertTriangle className="h-5 w-5" />} />
        <MetricCard label="Aguardando prazo" value={followups.queue.waiting_deadline} helper="Ainda não elegíveis" icon={<Activity className="h-5 w-5" />} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">SEM RESPOSTA</p><p className="mt-2 text-2xl font-bold text-brand-text">{followups.queue.no_response}</p><p className="mt-1 text-xs text-brand-text-muted">{followups.queue.due_no_response} com prazo atingido</p></div>
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">LEMBRETE DE GRUPO</p><p className="mt-2 text-2xl font-bold text-brand-text">{followups.queue.group_reminder}</p><p className="mt-1 text-xs text-brand-text-muted">{followups.queue.due_group_reminder} com prazo atingido</p></div>
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">SEM CADASTRO</p><p className="mt-2 text-2xl font-bold text-brand-text">{followups.queue.no_registration}</p><p className="mt-1 text-xs text-brand-text-muted">{followups.queue.due_no_registration} com prazo atingido</p></div>
      </div>
    </>
  );
}

export default function AdminCampaignDashboard() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [selectedRound, setSelectedRound] = useState<1 | 2>(2);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const loadDashboard = async (round: 1 | 2, silent = false) => {
    if (!accessToken) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(`/api/admin/campaign-dashboard?round=${round}`, {
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
    setData(null);
    setErrorMessage('');
    void loadDashboard(selectedRound, false);
    const timer = window.setInterval(() => void loadDashboard(selectedRound, true), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, selectedRound]);

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

  const isRound1 = selectedRound === 1;
  const overall = data?.overall;
  const variants = data?.variants;
  const decision = data?.decision;
  const followups = data?.followups;

  const round1Sent = Number(overall?.sent || 0);
  const round1Responses = Number(overall?.responses || 0);
  const round1Interested = Number(overall?.interested || 0);
  const round1NoInterest = Number(overall?.no_interest || 0);
  const round1GroupMembers = Number(overall?.group_members || 0);

  const funnelBase = Math.max(1, Number(overall?.processed || 0));
  const contactsSheetUrl = data?.contacts_sheet_url || 'https://docs.google.com/spreadsheets/d/1PwouSDq1gi0588hlfzo2jCeoCwZ79z4IAxEm3w2thJg/edit#gid=1007370751';

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <a href="/admin/jornada" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Voltar para Jornada 15 dias
            </a>
            <h1 className="text-2xl font-display font-bold text-brand-primary md:text-3xl">Dashboard de Captação</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">
              {isRound1
                ? 'Rodada 1 • Terapia Ocupacional + Enfermagem - Home Care. Histórico de envios, follow-ups e presença atual no grupo.'
                : 'Rodada 2 • Fase 1 • Psicologia e Saúde Mental. Métricas consolidadas da amostra e dos follow-ups.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/captacao-disparos" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm hover:bg-brand-bg">
              <Send className="h-4 w-4" /> Central de Disparos
            </a>
            <button type="button" onClick={() => void loadDashboard(selectedRound, true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4" /> Somente leitura
            </div>
          </div>
        </header>

        <div className="inline-flex rounded-2xl border border-brand-border bg-white p-1 shadow-sm">
          <button type="button" onClick={() => setSelectedRound(1)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${selectedRound === 1 ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}>Rodada 1</button>
          <button type="button" onClick={() => setSelectedRound(2)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${selectedRound === 2 ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}>Rodada 2</button>
        </div>

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-bold">Não foi possível atualizar os dados.</p><p className="mt-1">{errorMessage}</p></div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm">
            <div className="flex items-center gap-3 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Lendo a Rodada {selectedRound} pelo n8n...</div>
          </div>
        ) : null}

        {data && isRound1 && overall ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 1 — visão geral</h2></div>
                  <p className="mt-1 text-xs text-brand-text-muted">Fonte: Terapia Ocupacional + Enfermagem - Home Care + Dados Follow-up. Presença no grupo usa o status atual MEMBRO.</p>
                </div>
                <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Workflow {data.workflow || 'n8n'}</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="Envios registrados" value={round1Sent} helper="Rodada 1" icon={<Send className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={round1Responses} helper={`${formatPercent(overall.response_rate)} dos envios`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={round1Interested} helper={`${formatPercent(overall.interest_rate)} dos envios`} icon={<UserRoundCheck className="h-5 w-5" />} />
                <MetricCard label="Sem interesse" value={round1NoInterest} helper="Respostas negativas" icon={<AlertTriangle className="h-5 w-5" />} />
                <MetricCard label="No grupo agora" value={round1GroupMembers} helper="Status atual MEMBRO" icon={<Users className="h-5 w-5" />} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs text-brand-text-muted">Taxa de resposta</p><p className="mt-1 text-xl font-bold text-brand-primary">{formatPercent(overall.response_rate)}</p></div>
                <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs text-brand-text-muted">Taxa de interesse</p><p className="mt-1 text-xl font-bold text-brand-primary">{formatPercent(overall.interest_rate)}</p></div>
                <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs text-brand-text-muted">Interesse entre respostas</p><p className="mt-1 text-xl font-bold text-brand-primary">{formatPercent(overall.response_to_interest_rate)}</p></div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Desempenho por área — Rodada 1</h2></div>
              <div className="grid gap-4 lg:grid-cols-2">
                {(data.areas || []).map(area => (
                  <div key={area.name} className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="font-display text-lg font-bold text-brand-text">{area.name}</h3><p className="mt-1 text-xs text-brand-text-muted">Coorte histórica da Rodada 1</p></div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{area.current_group_members} no grupo</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">Envios</p><p className="mt-1 text-xl font-bold text-brand-text">{area.sent}</p></div>
                      <div className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">Respostas</p><p className="mt-1 text-xl font-bold text-brand-text">{area.responses}</p></div>
                      <div className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">Interessados</p><p className="mt-1 text-xl font-bold text-brand-text">{area.interested}</p></div>
                      <div className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">Sem interesse</p><p className="mt-1 text-xl font-bold text-brand-text">{area.no_interest}</p></div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-brand-text-muted">Resposta</p><p className="mt-1 font-bold text-brand-primary">{formatPercent(area.response_rate)}</p></div>
                      <div><p className="text-xs text-brand-text-muted">Interesse</p><p className="mt-1 font-bold text-brand-primary">{formatPercent(area.interest_rate)}</p></div>
                      <div><p className="text-xs text-brand-text-muted">Interesse / respostas</p><p className="mt-1 font-bold text-brand-primary">{formatPercent(area.response_to_interest_rate)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {followups?.available ? (
              <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-brand-primary"><MessageCircleReply className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Follow-ups — Rodada 1</h2></div>
                    <p className="mt-1 text-xs text-brand-text-muted">Somente os contatos que compõem a Rodada 1. Conversão para grupo é atribuída quando a confirmação de membro ocorre após o follow-up.</p>
                  </div>
                  <span className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">{followups.scope}</span>
                </div>

                <FollowupQueueCards followups={followups} />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Follow-up sem resposta" value={Number(followups.sent?.no_response || 0)} helper="Enviados" icon={<Send className="h-5 w-5" />} />
                  <MetricCard label="Lembrete de grupo" value={Number(followups.sent?.group_reminder || 0)} helper="Enviados" icon={<Users className="h-5 w-5" />} />
                  <MetricCard label="Sem cadastro" value={Number(followups.sent?.no_registration || 0)} helper="Enviados" icon={<UserRoundCheck className="h-5 w-5" />} />
                  <MetricCard label="Entraram após follow-up" value={followups.conversion.entered_after_any} helper={`${formatPercent(followups.conversion.conversion_rate)} dos pré-grupo`} icon={<CheckCircle2 className="h-5 w-5" />} />
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-brand-primary"><Users className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Leads da Rodada 1 atualmente no grupo</h2></div>
                  <p className="mt-1 text-xs text-brand-text-muted">{(data.group_members || []).length} leads com status atual MEMBRO. A lista muda automaticamente com a sincronização do grupo.</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{round1GroupMembers} membros</span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(data.group_members || []).map((member, index) => (
                  <div key={`${member.area}-${member.name}-${index}`} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-800">{member.name.slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-brand-text">{member.name}</p>
                        <p className="mt-1 text-xs text-brand-text-muted">{member.area || 'Rodada 1'}</p>
                        <p className="mt-1 truncate text-[11px] text-brand-primary">{templateLabels[member.template] || member.template || 'Template não identificado'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" />
                  <div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 1</h2><p className="mt-1 text-sm text-brand-text-muted">A base completa continua nas duas abas de origem do Google Sheets. O dashboard mantém apenas métricas e membros atuais.</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.source_sheets || []).map(sheet => (
                    <a key={sheet.name} href={sheet.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-bold text-brand-primary shadow-sm hover:bg-brand-bg">
                      <ExternalLink className="h-4 w-4" /> {sheet.name}
                    </a>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {data && !isRound1 && overall && variants ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 2 — visão geral</h2></div>
                  <p className="mt-1 text-xs text-brand-text-muted">Fonte: Dashboard + Config Automação + Dados Follow-up, consultados pelo workflow {data.workflow || 'n8n'}.</p>
                </div>
                <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Atualização automática a cada 60 s</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="Processados" value={Number(overall.processed || 0)} helper={`${Number(overall.planned || 0)} planejados`} icon={<Activity className="h-5 w-5" />} />
                <MetricCard label="Entregues" value={Number(overall.delivered || 0)} helper={`${formatPercent(overall.delivery_rate)} de entrega`} icon={<CheckCircle2 className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos entregues`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos entregues`} icon={<UserRoundCheck className="h-5 w-5" />} />
                <MetricCard label="No grupo agora" value={overall.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Sem confirmação Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{Number(overall.pending_meta || 0)}</p></div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">Falhas</p><p className="mt-1 text-2xl font-bold text-red-900">{Number(overall.failures || 0)}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{overall.no_interest}</p></div>
              </div>
            </section>

            <section className={`rounded-3xl border p-5 shadow-sm ${decision?.final ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <Trophy className={`mt-0.5 h-6 w-6 shrink-0 ${decision?.final ? 'text-emerald-700' : 'text-amber-700'}`} />
                  <div>
                    <h2 className={`font-display text-lg font-bold ${decision?.final ? 'text-emerald-900' : 'text-amber-900'}`}>{decision?.final ? `Fase 1 encerrada — Variante ${decision.winner || '—'} vencedora` : 'Fase 1 ainda em análise'}</h2>
                    {decision?.winner_template ? <p className="mt-1 text-sm font-semibold text-emerald-800">{templateLabels[decision.winner_template] || decision.winner_template}</p> : null}
                    <p className={`mt-2 text-sm ${decision?.final ? 'text-emerald-800' : 'text-amber-800'}`}>{decision?.reason || 'Aguardando encerramento da janela de análise.'}</p>
                  </div>
                </div>
                <div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm"><p className="text-brand-text-muted">Critério de fechamento</p><p className="mt-1 font-bold text-brand-text">{decision?.criterion || '—'}</p><p className="mt-3 text-brand-text-muted">Encerrada em</p><p className="mt-1 font-bold text-brand-text">{decision?.closed_at_label || '—'}</p></div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Comparativo A × B</h2></div>
              <div className="grid gap-4 xl:grid-cols-2"><VariantCard metric={variants.A} winner={decision?.final ? decision.winner : undefined} /><VariantCard metric={variants.B} winner={decision?.final ? decision.winner : undefined} /></div>
            </section>

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brand-primary"><Activity className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Funil da Rodada 2</h2></div>
              <p className="mt-1 text-xs text-brand-text-muted">O último estágio representa presença atual no grupo e não atribuição causal ao template.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-5">
                {(data.funnel || []).map((step, index) => {
                  const percent = Math.min(100, Math.max(0, Math.round((Number(step.value || 0) / funnelBase) * 100)));
                  return <div key={step.key} className="relative rounded-2xl border border-brand-border p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-brand-text-muted">{index + 1}</span><span className="text-xs font-semibold text-brand-primary">{percent}%</span></div><p className="mt-3 text-sm font-bold text-brand-text">{step.label}</p><p className="mt-1 text-2xl font-display font-bold text-brand-primary">{step.value}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${percent}%` }} /></div></div>;
                })}
              </div>
            </section>

            {followups?.available ? (
              <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-brand-primary"><MessageCircleReply className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Follow-ups — Rodada 2</h2></div><p className="mt-1 text-xs text-brand-text-muted">Métricas calculadas apenas sobre os 100 contatos da Fase 1. Conversão para grupo é atribuída quando a confirmação de membro ocorre após o envio do follow-up.</p></div><span className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">{followups.scope || 'Rodada 2 • Fase 1'}</span></div>
                <FollowupQueueCards followups={followups} />
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><MetricCard label="Receberam pré-grupo" value={Number(followups.conversion.received_pre_group || 0)} helper="Sem resposta ou grupo" icon={<Send className="h-5 w-5" />} /><MetricCard label="Entraram após follow-up" value={followups.conversion.entered_after_any} helper={`${Number(followups.conversion.current_members || 0)} membros atuais`} icon={<Users className="h-5 w-5" />} /><MetricCard label="Conversão → grupo" value={Number(followups.conversion.conversion_rate || 0)} helper="Percentual" icon={<UserRoundCheck className="h-5 w-5" />} /></div>
                {followups.ab ? <div className="mt-5"><h3 className="font-display text-base font-bold text-brand-primary">A/B dos follow-ups</h3><p className="mt-1 text-xs text-brand-text-muted">As variantes são analisadas separadamente. Enquanto a amostra for pequena, o dashboard apenas registra os números e não declara vencedor.</p><div className="mt-3 grid gap-4 xl:grid-cols-2"><FollowupABCard title="Sem resposta" A={followups.ab.no_response.A} B={followups.ab.no_response.B} /><FollowupABCard title="Lembrete de grupo" A={followups.ab.group_reminder.A} B={followups.ab.group_reminder.B} /></div><div className="mt-4 rounded-2xl border border-brand-border bg-brand-bg p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-brand-text-muted">FOLLOW-UP SEM CADASTRO</p><p className="mt-1 text-sm font-semibold text-brand-text">{templateLabels[followups.ab.registration.template] || followups.ab.registration.template || '—'}</p></div><div className="text-left sm:text-right"><p className="text-xs text-brand-text-muted">Enviados</p><p className="mt-1 text-2xl font-bold text-brand-primary">{followups.ab.registration.sent}</p></div></div></div></div> : null}
              </section>
            ) : null}

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 2</h2><p className="mt-1 text-sm text-brand-text-muted">A listagem completa permanece no Google Sheets para consulta operacional, sem duplicar centenas de linhas nesta página.</p></div></div><a href={contactsSheetUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"><ExternalLink className="h-4 w-4" /> Abrir contatos no Google Sheets</a></div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
