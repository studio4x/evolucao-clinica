import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { Check, ShieldCheck, Sparkles, CreditCard, HelpCircle, Code, Clock, AlertTriangle, Loader2, X, Mail, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { StripeSubscriptionButton, type ConfirmedBillingResult } from '../components/payments/StripeSubscriptionButton';
import { sendSubscriptionPaymentEmail } from '../services/subscriptionEmail';
import { FeatureTooltip } from '../components/common/FeatureTooltip';
import { createStripeCustomerPortalSession, hasNativeBillingBridge } from '../services/billing';
import { MONTHLY_PLAN_FEATURES, YEARLY_PLAN_FEATURES } from '../config/subscriptionPlans';

const DEFAULT_PLANS = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    description: 'Flexibilidade e controle mês a mês',
    price: 39.00,
    original_price: null,
    equivalent_monthly_price: null,
    launch_offer_text: null,
    features: MONTHLY_PLAN_FEATURES,
    button_text_simulate: 'Assinar Mensal (Simulado)',
    tag_text: 'Recorrente',
    discount_text: null
  },
  {
    id: 'yearly',
    name: 'Plano Anual',
    description: 'Melhor custo-benefício anualizado',
    price: 199.00,
    original_price: null,
    equivalent_monthly_price: 16.58,
    launch_offer_text: null,
    features: YEARLY_PLAN_FEATURES,
    button_text_simulate: 'Assinar Anual (Simulado)',
    tag_text: 'Popular',
    discount_text: '57% OFF'
  }
];

type SubscriptionPlanLike = {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  original_price?: number | null;
  features?: string[];
  equivalent_monthly_price?: number | null;
  tag_text?: string | null;
  discount_text?: string | null;
  launch_offer_text?: string | null;
  button_text_simulate?: string | null;
};

type SubscriptionPaymentModal = {
  kind: 'success' | 'error';
  planId: string;
  paymentLabel: string;
  title: string;
  message: string;
  benefits: string[];
  summaryLines: string[];
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  errorMessage?: string | null;
};

