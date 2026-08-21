import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
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
    label: 'A — Jornada 15 dias',
    description: 'Template de controle da Rodada 2.'
  },
  {
    value: 'convite_jornada_ec_organizacao_v2',
    label: 'B — Organização v2',
    description: 'Template desafiante da Rodada 2.'
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
  source_rows?: string;
  group_notice?: 'AGUARDANDO' | 'PENDENTE' | 'OK' | 'ERRO';
  group_http_status?: number;
  last_event?: string;
  updated_at?: string;
  error?: string;
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

export default function AdminCampaignDispatch() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState('');
  const [sheet, setSheet] = useState<(typeof SHEETS)[number]>('Psicologia e Saúde Mental');
  const [quantity, setQuantity] = useState(1);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['value']>('convite_jornada_ec_organizacao_v2');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [statusResult, setStatusResult] = useState<DispatchStatusResult | null>(null);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [dispatchStartedAt, setDispatchStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

    const firstPoll = window.setTimeout(() => void pollStatus(), 1200);
    const timer = window.setInterval(() => void pollStatus(), 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(firstPoll);
      window.clearInterval(timer);
    };
  }, [accessToken, result?.request_id, statusResult?.complete]);

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

  const resetRun = () => {
    if (runActive) return;
    setResult(null);
    setStatusResult(null);
    setStatusError('');
    setErrorMessage('');
    setDispatchStartedAt(null);
    setElapsedSeconds(0);
    setConfirmed(false);
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

        <section className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm md:p-7" aria-live="polite">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-base font-bold text-brand-primary">
                <Activity className="h-5 w-5" />
                Processamento em tempo real
              </div>
              <p className="mt-1 text-xs text-brand-text-muted">
                O andamento é atualizado automaticamente pelo `request_id` gravado em logs_execucao.
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
                    <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-brand-text-muted sm:grid-cols-2 lg:grid-cols-3">
                      <span><strong>Tempo:</strong> {formatElapsed(elapsedSeconds)}</span>
                      <span><strong>Máximo solicitado:</strong> {result.quantity ?? '-'}</span>
                      <span><strong>Processados:</strong> {batchCompleted ? statusResult?.processed ?? 0 : 'em andamento'}</span>
                      <span><strong>Versão:</strong> {statusResult?.workflow_version || result.workflow || 'aguardando'}</span>
                      <span><strong>Aviso:</strong> {statusResult?.group_notice || 'AGUARDANDO'}</span>
                      {statusResult?.group_http_status ? <span><strong>HTTP aviso:</strong> {statusResult.group_http_status}</span> : null}
                    </div>
                    {statusResult?.source_rows && (
                      <p className="mt-2 text-xs text-brand-text-muted"><strong>Linhas processadas:</strong> {statusResult.source_rows}</p>
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
                  <span>{statusError} O lote não será reiniciado; a página apenas tentará consultar o status novamente.</span>
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
              disabled={!confirmed || submitting || runActive}
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
