import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { publicEffectFlags } from "../config/publicFlags";
import { showConfirm } from "../store/modalStore";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { cancelClinicSubscription, changeClinicSeats, createClinicCheckout, fetchClinicBillingCatalog, fetchClinicBillingStatus, type ClinicBillingCatalogItem, type ClinicBillingStatus } from "../services/clinicBilling";
import { getClinicBillingIntervalLabel, getClinicPlanLabel } from "../utils/clinicAdminPresentation";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { active: "Ativa", past_due: "Pagamento pendente", unpaid: "Restrita", canceled: "Cancelada", pending_setup: "Aguardando contratação" };

function money(value: number) { return currency.format(value / 100); }

export default function ClinicBilling() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;
  const canManage = organization?.membershipRole === "owner";
  const [status, setStatus] = useState<ClinicBillingStatus | null>(null);
  const [catalog, setCatalog] = useState<ClinicBillingCatalogItem[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [planCode, setPlanCode] = useState("clinic_monthly");
  const [seats, setSeats] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true); setError(null);
    try {
      const [nextStatus, nextCatalog] = await Promise.all([fetchClinicBillingStatus(organizationId), fetchClinicBillingCatalog(organizationId)]);
      setStatus(nextStatus.billing); setBillingEnabled(nextStatus.clinic_billing_enabled); setCatalog(nextCatalog.catalog);
      const current = nextStatus.billing.subscription;
      if (current) { setPlanCode(current.plan_code); setSeats(current.contracted_seats); }
      else if (nextCatalog.catalog[0]) setSeats(Math.max(3, nextCatalog.catalog[0].minimum_contracted_seats));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a cobrança da clínica."); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const selectedPlan = useMemo(() => catalog.find((item) => item.plan_code === planCode) || catalog[0], [catalog, planCode]);
  if (!publicEffectFlags.clinicFeature) return <Navigate to="/painel/dashboard" replace />;
  if (!organization || !organizationId) return null;

  async function runCheckout() {
    if (!canManage || !selectedPlan || !billingEnabled) return;
    setBusy(true); setError(null);
    try {
      const result = await createClinicCheckout(organizationId, selectedPlan.plan_code, Math.max(seats, selectedPlan.minimum_contracted_seats));
      window.location.assign(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir o checkout."); setBusy(false); }
  }

  async function runSeatChange() {
    if (!canManage || !billingEnabled || !status?.subscription) return;
    const target = Math.max(seats, status.subscription.minimum_contracted_seats);
    setBusy(true); setError(null);
    try { await changeClinicSeats(organizationId, target); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar as licenças."); }
    finally { setBusy(false); }
  }

  async function runCancel() {
    if (!canManage || !billingEnabled || !status?.subscription || status.subscription.cancel_at_period_end) return;
    if (!await showConfirm("A assinatura será encerrada ao final do período já pago. Deseja continuar?", { title: "Programar cancelamento", confirmLabel: "Programar", cancelLabel: "Voltar", variant: "warning", icon: "question" })) return;
    setBusy(true); setError(null);
    try { await cancelClinicSubscription(organizationId); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível programar o cancelamento."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <PanelPageHeader title="Contratação da clínica" description="Assinatura empresarial em ambiente de homologação." icon={CreditCard} />
    {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
    {loading ? <div className="flex items-center gap-2 rounded-2xl border border-brand-border bg-white p-6 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando status de cobrança…</div> : <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Stripe Test Mode.</strong> Esta tela não cria cobranças reais e a ativação depende exclusivamente da confirmação do webhook.</div>
      {!billingEnabled && <div role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">Alterações de cobrança estão desabilitadas neste ambiente de homologação.</div>}
      {status?.subscription ? <section className="space-y-5 rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">Status financeiro</p><h2 className="mt-1 text-2xl font-bold text-brand-text">{labels[status.subscription.financial_status] || status.subscription.financial_status}</h2></div><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700"><ShieldCheck size={16} /> Webhook como fonte de verdade</span></div>
        <dl className="grid gap-3 sm:grid-cols-4">{[["Plano", getClinicPlanLabel(status.subscription.plan_code)], ["Intervalo", getClinicBillingIntervalLabel(status.subscription.billing_interval)], ["Licenças contratadas", String(status.subscription.contracted_seats)], ["Em uso", String(status.seats.active_seats)], ["Disponíveis", String(status.seats.available_seats)]].map(([label, value]) => <div key={label} className="rounded-xl bg-brand-bg p-4"><dt className="text-xs text-brand-text-muted">{label}</dt><dd className="mt-1 font-semibold text-brand-text">{value}</dd></div>)}</dl>
        {status.subscription.financial_status === "past_due" && <p className="text-sm text-amber-800">Pagamento pendente. O acesso permanece restrito conforme a política de tolerância registrada no servidor.</p>}
        {status.subscription.cancel_at_period_end && <p className="text-sm text-amber-800">Cancelamento programado para o fim do período atual.</p>}
        {canManage && <div className="flex flex-wrap items-end gap-3 border-t border-brand-border pt-5"><label className="text-sm font-semibold text-brand-text">Licenças<input className="mt-1 block w-28 rounded-xl border border-brand-border px-3 py-2 disabled:bg-slate-100" type="number" min={status.subscription.minimum_contracted_seats} value={seats} disabled={!billingEnabled || busy} onChange={(event) => setSeats(Number(event.target.value) || status.subscription!.minimum_contracted_seats)} /></label><button disabled={!billingEnabled || busy || seats === status.subscription.contracted_seats} onClick={() => void runSeatChange()} className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Processando…" : "Atualizar licenças"}</button>{!status.subscription.cancel_at_period_end && <button disabled={!billingEnabled || busy} onClick={() => void runCancel()} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Programar cancelamento</button>}</div>}
      </section> : <section className="space-y-5 rounded-2xl border border-brand-border bg-white p-5 shadow-sm"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">Próximo passo</p><h2 className="mt-1 text-2xl font-bold text-brand-text">Contrate o Plano Clínica</h2><p className="mt-2 text-sm text-brand-text-muted">A assinatura será criada com uma licença base e as licenças adicionais contratadas.</p></div><div className="grid gap-4 sm:grid-cols-2">{catalog.map((item) => <button key={item.plan_code} onClick={() => setPlanCode(item.plan_code)} className={`rounded-2xl border p-4 text-left ${selectedPlan?.plan_code === item.plan_code ? "border-brand-primary bg-brand-primary/5" : "border-brand-border"}`}><strong className="block text-brand-text">{item.billing_interval === "month" ? "Mensal" : "Anual"}</strong><span className="mt-2 block text-sm text-brand-text-muted">Base {money(item.base_amount_minor)} + {money(item.seat_amount_minor)} por licença</span></button>)}</div><label className="block max-w-xs text-sm font-semibold text-brand-text">Licenças contratadas<input className="mt-1 block w-full rounded-xl border border-brand-border px-3 py-2" type="number" min={selectedPlan?.minimum_contracted_seats || 3} value={seats} onChange={(event) => setSeats(Number(event.target.value) || 3)} /></label><button disabled={!canManage || busy || !selectedPlan || !billingEnabled} onClick={() => void runCheckout()} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Abrir checkout seguro</button>{!canManage && <p className="text-sm text-brand-text-muted">Somente o owner pode iniciar ou alterar a contratação.</p>}{!billingEnabled && <p className="text-sm text-brand-text-muted">A contratação está temporariamente desabilitada para este ambiente de homologação.</p>}</section>}
      <p className="text-sm text-brand-text-muted">Para voltar à visão organizacional, acesse <Link className="font-semibold text-brand-primary underline" to="/painel/clinica">o contexto da clínica</Link>.</p>
    </>}
  </div>;
}

export function ClinicBillingSuccess() {
  const { activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const [message, setMessage] = useState("Aguardando confirmação do webhook Stripe…");
  useEffect(() => {
    if (!organizationId) return;
    let stopped = false;
    const check = async () => { try { const result = await fetchClinicBillingStatus(organizationId); if (!stopped && result.billing.subscription?.financial_status === "active") setMessage("Assinatura confirmada. O acesso da clínica foi atualizado pelo servidor."); } catch { /* A próxima consulta pode confirmar o evento. */ } };
    void check(); const timer = window.setInterval(() => void check(), 4000); return () => { stopped = true; window.clearInterval(timer); };
  }, [organizationId]);
  if (!organizationId) return <Navigate to="/painel/clinica" replace />;
  return <div className="mx-auto max-w-2xl space-y-5"><PanelPageHeader title="Contratação recebida" description="O retorno do checkout não ativa acesso por si só." icon={CheckCircle2} /><section className="rounded-2xl border border-brand-border bg-white p-6 text-center shadow-sm"><Loader2 className="mx-auto animate-spin text-brand-primary" size={30} /><p className="mt-4 text-brand-text">{message}</p><p className="mt-2 text-sm text-brand-text-muted">Esta página consulta o estado persistido; não substitui a reconciliação do webhook.</p><Link className="mt-5 inline-flex rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white" to="/painel/clinica/contratar">Voltar para cobrança</Link></section></div>;
}
