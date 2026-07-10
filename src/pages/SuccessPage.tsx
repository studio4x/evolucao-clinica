import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { CheckCircle2, ArrowRight, ShieldCheck, CreditCard, Sparkles, Check, Mail, Loader2 } from 'lucide-react';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination } from '../utils/onboarding';
import { supabase } from '../supabaseClient';

const GooglePayLogo = ({ className = "h-3.5 w-auto" }: { className?: string }) => (
  <svg 
    viewBox="0 0 80 38.1" 
    className={className} 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="#5F6368" d="M37.8,19.7V29h-3V6h7.8c1.9,0,3.7,0.7,5.1,2c1.4,1.2,2.1,3,2.1,4.9c0,1.9-0.7,3.6-2.1,4.9c-1.4,1.3-3.1,2-5.1,2L37.8,19.7L37.8,19.7z M37.8,8.8v8h5c1.1,0,2.2-0.4,2.9-1.2c1.6-1.5,1.6-4,0.1-5.5c0,0-0.1-0.1-0.1-0.1c-0.8-0.8-1.8-1.3-2.9-1.2L37.8,8.8L37.8,8.8z"/>
    <path fill="#5F6368" d="M56.7,12.8c2.2,0,3.9,0.6,5.2,1.8s1.9,2.8,1.9,4.8V29H61v-2.2h-0.1c-1.2,1.8-2.9,2.7-4.9,2.7c-1.7,0-3.2-0.5-4.4-1.5c-1.1-1-1.8-2.4-1.8-3.9c0-1.6,0.6-2.9,1.8-3.9c1.2-1,2.9-1.4,4.9-1.4c1.8,0,3.2,0.3,4.3,1v-0.7c0-1-0.4-2-1.2-2.6c-0.8-0.7-1.8-1.1-2.9-1.1c-1.7,0-3,0.7-3.9,2.1l-2.6-1.6C51.8,13.8,53.9,12.8,56.7,12.8z M52.9,24.2c0,0.8,0.4,1.5,1,1.9c0.7,0.5,1.5,0.8,2.3,0.8c1.2,0,2.4-0.5,3.3-1.4c1-0.9,1.5-2,1.5-3.2c-0.9-0.7-2.2-1.1-3.9-1.1c-1.2,0-2.2,0.3-3,0.9C53.3,22.6,52.9,23.3,52.9,24.2z"/>
    <path fill="#5F6368" d="M80,13.3l-9.9,22.7h-3l3.7-7.9l-6.5-14.7h3.2l4.7,11.3h0.1l4.6-11.3H80z"/>
    <path fill="#4285F4" d="M25.9,17.7c0-0.9-0.1-1.8-0.2-2.7H13.2v5.1h7.1c-0.3,1.6-1.2,3.1-2.6,4v3.3H22C24.5,25.1,25.9,21.7,25.9,17.7z"/>
    <path fill="#34A853" d="M13.2,30.6c3.6,0,6.6-1.2,8.8-3.2l-4.3-3.3c-1.2,0.8-2.7,1.3-4.5,1.3c-3.4,0-6.4-2.3-7.4-5.5H1.4v3.4C3.7,27.8,8.2,30.6,13.2,30.6z"/>
    <path fill="#FBBC04" d="M5.8,19.9c-0.6-1.6-0.6-3.4,0-5.1v-3.4H1.4c-1.9,3.7-1.9,8.1,0,11.9L5.8,19.9z"/>
    <path fill="#EA4335" d="M13.2,9.4c1.9,0,3.7,0.7,5.1,2l0,0l3.8-3.8c-2.4-2.2-5.6-3.5-8.8-3.4c-5,0-9.6,2.8-11.8,7.3l4.4,3.4C6.8,11.7,9.8,9.4,13.2,9.4z"/>
  </svg>
);

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
  const defaultMonthlyBenefits = [
    'Pacientes ilimitados',
    'Transcrições de áudio com uso justo de até 20 horas por mês',
    'Integração com Google Docs em tempo real',
    'Gravação e transcrição de áudio nativa',
    'Geração de Relatórios & PDI por IA',
    'Lembrete e envio de WhatsApp para aniversariantes',
    'Compartilhamento de relatórios via WhatsApp',
    'Impressão de prontuários do Google Docs'
  ];

  const defaultYearlyBenefits = [
    'Tudo do plano mensal',
    'Desconto de ~17% sobre o valor mensal',
    'Suporte prioritário via e-mail e WhatsApp',
    'Garantia de novos recursos exclusivo em primeira mão'
  ];

  return planId === 'yearly' ? defaultYearlyBenefits : defaultMonthlyBenefits;
};

