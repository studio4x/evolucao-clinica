import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '../supabaseClient';

const SHEETS = [
  'Psicologia e Saúde Mental',
  'Fisioterapia',
  'Terapia Ocupacional',
  'Enfermagem - Home Care',
  'Área não confirmada',
  'Teste'
] as const;

const TEMPLATES = [
  {
    value: 'convite_jornada_ec_15dias_v1',
    label: 'Recomendado — Jornada 15 dias',
    description: 'Vencedor da Rodada 2 e modelo principal recomendado para a Rodada 3.'
  },
  {
    value: 'convite_jornada_ec_organizacao_v2',
    label: 'Organização v2 — não recomendado na Rodada 3',
    description: 'Variante B da Rodada 2. Permanece disponível apenas para uso excepcional.'
  },
  {
    value: 'convite_jornada_evolucao_clinica',
    label: 'Convite Evolução Clínica',
    description: 'Modelo legado aprovado para convite.'
  }
] as const;

type DispatchResult = {
  ok: boolean;
  accepted?: boolean;
  request_id?: string;
  sheet?: string;
  quantity?: number;
  template?: string;
  workflow?: string;
  poll_after_ms?: number;
  error?: string;
};

type DispatchStatusResult = {
  ok: boolean;
  request_id?: string;
  status?: 'ACEITO' | 'PROCESSANDO' | 'FINALIZANDO' | 'CONCLUIDO' | 'CONCLUIDO_COM_ALERTA' | 'BLOQUEADO' | 'INTERROMPIDO' | 'ERRO';
  complete?: boolean;
  severity?: 'info' | 'success' | 'warning' | 'error';
  message?: string;
  started?: boolean;
  batch_completed?: boolean;
  execution_id?: string;
  workflow_version?: string;
  selected?: number;
  processed?: number;
  pending?: number;
  progress_percent?: number;
  current_row?: number;
  source_rows?: string;
  group_notice?: 'AGUARDANDO' | 'PENDENTE' | 'OK' | 'ERRO';
  group_http_status?: number;
  last_event?: string;
  updated_at?: string;
  error_node?: string;
  error_message?: string;
  error_execution_url?: string;
  error?: string;
};

type Round3ReadinessResult = {
  ok: boolean;
  status?: string;
  template?: string;
  updated_at?: string;
  overall?: {
    planned?: number;
    released?: number;
    processed?: number;
  };
  error?: string;
};

type PersistedDispatchRun = {
  result: DispatchResult;
  statusResult: DispatchStatusResult | null;
  dispatchStartedAt: number;
  savedAt: number;
};

