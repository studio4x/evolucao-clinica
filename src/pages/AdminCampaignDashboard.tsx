import React, { useEffect, useState } from 'react';
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

type RoundNumber = 1 | 2 | 3 | 4;

const AVAILABLE_ROUNDS: RoundNumber[] = [1, 2, 3, 4];
const GENERAL_ROUNDS = [1, 2, 3, 4, 5] as const;
const DEFAULT_ROUND: RoundNumber = 4;

const readRoundFromUrl = (): RoundNumber => {
  const round = Number(new URLSearchParams(window.location.search).get('round'));
  return AVAILABLE_ROUNDS.includes(round as RoundNumber) ? round as RoundNumber : DEFAULT_ROUND;
};

const getRoundHref = (round: RoundNumber) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.set('round', String(round));
  return `${url.pathname}${url.search}${url.hash}`;
};

const getGeneralHref = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'geral');
  return `${url.pathname}${url.search}${url.hash}`;
};

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

type DashboardPayload = {
  ok: boolean;
  error?: string;
  round?: RoundNumber;
  phase?: string;
  scope?: string;
  read_only?: boolean;
  workflow?: string;
  financial_config?: {
    currency?: string;
    category?: string;
    unit_cost_brl?: number;
    billing_basis?: string;
    effective_from?: string;
    configurable_by?: string;
  };
  updated_at?: string;
  sample_size?: number;
  status?: string;
  template?: string;
  origin_decision?: string;
  contacts_sheet_url?: string;
  overall?: {
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
  followup_jornada_sem_resposta_v1: 'Sem resposta v1',
  followup_jornada_sem_resposta_v2: 'Sem resposta v2',
  followup_jornada_lembrete_grupo_v1: 'Lembrete de grupo v1',
  followup_jornada_lembrete_grupo_v2: 'Lembrete de grupo v2',
  followup_jornada_sem_cadastro_v1: 'Sem cadastro v1'
};

const DEFAULT_META_MARKETING_UNIT_COST_BRL = 0.3217;

const formatPercent = (value?: number) =>
  `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;

const formatCurrency = (value?: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits
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

function RateCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-bg p-4">
      <p className="text-xs text-brand-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-primary">{formatPercent(value)}</p>
    </div>
  );
}

function VariantCard({ metric, winner }: { metric: VariantMetric; winner?: string }) {
  const isWinner = winner === metric.variant;
  const isA = metric.variant === 'A';

  return (
    <section className={`rounded-3xl border bg-white p-5 shadow-sm ${isWinner ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-brand-border'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${isA ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{metric.variant}</span>
          <div>
            <h3 className="font-display text-lg font-bold text-brand-text">Variante {metric.variant}</h3>
            <p className="text-xs text-brand-text-muted">{templateLabels[metric.template] || metric.template}</p>
          </div>
        </div>
        {isWinner ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><Trophy className="h-3.5 w-3.5" /> Vencedora</span>
        ) : (
          <span className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">{metric.maturity || 'AMOSTRA'}</span>
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
        <RateCard label="Taxa de entrega" value={metric.delivery_rate} />
        <RateCard label="Resposta / entregues" value={metric.response_rate} />
        <RateCard label="Interesse / entregues" value={metric.interest_rate} />
        <RateCard label="Interesse / respostas" value={metric.response_to_interest_rate} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">Sem confirmação Meta: {metric.pending_meta}</span>
        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-semibold text-red-800">Falhas: {metric.failures}</span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 font-semibold text-slate-700">Sem interesse: {metric.no_interest}</span>
      </div>
    </section>
  );
}

function FollowupQueueCards({ followups }: { followups: FollowupPayload }) {
  const queue = followups.queue;
  if (!queue) return null;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Fila total" value={queue.total} helper={`${queue.no_response} sem resposta`} icon={<MessageCircleReply className="h-5 w-5" />} />
        <MetricCard label="Prazo atingido" value={queue.due_total} helper="Elegíveis pelo prazo" icon={<AlertTriangle className="h-5 w-5" />} />
        <MetricCard label="Aguardando prazo" value={queue.waiting_deadline} helper="Ainda não elegíveis" icon={<Activity className="h-5 w-5" />} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">SEM RESPOSTA</p><p className="mt-2 text-2xl font-bold text-brand-text">{queue.no_response}</p><p className="mt-1 text-xs text-brand-text-muted">{queue.due_no_response} com prazo atingido</p></div>
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">LEMBRETE DE GRUPO</p><p className="mt-2 text-2xl font-bold text-brand-text">{queue.group_reminder}</p><p className="mt-1 text-xs text-brand-text-muted">{queue.due_group_reminder} com prazo atingido</p></div>
        <div className="rounded-2xl border border-brand-border bg-brand-bg p-4"><p className="text-xs font-bold text-brand-text-muted">SEM CADASTRO</p><p className="mt-2 text-2xl font-bold text-brand-text">{queue.no_registration}</p><p className="mt-1 text-xs text-brand-text-muted">{queue.due_no_registration} com prazo atingido</p></div>
      </div>
    </>
  );
}