function formatCurrencyValue(amount: number, currency = 'BRL') {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function getPlanDisplayName(plan: SubscriptionPlanLike | undefined, fallbackId: string) {
  if (plan?.name) return plan.name;
  if (fallbackId === 'monthly') return 'Plano Mensal';
  if (fallbackId === 'yearly') return 'Plano Anual';
  return 'Plano de Assinatura';
}

function getPlanBenefitsCopy(plan: SubscriptionPlanLike | undefined, fallbackId: string) {
  const benefits = Array.isArray(plan?.features) && plan.features.length > 0
    ? plan.features.map((feature) => String(feature).trim()).filter(Boolean)
    : fallbackId === 'yearly'
      ? YEARLY_PLAN_FEATURES
      : MONTHLY_PLAN_FEATURES;

  if (fallbackId === 'yearly') {
    return {
      title: 'Bem-vindo ao Plano Anual',
      intro: 'Você escolheu a melhor opção para manter a operação rodando com previsibilidade e foco no longo prazo.',
      lead: 'Com essa assinatura, você terá acesso a:',
      benefits
    };
  }

  return {
    title: 'Bem-vindo ao Plano Mensal',
    intro: 'Você ativou uma assinatura flexível, pensada para quem quer controle mês a mês sem perder produtividade.',
    lead: 'Seu plano libera imediatamente:',
    benefits
  };
}

function buildPaymentSummaryLines(plan: SubscriptionPlanLike | undefined, data: any) {
  const lines = [
    `Plano: ${getPlanDisplayName(plan, plan?.id || '')}`,
    data?.amountPaid ? `Valor: ${formatCurrencyValue(Number(data.amountPaid), String(data.currency || 'BRL'))}` : null,
    data?.paymentLabel ? `Forma de pagamento: ${data.paymentLabel}` : null,
    data?.subscriptionId ? `Assinatura: ${data.subscriptionId}` : null,
    data?.invoiceId ? `Fatura: ${data.invoiceId}` : null,
    data?.endsAt ? `Próxima renovação: ${new Date(data.endsAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}` : null
  ];

  return lines.filter(Boolean) as string[];
}

export default function Subscription() {
  const { 
    user, 
    profileRole,
    subscriptionPlan, 
    subscriptionStatus, 
    subscriptionEndsAt, 
    trialEndsAt,
    setProfileInfo
  } = useAuthStore();
  const navigate = useNavigate();

  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<SubscriptionPaymentModal | null>(null);


  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [paymentErrorByPlan, setPaymentErrorByPlan] = useState<Record<string, string>>({});

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [billingSubscription, setBillingSubscription] = useState<any>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [showPersuadeModal, setShowPersuadeModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedTxForRefund, setSelectedTxForRefund] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [loadingRefund, setLoadingRefund] = useState(false);
  const isRefundConfirmationValid = confirmPhrase.trim().toUpperCase() === 'REEMBOLSAR';

  const getPlanDetails = (planId: string): SubscriptionPlanLike => {
    return (plans.length > 0 ? plans : DEFAULT_PLANS).find((plan) => plan.id === planId) || DEFAULT_PLANS.find((plan) => plan.id === planId) || {
      id: planId,
      name: getPlanDisplayName(undefined, planId),
      features: []
    };
  };

  const isRefundable = (createdAtStr: string) => {
    if (profileRole === 'admin') return true;
    if (!createdAtStr) return false;
    const createdAt = new Date(createdAtStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .order('price', { ascending: true });
        if (error) throw error;
        setPlans(data || []);
      } catch (e) {
        console.error("Error fetching plans:", e);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const fetchTransactions = async () => {
    if (!user) return;
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('professional_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (e) {
      console.error("Error fetching transactions:", e);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchBillingSubscription = async () => {
      const { data, error } = await supabase
        .from('billing_subscriptions')
        .select('provider, plan_id, status, play_product_id')
        .eq('professional_id', user.id)
        .maybeSingle();
      if (error) console.error('[Subscription] Falha ao consultar provedor da assinatura:', error);
      else setBillingSubscription(data || null);
    };
    void fetchBillingSubscription();
  }, [user]);

  // Calcula o status e tempo restante
  const now = new Date();
  const endsAtDate = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  const isExpired = endsAtDate ? endsAtDate < now : false;
  
  let daysRemaining = 0;
  if (endsAtDate && !isExpired) {
    const diffTime = Math.abs(endsAtDate.getTime() - now.getTime());
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const handleSimulatePayment = async (plan: 'monthly' | 'yearly') => {
    if (!user) return;
    setLoadingPlan(plan);
    setSuccessMessage(null);

    try {
      const now = new Date();
      let durationMs = 0;

      if (plan === 'monthly') {
        durationMs = 30 * 24 * 60 * 60 * 1000; // 30 dias
      } else if (plan === 'yearly') {
        durationMs = 365 * 24 * 60 * 60 * 1000; // 365 dias
      }

      const newExpirationDate = new Date(now.getTime() + durationMs).toISOString();

      const { error } = await supabase
        .from('professionals')
        .update({
          subscription_plan: plan,
          subscription_status: 'active',
          subscription_ends_at: newExpirationDate,
          updated_at: now.toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      // Inserir registro de transação simulada
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          professional_id: user.id,
          stripe_invoice_id: null,
          stripe_subscription_id: null,
          amount: plan === 'monthly' ? 39.00 : 199.00,
          currency: 'brl',
          plan_id: plan,
          status: 'paid',
          payment_provider: 'simulation',
          provider_transaction_id: `sim-${Date.now()}`,
          payment_method: 'Pagamento (Simulado)',
          stripe_invoice_url: null,
          invoice_pdf_url: null,
          created_at: new Date().toISOString()
        });

      if (txError) {
        console.error("Erro ao inserir transação simulada:", txError);
      }

      // Atualiza o estado global do Zustand
      setProfileInfo(
        'active', 
        profileRole || 'therapist',
        plan,
        'active',
        newExpirationDate,
        trialEndsAt
      );

      const simulatedTxId = `sim-${Date.now().toString().slice(-6)}`;
      navigate('/checkout/success', {
        state: {
          transactionId: simulatedTxId,
          planId: plan,
          planName: plan === 'yearly' ? 'Plano Anual' : 'Plano Mensal',
          amount: plan === 'yearly' ? 199.00 : 39.00,
          paymentMethod: 'Pagamento (Simulado)'
        },
        replace: true
      });
    } catch (error: any) {
      console.error("Erro ao simular pagamento:", error);
      alert("Erro ao processar assinatura simulada no Supabase: " + (error.message || error));
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleSimulateExpiration = async () => {
    if (!user) return;
    setLoadingPlan('expire');
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('professionals')
        .update({
          subscription_plan: 'trial',
          subscription_status: 'canceled',
          subscription_ends_at: yesterday,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfileInfo(
        'active',
        profileRole || 'therapist',
        'trial',
        'canceled',
        yesterday,
        trialEndsAt
      );

      setSuccessMessage("Conta simulada como EXPIRADA com sucesso! Você verá a tela de bloqueio nas outras páginas.");
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (error: any) {
      console.error("Erro ao simular expiração:", error);
      alert("Erro ao simular expiração no Supabase: " + (error.message || error));
    } finally {
      setLoadingPlan(null);
    }
  };

  const sendPaymentEmailAndShowModal = async (
    kind: 'success' | 'error',
    planId: string,
    paymentLabel: string,
    backendData: any,
    failureMessage?: string
  ) => {
    const plan = getPlanDetails(planId);
    if (kind === 'error') {
      const payload = {
        kind: 'failure' as const,
        planId,
        paymentMethodLabel: paymentLabel,
        subscriptionId: backendData?.subscriptionId || null,
        invoiceId: backendData?.invoiceId || null,
        invoiceUrl: backendData?.invoiceUrl || null,
        invoicePdfUrl: backendData?.invoicePdfUrl || null,
        amount: backendData?.amountPaid ?? plan.price ?? null,
        currency: backendData?.currency || 'brl',
        nextRenewalAt: backendData?.endsAt || null,
        failureMessage: failureMessage || null
      };

      void sendSubscriptionPaymentEmail(payload).catch((emailError) => {
        console.error('[Subscription] Falha ao disparar e-mail de falha da assinatura:', emailError);
      });
    }

    const planDetails = getPlanBenefitsCopy(plan, planId);
    const summaryLines = buildPaymentSummaryLines(plan, {
      ...backendData,
      paymentLabel
    });
    const isSuccess = kind === 'success';

    setPaymentModal({
      kind,
      planId,
      paymentLabel,
      title: planDetails.title,
      message: isSuccess
        ? `Seu pedido foi processado com sucesso usando ${paymentLabel}. Um e-mail foi enviado com os dados da sua assinatura.`
        : `Não foi possível concluir o pagamento usando ${paymentLabel}. Verifique os dados da cobrança e tente novamente.`,
      benefits: isSuccess
        ? planDetails.benefits
        : [
            'Você pode revisar os dados de pagamento no provedor escolhido.',
            'Tente novamente quando quiser refazer a assinatura.',
            'Se houver dúvida, entre em contato com o suporte.'
          ],
      summaryLines,
      invoiceUrl: backendData?.invoiceUrl || null,
      invoicePdfUrl: backendData?.invoicePdfUrl || null,
      errorMessage: failureMessage || null
    });
  };

  const handleBillingSuccess = (result: ConfirmedBillingResult) => {
    const plan = result.planId;
    const planDetails = getPlanDetails(plan);
    const paymentLabel = result.provider === 'google_play'
      ? 'Google Play Billing'
      : 'Stripe (cartão ou Google Pay)';

    setProfileInfo(
      'active',
      profileRole || 'therapist',
      plan,
      'active',
      result.currentPeriodEnd || null,
      trialEndsAt
    );
    navigate('/checkout/success', {
      state: {
        transactionId: result.subscriptionId || `${result.provider}-${Date.now()}`,
        subscriptionId: result.subscriptionId,
        endsAt: result.currentPeriodEnd,
        planId: plan,
        planName: getPlanDisplayName(planDetails, plan),
        amount: Number(planDetails.price || 0),
        paymentMethod: paymentLabel
      },
      replace: true
    });
  };

  const handleBillingError = async (plan: 'monthly' | 'yearly', error: Error) => {
    console.error('[Subscription] Erro no pagamento:', error);
    setPaymentErrorByPlan((current) => ({ ...current, [plan]: error.message }));
    await sendPaymentEmailAndShowModal(
      'error',
      plan,
      'Pagamento seguro',
      { paymentLabel: 'Pagamento seguro' },
      error.message
    );
  };

  const handleManageSubscription = async () => {
    if (!billingSubscription || managingSubscription) return;
    setManagingSubscription(true);
    const nativeApp = hasNativeBillingBridge();
    const browserTab = nativeApp ? null : window.open('about:blank', '_blank');

    const openManagementUrl = (rawUrl: string) => {
      const url = new URL(rawUrl);
      if (nativeApp) {
        // O WebView intercepta esta sinalização e abre o navegador externo,
        // mantendo o aplicativo aberto na tela atual.
        url.searchParams.set('open_external', '1');
        window.location.assign(url.toString());
        setManagingSubscription(false);
        return;
      }

      if (browserTab && !browserTab.closed) {
        browserTab.opener = null;
        browserTab.location.href = url.toString();
        return;
      }

      // Fallback para navegadores que bloquearam a aba aberta previamente.
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
      setManagingSubscription(false);
    };

    try {
      if (billingSubscription.provider === 'google_play') {
        const productId = billingSubscription.play_product_id ||
          (billingSubscription.plan_id === 'yearly' ? 'evolucao_yearly' : 'evolucao_monthly');
        const url = new URL('https://play.google.com/store/account/subscriptions');
        url.searchParams.set('sku', productId);
        url.searchParams.set('package', 'com.evolucaoclinica.app');
        openManagementUrl(url.toString());
        return;
      }

      const { portalUrl } = await createStripeCustomerPortalSession();
      openManagementUrl(portalUrl);
    } catch (error) {
      if (browserTab && !browserTab.closed) browserTab.close();
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o gerenciamento.';
      setPaymentErrorByPlan((current) => ({ ...current, management: message }));
      setManagingSubscription(false);
    }
  };

  const handleRequestRefund = async () => {
    if (!selectedTxForRefund) return;
    if (!isRefundConfirmationValid) {
      alert("Por favor, digite 'REEMBOLSAR' para confirmar.");
      return;
    }

    setLoadingRefund(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: {
          transactionId: selectedTxForRefund.id,
          refundReason: refundReason
        }
      });

      if (error) throw error;
      
      alert("Reembolso solicitado e assinatura cancelada com sucesso!");
      
      setProfileInfo(
        'active',
        profileRole || 'therapist',
        'trial',
        'canceled',
        subscriptionEndsAt,
        trialEndsAt
      );

      setShowConfirmModal(false);
      setSelectedTxForRefund(null);
      setRefundReason('');
      setConfirmPhrase('');
      
      fetchTransactions();
    } catch (err: any) {
      console.error("Erro ao solicitar reembolso:", err);
      alert("Falha ao processar reembolso: " + (err.message || err));
    } finally {
      setLoadingRefund(false);
    }
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Assinatura e Renovação</span>
        </div>
        <h1 className="text-3xl font-display font-bold text-brand-primary tracking-tight md:text-4xl">
          Planos e Assinatura
        </h1>
        <p className="text-brand-text-muted text-base max-w-xl mx-auto">
          Escolha o plano ideal para automatizar seus prontuários e evoluções clínicas com inteligência artificial de ponta.
        </p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-start space-x-3 shadow-sm animate-fade-in">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Sucesso na transação!</p>
            <p className="text-xs opacity-90 mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}



      {/* Status da Assinatura Atual */}
      <div className="card border-brand-primary/10 bg-white shadow-xl shadow-brand-primary/5 p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none" />
        
        <h2 className="text-lg font-bold text-brand-text mb-6 flex items-center space-x-2">
          <CreditCard className="w-5 h-5 text-brand-primary" />
          <span>Sua Assinatura Atual</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5 p-4 bg-brand-bg rounded-xl border border-brand-border/50">
            <span className="text-xs text-brand-text-muted uppercase tracking-wider font-semibold">Plano Ativo</span>
            <div className="text-xl font-bold text-brand-primary flex items-center space-x-1.5">
              <span>
                {subscriptionPlan === 'trial' && 'Teste gratuito de 7 dias'}
                {subscriptionPlan === 'monthly' && 'Plano Mensal'}
                {subscriptionPlan === 'yearly' && 'Plano Anual'}
                {subscriptionPlan === 'none' && 'Vitalício / Admin'}
                {!subscriptionPlan && 'Nenhum'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 p-4 bg-brand-bg rounded-xl border border-brand-border/50">
            <span className="text-xs text-brand-text-muted uppercase tracking-wider font-semibold">Status do Pagamento</span>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                subscriptionStatus === 'active' || subscriptionStatus === 'trialing'
                  ? 'bg-emerald-100 text-emerald-800' 
                  : isExpired || subscriptionStatus === 'canceled'
                    ? 'bg-red-100 text-red-800 animate-pulse'
                    : 'bg-amber-100 text-amber-800'
              }`}>
                {subscriptionStatus === 'trialing' && 'Teste gratuito ativo'}
                {subscriptionStatus === 'active' && 'Ativo (Pago)'}
                {subscriptionStatus === 'canceled' && 'Cancelado'}
                {subscriptionStatus === 'past_due' && 'Atrasado'}
                {subscriptionStatus === 'unpaid' && 'Não Pago'}
                {!subscriptionStatus && 'Inativo'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 p-4 bg-brand-bg rounded-xl border border-brand-border/50">
            <span className="text-xs text-brand-text-muted uppercase tracking-wider font-semibold">
              {isExpired ? 'Expirou em' : 'Validade / Renovação'}
            </span>
            <div className="text-sm font-medium text-brand-text flex items-center space-x-1.5 mt-1">
              <Clock className="w-4 h-4 text-brand-text-muted" />
              <span>
                {subscriptionEndsAt ? formatDateTime(subscriptionEndsAt) : 'Sem data de expiração'}
              </span>
            </div>
            {!isExpired && daysRemaining > 0 && (
              <span className="text-xs text-brand-primary block mt-1 font-semibold">
                (Faltam {daysRemaining} dias)
              </span>
            )}
          </div>
        </div>

        {/* Simuladores de Desenvolvimento (Exibido apenas para Admin) */}
        {profileRole === 'admin' && (
          <div className="mt-8 pt-6 border-t border-brand-border/60 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-brand-text-muted">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Simulador de Homologação SaaS (ideal para testes locais e validação técnica)</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSimulateExpiration}
                disabled={loadingPlan !== null}
                className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>Simular Expiração de Acesso</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cartões dos Planos de Assinatura */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
          {(plans.length > 0 ? plans : DEFAULT_PLANS).map((plan) => {
            const isCurrentPlan = subscriptionPlan === plan.id && !isExpired;
            const isYearly = plan.id === 'yearly';
            const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price);
            const formattedOriginalPrice = plan.original_price
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.original_price)
              : null;
            const periodLabel = plan.id === 'yearly' ? '/ano' : '/mês';
            
            return (
              <div key={plan.id} className={`card border bg-white rounded-3xl p-8 flex flex-col justify-between relative shadow-xl overflow-visible ${
                isCurrentPlan
                  ? 'border-brand-primary shadow-brand-primary/10 ring-2 ring-brand-primary/10' 
                  : 'border-brand-primary/10 shadow-brand-primary/5 hover:border-brand-primary/25 transition-all'
              }`}>
                {isCurrentPlan && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-xs font-bold uppercase tracking-widest px-4 py-1 rounded-full shadow-md">
                    Plano Escolhido
                  </div>
                )}
                {!isCurrentPlan && plan.discount_text && (
                  <div className="absolute top-4 right-[-32px] rotate-45 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest px-10 py-1 shadow-sm">
                    {plan.discount_text}
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-brand-text flex items-center space-x-2">
                        <span>{plan.name}</span>
                      </h3>
                      {plan.description && <p className="text-xs text-brand-text-muted mt-1">{plan.description}</p>}
                      {plan.launch_offer_text && (
                        <p className="text-xs font-medium text-brand-primary mt-2">{plan.launch_offer_text}</p>
                      )}
                    </div>
                    {plan.tag_text && (
                      <span className={`p-2 rounded-xl font-semibold text-xs border ${
                        isYearly 
                          ? 'bg-amber-50 text-amber-600 border-amber-100' 
                          : 'bg-brand-bg text-brand-primary border-brand-primary/10'
                      }`}>
                        {plan.tag_text}
                      </span>
                    )}
                  </div>

                  <div className="mt-6">
                    {formattedOriginalPrice && (
                      <p className="text-sm text-gray-400 line-through mb-1">
                        {formattedOriginalPrice}{periodLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-display font-extrabold text-brand-primary">{formattedPrice}</span>
                    <span className="text-brand-text-muted text-sm ml-1">{periodLabel}</span>
                  </div>
                  {plan.equivalent_monthly_price && (
                    <p className="text-xs text-brand-primary font-semibold mt-1">
                      Equivale a apenas {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.equivalent_monthly_price)} por mês
                    </p>
                  )}

                  {plan.features && plan.features.length > 0 && (
                    <ul className="mt-8 space-y-4 text-sm text-brand-text">
                      {plan.features.map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-center space-x-3">
                          <Check className="w-5 h-5 text-brand-primary flex-shrink-0" />
                          <span>
                            {feature}
                            <FeatureTooltip feature={feature} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-8 pt-4 space-y-3">
                  {isCurrentPlan ? (
                    <div className="space-y-3">
                      <div className="w-full py-3.5 px-4 font-bold rounded-2xl bg-brand-bg text-brand-primary border border-brand-primary/20 cursor-default flex items-center justify-center space-x-2">
                        <CreditCard className="w-5 h-5" />
                        <span>Plano Ativo</span>
                      </div>
                      {billingSubscription?.plan_id === plan.id && (
                        <button
                          type="button"
                          onClick={() => void handleManageSubscription()}
                          disabled={managingSubscription}
                          className="w-full py-3 px-4 font-semibold rounded-2xl border border-brand-border bg-white text-brand-text hover:bg-brand-bg transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {managingSubscription && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>
                            Gerenciar pela {billingSubscription.provider === 'google_play' ? 'Google Play' : 'Stripe'}
                          </span>
                        </button>
                      )}
                      {paymentErrorByPlan.management && (
                        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                          {paymentErrorByPlan.management}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {paymentErrorByPlan[plan.id] && (
                        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                          {paymentErrorByPlan[plan.id]}
                        </div>
                      )}
                      <StripeSubscriptionButton
                        planId={plan.id}
                        disabled={loadingPlan !== null}
                        onLoadingChange={(loading) => {
                          setPaymentErrorByPlan((current) => ({ ...current, [plan.id]: '' }));
                          setLoadingPlan(loading ? plan.id : null);
                        }}
                        onSuccess={handleBillingSuccess}
                        onError={(error) => void handleBillingError(plan.id, error)}
                      />
                      
                      {profileRole === 'admin' && (
                        <button
                          onClick={() => handleSimulatePayment(plan.id)}
                          disabled={loadingPlan !== null}
                          className="w-full py-2 px-4 text-xs font-semibold text-brand-text-muted hover:text-brand-primary border border-dashed border-brand-border hover:border-brand-primary/45 rounded-xl transition-all flex items-center justify-center space-x-1.5 bg-brand-bg/30 hover:bg-brand-bg cursor-pointer"
                        >
                          {loadingPlan === plan.id ? (
                            <svg className="animate-spin h-4 w-4 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Simular Ativação Rápida</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      {/* Seção de Transações Efetuadas */}
      <div className="card border-brand-border/60 bg-white shadow p-6 space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-brand-border/60">
          <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-brand-primary border-none p-0 pb-0">Histórico de Transações</h3>
            <p className="text-xs text-brand-text-muted mt-0.5">Veja seus pagamentos e gerencie reembolsos ou faturas.</p>
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200/75 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-800">
          <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Garantia de Arrependimento (Art. 49 do CDC)</p>
            <p className="opacity-90 mt-0.5 leading-relaxed">
              Conforme o Código de Defesa do Consumidor brasileiro, você tem direito ao reembolso integral de qualquer pagamento realizado em até <strong>7 dias</strong> a partir da data de assinatura. Após esse período, não é possível solicitar o reembolso automático.
            </p>
          </div>
        </div>

        {loadingTransactions ? (
          <div className="py-8 flex flex-col items-center justify-center text-brand-text-muted">
            <Loader2 className="w-6 h-6 text-brand-primary animate-spin mb-2" />
            <span className="text-xs">Carregando histórico de pagamentos...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-brand-text-muted text-xs leading-relaxed">
            Nenhuma transação efetuada até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-brand-border/60 text-brand-text font-bold">
                  <th className="py-3 px-2">Plano</th>
                  <th className="py-3 px-2">Data</th>
                  <th className="py-3 px-2">Valor</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/30">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-brand-bg/20 transition-colors">
                    <td className="py-3.5 px-2 font-medium text-brand-text">
                      {tx.plan_id === 'monthly' ? 'Plano Mensal' : tx.plan_id === 'yearly' ? 'Plano Anual' : tx.plan_id}
                    </td>
                    <td className="py-3.5 px-2 text-brand-text-muted">
                      {formatDateTime(tx.created_at)}
                    </td>
                    <td className="py-3.5 px-2 font-semibold text-brand-text">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: tx.currency?.toUpperCase() || 'BRL' }).format(tx.amount)}
                    </td>
                    <td className="py-3.5 px-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        tx.status === 'refunded' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        tx.status === 'refund_requested' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        tx.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {tx.status === 'paid' ? 'Pago' :
                         tx.status === 'refunded' ? 'Reembolsado' :
                         tx.status === 'refund_requested' ? 'Reembolso Solicitado' :
                         tx.status === 'failed' ? 'Falhou' : tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-2 text-right space-x-2">
                      {tx.stripe_invoice_url ? (
                        <a
                          href={tx.stripe_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2.5 py-1.5 border border-brand-border text-brand-text hover:text-brand-primary hover:border-brand-primary/45 rounded-lg transition-colors font-medium text-[10px]"
                        >
                          Ver Fatura
                        </a>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center px-2.5 py-1.5 border border-brand-border/40 text-brand-text-muted rounded-lg font-medium text-[10px] cursor-not-allowed opacity-55"
                          title="Fatura não disponível para transações simuladas"
                        >
                          Sem Fatura
                        </button>
                      )}
                      
                      {tx.status === 'paid' && (
                        isRefundable(tx.created_at) ? (
                          <button
                            onClick={() => {
                              setSelectedTxForRefund(tx);
                              setShowPersuadeModal(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-semibold text-[10px] cursor-pointer"
                          >
                            Solicitar Reembolso
                          </button>
                        ) : (
                          <button
                            disabled
                            className="inline-flex items-center px-2.5 py-1.5 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg font-medium text-[10px] cursor-not-allowed opacity-60"
                            title="O prazo de arrependimento e reembolso de 7 dias (Art. 49 do CDC) expirou para esta transação."
                          >
                            Prazo Expirado (CDC)
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumo técnico da integração de cobrança - exibido apenas para Admin */}
      {profileRole === 'admin' && (
        <div className="card border-brand-primary/5 bg-white shadow p-6">
          <button
            onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                <Code className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-brand-text">Como funciona a cobrança em produção?</h3>
                <p className="text-xs text-brand-text-muted">Stripe na web e escolha oficial de faturamento no Android</p>
              </div>
            </div>
            <HelpCircle className={`w-5 h-5 text-brand-text-muted transition-transform duration-200 ${showWebhookGuide ? 'rotate-180 text-brand-primary' : ''}`} />
          </button>

          {showWebhookGuide && (
            <div className="mt-6 pt-6 border-t border-brand-border/60 space-y-4 text-sm text-brand-text leading-relaxed">
              <p>
                A ativação do plano acontece somente depois da confirmação assinada pelo webhook do provedor:
              </p>
              
              <ol className="list-decimal pl-5 space-y-2 text-xs">
                <li><strong>Web</strong>: o usuário é redirecionado ao Stripe Checkout hospedado.</li>
                <li><strong>Android</strong>: a Google exibe a escolha entre Play Billing e Stripe PaymentSheet nativo.</li>
                <li><strong>Webhooks</strong>: Stripe e RTDN atualizam o registro unificado no Supabase.</li>
                <li><strong>Liberação</strong>: o plano só é projetado em `professionals` depois da confirmação do provedor.</li>
              </ol>

              <div className="mt-4">
                <p className="font-semibold text-xs text-brand-primary mb-2 flex items-center">
                  <span>Endpoints e eventos obrigatórios:</span>
                </p>
                <div className="bg-gray-900 text-emerald-300 p-4 rounded-xl font-mono text-[11px] overflow-x-auto space-y-2">
                  <p>/functions/v1/stripe-webhook</p>
                  <p>/functions/v1/google-play-rtdn</p>
                  <p className="text-gray-300">checkout.session.completed · invoice.paid · invoice.payment_failed</p>
                  <p className="text-gray-300">customer.subscription.updated · customer.subscription.deleted</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overlay de carregamento do provedor */}
      {loadingPlan && (loadingPlan === 'monthly' || loadingPlan === 'yearly') && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 text-center space-y-6 shadow-2xl border border-brand-primary/10 animate-in zoom-in-95 duration-200">
            <div className="relative flex justify-center animate-bounce">
              <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                <CreditCard className="w-8 h-8" />
              </div>
              <div className="absolute top-0 w-16 h-16 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-display font-bold text-brand-primary">Processando seu pagamento...</h3>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                Estamos abrindo e validando o provedor de pagamento. Não feche nem recarregue esta página.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação / falha do pagamento */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/55 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[28px] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl border border-brand-primary/10 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setPaymentModal(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-brand-bg text-brand-text-muted hover:text-brand-text hover:bg-brand-primary/10 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Fechar modal"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4 pr-10">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                paymentModal.kind === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {paymentModal.kind === 'success' ? <CheckCircle2 className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-brand-primary text-[11px] font-bold uppercase tracking-wider">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{paymentModal.kind === 'success' ? 'Assinatura confirmada' : 'Pagamento não concluído'}</span>
                </div>
                <h3 className="text-2xl font-display font-bold text-brand-text">{paymentModal.title}</h3>
                <p className={`text-sm leading-relaxed ${paymentModal.kind === 'success' ? 'text-brand-text-muted' : 'text-red-700'}`}>
                  {paymentModal.message}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-brand-border bg-brand-bg/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-2">Resumo da transação</p>
                <div className="space-y-2 text-sm text-brand-text">
                  {paymentModal.summaryLines.map((line) => (
                    <p key={line} className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>{line}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {paymentModal.kind === 'error' && paymentModal.errorMessage && (
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4 text-sm text-red-800 leading-relaxed">
                <p className="font-bold text-red-900 mb-1">Motivo da falha</p>
                <p>{paymentModal.errorMessage}</p>
              </div>
            )}

            <div className="rounded-2xl border border-brand-border bg-white p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Boas-vindas e benefícios</p>
                  <p className="text-lg font-bold text-brand-primary mt-1">{paymentModal.kind === 'success' ? 'O que você desbloqueou' : 'O que fazer agora'}</p>
                </div>
                {paymentModal.kind === 'success' && (
                  <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                    Plano ativo
                  </span>
                )}
              </div>

              {paymentModal.kind === 'success' && (
                <p className="text-sm text-brand-text-muted leading-relaxed">
                  {getPlanBenefitsCopy(getPlanDetails(paymentModal.planId), paymentModal.planId).intro}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paymentModal.benefits.map((benefit) => (
                  <div key={benefit} className={`rounded-xl border p-3 text-sm leading-relaxed ${
                    paymentModal.kind === 'success'
                      ? 'bg-brand-bg/40 border-brand-border/60 text-brand-text'
                      : 'bg-red-50/70 border-red-100 text-red-800'
                  }`}>
                    <div className="flex items-start gap-2">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${paymentModal.kind === 'success' ? 'text-brand-primary' : 'text-red-600'}`} />
                      <span>{benefit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              {paymentModal.kind === 'success' && paymentModal.invoiceUrl && (
                <a
                  href={paymentModal.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-primary/15 bg-brand-primary text-white font-bold hover:bg-brand-primary-hover transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Ver fatura</span>
                </a>
              )}
              {paymentModal.kind === 'success' && paymentModal.invoicePdfUrl && (
                <a
                  href={paymentModal.invoicePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-border bg-white text-brand-text font-bold hover:bg-brand-bg transition-colors"
                >
                  <span>Baixar PDF</span>
                </a>
              )}
              <button
                onClick={() => setPaymentModal(null)}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-colors ${
                  paymentModal.kind === 'success'
                    ? 'bg-brand-bg text-brand-text hover:bg-brand-primary/10 border border-brand-border'
                    : 'bg-red-600 text-white hover:bg-red-700 border border-red-600'
                }`}
              >
                <span>{paymentModal.kind === 'success' ? 'Continuar' : 'Tentar novamente'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Persuasão para Reembolso */}
      {showPersuadeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-6 shadow-2xl border border-brand-primary/10 relative animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-xl font-display font-bold text-brand-primary flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span>Deseja mesmo solicitar reembolso?</span>
              </h3>
              <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
                Ao cancelar sua assinatura e obter o reembolso, você perderá acesso imediato aos seguintes recursos exclusivos:
              </p>
            </div>

            <div className="space-y-3 bg-brand-bg/50 p-4 rounded-2xl border border-brand-border/40 text-xs text-brand-text leading-relaxed">
              <div className="flex items-start space-x-2.5">
                <Check className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="font-semibold block">Transcrições e evoluções com IA</strong>
                  <span>Você perderá acesso às transcrições de áudio com uso justo mensal e terá de voltar a digitar seus registros manualmente.</span>
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <Check className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="font-semibold block">Integração em tempo real com Google Docs</strong>
                  <span>As evoluções deixarão de ser inseridas automaticamente nos seus prontuários no Google Drive.</span>
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <Check className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="font-semibold block">Histórico de Atendimentos Centralizado</strong>
                  <span>Busca rápida de evoluções e controle de pacientes direto pela nossa plataforma segura.</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setShowPersuadeModal(false);
                  setSelectedTxForRefund(null);
                }}
                className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl text-sm hover:bg-brand-primary-hover transition-colors shadow shadow-brand-primary/20 cursor-pointer"
              >
                Desistir do reembolso e manter benefícios
              </button>
              <button
                onClick={() => {
                  setShowPersuadeModal(false);
                  setShowConfirmModal(true);
                }}
                className="w-full py-2.5 border border-brand-border text-brand-text-muted hover:text-red-600 hover:bg-red-50 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Prosseguir com o cancelamento e reembolso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Motivo e Confirmação de Reembolso */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-5 shadow-2xl border border-brand-primary/10 relative animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-xl font-display font-bold text-red-600 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Confirmar Reembolso</span>
              </h3>
              <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                Por favor, preencha os detalhes abaixo para que possamos efetuar o reembolso e o cancelamento de sua assinatura.
              </p>
            </div>

            <div className="space-y-4">
              {/* Motivo do Cancelamento */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-brand-text block">Motivo do Reembolso</label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Conte-nos brevemente o motivo (ex: não me adaptei, problemas técnicos, etc.)"
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary resize-none"
                />
              </div>

              {/* Confirmação por Escrito */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-brand-text block">
                  Digite <strong className="text-brand-primary font-bold">REEMBOLSAR</strong> para confirmar:
                </label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="Digite REEMBOLSAR"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-brand-border/60">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedTxForRefund(null);
                  setRefundReason('');
                  setConfirmPhrase('');
                }}
                disabled={loadingRefund}
                className="flex-1 py-3 border border-brand-border text-brand-text font-bold rounded-xl text-sm hover:bg-brand-bg transition-colors cursor-pointer"
              >
                Desistir do reembolso
              </button>
              <button
                type="button"
                onClick={handleRequestRefund}
                disabled={loadingRefund || !isRefundConfirmationValid}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center space-x-1.5 shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loadingRefund ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>Efetuar reembolso</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
