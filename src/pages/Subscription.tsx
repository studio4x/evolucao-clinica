import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { Check, ShieldCheck, Sparkles, CreditCard, HelpCircle, Code, Clock, AlertTriangle } from 'lucide-react';
import GooglePayButton from '@google-pay/button-react';
import { getGooglePayRequest, DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '../services/googlePay';

const DEFAULT_PLANS = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    description: 'Flexibilidade e controle mês a mês',
    price: 49.90,
    equivalent_monthly_price: null,
    features: ['Pacientes ilimitados', 'Evoluções clínicas com IA ilimitadas', 'Integração com Google Docs em tempo real', 'Gravação e transcrição de áudio nativa'],
    button_text_simulate: 'Assinar Mensal (Simulado)',
    tag_text: 'Recorrente',
    discount_text: null
  },
  {
    id: 'yearly',
    name: 'Plano Anual',
    description: 'Melhor custo-benefício anualizado',
    price: 499.00,
    equivalent_monthly_price: 41.58,
    features: ['Tudo do plano mensal', 'Desconto de ~17% sobre o valor mensal', 'Suporte prioritário via e-mail', 'Garantia de novos recursos em primeira mão'],
    button_text_simulate: 'Assinar Anual (Simulado)',
    tag_text: 'Popular',
    discount_text: '17% OFF'
  }
];

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

  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);

  useEffect(() => {
    const fetchPaymentSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'payment_settings')
          .single();
        
        if (!error && data && data.api_key) {
          const parsed = JSON.parse(data.api_key);
          setPaymentSettings({
            ...DEFAULT_PAYMENT_SETTINGS,
            ...parsed
          });
        }
      } catch (err) {
        console.error("Erro ao carregar configurações de pagamento do banco:", err);
      }
    };
    
    fetchPaymentSettings();
  }, []);

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

      // Atualiza o estado global do Zustand
      setProfileInfo(
        'active', 
        profileRole || 'therapist',
        plan,
        'active',
        newExpirationDate,
        trialEndsAt
      );

      setSuccessMessage(`Plano ${plan === 'monthly' ? 'Mensal' : 'Anual'} ativado com sucesso através da simulação!`);
      setTimeout(() => setSuccessMessage(null), 8000);
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

  const handleGooglePaySuccess = async (plan: 'monthly' | 'yearly', paymentData: any) => {
    if (!user) return;
    setLoadingPlan(plan);
    setSuccessMessage(null);

    try {
      console.log("Token do Google Pay recebido com sucesso:", paymentData.paymentMethodData?.tokenizationData?.token);
      
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

      // Atualiza o estado global do Zustand
      setProfileInfo(
        'active', 
        profileRole || 'therapist',
        plan,
        'active',
        newExpirationDate,
        trialEndsAt
      );

      setSuccessMessage(`Plano ${plan === 'monthly' ? 'Mensal' : 'Anual'} ativado com sucesso via Google Pay!`);
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (error: any) {
      console.error("Erro ao processar assinatura via Google Pay:", error);
      alert("Erro ao processar assinatura no Supabase: " + (error.message || error));
    } finally {
      setLoadingPlan(null);
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
          <span>SaaS Recorrência</span>
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
                {subscriptionPlan === 'trial' && 'Período de Testes (Trial)'}
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
                {subscriptionStatus === 'trialing' && 'Trial Ativo'}
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
          const periodLabel = plan.id === 'yearly' ? '/ano' : '/mês';
          
          return (
            <div key={plan.id} className={`card border bg-white rounded-3xl p-8 flex flex-col justify-between relative shadow-xl ${
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

                <div className="mt-6 flex items-baseline">
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
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-8 pt-4 space-y-3">
                {isCurrentPlan ? (
                  <button
                    disabled
                    className="w-full py-3.5 px-4 font-bold rounded-2xl bg-brand-bg text-brand-primary border border-brand-primary/20 cursor-default flex items-center justify-center space-x-2"
                  >
                    <CreditCard className="w-5 h-5" />
                    <span>Plano Ativo</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="w-full rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <GooglePayButton
                        environment={paymentSettings.environment}
                        buttonType="subscribe"
                        buttonColor="black"
                        buttonSizeMode="fill"
                        buttonLocale="pt"
                        paymentRequest={getGooglePayRequest(plan.price, paymentSettings)}
                        onLoadPaymentData={(paymentRequest) => {
                          handleGooglePaySuccess(plan.id, paymentRequest);
                        }}
                        onError={(error) => {
                          console.error('Erro na API do Google Pay:', error);
                        }}
                        onCancel={(reason) => {
                          console.log('Pagamento cancelado pelo usuário:', reason);
                        }}
                        style={{ width: '100%', height: '48px' }}
                      />
                    </div>
                    
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

      {/* Manual de Integração Stripe/Asaas (Ajuda técnica do SaaS - Exibido apenas para Admin) */}
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
                <h3 className="font-bold text-brand-text">Como integrar com Stripe ou Asaas em produção?</h3>
                <p className="text-xs text-brand-text-muted">Clique aqui para ver a arquitetura recomendada e código de webhooks</p>
              </div>
            </div>
            <HelpCircle className={`w-5 h-5 text-brand-text-muted transition-transform duration-200 ${showWebhookGuide ? 'rotate-180 text-brand-primary' : ''}`} />
          </button>

          {showWebhookGuide && (
            <div className="mt-6 pt-6 border-t border-brand-border/60 space-y-4 text-sm text-brand-text leading-relaxed">
              <p>
                Para disponibilizar este SaaS comercialmente, você deve conectar os planos a um gateway de pagamentos real. O fluxo de produção recomendado é:
              </p>
              
              <ol className="list-decimal pl-5 space-y-2 text-xs">
                <li><strong>Checkout</strong>: O botão de assinatura redireciona o usuário para o Stripe Checkout Session ou gera um Pix/Boleto no Asaas.</li>
                <li><strong>Metadata</strong>: Você passa o `uid` do usuário do Firebase Auth como metadata na transação.</li>
                <li><strong>Webhook</strong>: Quando o pagamento é confirmado, o gateway envia um evento POST (webhook) para o seu servidor.</li>
                <li><strong>Atualização no Firestore</strong>: O servidor valida o webhook e atualiza o documento correspondente na coleção `professionals` no Firestore.</li>
              </ol>

              <div className="mt-4">
                <p className="font-semibold text-xs text-brand-primary mb-2 flex items-center">
                  <span>Exemplo de endpoint de Webhook Node.js / Express (Stripe):</span>
                </p>
                <pre className="bg-gray-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto">
{`const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(\`Webhook Error: \${err.message}\`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const plan = session.metadata.plan; // 'monthly' | 'yearly'
    
    const db = admin.firestore();
    const durationMs = plan === 'monthly' ? 30 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
    const subscriptionEndsAt = new Date(Date.now() + durationMs).toISOString();

    await db.collection('professionals').doc(userId).update({
      subscription_plan: plan,
      subscription_status: 'active',
      subscription_ends_at: subscriptionEndsAt,
      updated_at: new Date().toISOString()
    });
  }

  res.json({ received: true });
});`}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