const DISPATCH_RUN_STORAGE_KEY = 'evolucao-clinica:campaign-dispatch:active-run';
const DISPATCH_RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const readPersistedDispatchRun = (): PersistedDispatchRun | null => {
  try {
    const raw = window.localStorage.getItem(DISPATCH_RUN_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedDispatchRun>;
    const requestId = String(parsed.result?.request_id || '').trim();
    const startedAt = Number(parsed.dispatchStartedAt || 0);
    const savedAt = Number(parsed.savedAt || 0);
    const expired = !savedAt || Date.now() - savedAt > DISPATCH_RUN_MAX_AGE_MS;

    if (
      expired ||
      parsed.result?.accepted !== true ||
      !/^[A-Za-z0-9-]{8,100}$/.test(requestId) ||
      !Number.isFinite(startedAt) ||
      startedAt <= 0
    ) {
      window.localStorage.removeItem(DISPATCH_RUN_STORAGE_KEY);
      return null;
    }

    return {
      result: parsed.result,
      statusResult: parsed.statusResult || null,
      dispatchStartedAt: startedAt,
      savedAt
    };
  } catch (error) {
    console.warn('[AdminCampaignDispatch] Não foi possível restaurar a execução salva:', error);
    window.localStorage.removeItem(DISPATCH_RUN_STORAGE_KEY);
    return null;
  }
};

const errorLabels: Record<string, string> = {
  authentication_required: 'Sua sessão não foi encontrada. Faça login novamente.',
  invalid_session: 'Sua sessão expirou. Faça login novamente.',
  admin_only: 'Esta página é restrita a administradores.',
  invalid_sheet: 'A aba selecionada não é permitida.',
  invalid_template: 'O template selecionado não é permitido.',
  invalid_quantity: 'A quantidade deve estar entre 1 e 50.',
  invalid_request_id: 'O identificador da execução é inválido.',
  confirmation_required: 'Confirme as condições do disparo antes de executar.',
  dispatch_integration_not_configured: 'A integração server-side com o n8n ainda não foi configurada.',
  n8n_rejected_request: 'O n8n recusou a solicitação. Verifique a configuração da integração.',
  n8n_timeout: 'O n8n demorou demais para confirmar o recebimento.',
  n8n_unavailable: 'Não foi possível alcançar o n8n neste momento.',
  n8n_status_rejected: 'O n8n recusou a consulta de acompanhamento.',
  n8n_status_timeout: 'A consulta de acompanhamento demorou além do esperado.',
  n8n_status_unavailable: 'Não foi possível consultar o andamento no n8n.',
  round3_data_incomplete: 'Os dados de preparação da Rodada 3 ainda não estão completos na fonte.',
  server_configuration_missing: 'Configuração server-side indisponível.',
  admin_validation_failed: 'Não foi possível validar a permissão administrativa.'
};

const statusLabels: Record<string, string> = {
  ACEITO: 'Solicitação aceita',
  PROCESSANDO: 'Processando lote',
  FINALIZANDO: 'Finalizando',
  CONCLUIDO: 'Execução completa',
  CONCLUIDO_COM_ALERTA: 'Concluído com alerta',
  BLOQUEADO: 'Execução bloqueada',
  INTERROMPIDO: 'Execução interrompida',
  ERRO: 'Erro na execução'
};

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return 'aguardando atualização';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
};

const isSafeN8nExecutionUrl = (value?: string) => {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'n8n.studio4x.com.br' &&
      url.pathname.includes('/executions/')
    );
  } catch {
    return false;
  }
};

