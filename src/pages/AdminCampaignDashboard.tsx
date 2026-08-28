import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  DollarSign,
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

type RoundNumber = 1 | 2 | 3 | 4 | 5;

const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4, 5];
const GENERAL_ROUNDS: RoundNumber[] = [1, 2, 3, 4, 5];
const DEFAULT_ROUND: RoundNumber = 5;
const DEFAULT_META_MARKETING_UNIT_COST_BRL = 0.3217;

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
  reason?: string;
  queue?: FollowupQueue;
  sent?: {
    no_response: number;
    group_reminder: number;
    no_registration: number;
    pre_group_unique: number;
  };
  conversion?: {
    entered_after_no_response: number;
    entered_after_group_reminder: number;
    entered_after_any: number;
    conversion_rate: number;
  };
};

type AreaMetric = {
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

type GroupMember = {
  name: string;
  area: string;
  template: string;
  variant?: string;
  template_label?: string;
  badge_letter?: string;
};

type SourceSheet = {
  name: string;
  url: string;
};

type DashboardOverall = {
  planned?: number;
  released?: number;
  processed?: number;
  sent?: number;
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
};

type DashboardPayload = {
  ok: boolean;
  error?: string;
  data_warning?: string;
  round?: RoundNumber;
  phase?: string;
  scope?: string;
  read_only?: boolean;
  workflow?: string;
  updated_at?: string;
  sample_size?: number;
  status?: string;
  template?: string;
  origin_decision?: string;
  contacts_sheet_url?: string;
  financial_config?: {
    currency?: string;
    category?: string;
    unit_cost_brl?: number;
    billing_basis?: string;
    effective_from?: string;
    configurable_by?: string;
  };
  overall?: DashboardOverall;
  variants?: { A: VariantMetric; B: VariantMetric };
  funnel?: Array<{ key: string; label: string; value: number }>;
  followups?: FollowupPayload;
  areas?: AreaMetric[];
  group_members?: GroupMember[];
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
  round2_data_incomplete: 'Os dados da Rodada 2 ainda não estão completos na fonte.',
  round3_data_incomplete: 'Os dados da Rodada 3 ainda não estão completos na fonte.',
  round4_data_incomplete: 'Os dados da Rodada 4 ainda não estão completos na fonte.',
  round5_data_incomplete: 'Os dados da Rodada 5 ainda não estão completos na fonte.'
};

const templateLabels: Record<string, string> = {
  convite_jornada_ec_15dias_v1: 'Jornada 15 dias',
  convite_jornada_ec_app_v1: 'App v1',
  convite_jornada_ec_organizacao_v2: 'Organização v2',
  convite_jornada_evolucao_clinica: 'Evolução Clínica',
  MULTIPLOS_TEMPLATES_HISTORICOS: 'Múltiplos templates históricos'
};

const readRoundFromUrl = (): RoundNumber => {
  const round = Number(new URLSearchParams(window.location.search).get('round'));
  return AVAILABLE_ROUNDS.includes(round as RoundNumber) ? round as RoundNumber : DEFAULT_ROUND;
};

const readGeneralFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'geral' || !params.has('round');
};

const getRoundHref = (round: RoundNumber) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.set('round', String(round));
  return `${url.pathname}${url.search}${url.hash}`;
};

const getGeneralHref = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('round');
  url.searchParams.set('view', 'geral');
  return `${url.pathname}${url.search}${url.hash}`;
};

const formatPercent = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

const formatCurrency = (value?: number, digits = 2) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));

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

const numericOrDash = (value?: number) =>
  value === undefined || value === null || Number.isNaN(Number(value)) ? '—' : Number(value);

const ratio = (value: number, base: number) => base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0;

function MetricCard({
  label,
  value,
  helper,
  icon
}: {
  label: string;
  value: number | string;
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

function RateCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-bg p-4">
      <p className="text-xs text-brand-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-primary">{formatPercent(value)}</p>
    </div>
  );
}

