import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { CheckCircle2, ArrowRight, ShieldCheck, Check, Mail, Loader2, Clock3, XCircle, AlertTriangle } from 'lucide-react';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination } from '../utils/onboarding';
import { supabase } from '../supabaseClient';
import { BillingConfirmationError, addNativeBillingListener, getConfirmedGooglePlayTransaction, getConfirmedStripeTransaction, hasNativeBillingBridge, waitForConfirmedSubscription } from '../services/billing';
import { MONTHLY_PLAN_FEATURES, YEARLY_PLAN_FEATURES } from '../config/subscriptionPlans';
import { trackConfirmedMarketingPurchaseOnce } from '../services/analytics';

const formatRenewalDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const getPlanBenefitsList = (planId: string) => {
  return planId === 'yearly' ? YEARLY_PLAN_FEATURES : MONTHLY_PLAN_FEATURES;
};

export default function SuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, subscriptionPlan, profileRole, trialEndsAt, setProfileInfo } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [isProceeding, setIsProceeding] = useState(false);
  const initialState = location.state as {
    pendingConfirmation?: boolean;
    transactionId?: string;
    subscriptionId?: string;
    invoiceId?: string;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    endsAt?: string;
    planId: string;
    planName: string;
    amount: number;
    paymentMethod: string;
    provider?: 'stripe' | 'google_play' | 'simulation';
    returnTo?: string;
  } | null;
  const [confirmationStatus, setConfirmationStatus] = useState<'checking' | 'confirmed' | 'delayed' | 'cancelled' | 'error'>(
    initialState && !initialState.pendingConfirmation ? 'confirmed' : 'checking'
  );
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAttempt, setConfirmationAttempt] = useState(0);
  const paymentAbortedRef = useRef(false);
  const [webCheckoutState, setWebCheckoutState] = useState<typeof initialState>(
    initialState?.pendingConfirmation ? null : initialState
  );
  const effectiveState = webCheckoutState;
  const query = new URLSearchParams(location.search);
  const checkoutSessionId = query.get('session_id');
  const queryPlanId = query.get('plan') === 'yearly' ? 'yearly' : 'monthly';
  const queryProvider = query.get('provider') === 'google_play' ? 'google_play' : checkoutSessionId ? 'stripe' : null;

  useEffect(() => {
    if (initialState && !initialState.pendingConfirmation) {
      setConfirmationStatus('confirmed');
      return;
    }
    const expectedSubscriptionId = initialState?.pendingConfirmation ? initialState.subscriptionId : undefined;
    const expectedProvider = initialState?.provider === 'google_play' || queryProvider === 'google_play' ? 'google_play' : 'stripe';
    if ((!checkoutSessionId && !expectedSubscriptionId && !queryProvider) || !user) {
      setConfirmationStatus('delayed');
      setConfirmationMessage('Não foi possível identificar este retorno de pagamento.');
      return;
    }

    let cancelled = false;
    const confirmFromWebhook = async () => {
      try {
        const planId = initialState?.planId === 'yearly' || queryPlanId === 'yearly' ? 'yearly' : 'monthly';
        const confirmed = await waitForConfirmedSubscription(user.id, planId, 40, checkoutSessionId || undefined, expectedSubscriptionId, expectedProvider);
        const { data: plan } = await supabase
          .from('plans')
          .select('name, price')
          .eq('id', planId)
          .maybeSingle();
        const transaction = confirmed.provider_subscription_id
          ? confirmed.provider === 'stripe'
            ? await getConfirmedStripeTransaction(confirmed.provider_subscription_id, planId)
            : await getConfirmedGooglePlayTransaction(confirmed.provider_subscription_id, planId)
          : null;
        if (cancelled || paymentAbortedRef.current) return;
        const nextState = {
          transactionId: transaction?.transactionId || checkoutSessionId || confirmed.provider_subscription_id,
          subscriptionId: confirmed.provider_subscription_id,
          endsAt: confirmed.current_period_end,
          planId,
          planName: plan?.name || initialState?.planName || (planId === 'yearly' ? 'Plano Anual' : 'Plano Mensal'),
          amount: transaction?.amount || Number(initialState?.amount || plan?.price || (planId === 'yearly' ? 199 : 39)),
          paymentMethod: initialState?.paymentMethod || (confirmed.provider === 'google_play' ? 'Google Play (Pix)' : 'Stripe (Pix, cartão ou carteira digital)'),
          provider: confirmed.provider as 'stripe' | 'google_play'
        };
        setWebCheckoutState(nextState);
        setProfileInfo(
          'active',
          profileRole || 'therapist',
          planId,
          'active',
          confirmed.current_period_end,
          trialEndsAt
        );
        setConfirmationStatus('confirmed');
      } catch (error) {
        if (cancelled || paymentAbortedRef.current) return;
        setConfirmationMessage(error instanceof Error ? error.message : 'A confirmação ainda está pendente.');
        setConfirmationStatus(error instanceof BillingConfirmationError && error.code === 'terminal' ? 'cancelled' : 'delayed');
      }
    };
    void confirmFromWebhook();
    return () => { cancelled = true; };
  }, [checkoutSessionId, confirmationAttempt, initialState, profileRole, queryPlanId, queryProvider, setProfileInfo, trialEndsAt, user]);

  useEffect(() => {
    if (confirmationStatus !== 'delayed' || confirmationAttempt >= 9) return;
    const retryTimer = window.setTimeout(() => {
      setConfirmationStatus('checking');
      setConfirmationAttempt((current) => current + 1);
    }, 10_000);
    return () => window.clearTimeout(retryTimer);
  }, [confirmationAttempt, confirmationStatus]);

  useEffect(() => {
    if (!user || confirmationStatus === 'confirmed' || confirmationStatus === 'cancelled') return;
    const reconcile = () => {
      if (document.visibilityState !== 'visible') return;
      if (hasNativeBillingBridge()) {
        try { window.NativeBillingBridge?.restorePurchases(user.id); } catch { /* polling remains available */ }
      }
      setConfirmationStatus('checking');
      setConfirmationAttempt((current) => current + 1);
    };
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('pageshow', reconcile);
    window.addEventListener('focus', reconcile);
    return () => {
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('pageshow', reconcile);
      window.removeEventListener('focus', reconcile);
    };
  }, [confirmationStatus, user]);

  useEffect(() => {
    if (!user || confirmationStatus === 'confirmed') return;
    const channel = supabase.channel(`billing-confirmation:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'billing_subscriptions',
        filter: `professional_id=eq.${user.id}`
      }, () => {
        setConfirmationStatus('checking');
        setConfirmationAttempt((current) => current + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [confirmationStatus, user]);

  useEffect(() => {
    if (!initialState?.pendingConfirmation) return;
    return addNativeBillingListener((event) => {
      if (event.planId && event.planId !== initialState.planId) return;
      if (event.type === 'stripe_payment_cancelled' || event.type === 'billing_cancelled') {
        paymentAbortedRef.current = true;
        setConfirmationStatus('cancelled');
        setConfirmationMessage('O pagamento foi fechado antes da conclusão. Nenhuma assinatura foi ativada.');
      } else if (event.type === 'stripe_payment_failed' || event.type === 'billing_error') {
        paymentAbortedRef.current = true;
        setConfirmationStatus('error');
        setConfirmationMessage(event.message || 'O provedor não conseguiu concluir o pagamento.');
      }
    });
  }, [initialState]);

  useEffect(() => {
    if (confirmationStatus !== 'confirmed' || !['stripe', 'google_play'].includes(effectiveState?.provider || '') || !effectiveState?.transactionId) return;
    void trackConfirmedMarketingPurchaseOnce({
      transactionId: effectiveState.transactionId,
      planId: effectiveState.planId,
      planName: effectiveState.planName,
      amount: effectiveState.amount,
      paymentProvider: effectiveState.provider as 'stripe' | 'google_play'
    });
  }, [confirmationStatus, effectiveState]);

  const handleProceed = async () => {
    if (!user || isProceeding) return;
    setIsProceeding(true);
    try {
      const { data, error } = await supabase
        .from('professionals')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data?.onboarding_completed) {
        navigate('/painel/dashboard', { replace: true });
        return;
      }
    } catch (e) {
      console.error("Erro ao verificar onboarding no banco:", e);
    } finally {
      setIsProceeding(false);
    }

    const destination = getOnboardingDestination(user.id);
    navigate(destination, { replace: true });
  };

  if (confirmationStatus !== 'confirmed') {
    const isChecking = confirmationStatus === 'checking';
    const canRetryConfirmation = confirmationStatus === 'delayed';
    const isCancelled = confirmationStatus === 'cancelled';
    const title = isChecking
      ? 'Confirmando pagamento…'
      : canRetryConfirmation
        ? 'Pagamento em processamento'
        : isCancelled
          ? 'Pagamento cancelado'
          : 'Erro na confirmação';
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="card bg-white border border-brand-border shadow-xl rounded-3xl p-8 max-w-lg w-full text-center space-y-5">
          <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${isChecking ? 'bg-brand-primary/10 text-brand-primary' : canRetryConfirmation ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {isChecking ? <Loader2 className="w-7 h-7 animate-spin" /> : canRetryConfirmation ? <Clock3 className="w-7 h-7" /> : isCancelled ? <XCircle className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
          </div>
          <h1 className="text-2xl font-bold text-brand-text">{title}</h1>
          <p className="text-sm leading-relaxed text-brand-text-muted">
            {isChecking
              ? 'Seu pagamento foi enviado. Estamos aguardando a confirmação segura do provedor para ativar o plano automaticamente. Não é necessário atualizar a página.'
              : confirmationMessage || (isCancelled
                ? 'Nenhuma assinatura foi ativada e nenhuma conversão foi registrada.'
                : 'Não foi possível confirmar o pagamento. Tente novamente mais tarde.')}
          </p>
          {canRetryConfirmation && (
            <div className="space-y-3">
              <p className="text-xs text-brand-text-muted">Continuaremos verificando automaticamente.</p>
              <button
                type="button"
                onClick={() => {
                  setConfirmationStatus('checking');
                  setConfirmationAttempt((current) => current + 1);
                }}
                className="btn-primary w-full py-3 cursor-pointer"
              >
                Verificar pagamento agora
              </button>
            </div>
          )}
          {!isChecking && !canRetryConfirmation && (
            <button
              type="button"
              onClick={() => navigate(initialState?.returnTo || '/painel/subscription', { replace: true })}
              className="btn-primary w-full py-3 cursor-pointer"
            >
              Voltar para assinatura
            </button>
          )}
        </div>
      </div>
    );
  }

  const formattedAmount = effectiveState?.amount
    ? effectiveState.amount.toFixed(2).replace('.', ',')
    : (subscriptionPlan === 'yearly' ? '199,00' : '39,00');

  const displayPlanName = effectiveState?.planName
    ? effectiveState.planName
    : (subscriptionPlan === 'yearly' ? 'Plano Anual' : 'Plano Mensal');

  const displayTransactionId = effectiveState?.transactionId || 'Confirmada pelo provedor';

  const displayPaymentMethod = effectiveState?.paymentMethod
    ? effectiveState.paymentMethod
    : 'Pagamento seguro';

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="w-full bg-white/80 backdrop-blur-md border-b border-brand-border relative z-10">
        <div className="max-w-5xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex-shrink-0">
            {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
              <img 
                src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                alt={siteConfig.pwa_app_name || "Evolução Clínica"} 
                className="h-12 w-auto object-contain"
              />
            ) : (
              <span className="text-lg font-display font-bold text-brand-primary">
                {siteConfig.pwa_app_name || "Evolução Clínica"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center items-center py-12 px-6 relative z-10 max-w-2xl mx-auto w-full animate-fade-in">
        <div className="w-full space-y-8">
          <div className="card bg-white p-6 md:p-8 rounded-3xl border border-brand-border shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start gap-4 text-left">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-brand-primary text-[11px] font-bold uppercase tracking-wider">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Assinatura confirmada</span>
                </div>
                <h3 className="text-2xl font-display font-bold text-brand-text">Assinatura ativada</h3>
                <p className="text-sm leading-relaxed text-brand-text-muted">
                  Seu pedido foi processado com sucesso usando {displayPaymentMethod}. Um e-mail foi enviado com os dados da sua assinatura.
                </p>
              </div>
            </div>

            {/* Transaction Data Table */}
            <div className="grid grid-cols-1 gap-4 text-left">
              <div className="rounded-2xl border border-brand-border bg-brand-bg/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-2">Resumo da transação</p>
                <div className="space-y-2.5 text-sm text-brand-text">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Plano: {displayPlanName}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Situação: Ativa</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Valor: R$ {formattedAmount}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Forma de pagamento: {displayPaymentMethod}</span>
                  </p>
                  <p className="flex items-start gap-2 break-all">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Referência: {displayTransactionId}</span>
                  </p>
                  {effectiveState?.subscriptionId && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Assinatura: {effectiveState.subscriptionId}</span>
                    </p>
                  )}
                  {effectiveState?.invoiceId && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Fatura: {effectiveState.invoiceId}</span>
                    </p>
                  )}
                  {effectiveState?.endsAt && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Próxima renovação: {formatRenewalDate(effectiveState.endsAt)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Welcome and Benefits Section */}
            <div className="rounded-2xl border border-brand-border bg-white p-5 space-y-4 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Boas-vindas e benefícios</p>
                  <p className="text-lg font-bold text-brand-primary mt-1">O que você desbloqueou</p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                  Plano ativo
                </span>
              </div>

              <p className="text-sm text-brand-text-muted leading-relaxed">
                {effectiveState?.planId === 'yearly'
                  ? 'Você escolheu a melhor opção para manter a operação rodando com previsibilidade e foco no longo prazo.'
                  : 'Você ativou uma assinatura flexível, pensada para quem quer controle mês a mês sem perder produtividade.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {getPlanBenefitsList(effectiveState?.planId || 'monthly').map((benefit) => (
                  <div key={benefit} className="rounded-xl border bg-brand-bg/40 border-brand-border/60 p-3 text-sm leading-relaxed text-brand-text">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-brand-primary" />
                      <span>{benefit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1 w-full">
              {effectiveState?.invoiceUrl && (
                <a
                  href={effectiveState.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-primary/15 bg-brand-primary text-white font-bold hover:bg-brand-primary-hover transition-colors text-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Ver fatura</span>
                </a>
              )}
              {effectiveState?.invoicePdfUrl && (
                <a
                  href={effectiveState.invoicePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text font-bold hover:bg-brand-bg transition-colors text-sm"
                >
                  <span>Baixar PDF</span>
                </a>
              )}
              <button
                onClick={handleProceed}
                disabled={isProceeding}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-colors bg-brand-bg text-brand-text hover:bg-brand-primary/10 border border-brand-border text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProceeding ? (
                  <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                ) : null}
                <span>Continuar</span>
              </button>
            </div>

            <div className="flex justify-center items-center gap-1.5 text-[10px] text-brand-text-muted select-none pt-2">
              <ShieldCheck className="w-4 h-4 text-brand-primary flex-shrink-0" />
              <span>Transação protegida e confirmada pela Stripe ou Google Play</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-[10px] text-brand-text-muted mt-auto border-t border-brand-border bg-white/40">
        <p>© {new Date().getFullYear()} Evolução Clínica. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
