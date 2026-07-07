import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import GooglePayButton from '@google-pay/button-react';
import { getGooglePayRequest, DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '../services/googlePay';
import { Check, ShieldCheck, Sparkles, LogOut, ArrowRight, Clock, HelpCircle, AlertTriangle, CreditCard } from 'lucide-react';
import { AppVersion } from '../components/layout/AppVersion';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination, isOnboardingComplete } from '../utils/onboarding';
import { trackBeginCheckout } from '../services/analytics';


const DEFAULT_PLANS = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    price: 49.90,
    features: [
      'Pacientes ilimitados',
      'Evoluções clínicas com IA ilimitadas',
      'Integração com Google Docs em tempo real',
      'Gravação e transcrição de áudio nativa',
      'Geração de Relatórios & PDI por IA',
      'Pesquisa Inteligente por IA (Pergunte ao Prontuário)',
      'Assinatura Digital de Documentos com Proteção Legal',
      'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)'
    ]
  },
  {
    id: 'yearly',
    name: 'Plano Anual',
    price: 499.00,
    features: [
      'Tudo do plano mensal',
      'Desconto de ~17% sobre o valor mensal',
      'Suporte prioritário via e-mail e WhatsApp',
      'Garantia de novos recursos em primeira mão'
    ]
  }
];