export default function AdminCampaignDispatch() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [sheet, setSheet] = useState<(typeof SHEETS)[number]>('Psicologia e Saúde Mental');
  const [quantity, setQuantity] = useState(1);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['value']>('convite_jornada_ec_15dias_v1');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [statusResult, setStatusResult] = useState<DispatchStatusResult | null>(null);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [dispatchStartedAt, setDispatchStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [round3Readiness, setRound3Readiness] = useState<Round3ReadinessResult | null>(null);
  const [round3ReadinessLoading, setRound3ReadinessLoading] = useState(false);
  const [round3ReadinessError, setRound3ReadinessError] = useState('');
  const [runStateRestored, setRunStateRestored] = useState(false);
  const [runRecovered, setRunRecovered] = useState(false);

  useEffect(() => {
    const persisted = readPersistedDispatchRun();

    if (persisted) {
      setResult(persisted.result);
      setStatusResult(persisted.statusResult);
      setDispatchStartedAt(persisted.dispatchStartedAt);
      const elapsedReference = persisted.statusResult?.complete ? persisted.savedAt : Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((elapsedReference - persisted.dispatchStartedAt) / 1000)));
      setRunRecovered(true);

      if (SHEETS.includes(persisted.result.sheet as (typeof SHEETS)[number])) {
        setSheet(persisted.result.sheet as (typeof SHEETS)[number]);
      }

      const savedQuantity = Number(persisted.result.quantity || 0);
      if (Number.isInteger(savedQuantity) && savedQuantity >= 1 && savedQuantity <= 50) {
        setQuantity(savedQuantity);
      }

      if (TEMPLATES.some(item => item.value === persisted.result.template)) {
        setTemplate(persisted.result.template as (typeof TEMPLATES)[number]['value']);
      }
    }

    setRunStateRestored(true);
  }, []);

  useEffect(() => {
    if (!runStateRestored) return;

    try {
      if (result?.accepted && result.request_id && dispatchStartedAt) {
        const persisted: PersistedDispatchRun = {
          result,
          statusResult,
          dispatchStartedAt,
          savedAt: Date.now()
        };
        window.localStorage.setItem(DISPATCH_RUN_STORAGE_KEY, JSON.stringify(persisted));
      } else {
        window.localStorage.removeItem(DISPATCH_RUN_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('[AdminCampaignDispatch] Não foi possível salvar o acompanhamento da execução:', error);
    }
  }, [dispatchStartedAt, result, runStateRestored, statusResult]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (!session?.access_token) {
        window.location.assign('/login');
        return;
      }
      setAccessToken(session.access_token);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const loadRound3Readiness = useCallback(async () => {
    if (!accessToken) return;

    setRound3ReadinessLoading(true);
    try {
      const response = await fetch('/api/admin/campaign-dashboard?round=3', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as Round3ReadinessResult;
      if (!response.ok || !body.ok) {
        setRound3ReadinessError(errorLabels[String(body.error || '')] || 'Não foi possível consultar a preparação da Rodada 3 agora.');
        return;
      }

      setRound3Readiness(body);
      setRound3ReadinessError('');
    } catch (error) {
      console.error('[AdminCampaignDispatch] Falha ao consultar preparação da Rodada 3:', error);
      setRound3ReadinessError('Falha de comunicação ao consultar a preparação da Rodada 3.');
    } finally {
      setRound3ReadinessLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadRound3Readiness();
  }, [accessToken, loadRound3Readiness]);

  useEffect(() => {
    if (!dispatchStartedAt || statusResult?.complete) return;

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - dispatchStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [dispatchStartedAt, statusResult?.complete]);

  useEffect(() => {
    const requestId = result?.request_id;
    if (!requestId || !accessToken || statusResult?.complete) return;

    let cancelled = false;
    let requestInFlight = false;

    const pollStatus = async () => {
      if (requestInFlight || cancelled) return;
      requestInFlight = true;
      setStatusChecking(true);

      try {
        const response = await fetch(`/api/admin/campaign-dispatch?request_id=${encodeURIComponent(requestId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          },
          cache: 'no-store'
        });

        const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DispatchStatusResult;
        if (cancelled) return;

        if (!response.ok || !body.ok) {
          setStatusError(errorLabels[String(body.error || '')] || 'Não foi possível atualizar o andamento agora.');
          return;
        }

        setStatusResult(body);
        setStatusError('');
      } catch (error) {
        if (!cancelled) {
          console.error('[AdminCampaignDispatch] Falha ao consultar status:', error);
          setStatusError('A atualização automática falhou temporariamente. Uma nova tentativa será feita.');
        }
      } finally {
        requestInFlight = false;
        if (!cancelled) setStatusChecking(false);
      }
    };

    const pollIntervalMs = Math.min(
      60_000,
      Math.max(10_000, Number(result.poll_after_ms || 15_000))
    );

    const firstPoll = window.setTimeout(() => void pollStatus(), 1500);
    const timer = window.setInterval(() => void pollStatus(), pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(firstPoll);
      window.clearInterval(timer);
    };
  }, [accessToken, result?.poll_after_ms, result?.request_id, statusResult?.complete]);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((item) => item.value === template),
    [template]
  );

  const runActive = Boolean(result?.accepted && result.request_id && !statusResult?.complete);
  const currentStatus = statusResult?.status || (result?.accepted ? 'ACEITO' : '');
  const executionStarted = Boolean(statusResult?.started);
  const batchCompleted = Boolean(statusResult?.batch_completed);
  const groupNoticeOk = statusResult?.group_notice === 'OK';
  const groupNoticeError = statusResult?.group_notice === 'ERRO';
  const completeSuccess = currentStatus === 'CONCLUIDO';
  const terminalWithIssue = Boolean(statusResult?.complete && !completeSuccess);
  const safeErrorExecutionUrl = isSafeN8nExecutionUrl(statusResult?.error_execution_url)
    ? statusResult?.error_execution_url
    : '';
  const round3Configuration = sheet === 'Psicologia e Saúde Mental';
  const winnerTemplateSelected = template === 'convite_jornada_ec_15dias_v1';
  const round3Planned = Math.max(0, Number(round3Readiness?.overall?.planned || 0));
  const round3Released = Math.max(0, Number(round3Readiness?.overall?.released || 0));
  const round3Processed = Math.max(0, Number(round3Readiness?.overall?.processed || 0));
  const round3ReadinessAvailable = Boolean(round3Readiness?.ok);
  const noRound3ContactsReleased = round3Configuration && round3ReadinessAvailable && round3Released === 0;
  const quantityExceedsReleased = round3Configuration && round3ReadinessAvailable && quantity > round3Released;

  const requestedTotal = Math.max(0, Number(result?.quantity || 0));
  const selectedTotal = Math.max(0, Number(statusResult?.selected || 0));
  const progressTotal = selectedTotal > 0 ? selectedTotal : requestedTotal;
  const progressProcessed = Math.min(
    progressTotal,
    Math.max(0, Number(statusResult?.processed || 0))
  );
  const progressPending = Math.max(
    0,
    Number.isFinite(Number(statusResult?.pending))
      ? Number(statusResult?.pending || 0)
      : progressTotal - progressProcessed
  );
  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      selectedTotal > 0 && Number.isFinite(Number(statusResult?.progress_percent))
        ? Number(statusResult?.progress_percent || 0)
        : progressTotal > 0
          ? Math.round((progressProcessed / progressTotal) * 100)
          : 0
    )
  );
  const pollSeconds = Math.round(
    Math.min(60_000, Math.max(10_000, Number(result?.poll_after_ms || 15_000))) / 1000
  );

  const resetRun = () => {
    if (runActive) return;
    window.localStorage.removeItem(DISPATCH_RUN_STORAGE_KEY);
    setResult(null);
    setStatusResult(null);
    setStatusError('');
    setErrorMessage('');
    setDispatchStartedAt(null);
    setElapsedSeconds(0);
    setConfirmed(false);
    setRunRecovered(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || submitting || runActive) return;

    setSubmitting(true);
    setResult(null);
    setStatusResult(null);
    setStatusError('');
    setErrorMessage('');
    setDispatchStartedAt(null);
    setElapsedSeconds(0);
    setRunRecovered(false);
    window.localStorage.removeItem(DISPATCH_RUN_STORAGE_KEY);

    try {
      const response = await fetch('/api/admin/campaign-dispatch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sheet,
          quantity,
          template,
          confirmed
        })
      });

      const body = await response.json().catch(() => ({ ok: false, error: 'invalid_response' })) as DispatchResult;

      if (!response.ok || !body.ok) {
        setErrorMessage(errorLabels[String(body.error || '')] || 'Não foi possível iniciar o lote.');
        return;
      }

      setResult(body);
      setStatusResult({
        ok: true,
        request_id: body.request_id,
        status: 'ACEITO',
        complete: false,
        severity: 'info',
        message: 'Solicitação aceita. Aguardando o n8n registrar o início do processamento.',
        started: false,
        batch_completed: false,
        selected: body.quantity || 0,
        processed: 0,
        pending: body.quantity || 0,
        progress_percent: 0,
        group_notice: 'AGUARDANDO'
      });
      setDispatchStartedAt(Date.now());
      setConfirmed(false);
    } catch (error) {
      console.error('[AdminCampaignDispatch] Falha ao iniciar lote:', error);
      setErrorMessage('Falha de comunicação ao iniciar o lote.');
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <a
              href="/admin/jornada"
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Jornada 15 dias
            </a>
            <h1 className="text-2xl font-display font-bold text-brand-primary md:text-3xl">
              Central de Disparos da Captação
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">
              Configure, inicie e acompanhe um lote do workflow de captação sem editar os parâmetros diretamente no n8n.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Acesso administrativo
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-text">
              <FileSpreadsheet className="h-4 w-4 text-brand-primary" />
              Planilha continua mandando
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
              Apenas linhas com <strong>Liberado para disparo? = SIM</strong> entram no lote, além das demais travas do workflow.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-text">
              <MessageSquareText className="h-4 w-4 text-brand-primary" />
              Aviso de conclusão
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
              O grupo operacional configurado recebe a mensagem de conclusão ao término normal do lote.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-text">
              <ShieldCheck className="h-4 w-4 text-brand-primary" />
              Travas preservadas
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
              Brasil, dias úteis, janela 08h–20h, intervalo de 60 s, limite máximo de 50 e bloqueios de status continuam ativos.
            </p>
          </div>
        </div>

        <section className="rounded-3xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm md:p-6" aria-live="polite">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-base font-bold text-brand-primary">
                <ShieldCheck className="h-5 w-5" />
                Pré-checagem da Rodada 3
              </div>
              <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">
                Leitura do dashboard administrativo. “Liberados” indica apenas <strong>SIM na origem</strong>; a elegibilidade final ainda depende de todas as travas do workflow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRound3Readiness()}
              disabled={round3ReadinessLoading}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-primary transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${round3ReadinessLoading ? 'animate-spin' : ''}`} />
              Atualizar dados
            </button>
          </div>

          {round3ReadinessLoading && !round3Readiness ? (
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-brand-text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
              Consultando a preparação atual...
            </div>
          ) : round3Readiness ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">Planejados</p>
                  <p className="mt-1 text-xl font-bold text-brand-text">{round3Planned}</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">Liberados na origem</p>
                  <p className="mt-1 text-xl font-bold text-brand-text">{round3Released}</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">Processados</p>
                  <p className="mt-1 text-xl font-bold text-brand-text">{round3Processed}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-brand-text-muted sm:flex-row sm:items-center sm:justify-between">
                <span><strong>Status:</strong> {round3Readiness.status || 'PREPARADA / AGUARDANDO ENVIOS'}</span>
                <span><strong>Atualizado:</strong> {formatDateTime(round3Readiness.updated_at)}</span>
              </div>
              {round3Released === 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Nenhum contato da Rodada 3 está liberado na origem. A execução permanece bloqueada nesta configuração até uma nova consulta confirmar pelo menos um contato liberado.
                </div>
              )}
            </div>
          ) : null}

          {round3ReadinessError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{round3ReadinessError} A consulta indisponível não libera contatos nem inicia envios.</span>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm md:p-7" aria-live="polite">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-base font-bold text-brand-primary">
                <Activity className="h-5 w-5" />
                Processamento em tempo real
              </div>
              <p className="mt-1 text-xs text-brand-text-muted">
                O andamento é atualizado automaticamente pelo request_id, logs_execucao e estado das linhas do lote.
              </p>
            </div>
            {result?.accepted ? (
              <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold ${
                completeSuccess
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : terminalWithIssue
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}>
                {runActive || statusChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {statusLabels[currentStatus] || 'Acompanhando'}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-brand-border bg-brand-bg/40 px-3 py-1.5 text-xs font-semibold text-brand-text-muted">
                <Clock className="h-3.5 w-3.5" />
                Nenhum lote em andamento
              </div>
            )}
          </div>

          {runRecovered && result?.accepted && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
              statusResult?.complete
                ? terminalWithIssue
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-blue-200 bg-blue-50 text-blue-900'
            }`}>
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {statusResult?.complete ? (
                  <>
                    <strong>Execução finalizada restaurada.</strong> O último estado confirmado foi recuperado do navegador. Não há processamento em andamento para este request_id.
                  </>
                ) : (
                  <>
                    <strong>Acompanhamento recuperado.</strong> Esta execução foi restaurada após a atualização ou reabertura da página e continuará sendo consultada pelo mesmo request_id.
                  </>
                )}
              </span>
            </div>
          )}

          {!result?.accepted ? (
            <div className="mt-5 rounded-2xl border border-dashed border-brand-border bg-brand-bg/30 px-5 py-6 text-center">
              <p className="text-sm font-semibold text-brand-text">O próximo lote aparecerá aqui assim que for aceito pelo n8n.</p>
              <p className="mt-1 text-xs text-brand-text-muted">A página continuará aberta e confirmará a execução completa sem precisar consultar o editor do workflow.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Solicitação aceita', done: true, active: false },
                  { label: 'Workflow iniciado', done: executionStarted, active: !executionStarted && runActive },
                  { label: 'Lote processado', done: batchCompleted, active: executionStarted && !batchCompleted && runActive },
                  { label: 'Aviso operacional', done: groupNoticeOk, warning: groupNoticeError, active: batchCompleted && !statusResult?.complete }
                ].map((step, index) => (
                  <div
                    key={step.label}
                    className={`rounded-2xl border px-4 py-3 ${
                      step.warning
                        ? 'border-amber-200 bg-amber-50'
                        : step.done
                          ? 'border-emerald-200 bg-emerald-50'
                          : step.active
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-brand-border bg-brand-bg/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {step.active ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-700" />
                      ) : step.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                      ) : step.warning ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-brand-border text-[9px] font-bold text-brand-text-muted">{index + 1}</span>
                      )}
                      <span className="text-xs font-bold text-brand-text">{step.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-brand-border bg-brand-bg/25 px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">Progresso do lote</p>
                    <p className="mt-1 text-lg font-bold text-brand-text">
                      {progressProcessed} de {progressTotal || '-'} envios finalizados
                    </p>
                  </div>
                  <div className="text-sm font-bold text-brand-primary">{progressPercent}%</div>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${completeSuccess ? 'bg-emerald-500' : 'bg-brand-primary'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-col gap-1 text-[11px] text-brand-text-muted sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {progressPending > 0 ? `${progressPending} envio(s) ainda pendente(s)` : progressTotal > 0 ? 'Todos os contatos do lote foram processados' : 'Aguardando a seleção do lote'}
                    {statusResult?.current_row && progressPending > 0 ? ` · próxima linha: ${statusResult.current_row}` : ''}
                  </span>
                  <span>Atualização aproximada a cada {pollSeconds}s</span>
                </div>
              </div>

              <div className={`rounded-2xl border px-4 py-4 ${
                completeSuccess
                  ? 'border-emerald-200 bg-emerald-50'
                  : terminalWithIssue
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-blue-200 bg-blue-50/70'
              }`}>
                <div className="flex items-start gap-3">
                  {runActive ? (
                    <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-700" />
                  ) : completeSuccess ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brand-text">
                      {statusResult?.message || 'Acompanhando a execução do lote.'}
                    </p>

                    {currentStatus === 'ERRO' && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-950">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Detalhes da falha
                        </div>
                        <dl className="mt-2 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
                          {statusResult?.error_node && (
                            <div>
                              <dt className="font-semibold text-red-800">Node</dt>
                              <dd className="mt-0.5 break-words">{statusResult.error_node}</dd>
                            </div>
                          )}
                          {statusResult?.execution_id && (
                            <div>
                              <dt className="font-semibold text-red-800">Execução n8n</dt>
                              <dd className="mt-0.5 break-all">{statusResult.execution_id}</dd>
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <dt className="font-semibold text-red-800">Mensagem</dt>
                            <dd className="mt-0.5 break-words">{statusResult?.error_message || statusResult?.message || 'Falha sem mensagem detalhada.'}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="font-semibold text-red-800">Request ID</dt>
                            <dd className="mt-0.5 break-all">{result.request_id}</dd>
                          </div>
                        </dl>
                        {safeErrorExecutionUrl && (
                          <a
                            href={safeErrorExecutionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-800 transition hover:bg-red-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Abrir execução no n8n
                          </a>
                        )}
                      </div>
                    )}

                    <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-brand-text-muted sm:grid-cols-2 lg:grid-cols-3">
                      <span><strong>Tempo:</strong> {formatElapsed(elapsedSeconds)}</span>
                      <span><strong>Máximo solicitado:</strong> {result.quantity ?? '-'}</span>
                      <span><strong>Processados:</strong> {progressProcessed} de {progressTotal || '-'}</span>
                      <span><strong>Versão:</strong> {statusResult?.workflow_version || result.workflow || 'aguardando'}</span>
                      <span><strong>Aviso:</strong> {statusResult?.group_notice || 'AGUARDANDO'}</span>
                      {statusResult?.group_http_status ? <span><strong>HTTP aviso:</strong> {statusResult.group_http_status}</span> : null}
                    </div>
                    {statusResult?.source_rows && (
                      <p className="mt-2 text-xs text-brand-text-muted"><strong>Linhas do lote:</strong> {statusResult.source_rows}</p>
                    )}
                    <p className="mt-2 break-all text-[11px] text-brand-text-muted"><strong>Solicitação:</strong> {result.request_id}</p>
                    {statusResult?.execution_id && (
                      <p className="mt-1 break-all text-[11px] text-brand-text-muted"><strong>Execução n8n:</strong> {statusResult.execution_id}</p>
                    )}
                  </div>
                </div>
              </div>

              {statusError && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{statusError} O último progresso confirmado continua exibido e a página tentará consultar novamente sem reiniciar o lote.</span>
                </div>
              )}

              {statusResult?.complete && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={resetRun}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-xs font-bold text-brand-primary transition hover:bg-brand-bg"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Preparar novo lote
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm md:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="dispatch-sheet" className="text-xs font-bold uppercase tracking-wider text-brand-text">
                Aba de origem
              </label>
              <select
                id="dispatch-sheet"
                value={sheet}
                disabled={runActive}
                onChange={(event) => setSheet(event.target.value as (typeof SHEETS)[number])}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {SHEETS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="dispatch-quantity" className="text-xs font-bold uppercase tracking-wider text-brand-text">
                Quantidade máxima do lote
              </label>
              <input
                id="dispatch-quantity"
                type="number"
                min={1}
                max={50}
                step={1}
                value={quantity}
                disabled={runActive}
                onChange={(event) => setQuantity(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-[11px] text-brand-text-muted">
                É um teto: se houver menos contatos liberados e elegíveis, o lote processará menos.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="dispatch-template" className="text-xs font-bold uppercase tracking-wider text-brand-text">
                Template Meta
              </label>
              <select
                id="dispatch-template"
                value={template}
                disabled={runActive}
                onChange={(event) => setTemplate(event.target.value as (typeof TEMPLATES)[number]['value'])}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {TEMPLATES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label} — {item.value}</option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="text-[11px] text-brand-text-muted">{selectedTemplate.description}</p>
              )}
            </div>
          </div>

          {round3Configuration && !winnerTemplateSelected && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Para a Rodada 3, o modelo recomendado é <strong>convite_jornada_ec_15dias_v1</strong>, vencedor da Rodada 2. O template selecionado agora não é o recomendado.
            </div>
          )}

          {quantityExceedsReleased && round3Released > 0 && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              O teto solicitado ({quantity}) é maior que os {round3Released} contato(s) atualmente liberado(s) na origem. O workflow processará apenas os que também passarem pelas demais travas de elegibilidade.
            </div>
          )}

          {quantity > 5 && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Você selecionou mais de 5 contatos. Confirme que o lote e o template estão corretos antes de prosseguir.
            </div>
          )}

          <label className={`mt-5 flex items-start gap-3 rounded-xl border border-brand-border bg-brand-bg/30 px-4 py-3 ${runActive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={runActive}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-brand-border text-brand-primary"
            />
            <span className="text-xs leading-relaxed text-brand-text">
              Confirmo que revisei <strong>aba, quantidade e template</strong> e entendo que somente contatos previamente liberados como <strong>SIM</strong> serão processados.
            </span>
          </label>

          {errorMessage && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {result?.accepted && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-5 w-5" />
                Lote aceito pelo n8n
              </div>
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                <span><strong>Aba:</strong> {result.sheet}</span>
                <span><strong>Máximo:</strong> {result.quantity}</span>
                <span className="sm:col-span-2 break-all"><strong>Solicitação:</strong> {result.request_id}</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-brand-text-muted">
              {runActive ? 'Há um lote em processamento. Um novo disparo permanece bloqueado até a execução terminar.' : 'A página acompanha o lote até a confirmação final do workflow e do aviso operacional.'}
            </p>
            <button
              type="submit"
              disabled={!confirmed || submitting || runActive || noRound3ContactsReleased}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Iniciando lote...' : runActive ? 'Lote em processamento' : 'Executar lote'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
