import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
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
  error?: string;
};

const errorLabels: Record<string, string> = {
  authentication_required: 'Sua sessão não foi encontrada. Faça login novamente.',
  invalid_session: 'Sua sessão expirou. Faça login novamente.',
  admin_only: 'Esta página é restrita a administradores.',
  invalid_sheet: 'A aba selecionada não é permitida.',
  invalid_template: 'O template selecionado não é permitido.',
  invalid_quantity: 'A quantidade deve estar entre 1 e 50.',
  confirmation_required: 'Confirme as condições do disparo antes de executar.',
  dispatch_integration_not_configured: 'A integração server-side com o n8n ainda não foi configurada.',
  n8n_rejected_request: 'O n8n recusou a solicitação. Verifique a configuração da integração.',
  n8n_timeout: 'O n8n demorou demais para confirmar o recebimento.',
  n8n_unavailable: 'Não foi possível alcançar o n8n neste momento.',
  server_configuration_missing: 'Configuração server-side indisponível.',
  admin_validation_failed: 'Não foi possível validar a permissão administrativa.'
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
  const [errorMessage, setErrorMessage] = useState('');

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

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((item) => item.value === template),
    [template]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || submitting) return;

    setSubmitting(true);
    setResult(null);
    setErrorMessage('');

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
              Configure e inicie um lote do workflow de captação sem editar os parâmetros diretamente no n8n.
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

        <form onSubmit={handleSubmit} className="rounded-3xl border border-brand-border bg-white p-5 shadow-sm md:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="dispatch-sheet" className="text-xs font-bold uppercase tracking-wider text-brand-text">
                Aba de origem
              </label>
              <select
                id="dispatch-sheet"
                value={sheet}
                onChange={(event) => setSheet(event.target.value as (typeof SHEETS)[number])}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary"
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
                onChange={(event) => setQuantity(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary"
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
                onChange={(event) => setTemplate(event.target.value as (typeof TEMPLATES)[number]['value'])}
                className="w-full rounded-xl border border-brand-border bg-brand-bg/40 px-3.5 py-3 text-sm font-medium text-brand-text outline-none transition focus:border-brand-primary"
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

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-border bg-brand-bg/30 px-4 py-3">
            <input
              type="checkbox"
              checked={confirmed}
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
              <p className="mt-2 text-xs leading-relaxed">
                O processamento continua no n8n. A confirmação de conclusão será registrada em <strong>logs_execucao</strong> e enviada ao grupo operacional.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-brand-text-muted">
              Não inicie outro lote enquanto o atual ainda estiver em processamento.
            </p>
            <button
              type="submit"
              disabled={!confirmed || submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Iniciando lote...' : 'Executar lote'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