function FollowupABCard({ title, A, B }: { title: string; A: FollowupVariantMetric; B: FollowupVariantMetric }) {
  const totalSent = Number(A.sent || 0) + Number(B.sent || 0);

  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-bold text-brand-text">{title}</h3><p className="mt-1 text-xs text-brand-text-muted">Comparação por template persistido no workflow.</p></div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${totalSent >= 20 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{totalSent >= 20 ? 'Em análise' : 'Amostra inicial'}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([['A', A], ['B', B]] as const).map(([variant, metric]) => (
          <div key={variant} className="rounded-xl bg-brand-bg p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-brand-primary">Variante {variant}</span><span className="text-[11px] text-brand-text-muted">{templateLabels[metric.template] || metric.template || '—'}</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[11px] text-brand-text-muted">Enviados</p><p className="mt-1 text-lg font-bold text-brand-text">{metric.sent}</p></div>
              <div><p className="text-[11px] text-brand-text-muted">Entraram</p><p className="mt-1 text-lg font-bold text-brand-text">{metric.entered_group}</p></div>
              <div><p className="text-[11px] text-brand-text-muted">Conversão</p><p className="mt-1 text-lg font-bold text-brand-primary">{formatPercent(metric.conversion_rate)}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersSection({ round, members, total }: { round: RoundNumber; members: GroupMember[]; total: number }) {
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-primary"><Users className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Leads da Rodada {round} atualmente no grupo</h2></div>
          <p className="mt-1 text-xs text-brand-text-muted">{members.length} leads identificados nominalmente com status atual MEMBRO. A lista acompanha a sincronização do grupo.</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{total} membros</span>
      </div>

      {members.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {members.map((member, index) => (
            <div key={`${round}-${member.name}-${index}`} className="rounded-2xl border border-brand-border bg-brand-bg p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-800">{member.badge_letter || member.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-brand-text">{member.name}</p>
                  <p className="mt-1 text-xs text-brand-text-muted">{member.area || `Rodada ${round}`}</p>
                  <p className="mt-1 truncate text-[11px] text-brand-primary">{member.variant ? `Variante ${member.variant} • ` : ''}{templateLabels[member.template] || member.template_label || member.template || 'Template não identificado'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-brand-border bg-brand-bg p-5 text-sm text-brand-text-muted">Nenhum lead desta rodada está identificado como membro atual do grupo neste momento.</div>
      )}
    </section>
  );
}

function FunnelSection({ title, funnel, base }: { title: string; funnel: DashboardPayload['funnel']; base: number }) {
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-brand-primary"><Activity className="h-5 w-5" /><h2 className="font-display text-lg font-bold">{title}</h2></div>
      <p className="mt-1 text-xs text-brand-text-muted">O último estágio representa presença atual no grupo e não atribuição causal direta.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {(funnel || []).map((step, index) => {
          const percent = Math.min(100, Math.max(0, Math.round((Number(step.value || 0) / Math.max(1, base)) * 100)));
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
  );
}



function FinancialSection({
  title,
  overall,
  financialConfig,
  helper
}: {
  title: string;
  overall: NonNullable<DashboardPayload['overall']>;
  financialConfig?: DashboardPayload['financial_config'];
  helper?: string;
}) {
  const unitCost = Number(financialConfig?.unit_cost_brl || DEFAULT_META_MARKETING_UNIT_COST_BRL);
  const hasDeliveredMetric = typeof overall.delivered === 'number';
  const billableMessages = Number(hasDeliveredMetric ? overall.delivered : overall.sent || 0);
  const estimatedSpend = billableMessages * unitCost;
  const responses = Number(overall.responses || 0);
  const interested = Number(overall.interested || 0);
  const groupMembers = Number(overall.group_members || 0);
  const costPerResponse = responses > 0 ? estimatedSpend / responses : 0;
  const costPerInterested = interested > 0 ? estimatedSpend / interested : 0;
  const costPerGroupMember = groupMembers > 0 ? estimatedSpend / groupMembers : 0;

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-800"><DollarSign className="h-5 w-5" /><h2 className="font-display text-lg font-bold">{title}</h2></div>
          <p className="mt-1 text-xs text-emerald-800/80">{helper || 'Estimativa da tarifa Meta para mensagens de template Marketing entregues.'}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-xs text-emerald-900">
          <p className="font-semibold">Tarifa unitária de referência</p>
          <p className="mt-1 text-lg font-black">{formatCurrency(unitCost, 4)}</p>
          <p className="mt-1 text-[11px] text-emerald-800/70">Marketing • Brasil • vigente desde 01/07/2026</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo Meta estimado</p><p className="mt-1 text-2xl font-bold text-emerald-950">{formatCurrency(estimatedSpend)}</p><p className="mt-1 text-xs text-emerald-800/70">{billableMessages} mensagem(ns) faturável(is)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por resposta</p><p className="mt-1 text-2xl font-bold text-emerald-950">{responses > 0 ? formatCurrency(costPerResponse) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{responses} resposta(s)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por interessado</p><p className="mt-1 text-2xl font-bold text-emerald-950">{interested > 0 ? formatCurrency(costPerInterested) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{interested} interessado(s)</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Custo por membro atual</p><p className="mt-1 text-2xl font-bold text-emerald-950">{groupMembers > 0 ? formatCurrency(costPerGroupMember) : '—'}</p><p className="mt-1 text-xs text-emerald-800/70">{groupMembers} no grupo agora</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-xs font-semibold text-emerald-800">Base de cobrança</p><p className="mt-1 text-2xl font-bold text-emerald-950">{billableMessages}</p><p className="mt-1 text-xs text-emerald-800/70">{hasDeliveredMetric ? 'Entregues' : 'Envios registrados*'}</p></div>
      </div>

      <p className="mt-3 text-[11px] text-emerald-900/65">* A Meta cobra template Marketing por mensagem entregue. Nas fontes históricas que não possuem uma métrica separada de entrega, o dashboard usa os envios registrados como aproximação. Valores são estimativas da tarifa Meta e podem divergir do faturamento final por ajustes da conta.</p>
    </section>
  );
}

function GeneralDashboardSection({ payloads }: { payloads: DashboardPayload[] }) {
  const snapshots = payloads
    .filter(payload => payload?.ok && payload.overall)
    .map(payload => {
      const overall = payload.overall!;
      const processed = Number(overall.processed ?? overall.sent ?? 0);
      const sent = Number(overall.sent ?? overall.delivered ?? 0);
      return {
        round: Number(payload.round || 0),
        status: payload.status || '—',
        updated_at: payload.updated_at,
        processed,
        sent,
        billable: Number(overall.delivered ?? overall.sent ?? 0),
        responses: Number(overall.responses || 0),
        interested: Number(overall.interested || 0),
        no_interest: Number(overall.no_interest || 0),
        group_members: Number(overall.group_members || 0),
        failures: Number(overall.failures || 0),
        pending_meta: Number(overall.pending_meta || 0)
      };
    })
    .sort((a, b) => a.round - b.round);

  const total = snapshots.reduce(
    (acc, item) => ({
      processed: acc.processed + item.processed,
      sent: acc.sent + item.sent,
      billable: acc.billable + item.billable,
      responses: acc.responses + item.responses,
      interested: acc.interested + item.interested,
      no_interest: acc.no_interest + item.no_interest,
      group_members: acc.group_members + item.group_members,
      failures: acc.failures + item.failures,
      pending_meta: acc.pending_meta + item.pending_meta
    }),
    { processed: 0, sent: 0, billable: 0, responses: 0, interested: 0, no_interest: 0, group_members: 0, failures: 0, pending_meta: 0 }
  );

  const rate = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;
  const financialConfig = payloads.find(payload => Number(payload.financial_config?.unit_cost_brl || 0) > 0)?.financial_config;
  const generalOverall: NonNullable<DashboardPayload['overall']> = {
    delivered: total.billable,
    sent: total.sent,
    responses: total.responses,
    interested: total.interested,
    no_interest: total.no_interest,
    group_members: total.group_members,
    failures: total.failures,
    pending_meta: total.pending_meta,
    response_rate: rate(total.responses, total.billable),
    interest_rate: rate(total.interested, total.billable),
    response_to_interest_rate: rate(total.interested, total.responses)
  };
  const funnel = [
    { key: 'processed', label: 'Processados', value: total.processed },
    { key: 'sent', label: 'Enviados', value: total.sent },
    { key: 'responses', label: 'Respostas', value: total.responses },
    { key: 'interested', label: 'Interessados', value: total.interested },
    { key: 'group_members', label: 'No grupo agora', value: total.group_members }
  ];

  const latestUpdated = snapshots
    .map(item => item.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <>
      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Visão geral da captação</h2></div>
            <p className="mt-1 text-xs text-brand-text-muted">Consolidação das principais métricas das Rodadas 1 a 5. Cada rodada continua sendo calculada individualmente pelo n8n.</p>
          </div>
          <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização consolidada</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(latestUpdated)}</p><p className="mt-1">{snapshots.length} rodada(s) carregada(s)</p></div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Processados" value={total.processed} helper="Todas as rodadas" icon={<Activity className="h-5 w-5" />} />
          <MetricCard label="Enviados" value={total.sent} helper={`${formatPercent(rate(total.sent, total.processed))} dos processados`} icon={<Send className="h-5 w-5" />} />
          <MetricCard label="Respostas" value={total.responses} helper={`${formatPercent(rate(total.responses, total.sent))} dos enviados`} icon={<MessageCircleReply className="h-5 w-5" />} />
          <MetricCard label="Interessados" value={total.interested} helper={`${formatPercent(rate(total.interested, total.sent))} dos enviados`} icon={<UserRoundCheck className="h-5 w-5" />} />
          <MetricCard label="No grupo agora" value={total.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <RateCard label="Envio / processados" value={rate(total.sent, total.processed)} />
          <RateCard label="Resposta / enviados" value={rate(total.responses, total.sent)} />
          <RateCard label="Interesse / enviados" value={rate(total.interested, total.sent)} />
          <RateCard label="Interesse / respostas" value={rate(total.interested, total.responses)} />
          <RateCard label="Grupo / interessados" value={rate(total.group_members, total.interested)} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold text-red-800">Falhas acumuladas</p><p className="mt-1 text-2xl font-bold text-red-900">{total.failures}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Aguardando confirmação Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{total.pending_meta}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{total.no_interest}</p></div>
        </div>
      </section>

      <FinancialSection title="Financeiro geral — todas as rodadas" overall={generalOverall} financialConfig={financialConfig} helper="Consolidação financeira das mensagens iniciais das Rodadas 1 a 5." />

      <FunnelSection title="Funil geral — todas as rodadas" funnel={funnel} base={Math.max(1, total.processed)} />

      <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Comparativo por rodada</h2></div>
        <p className="mt-1 text-xs text-brand-text-muted">Leitura rápida dos principais estágios para identificar evolução entre as coortes.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-brand-text-muted">{['Rodada', 'Processados', 'Enviados', 'Respostas', 'Interessados', 'No grupo', 'Custo Meta', 'Falhas', 'Status'].map(label => <th key={label} className="border-b border-brand-border px-3 py-3 font-bold">{label}</th>)}</tr></thead>
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
                  <td className="border-b border-brand-border/70 px-3 py-3"><span className="rounded-full border border-brand-border bg-brand-bg px-2.5 py-1 text-xs font-bold">{item.status}</span></td>
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
  const [showGeneral, setShowGeneral] = useState(() => new URLSearchParams(window.location.search).get('view') === 'geral');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [generalData, setGeneralData] = useState<DashboardPayload[]>([]);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalRefreshing, setGeneralRefreshing] = useState(false);
  const [generalError, setGeneralError] = useState('');
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

  useEffect(() => {
    const syncRoundFromUrl = () => {
      setSelectedRound(readRoundFromUrl());
      setShowGeneral(new URLSearchParams(window.location.search).get('view') === 'geral');
    };
    const normalizedRound = readRoundFromUrl();
    const currentRound = new URLSearchParams(window.location.search).get('round');

    if (currentRound !== String(normalizedRound)) {
      window.history.replaceState(window.history.state, '', getRoundHref(normalizedRound));
    }

    window.addEventListener('popstate', syncRoundFromUrl);
    return () => window.removeEventListener('popstate', syncRoundFromUrl);
  }, []);

  const handleGeneralNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (showGeneral) return;
    window.history.pushState(window.history.state, '', getGeneralHref());
    setShowGeneral(true);
    setData(null);
    setErrorMessage('');
  };

  const handleRoundNavigation = (event: React.MouseEvent<HTMLAnchorElement>, round: RoundNumber) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (!showGeneral && round === selectedRound) return;

    window.history.pushState(window.history.state, '', getRoundHref(round));
    setShowGeneral(false);
    setSelectedRound(round);
  };

  const loadDashboard = async (round: RoundNumber, silent = false) => {
    if (!accessToken) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(`/api/admin/campaign-dashboard?round=${round}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
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

  const loadGeneralDashboard = async (silent = false) => {
    if (!accessToken) return;
    if (silent) setGeneralRefreshing(true);
    else setGeneralLoading(true);

    try {
      const results = await Promise.allSettled(
        GENERAL_ROUNDS.map(async round => {
          const nonce = `${Date.now()}-${round}-${Math.random().toString(36).slice(2)}`;
          const response = await fetch(`/api/admin/campaign-dashboard?round=${round}&refresh=${encodeURIComponent(nonce)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
            cache: 'no-store'
          });
          const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DashboardPayload;
          if (!response.ok || !body.ok) throw new Error(String(body.error || `round_${round}_unavailable`));
          return body;
        })
      );

      const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      const failedCount = results.length - successful.length;
      setGeneralData(successful);
      setGeneralError(failedCount > 0 ? `${failedCount} rodada(s) não puderam ser carregadas agora. O consolidado abaixo usa somente as rodadas disponíveis.` : '');
    } catch (error) {
      console.error('[AdminCampaignDashboard] Falha ao carregar visão geral:', error);
      setGeneralError('Falha de comunicação ao atualizar a visão geral.');
    } finally {
      setGeneralLoading(false);
      setGeneralRefreshing(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !showGeneral) return;
    void loadGeneralDashboard(false);
    const timer = window.setInterval(() => void loadGeneralDashboard(true), 60_000);
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
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4"><div className="flex items-center gap-3 rounded-2xl border border-brand-border bg-white px-5 py-4 shadow-sm text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" />Validando sessão administrativa...</div></div>;
  }

  const isRound1 = selectedRound === 1;
  const isRound2 = selectedRound === 2;
  const isRound3 = selectedRound === 3;
  const isRound4 = selectedRound === 4;
  const overall = data?.overall;
  const variants = data?.variants;
  const decision = data?.decision;
  const followups = data?.followups;
  const members = data?.group_members || [];
  const contactsSheetUrl = data?.contacts_sheet_url || 'https://docs.google.com/spreadsheets/d/1PwouSDq1gi0588hlfzo2jCeoCwZ79z4IAxEm3w2thJg/edit';

  const description = showGeneral
    ? 'Visão consolidada das principais métricas de todas as rodadas da captação, com foco no funil geral e comparação entre coortes.'
    : isRound1
    ? 'Rodada 1 • Terapia Ocupacional + Enfermagem - Home Care. Histórico de envios, follow-ups e presença atual no grupo.'
    : isRound2
      ? 'Rodada 2 • Fase 1 • Psicologia e Saúde Mental. Teste A/B encerrado, follow-ups e presença atual no grupo.'
      : isRound3
        ? 'Rodada 3 • Psicologia e Saúde Mental. Rodada encerrada com 100 contatos processados; follow-up desativado.'
        : 'Rodada 4 • Psicologia e Saúde Mental. Nova coorte fixa de 100 contatos liberados; follow-up desativado.';

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <a href="/admin/jornada" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar para Jornada 15 dias</a>
            <h1 className="text-2xl font-display font-bold text-brand-primary md:text-3xl">Dashboard de Captação</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/captacao-disparos" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm hover:bg-brand-bg"><Send className="h-4 w-4" /> Central de Disparos</a>
            <button type="button" onClick={() => void (showGeneral ? loadGeneralDashboard(true) : loadDashboard(selectedRound, true))} disabled={showGeneral ? (generalRefreshing || generalLoading) : (refreshing || loading)} className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-brand-primary shadow-sm disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${(showGeneral ? generalRefreshing : refreshing) ? 'animate-spin' : ''}`} /> Atualizar</button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" /> Somente leitura</div>
          </div>
        </header>

        <div className="inline-flex flex-wrap rounded-2xl border border-brand-border bg-white p-1 shadow-sm">
          <a href={getGeneralHref()} onClick={handleGeneralNavigation} aria-current={showGeneral ? 'page' : undefined} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${showGeneral ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}>Geral</a>
          {AVAILABLE_ROUNDS.map(round => (
            <a
              key={round}
              href={getRoundHref(round)}
              onClick={(event) => handleRoundNavigation(event, round)}
              aria-current={selectedRound === round ? 'page' : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${selectedRound === round ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-text-muted hover:bg-brand-bg'}`}
            >
              Rodada {round}
            </a>
          ))}
        </div>

        {(showGeneral ? generalError : errorMessage) ? <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Não foi possível atualizar os dados.</p><p className="mt-1">{showGeneral ? generalError : errorMessage}</p></div></div> : null}

        {!showGeneral && loading && !data ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm"><div className="flex items-center gap-3 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Lendo a Rodada {selectedRound} pelo n8n...</div></div> : null}

        {showGeneral && generalLoading && generalData.length === 0 ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-brand-border bg-white shadow-sm"><div className="flex items-center gap-3 text-sm text-brand-text-muted"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Consolidando todas as rodadas...</div></div> : null}

        {showGeneral && generalData.length > 0 ? <GeneralDashboardSection payloads={generalData} /> : null}

        {!showGeneral && data && overall ? (
          <FinancialSection
            title={`Financeiro — Rodada ${selectedRound}`}
            overall={overall}
            financialConfig={data.financial_config}
            helper={`Estimativa financeira do convite inicial da Rodada ${selectedRound}.`}
          />
        ) : null}

        {!showGeneral && data && isRound1 && overall ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 1 — visão geral</h2></div><p className="mt-1 text-xs text-brand-text-muted">Fonte histórica das abas de origem + Dados Follow-up. Presença no grupo usa o status atual MEMBRO.</p></div><div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Workflow {data.workflow || 'n8n'}</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="Envios registrados" value={Number(overall.sent || 0)} helper="Rodada 1" icon={<Send className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos envios`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos envios`} icon={<UserRoundCheck className="h-5 w-5" />} />
                <MetricCard label="Sem interesse" value={overall.no_interest} helper="Respostas negativas" icon={<AlertTriangle className="h-5 w-5" />} />
                <MetricCard label="No grupo agora" value={overall.group_members} helper="Status atual MEMBRO" icon={<Users className="h-5 w-5" />} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><RateCard label="Taxa de resposta" value={overall.response_rate} /><RateCard label="Taxa de interesse" value={overall.interest_rate} /><RateCard label="Interesse entre respostas" value={overall.response_to_interest_rate} /></div>
            </section>

            <section><div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Desempenho por área — Rodada 1</h2></div><div className="grid gap-4 lg:grid-cols-2">{(data.areas || []).map(area => <div key={area.name} className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-bold text-brand-text">{area.name}</h3><p className="mt-1 text-xs text-brand-text-muted">Coorte histórica da Rodada 1</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{area.current_group_members} no grupo</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Envios', area.sent], ['Respostas', area.responses], ['Interessados', area.interested], ['Sem interesse', area.no_interest]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-brand-bg p-3"><p className="text-xs text-brand-text-muted">{label}</p><p className="mt-1 text-xl font-bold text-brand-text">{value}</p></div>)}</div><div className="mt-4 grid grid-cols-3 gap-3"><RateCard label="Resposta" value={area.response_rate} /><RateCard label="Interesse" value={area.interest_rate} /><RateCard label="Interesse / respostas" value={area.response_to_interest_rate} /></div></div>)}</div></section>

            {followups?.available ? <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-brand-primary"><MessageCircleReply className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Follow-ups — Rodada 1</h2></div><p className="mt-1 text-xs text-brand-text-muted">Histórico da Rodada 1. Os follow-ups pré-grupo estão atualmente pausados.</p><FollowupQueueCards followups={followups} /><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Follow-up sem resposta" value={Number(followups.sent?.no_response || 0)} helper="Enviados" icon={<Send className="h-5 w-5" />} /><MetricCard label="Lembrete de grupo" value={Number(followups.sent?.group_reminder || 0)} helper="Enviados" icon={<Users className="h-5 w-5" />} /><MetricCard label="Sem cadastro" value={Number(followups.sent?.no_registration || 0)} helper="Enviados" icon={<UserRoundCheck className="h-5 w-5" />} /><MetricCard label="Entraram após follow-up" value={Number(followups.conversion?.entered_after_any || 0)} helper={`${formatPercent(followups.conversion?.conversion_rate)} dos pré-grupo`} icon={<CheckCircle2 className="h-5 w-5" />} /></div></section> : null}

            <MembersSection round={1} members={members} total={overall.group_members} />
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 1</h2><p className="mt-1 text-sm text-brand-text-muted">A base completa continua nas abas de origem do Google Sheets.</p></div></div><div className="flex flex-wrap gap-2">{(data.source_sheets || []).map(sheet => <a key={sheet.name} href={sheet.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-bold text-brand-primary shadow-sm hover:bg-brand-bg"><ExternalLink className="h-4 w-4" /> {sheet.name}</a>)}</div></div></section>
          </>
        ) : null}

        {!showGeneral && data && isRound2 && overall && variants ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 2 — visão geral</h2></div><p className="mt-1 text-xs text-brand-text-muted">Fonte: Dashboard + Config Automação + Dados Follow-up, consultados pelo workflow {data.workflow || 'n8n'}.</p></div><div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Atualização automática a cada 60 s</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><MetricCard label="Processados" value={Number(overall.processed || 0)} helper={`${Number(overall.planned || 0)} planejados`} icon={<Activity className="h-5 w-5" />} /><MetricCard label="Entregues" value={Number(overall.delivered || 0)} helper={`${formatPercent(overall.delivery_rate)} de entrega`} icon={<CheckCircle2 className="h-5 w-5" />} /><MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos entregues`} icon={<MessageCircleReply className="h-5 w-5" />} /><MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos entregues`} icon={<UserRoundCheck className="h-5 w-5" />} /><MetricCard label="No grupo agora" value={overall.group_members} helper="Presença atual, não causal" icon={<Users className="h-5 w-5" />} /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Sem confirmação Meta</p><p className="mt-1 text-2xl font-bold text-amber-900">{Number(overall.pending_meta || 0)}</p></div><div className="rounded-2xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">Falhas</p><p className="mt-1 text-2xl font-bold text-red-900">{Number(overall.failures || 0)}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{overall.no_interest}</p></div></div>
            </section>

            <section className={`rounded-3xl border p-5 shadow-sm ${decision?.final ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex items-start gap-3"><Trophy className={`mt-0.5 h-6 w-6 shrink-0 ${decision?.final ? 'text-emerald-700' : 'text-amber-700'}`} /><div><h2 className={`font-display text-lg font-bold ${decision?.final ? 'text-emerald-900' : 'text-amber-900'}`}>{decision?.final ? `Fase 1 encerrada — Variante ${decision.winner || '—'} vencedora` : 'Fase 1 ainda em análise'}</h2>{decision?.winner_template ? <p className="mt-1 text-sm font-semibold text-emerald-800">{templateLabels[decision.winner_template] || decision.winner_template}</p> : null}<p className={`mt-2 text-sm ${decision?.final ? 'text-emerald-800' : 'text-amber-800'}`}>{decision?.reason || 'Aguardando encerramento da janela de análise.'}</p></div></div><div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm"><p className="text-brand-text-muted">Critério de fechamento</p><p className="mt-1 font-bold text-brand-text">{decision?.criterion || '—'}</p><p className="mt-3 text-brand-text-muted">Encerrada em</p><p className="mt-1 font-bold text-brand-text">{decision?.closed_at_label || '—'}</p></div></div></section>

            <section><div className="mb-3 flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Comparativo A × B</h2></div><div className="grid gap-4 xl:grid-cols-2"><VariantCard metric={variants.A} winner={decision?.final ? decision.winner : undefined} /><VariantCard metric={variants.B} winner={decision?.final ? decision.winner : undefined} /></div></section>
            <FunnelSection title="Funil da Rodada 2" funnel={data.funnel} base={Number(overall.processed || 0)} />

            {followups?.available ? <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-brand-primary"><MessageCircleReply className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Follow-ups — Rodada 2</h2></div><p className="mt-1 text-xs text-brand-text-muted">Histórico dos 100 contatos da Fase 1. Os follow-ups pré-grupo estão pausados; o de cadastro permanece em avaliação separada.</p></div><span className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-bold text-brand-text-muted">{followups.scope}</span></div><FollowupQueueCards followups={followups} /><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><MetricCard label="Receberam pré-grupo" value={Number(followups.conversion?.received_pre_group || 0)} helper="Sem resposta ou grupo" icon={<Send className="h-5 w-5" />} /><MetricCard label="Entraram após follow-up" value={Number(followups.conversion?.entered_after_any || 0)} helper={`${Number(followups.conversion?.current_members || 0)} membros atuais`} icon={<Users className="h-5 w-5" />} /><div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-brand-text-muted">Conversão → grupo</p><p className="mt-2 text-3xl font-display font-bold text-brand-text">{formatPercent(followups.conversion?.conversion_rate)}</p><p className="mt-1 text-xs text-brand-text-muted">Conversão atribuída</p></div></div>{followups.ab ? <div className="mt-5"><h3 className="font-display text-base font-bold text-brand-primary">A/B histórico dos follow-ups</h3><div className="mt-3 grid gap-4 xl:grid-cols-2"><FollowupABCard title="Sem resposta" A={followups.ab.no_response.A} B={followups.ab.no_response.B} /><FollowupABCard title="Lembrete de grupo" A={followups.ab.group_reminder.A} B={followups.ab.group_reminder.B} /></div></div> : null}</section> : null}

            <MembersSection round={2} members={members} total={overall.group_members} />
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 2</h2><p className="mt-1 text-sm text-brand-text-muted">A listagem completa permanece no Google Sheets para consulta operacional.</p></div></div><a href={contactsSheetUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"><ExternalLink className="h-4 w-4" /> Abrir contatos no Google Sheets</a></div></section>
          </>
        ) : null}

        {!showGeneral && data && isRound3 && overall ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div><div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 3 — visão geral</h2></div><p className="mt-1 text-xs text-brand-text-muted">Rodada encerrada. Coorte histórica congelada no Sheets, com 100 contatos processados.</p></div>
                <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Workflow {data.workflow || 'n8n'}</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <MetricCard label="Planejados" value={Number(overall.planned || 0)} helper="Coorte congelada" icon={<Users className="h-5 w-5" />} />
                <MetricCard label="Liberados" value={Number(overall.released || 0)} helper="SIM na origem" icon={<ShieldCheck className="h-5 w-5" />} />
                <MetricCard label="Processados" value={Number(overall.processed || 0)} helper="Com status de disparo" icon={<Activity className="h-5 w-5" />} />
                <MetricCard label="Enviados" value={Number(overall.sent || 0)} helper={`${Number(overall.pending_meta || 0)} aguardando callback`} icon={<Send className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos enviados`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos enviados`} icon={<UserRoundCheck className="h-5 w-5" />} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold text-red-800">Erros</p><p className="mt-1 text-2xl font-bold text-red-900">{Number(overall.failures || 0)}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{overall.no_interest}</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">No grupo agora</p><p className="mt-1 text-2xl font-bold text-emerald-900">{overall.group_members}</p></div></div>
            </section>

            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" /><div><h2 className="font-display text-lg font-bold text-blue-900">Estratégia da Rodada 3</h2><p className="mt-1 text-sm font-semibold text-blue-800">{templateLabels[data.template || ''] || data.template || 'Template não definido'}</p><p className="mt-2 text-sm text-blue-800">A Rodada 3 utilizou o template vencedor da Rodada 2. Não houve novo A/B no convite inicial.</p></div></div>
                <div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm"><p className="text-brand-text-muted">Status operacional</p><p className="mt-1 font-bold text-brand-text">{data.status || '—'}</p><p className="mt-3 text-brand-text-muted">Origem da decisão</p><p className="mt-1 font-bold text-brand-text">{data.origin_decision || '—'}</p></div>
              </div>
            </section>

            <FunnelSection title="Funil da Rodada 3" funnel={data.funnel} base={Number(overall.planned || 0)} />

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><MessageCircleReply className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Política de follow-up — Rodada 3</h2><p className="mt-1 text-sm text-brand-text-muted">Os follow-ups da captação estão desativados por decisão operacional e assim permanecem após o encerramento da rodada.</p></div></div></section>

            <MembersSection round={3} members={members} total={overall.group_members} />

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 3</h2><p className="mt-1 text-sm text-brand-text-muted">A fotografia final da Rodada 3 está congelada na aba de controle e não será alterada pelos disparos seguintes.</p></div></div><a href={contactsSheetUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"><ExternalLink className="h-4 w-4" /> Abrir Rodada 3 no Google Sheets</a></div></section>
          </>
        ) : null}

        {!showGeneral && data && isRound4 && overall ? (
          <>
            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div><div className="flex items-center gap-2 text-brand-primary"><BarChart3 className="h-5 w-5" /><h2 className="font-display text-lg font-bold">Rodada 4 — visão geral</h2></div><p className="mt-1 text-xs text-brand-text-muted">Coorte fixa de 100 contatos de Psicologia e Saúde Mental, selecionada após o encerramento da Rodada 3.</p></div>
                <div className="text-left text-xs text-brand-text-muted md:text-right"><p>Última atualização</p><p className="mt-1 font-bold text-brand-text">{formatDateTime(data.updated_at)}</p><p className="mt-1">Workflow {data.workflow || 'n8n'}</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <MetricCard label="Planejados" value={Number(overall.planned || 0)} helper="Coorte fixa" icon={<Users className="h-5 w-5" />} />
                <MetricCard label="Liberados" value={Number(overall.released || 0)} helper="SIM na origem" icon={<ShieldCheck className="h-5 w-5" />} />
                <MetricCard label="Processados" value={Number(overall.processed || 0)} helper="Com status de disparo" icon={<Activity className="h-5 w-5" />} />
                <MetricCard label="Enviados" value={Number(overall.sent || 0)} helper={`${Number(overall.pending_meta || 0)} aguardando callback`} icon={<Send className="h-5 w-5" />} />
                <MetricCard label="Respostas" value={overall.responses} helper={`${formatPercent(overall.response_rate)} dos enviados`} icon={<MessageCircleReply className="h-5 w-5" />} />
                <MetricCard label="Interessados" value={overall.interested} helper={`${formatPercent(overall.interest_rate)} dos enviados`} icon={<UserRoundCheck className="h-5 w-5" />} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold text-red-800">Erros</p><p className="mt-1 text-2xl font-bold text-red-900">{Number(overall.failures || 0)}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Sem interesse</p><p className="mt-1 text-2xl font-bold text-slate-900">{overall.no_interest}</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">No grupo agora</p><p className="mt-1 text-2xl font-bold text-emerald-900">{overall.group_members}</p></div></div>
            </section>

            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" /><div><h2 className="font-display text-lg font-bold text-blue-900">Estratégia da Rodada 4</h2><p className="mt-1 text-sm font-semibold text-blue-800">{templateLabels[data.template || ''] || data.template || 'Template não definido'}</p><p className="mt-2 text-sm text-blue-800">A Rodada 4 mantém o template vencedor da Rodada 2, validado também na Rodada 3. Não há novo A/B no convite inicial.</p></div></div>
                <div className="min-w-64 rounded-2xl bg-white/80 px-4 py-3 text-xs shadow-sm"><p className="text-brand-text-muted">Status operacional</p><p className="mt-1 font-bold text-brand-text">{data.status || '—'}</p><p className="mt-3 text-brand-text-muted">Origem da decisão</p><p className="mt-1 font-bold text-brand-text">{data.origin_decision || '—'}</p></div>
              </div>
            </section>

            <FunnelSection title="Funil da Rodada 4" funnel={data.funnel} base={Number(overall.planned || 0)} />

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><MessageCircleReply className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Política de follow-up — Rodada 4</h2><p className="mt-1 text-sm text-brand-text-muted">Os follow-ups da captação permanecem desativados por decisão operacional. Nenhum follow-up será enviado nesta rodada.</p></div></div></section>

            <MembersSection round={4} members={members} total={overall.group_members} />

            <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-6 w-6 text-brand-primary" /><div><h2 className="font-display text-lg font-bold text-brand-primary">Contatos da Rodada 4</h2><p className="mt-1 text-sm text-brand-text-muted">A coorte de 100 contatos está fixa na aba Rodada 4 - Controle e a liberação é acompanhada pela origem.</p></div></div><a href={contactsSheetUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"><ExternalLink className="h-4 w-4" /> Abrir Rodada 4 no Google Sheets</a></div></section>
          </>
        ) : null}
      </div>
    </main>
  );
}