export default function SuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, subscriptionPlan } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [isProceeding, setIsProceeding] = useState(false);

  const state = location.state as {
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
  } | null;

  useEffect(() => {
    if (state) {
      const transactionId = state.transactionId || `sim-${Date.now().toString().slice(-6)}`;
      const amount = state.amount;
      const planName = state.planName;
      const planId = state.planId;

      // 1. Push to Google Tag Manager dataLayer
      if (typeof window !== 'undefined') {
        const dl = ((window as any).dataLayer = (window as any).dataLayer || []);
        dl.push({
          event: 'purchase',
          ecommerce: {
            transaction_id: transactionId,
            value: amount,
            currency: 'BRL',
            items: [{
              item_id: planId,
              item_name: planName,
              price: amount,
              quantity: 1
            }]
          }
        });

        // 2. Fire Facebook Pixel Purchase Event
        if (typeof (window as any).fbq === 'function') {
          (window as any).fbq('track', 'Purchase', {
            value: amount,
            currency: 'BRL',
            content_name: planName,
            content_category: 'Subscription',
            content_ids: [planId],
            content_type: 'product'
          });
        }
      }
    }
  }, [state]);

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

  const formattedAmount = state?.amount 
    ? state.amount.toFixed(2).replace('.', ',') 
    : (subscriptionPlan === 'yearly' ? '499,00' : '49,90');

  const displayPlanName = state?.planName 
    ? state.planName 
    : (subscriptionPlan === 'yearly' ? 'Plano Anual' : 'Plano Mensal');

  const displayTransactionId = state?.transactionId 
    ? state.transactionId 
    : `TX-${Date.now().toString().slice(-8)}`;

  const displayPaymentMethod = state?.paymentMethod 
    ? state.paymentMethod 
    : 'Google Pay / Cartão';

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
                <h3 className="text-2xl font-display font-bold text-brand-text">Bem-vindo ao {displayPlanName}</h3>
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
                    <span>Valor: R$ {formattedAmount}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <span>Forma de pagamento: {displayPaymentMethod}</span>
                  </p>
                  {state?.subscriptionId && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Assinatura Google Pay: {state.subscriptionId}</span>
                    </p>
                  )}
                  {state?.invoiceId && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Fatura Google Pay: {state.invoiceId}</span>
                    </p>
                  )}
                  {state?.endsAt && (
                    <p className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                      <span>Próxima renovação: {formatRenewalDate(state.endsAt)}</span>
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
                {state?.planId === 'yearly'
                  ? 'Você escolheu a melhor opção para manter a operação rodando com previsibilidade e foco no longo prazo.'
                  : 'Você ativou uma assinatura flexível, pensada para quem quer controle mês a mês sem perder produtividade.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {getPlanBenefitsList(state?.planId || 'monthly').map((benefit) => (
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
              {state?.invoiceUrl && (
                <a
                  href={state.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-primary/15 bg-brand-primary text-white font-bold hover:bg-brand-primary-hover transition-colors text-sm"
                >
                  <Mail className="w-4 h-4" />
                  <span>Ver fatura</span>
                </a>
              )}
              {state?.invoicePdfUrl && (
                <a
                  href={state.invoicePdfUrl}
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
              <span>Transação protegida e auditada pelo</span>
              <GooglePayLogo className="h-3.5 w-auto" />
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