function getGooglePayPaymentLabel(paymentData: any) {
  const paymentMethodData = paymentData?.paymentMethodData || {};
  const description = String(paymentMethodData.description || '').trim();
  if (description) {
    return `Google Pay (${description})`;
  }

  const network = String(paymentMethodData.info?.cardNetwork || '').trim();
  const cardDetails = String(paymentMethodData.info?.cardDetails || '').trim();

  if (network && cardDetails) {
    const formattedNetwork = network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
    return `Google Pay (${formattedNetwork} **** ${cardDetails})`;
  }
  return 'Google Pay';
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user, profileRole, trialEndsAt, setProfileInfo } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  const [selectedCheckoutPlan, setSelectedCheckoutPlan] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem('selected_checkout_plan') : null;
  });

  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);

  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    const fetchPaymentSettings = async () => {
      try {
        const response = await fetch('/api/payment-settings', {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error('Falha ao carregar configurações públicas de pagamento.');
        }

        const parsed = await response.json();
        if (parsed) {
          setPaymentSettings({
            ...DEFAULT_PAYMENT_SETTINGS,
            ...parsed
          });
        }
      } catch (e) {
        console.error("Error fetching payment settings in checkout:", e);
      }
    };

    const fetchPlans = async () => {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .order('price', { ascending: true });
        if (error) throw error;
        if (data && data.length > 0) {
          setPlans(data);
        }
      } catch (e) {
        console.error("Error fetching plans in checkout:", e);
      }
    };

    fetchPaymentSettings();
    fetchPlans();
  }, []);

  const hasTrackedCheckoutRef = useRef(false);

  useEffect(() => {
    if (selectedCheckoutPlan && !hasTrackedCheckoutRef.current) {
      const isPlansLoaded = plans.length > 0;
      if (isPlansLoaded) {
        const planDetails = getPlanDetails(selectedCheckoutPlan);
        trackBeginCheckout(
          planDetails.id,
          planDetails.name,
          planDetails.price
        );
        hasTrackedCheckoutRef.current = true;
      }
    }
  }, [selectedCheckoutPlan, plans]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedCheckoutPlan && !hasTrackedCheckoutRef.current) {
        const planDetails = getPlanDetails(selectedCheckoutPlan);
        trackBeginCheckout(
          planDetails.id,
          planDetails.name,
          planDetails.price
        );
        hasTrackedCheckoutRef.current = true;
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [selectedCheckoutPlan]);

  const getPlanDetails = (planId: string) => {
    return (plans.length > 0 ? plans : DEFAULT_PLANS).find((plan) => plan.id === planId) || DEFAULT_PLANS.find((plan) => plan.id === planId) || DEFAULT_PLANS[0];
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('pending_checkout_flow');
      sessionStorage.removeItem('selected_checkout_plan');
      await supabase.auth.signOut();
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setProfileInfo(null, null);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Erro ao deslogar:', error);
    }
  };

  const handleGooglePaySuccess = async (plan: string, paymentData: any) => {
    if (!user) return;
    setLoadingPlan(plan);

    try {
      const token = paymentData.paymentMethodData?.tokenizationData?.token;
      const paymentLabel = getGooglePayPaymentLabel(paymentData);
      
      if (!token) {
        throw new Error("Token de pagamento não retornado pela API.");
      }

      const { data, error: functionError } = await supabase.functions.invoke('process-google-pay', {
        body: {
          userId: user.id,
          planId: plan,
          paymentToken: token,
          paymentDescriptor: paymentLabel
        }
      });

      if (functionError) throw functionError;
      if (!data || !data.success) {
        throw new Error(data?.error || "Erro no processamento do pagamento.");
      }

      const now = new Date();
      let durationMs = 0;
      if (plan === 'monthly') {
        durationMs = 30 * 24 * 60 * 60 * 1000;
      } else if (plan === 'yearly') {
        durationMs = 365 * 24 * 60 * 60 * 1000;
      }
      const newExpirationDate = data.endsAt || new Date(now.getTime() + durationMs).toISOString();

      setProfileInfo(
        'active', 
        profileRole || 'therapist',
        plan as any,
        data.status || 'active',
        newExpirationDate,
        trialEndsAt
      );

      sessionStorage.removeItem('pending_checkout_flow');
      sessionStorage.removeItem('selected_checkout_plan');
      
      const transactionId = data.chargeId || data.paymentIntentId || `gpay-${Date.now()}`;
      navigate('/checkout/success', {
        state: {
          transactionId,
          planId: plan,
          planName: plan === 'yearly' ? 'Plano Anual' : 'Plano Mensal',
          amount: plan === 'yearly' ? 499.00 : 49.90,
          paymentMethod: paymentLabel
        },
        replace: true
      });
    } catch (error: any) {
      console.error("Erro ao processar assinatura via Google Pay:", error);
      alert(`Falha ao processar pagamento: ${error.message || error}`);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleGooglePayError = (plan: string, error: any) => {
    console.error('Erro na API do Google Pay:', error);
    alert('Erro ao processar pagamento com Google Pay. Tente novamente.');
  };

  const handleSimulatePayment = async (plan: string) => {
    if (!user) return;
    setLoadingPlan(plan);

    try {
      const now = new Date();
      let durationMs = 0;

      if (plan === 'monthly') {
        durationMs = 30 * 24 * 60 * 60 * 1000;
      } else if (plan === 'yearly') {
        durationMs = 365 * 24 * 60 * 60 * 1000;
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

      await supabase
        .from('transactions')
        .insert({
          professional_id: user.id,
          stripe_invoice_id: null,
          stripe_subscription_id: null,
          amount: plan === 'monthly' ? 49.90 : 499.00,
          currency: 'brl',
          plan_id: plan,
          status: 'paid',
          payment_method: 'Google Pay (Simulado)',
          invoice_url: null,
          invoice_pdf_url: null,
          created_at: now.toISOString()
        });

      setProfileInfo(
        'active',
        profileRole || 'therapist',
        plan as any,
        'active',
        newExpirationDate,
        trialEndsAt
      );

      sessionStorage.removeItem('pending_checkout_flow');
      sessionStorage.removeItem('selected_checkout_plan');

      const simulatedTxId = `sim-${Date.now().toString().slice(-6)}`;
      navigate('/checkout/success', {
        state: {
          transactionId: simulatedTxId,
          planId: plan,
          planName: plan === 'yearly' ? 'Plano Anual' : 'Plano Mensal',
          amount: plan === 'yearly' ? 499.00 : 49.90,
          paymentMethod: 'Google Pay (Simulado)'
        },
        replace: true
      });
    } catch (error: any) {
      console.error("Erro ao simular pagamento:", error);
      alert("Falha na simulação: " + error.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleStartTrial = () => {
    sessionStorage.removeItem('pending_checkout_flow');
    sessionStorage.removeItem('selected_checkout_plan');
    const destination = getOnboardingDestination(user?.id);
    navigate(destination, { replace: true });
  };

  // Se por acaso cair aqui sem plano selecionado
  if (!selectedCheckoutPlan) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center p-6 text-center">
        <div className="card p-8 max-w-md bg-white border border-brand-primary/10 shadow-2xl space-y-6">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-brand-text">Nenhum plano selecionado</h2>
          <p className="text-sm text-brand-text-muted">
            Por favor, retorne à página inicial para escolher o plano de assinatura que deseja adquirir.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="btn-primary w-full py-3 font-semibold text-sm cursor-pointer"
          >
            Voltar para a Home
          </button>
        </div>
      </div>
    );
  }

  const planDetails = getPlanDetails(selectedCheckoutPlan);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col relative overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* HEADER SIMPLIFICADO */}
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
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-text-muted hover:text-brand-primary bg-white hover:bg-brand-bg border border-brand-border rounded-xl transition-all cursor-pointer shadow-sm"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col justify-center items-center py-12 px-6 relative z-10 max-w-3xl mx-auto w-full">
        <div className="w-full space-y-8 text-center">
          
          {/* Card de Checkout */}
          <div className="card border-brand-primary bg-white p-6 md:p-8 rounded-3xl border shadow-2xl text-left relative overflow-hidden ring-4 ring-brand-primary/10 animate-fade-in">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row justify-between gap-8">
              <div className="space-y-6 flex-1">
                <div>
                  <div className="inline-flex items-center space-x-1.5 bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Plano Escolhido</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-brand-text">
                    Concluir Assinatura: {planDetails.name}
                  </h2>
                  <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
                    Você selecionou este plano. Complete o pagamento abaixo de forma 100% segura com o Google Pay para liberar seu acesso clínico instantaneamente e prosseguir para a etapa de onboarding.
                  </p>
                </div>

                <div className="flex items-baseline">
                  <span className="text-sm font-bold text-brand-text-muted mr-1">R$</span>
                  <span className="text-4xl font-extrabold font-display text-brand-primary">
                    {planDetails.price.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-sm text-brand-text-muted ml-1">
                    {selectedCheckoutPlan === 'yearly' ? '/ano' : '/mês'}
                  </span>
                </div>

                {planDetails.features && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">O que está incluso no seu plano:</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-brand-text">
                      {planDetails.features.map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-center space-x-2">
                          <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
                          <span className="text-xs font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="w-full md:w-72 flex flex-col justify-center border-t md:border-t-0 md:border-l border-brand-border/65 pt-6 md:pt-0 md:pl-8 space-y-4 min-w-[260px]">
                <div className="bg-brand-bg/60 p-4 rounded-2xl border border-brand-border/40 text-center space-y-1 mb-1">
                  <p className="text-xs text-brand-text-muted font-semibold">Método de pagamento seguro</p>
                  <div className="flex justify-center items-center space-x-1.5 text-brand-primary font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Criptografia SSL ativa</span>
                  </div>
                </div>

                <GooglePayButton
                  key={`${paymentSettings.environment}-${paymentSettings.stripeSandboxPublishableKey}-${paymentSettings.stripeProdPublishableKey}`}
                  environment={paymentSettings.environment}
                  buttonType="subscribe"
                  buttonColor="black"
                  buttonSizeMode="fill"
                  buttonLocale="pt"
                  buttonRadius={8}
                  paymentRequest={getGooglePayRequest(planDetails.price, paymentSettings)}
                  onLoadPaymentData={(paymentRequest) => {
                    handleGooglePaySuccess(selectedCheckoutPlan, paymentRequest);
                  }}
                  onError={(error) => {
                    handleGooglePayError(selectedCheckoutPlan, error);
                  }}
                  onCancel={(reason) => {
                    console.log('Pagamento cancelado pelo usuário:', reason);
                  }}
                  style={{ width: '100%', height: '48px' }}
                />

                {profileRole === 'admin' && (
                  <button
                    onClick={() => handleSimulatePayment(selectedCheckoutPlan)}
                    disabled={loadingPlan !== null}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-brand-text-muted hover:text-brand-primary border border-dashed border-brand-border hover:border-brand-primary/45 rounded-xl transition-all flex items-center justify-center space-x-1.5 bg-brand-bg/30 hover:bg-brand-bg cursor-pointer"
                  >
                    {loadingPlan === selectedCheckoutPlan ? (
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
            </div>
          </div>

          {/* CTA ALTERNATIVO DE AVALIAÇÃO GRATUITA */}
          <div className="card bg-white/70 backdrop-blur-sm border border-brand-border/70 p-6 md:p-8 rounded-3xl shadow-lg space-y-5 text-center max-w-xl mx-auto animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-base font-bold text-brand-text">Ainda com dúvidas?</h3>
            <p className="text-xs text-brand-text-muted leading-relaxed max-w-md mx-auto">
              Está na dúvida se vai valer a pena adquirir uma assinatura da Evolução Clínica? Sem problemas, faça um teste gratuito por até 7 dias para conhecer toda a ferramenta e suas funcionalidades.
            </p>
            <button
              onClick={() => setShowTrialModal(true)}
              className="btn-outline px-6 py-3 text-xs font-bold transition-all hover:border-brand-primary flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              Experimentar por 7 dias grátis <ArrowRight size={14} />
            </button>
          </div>
          
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full py-8 text-center text-[10px] text-brand-text-muted mt-auto relative z-10 border-t border-brand-border bg-white/40">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-2">
          <div className="inline-block px-3 py-1 bg-white/50 backdrop-blur-md rounded-full border border-brand-primary/5 shadow-sm">
            <AppVersion />
          </div>
          <p>© {new Date().getFullYear()} Evolução Clínica. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* MODAL DE CONFIRMAÇÃO DO TRIAL */}
      {showTrialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay escurecido com blur */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowTrialModal(false)}
          />
          
          {/* Caixa do modal */}
          <div className="bg-white rounded-3xl border border-brand-border shadow-2xl p-6 md:p-8 max-w-md w-full relative z-10 text-center space-y-6 animate-scaleIn">
            <div className="w-12 h-12 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-brand-text">Iniciar Teste Gratuito?</h4>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                Você deseja iniciar sua avaliação gratuita de 7 dias e conhecer todas as funcionalidades da Evolução Clínica? Você poderá assinar um plano a qualquer momento pelo painel.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => setShowTrialModal(false)}
                className="w-full py-3 px-4 text-xs font-semibold text-brand-text-muted hover:text-brand-primary bg-brand-bg rounded-xl border border-brand-border/45 transition-colors cursor-pointer"
              >
                Não, voltar
              </button>
              <button
                onClick={handleStartTrial}
                className="w-full py-3 px-4 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Sim, iniciar teste
              </button>
            </div>
          </div>
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
    </div>
  );
}