function FinancialSection({
  overall,
  financialConfig,
  title
}: {
  overall: DashboardOverall;
  financialConfig?: DashboardPayload['financial_config'];
  title: string;
}) {
  const unitCost = Number(financialConfig?.unit_cost_brl || DEFAULT_META_MARKETING_UNIT_COST_BRL);
  const hasDeliveredMetric = typeof overall.delivered === 'number';
  const billable = Number(hasDeliveredMetric ? overall.delivered : overall.sent || 0);
  const spend = billable * unitCost;
  const responses = Number(overall.responses || 0);
  const interested = Number(overall.interested || 0);
  const members = Number(overall.group_members || 0);

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-800">
            <DollarSign className="h-5 w-5" />
            <h2 className="font-display text-lg font-bold">{title}</h2>
          </div>
          <p className="mt-1 text-xs text-emerald-800/80">Estimativa da tarifa Meta para o convite inicial da captação.</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-xs text-emerald-900">
          <p className="font-semibold">Tarifa unitária de referência</p>
          <p className="mt-1 text-lg font-black">{formatCurrency(unitCost, 4)}</p>
          <p className="mt-1 text-[11px] text-emerald-800/70">Marketing • Brasil</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Custo Meta estimado', formatCurrency(spend), `${billable} mensagem(ns) faturável(is)`],
          ['Custo por resposta', responses > 0 ? formatCurrency(spend / responses) : '—', `${responses} resposta(s)`],
          ['Custo por interessado', interested > 0 ? formatCurrency(spend / interested) : '—', `${interested} interessado(s)`],
          ['Custo por membro atual', members > 0 ? formatCurrency(spend / members) : '—', `${members} no grupo agora`],
          ['Base de cobrança', String(billable), hasDeliveredMetric ? 'Entregues' : 'Envios registrados*']
        ].map(([label, value, helper]) => (
          <div key={label} className="rounded-2xl border border-emerald-200 bg-white p-4">
            <p className="text-xs font-semibold text-emerald-800">{label}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{value}</p>
            <p className="mt-1 text-xs text-emerald-800/70">{helper}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-emerald-900/65">
        * Quando a fonte histórica não possui métrica separada de entrega, os envios registrados são usados como aproximação. O faturamento final da Meta pode variar.
      </p>
    </section>
  );
}

