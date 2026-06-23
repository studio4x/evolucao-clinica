import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { Check, ShieldCheck, Sparkles, CreditCard, HelpCircle, Code, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import GooglePayButton from '@google-pay/button-react';
import { getGooglePayRequest, DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '../services/googlePay';

const DEFAULT_PLANS = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    description: 'Flexibilidade e controle mês a mês',
    price: 49.90,
    equivalent_monthly_price: null,
    features: [
      'Pacientes ilimitados',
      'Evoluções clínicas com IA ilimitadas',
      'Integração com Google Docs em tempo real',
      'Gravação e transcrição de áudio nativa',
      'Geração de Relatórios & PDI por IA',
      'Lembrete e envio de WhatsApp para aniversariantes',
      'Compartilhamento de relatórios via WhatsApp',
      'Impressão de prontuários do Google Docs'
    ],
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

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showPersuadeModal, setShowPersuadeModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedTxForRefund, setSelectedTxForRefund] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [loadingRefund, setLoadingRefund] = useState(false);

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
          amount: plan === 'monthly' ? 49.90 : 499.00,
          currency: 'brl',
          plan_id: plan,
          status: 'paid',
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

      setSuccessMessage(`Plano ${plan === 'monthly' ? 'Mensal' : 'Anual'} ativado com sucesso através da simulação!`);
      fetchTransactions();
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
      const token = paymentData.paymentMethodData?.tokenizationData?.token;
      console.log("Token do Google Pay recebido com sucesso:", token);
      
      if (!token) {
        throw new Error("Token de pagamento não retornado pela API do Google Pay.");
      }

      // Invoca a Edge Function do Supabase para processar a assinatura real na Stripe
      const { data, error: functionError } = await supabase.functions.invoke('process-google-pay', {
        body: {
          userId: user.id,
          planId: plan,
          paymentToken: token
        }
      });

      if (functionError) throw functionError;
      if (!data || !data.success) {
        throw new Error(data?.error || "Ocorreu um erro no processamento do pagamento.");
      }

      // Atualiza o estado global do Zustand com os dados reais retornados pelo backend
      setProfileInfo(
        'active', 
        profileRole || 'therapist',
        plan,
        data.status || 'active',
        data.endsAt,
        trialEndsAt
      );

      setSuccessMessage(`Plano ${plan === 'monthly' ? 'Mensal' : 'Anual'} ativado com sucesso via Google Pay!`);
      fetchTransactions();
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (error: any) {
      console.error("Erro ao processar assinatura via Google Pay:", error);
      alert("Erro ao processar pagamento real: " + (error.message || error));
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleRequestRefund = async () => {
    if (!selectedTxForRefund) return;
    if (confirmPhrase !== 'REEMBOLSAR') {
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

      {/* Overlay de carregamento do Google Pay */}
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
                Estamos validando sua transação com segurança no Google Pay. Por favor, não feche ou recarregue esta página.
              </p>
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
                  <strong className="font-semibold block">Evoluções com IA Ilimitadas</strong>
                  <span>Você não poderá mais transcrever e resumir seus áudios clínicos com a inteligência artificial, tendo que voltar a digitar tudo manualmente.</span>
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
                  className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary font-mono uppercase"
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
                disabled={loadingRefund || confirmPhrase !== 'REEMBOLSAR'}
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