function FunnelSection({
  title,
  overall,
  funnel
}: {
  title: string;
  overall: DashboardOverall;
  funnel?: DashboardPayload['funnel'];
}) {
  const processed = Number(overall.processed ?? overall.sent ?? 0);
  const sent = Number(overall.sent ?? overall.delivered ?? 0);
  const steps = funnel?.length ? funnel : [
    { key: 'processed', label: 'Processados', value: processed },
    { key: 'sent', label: 'Enviados', value: sent },
    { key: 'responses', label: 'Respostas', value: Number(overall.responses || 0) },
    { key: 'interested', label: 'Interessados', value: Number(overall.interested || 0) },
    { key: 'group_members', label: 'No grupo agora', value: Number(overall.group_members || 0) }
  ];
  const base = Math.max(1, processed || Number(overall.planned || 0));

  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-brand-primary">
        <Activity className="h-5 w-5" />
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-brand-text-muted">O último estágio representa presença atual no grupo e não atribuição causal direta.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const percent = Math.min(100, Math.max(0, Math.round((Number(step.value || 0) / base) * 100)));
          return (
            <div key={step.key} className="relative rounded-2xl border border-brand-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-brand-text-muted">{index + 1}</span>
                <span className="text-xs font-semibold text-brand-primary">{percent}%</span>
              </div>
              <p className="mt-3 text-sm font-bold text-brand-text">{step.label}</p>
              <p className="mt-1 text-2xl font-display font-bold text-brand-primary">{step.value}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MembersSection({
  round,
  members,
  total
}: {
  round: RoundNumber;
  members: GroupMember[];
  total: number;
}) {
  const gap = Math.max(0, total - members.length);
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-primary">
            <Users className="h-5 w-5" />
            <h2 className="font-display text-lg font-bold">Leads da Rodada {round} atualmente no grupo</h2>
          </div>
          <p className="mt-1 text-xs text-brand-text-muted">{members.length} leads identificados nominalmente; total atual informado: {total}.</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{total} membros</span>
      </div>
      {gap > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {gap} membro(s) atual(is) ainda não possui(em) identificação nominal na lista histórica. O total do funil foi preservado.
        </div>
      ) : null}
      {members.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {members.map((member, index) => (
            <div key={`${round}-${member.name}-${index}`} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
              <p className="font-bold text-brand-text">{member.name}</p>
              <p className="mt-1 text-xs text-brand-text-muted">{member.area || `Rodada ${round}`}</p>
              <p className="mt-1 truncate text-[11px] text-brand-primary">
                {member.variant ? `Variante ${member.variant} • ` : ''}
                {templateLabels[member.template] || member.template_label || member.template || 'Template não identificado'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-brand-border bg-brand-bg p-5 text-sm text-brand-text-muted">
          Nenhum lead desta rodada está identificado nominalmente como membro atual.
        </div>
      )}
    </section>
  );
}

function FollowupSection({ followups, round }: { followups?: FollowupPayload; round: RoundNumber }) {
  if (!followups?.available) {
    return (
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <MessageCircleReply className="mt-0.5 h-6 w-6 text-brand-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-brand-primary">Política de follow-up — Rodada {round}</h2>
            <p className="mt-1 text-sm text-brand-text-muted">{followups?.reason || 'Follow-up sem dados disponíveis para esta rodada.'}</p>
          </div>
        </div>
      </section>
    );
  }

  const queue = followups.queue;
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-brand-primary">
        <MessageCircleReply className="h-5 w-5" />
        <h2 className="font-display text-lg font-bold">Histórico de follow-up — Rodada {round}</h2>
      </div>
      <p className="mt-1 text-xs text-brand-text-muted">Dados históricos preservados. A política operacional atual pode estar desativada.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Fila total" value={queue?.total ?? '—'} helper="Histórico" icon={<Activity className="h-5 w-5" />} />
        <MetricCard label="Sem resposta enviados" value={followups.sent?.no_response ?? '—'} helper="Follow-up" icon={<Send className="h-5 w-5" />} />
        <MetricCard label="Lembretes de grupo" value={followups.sent?.group_reminder ?? '—'} helper="Follow-up" icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Entraram após follow-up" value={followups.conversion?.entered_after_any ?? '—'} helper={formatPercent(followups.conversion?.conversion_rate)} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>
    </section>
  );
}

function StrategySection({ data, round }: { data: DashboardPayload; round: RoundNumber }) {
  const template = templateLabels[data.template || ''] || data.template || (round === 1 ? 'Múltiplos templates históricos' : 'Template não definido');
  return (
    <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" />
          <div>
            <h2 className="font-display text-lg font-bold text-blue-900">Estratégia da Rodada {round}</h2>
            <p className="mt-1 text-sm font-semibold text-blue-800">{template}</p>
            <p className="mt-2 text-sm text-blue-800">{data.origin_decision || 'Histórico preservado para comparação entre rodadas.'}</p>
          </div>
        </div>
        <div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm">
          <p className="text-brand-text-muted">Status operacional</p>
          <p className="mt-1 font-bold text-brand-text">{data.status || '—'}</p>
          <p className="mt-3 text-brand-text-muted">Fase</p>
          <p className="mt-1 font-bold text-brand-text">{data.phase || '—'}</p>
        </div>
      </div>
    </section>
  );
}

function SourceSection({ data, round }: { data: DashboardPayload; round: RoundNumber }) {
  const links = data.source_sheets?.length
    ? data.source_sheets
    : data.contacts_sheet_url
      ? [{ name: `Rodada ${round} - Controle`, url: data.contacts_sheet_url }]
      : [];

  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-brand-primary">Fonte de dados — Rodada {round}</h2>
            <p className="mt-1 text-sm text-brand-text-muted">A aba da rodada usa somente leitura e preserva a fonte operacional no Google Sheets.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {links.map(link => (
            <a key={`${link.name}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90">
              <ExternalLink className="h-4 w-4" />
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoundSpecificDetails({ data, round }: { data: DashboardPayload; round: RoundNumber }) {
  if (round === 2 && data.variants) {
    return (
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary">
          <BarChart3 className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold">Detalhes específicos — teste A/B da Rodada 2</h2>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {(['A', 'B'] as const).map(key => {
            const metric = data.variants![key];
            return (
              <div key={key} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-brand-text">Variante {key}</p>
                  <span className="text-xs font-semibold text-brand-primary">{templateLabels[metric.template] || metric.template}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['Processados', metric.processed],
                    ['Entregues', metric.delivered],
                    ['Respostas', metric.responses],
                    ['Interessados', metric.interested],
                    ['No grupo', metric.group_members]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-white p-3">
                      <p className="text-[11px] text-brand-text-muted">{label}</p>
                      <p className="mt-1 text-lg font-bold text-brand-text">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (round === 1 && data.areas?.length) {
    return (
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary">
          <BarChart3 className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold">Detalhes específicos — áreas da Rodada 1</h2>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {data.areas.map(area => (
            <div key={area.name} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
              <p className="font-bold text-brand-text">{area.name}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Enviados', area.sent],
                  ['Respostas', area.responses],
                  ['Interessados', area.interested],
                  ['Sem interesse', area.no_interest],
                  ['No grupo', area.current_group_members]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-white p-3">
                    <p className="text-[11px] text-brand-text-muted">{label}</p>
                    <p className="mt-1 text-lg font-bold text-brand-text">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return null;
}

function StandardRoundDashboard({ data, round }: { data: DashboardPayload; round: RoundNumber }) {
  const overall = data.overall!;
  const planned = overall.planned ?? data.sample_size ?? overall.processed ?? overall.sent;
  const processed = overall.processed ?? overall.sent;
  const sent = overall.sent ?? overall.delivered;
  const sentCount = Number(sent || 0);
  const processedCount = Number(processed || 0);
  const responseRate = overall.response_rate ?? ratio(Number(overall.responses || 0), sentCount);
  const interestRate = overall.interest_rate ?? ratio(Number(overall.interested || 0), sentCount);
  const responseToInterestRate = overall.response_to_interest_rate ?? ratio(Number(overall.interested || 0), Number(overall.responses || 0));
  const groupRate = ratio(Number(overall.group_members || 0), Number(overall.interested || 0));
  const sendRate = overall.delivery_rate ?? ratio(sentCount, processedCount);

  return (
    <>
      {data.data_warning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Observação da fonte</p>
          <p className="mt-1">{data.data_warning}</p>
        </div>
      ) : null}

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-primary">
              <BarChart3 className="h-5 w-5" />
              <h2 className="font-display text-lg font-bold">Rodada {round} — visão geral</h2>
            </div>
            <p className="mt-1 text-xs text-brand-text-muted">{data.scope || 'Captação Evolução Clínica'} • Estrutura padronizada do dashboard.</p>
          </div>
          <div className="text-left text-xs text-brand-text-muted md:text-right">
            <p>Última atualização</p>
            <p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p>
            <p className="mt-1">Workflow {data.workflow || 'n8n'}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard label="Planejados" value={numericOrDash(planned)} helper="Coorte da rodada" icon={<Users className="h-5 w-5" />} />
          <MetricCard label="Liberados" value={numericOrDash(overall.released)} helper={overall.released === undefined ? 'N/D na fonte histórica' : 'SIM na origem'} icon={<ShieldCheck className="h-5 w-5" />} />
          <MetricCard label="Processados" value={numericOrDash(processed)} helper="Tentativa/status registrado" icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Enviados" value={numericOrDash(sent)} helper={`${numericOrDash(overall.pending_meta)} aguardando Meta`} icon={<Send className="h-5 w-5" />} />
          <MetricCard label="Respostas" value={Number(overall.responses || 0)} helper={formatPercent(responseRate)} icon={<MessageCircleReply className="h-5 w-5" />} />
          <MetricCard label="Interessados" value={Number(overall.interested || 0)} helper={formatPercent(interestRate)} icon={<UserRoundCheck className="h-5 w-5" />} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Erros" value={numericOrDash(overall.failures)} helper={overall.failures === undefined ? 'N/D na fonte histórica' : 'Falhas registradas'} icon={<AlertTriangle className="h-5 w-5" />} />
          <MetricCard label="Aguardando Meta" value={numericOrDash(overall.pending_meta)} helper={overall.pending_meta === undefined ? 'N/D na fonte histórica' : 'Callback pendente'} icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Sem interesse" value={Number(overall.no_interest || 0)} helper="Respostas negativas" icon={<AlertTriangle className="h-5 w-5" />} />
          <MetricCard label="No grupo agora" value={Number(overall.group_members || 0)} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <RateCard label="Envio / processados" value={sendRate} />
          <RateCard label="Resposta / enviados" value={responseRate} />
          <RateCard label="Interesse / enviados" value={interestRate} />
          <RateCard label="Interesse / respostas" value={responseToInterestRate} />
          <RateCard label="Grupo / interessados" value={groupRate} />
        </div>
      </section>

      <FinancialSection overall={overall} financialConfig={data.financial_config} title={`Financeiro — Rodada ${round}`} />
      <StrategySection data={data} round={round} />
      <FunnelSection title={`Funil da Rodada ${round}`} overall={overall} funnel={data.funnel} />
      <FollowupSection followups={data.followups} round={round} />
      <MembersSection round={round} members={data.group_members || []} total={Number(overall.group_members || 0)} />
      <SourceSection data={data} round={round} />
      <RoundSpecificDetails data={data} round={round} />
    </>
  );
}

function GeneralDashboard({ payloads }: { payloads: DashboardPayload[] }) {
  const snapshots = useMemo(() => payloads
    .filter(payload => payload.ok && payload.overall)
    .map(payload => {
      const overall = payload.overall!;
      const processed = Number(overall.processed ?? overall.sent ?? 0);
      const sent = Number(overall.sent ?? overall.delivered ?? 0);
      const billable = Number(overall.delivered ?? overall.sent ?? 0);
      return {
        round: Number(payload.round || 0),
        status: payload.status || '—',
        processed,
        sent,
        billable,
        responses: Number(overall.responses || 0),
        interested: Number(overall.interested || 0),
        no_interest: Number(overall.no_interest || 0),
        group_members: Number(overall.group_members || 0),
        failures: Number(overall.failures || 0)
      };
    })
    .sort((a, b) => a.round - b.round), [payloads]);

  const total = snapshots.reduce((acc, item) => ({
    processed: acc.processed + item.processed,
    sent: acc.sent + item.sent,
    billable: acc.billable + item.billable,
    responses: acc.responses + item.responses,
    interested: acc.interested + item.interested,
    no_interest: acc.no_interest + item.no_interest,
    group_members: acc.group_members + item.group_members,
    failures: acc.failures + item.failures
  }), { processed: 0, sent: 0, billable: 0, responses: 0, interested: 0, no_interest: 0, group_members: 0, failures: 0 });

  const overall: DashboardOverall = {
    processed: total.processed,
    sent: total.sent,
    delivered: total.billable,
    failures: total.failures,
    responses: total.responses,
    interested: total.interested,
    no_interest: total.no_interest,
    group_members: total.group_members,
    delivery_rate: ratio(total.sent, total.processed),
    response_rate: ratio(total.responses, total.sent),
    interest_rate: ratio(total.interested, total.sent),
    response_to_interest_rate: ratio(total.interested, total.responses)
  };

  const financialConfig = payloads.find(payload => Number(payload.financial_config?.unit_cost_brl || 0) > 0)?.financial_config;

  return (
    <>
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary">
          <BarChart3 className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold">Visão geral da captação</h2>
        </div>
        <p className="mt-1 text-xs text-brand-text-muted">Consolidação das Rodadas 1 a 5 usando o mesmo contrato de métricas das abas individuais.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Processados" value={total.processed} helper="Todas as rodadas" icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Enviados" value={total.sent} helper={formatPercent(ratio(total.sent, total.processed))} icon={<Send className="h-5 w-5" />} />
          <MetricCard label="Respostas" value={total.responses} helper={formatPercent(ratio(total.responses, total.sent))} icon={<MessageCircleReply className="h-5 w-5" />} />
          <MetricCard label="Interessados" value={total.interested} helper={formatPercent(ratio(total.interested, total.sent))} icon={<UserRoundCheck className="h-5 w-5" />} />
          <MetricCard label="No grupo agora" value={total.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Erros" value={total.failures} helper="Somatório disponível" icon={<AlertTriangle className="h-5 w-5" />} />
          <MetricCard label="Sem interesse" value={total.no_interest} helper="Todas as rodadas" icon={<AlertTriangle className="h-5 w-5" />} />
          <RateCard label="Interesse / respostas" value={ratio(total.interested, total.responses)} />
          <RateCard label="Grupo / interessados" value={ratio(total.group_members, total.interested)} />
        </div>
      </section>

      <FinancialSection overall={overall} financialConfig={financialConfig} title="Financeiro geral — todas as rodadas" />
      <FunnelSection title="Funil geral — todas as rodadas" overall={overall} />

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary">
          <BarChart3 className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold">Comparativo por rodada</h2>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-brand-text-muted">
                {['Rodada', 'Processados', 'Enviados', 'Respostas', 'Interessados', 'No grupo', 'Custo Meta', 'Erros', 'Status'].map(label => (
                  <th key={label} className="border-b border-brand-border px-3 py-3 font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map(item => (
                <tr key={item.round} className="text-brand-text">
                  <td className="border-b border-brand-border/70 px-3 py-3 font-bold text-brand-primary">Rodada {item.round}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.processed}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.sent}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.responses}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3 font-semibold">{item.interested}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.group_members}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3 font-semibold text-emerald-800">{formatCurrency(item.billable * Number(financialConfig?.unit_cost_brl || DEFAULT_META_MARKETING_UNIT_COST_BRL))}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">{item.failures}</td>
                  <td className="border-b border-brand-border/70 px-3 py-3">
                    <span className="rounded-full border border-brand-border bg-brand-bg px-2.5 py-1 text-xs font-bold">{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function AdminCampaignDashboard() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [selectedRound, setSelectedRound] = useState<RoundNumber>(() => readRoundFromUrl());
  const [showGeneral, setShowGeneral] = useState(() => readGeneralFromUrl());
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [generalData, setGeneralData] = useState<DashboardPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalRefreshing, setGeneralRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [generalError, setGeneralError] = useState('');

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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) setAccessToken(session.access_token);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setSelectedRound(readRoundFromUrl());
      setShowGeneral(readGeneralFromUrl());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const loadDashboard = async (round: RoundNumber, silent = false) => {
    if (!accessToken) return;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(`/api/admin/campaign-dashboard?round=${round}&refresh=${encodeURIComponent(nonce)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
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

  const loadGeneral = async (silent = false) => {
    if (!accessToken) return;
    silent ? setGeneralRefreshing(true) : setGeneralLoading(true);
    try {
      const results = await Promise.allSettled(
        GENERAL_ROUNDS.map(async round => {
          const nonce = `${Date.now()}-${round}-${Math.random().toString(36).slice(2)}`;
          const response = await fetch(`/api/admin/campaign-dashboard?round=${round}&refresh=${encodeURIComponent(nonce)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache'
            },
            cache: 'no-store'
          });
          const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DashboardPayload;
          if (!response.ok || !body.ok) throw new Error(String(body.error || `round_${round}_unavailable`));
          return body;
        })
      );
      const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      const failed = results.length - successful.length;
      setGeneralData(successful);
      setGeneralError(failed > 0 ? `${failed} rodada(s) não puderam ser carregadas. O consolidado usa temporariamente somente as rodadas disponíveis.` : '');
    } finally {
      setGeneralLoading(false);
      setGeneralRefreshing(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !showGeneral) return;
    void loadGeneral(false);
    const timer = window.setInterval(() => void loadGeneral(true), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, showGeneral]);

  useEffect(() => {
    if (!accessToken || showGeneral) return;
    setData(null);
    setErrorMessage('');
    void loadDashboard(selectedRound, false);
    const timer = window.setInterval(() => void loadDashboard(selectedRound, true), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, selectedRound, showGeneral]);

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

  const description = showGeneral
    ? 'Visão consolidada das principais métricas de todas as rodadas, com funil e financeiro no mesmo padrão das abas individuais.'
    : `Rodada ${selectedRound} • ${data?.scope || 'Captação Evolução Clínica'}. Métricas padronizadas para comparação direta entre coortes.`;

  const navigateGeneral = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(window.history.state, '', getGeneralHref());
    setShowGeneral(true);
  };

  const navigateRound = (event: React.MouseEvent<HTMLAnchorElement>, round: RoundNumber) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(window.history.state, '', getRoundHref(round));
    setShowGeneral(false);
    setSelectedRound(round);
  };

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <a href="/admin/jornada" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Voltar para Jornada 15 dias
            </a>
            <h1 className="text-2xl font-display font-bold text-brand-primary md:text-3xl">Dashboard de Captação</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/captacao-disparos" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm hover:bg-brand-bg">
              <Send className="h-4 w-4" /> Central de Disparos
            </a>
            <button
              type="button"
              onClick={() => void (showGeneral ? loadGeneral(true) : loadDashboard(selectedRound, true))}
              disabled={showGeneral ? (generalRefreshing || generalLoading) : (refreshing || loading)}
              className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${(showGeneral ? generalRefreshing : refreshing) ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4" /> Somente leitura
            </div>
          </div>
        </header>

        <div className="inline-flex flex-wrap rounded-2xl border border-brand-border bg-white p-1 shadow-sm">
          <a href={getGeneralHref()} onClick={navigateGeneral} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${showGeneral ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}>Geral</a>
          {AVAILABLE_ROUNDS.map(round => (
            <a
              key={round}
              href={getRoundHref(round)}
              onClick={event => navigateRound(event, round)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${!showGeneral && selectedRound === round ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}
            >
              Rodada {round}
            </a>
          ))}
        </div>

        {(showGeneral ? generalError : errorMessage) ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Não foi possível atualizar todos os dados.</p>
              <p className="mt-1">{showGeneral ? generalError : errorMessage}</p>
            </div>
          </div>
        ) : null}

        {showGeneral && generalLoading && generalData.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm">
            <div className="flex items-center gap-3 text-sm text-brand-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Consolidando todas as rodadas...
            </div>
          </div>
        ) : null}

        {!showGeneral && loading && !data ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm">
            <div className="flex items-center gap-3 text-sm text-brand-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Lendo a Rodada {selectedRound}...
            </div>
          </div>
        ) : null}

        {showGeneral && generalData.length > 0 ? <GeneralDashboard payloads={generalData} /> : null}
        {!showGeneral && data?.overall ? <StandardRoundDashboard data={data} round={selectedRound} /> : null}
      </div>
    </main>
  );
}
