import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { CheckCircle2, ArrowRight, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination } from '../utils/onboarding';

export default function SuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, subscriptionPlan } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  const state = location.state as {
    transactionId?: string;
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

  const handleProceed = () => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
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
      <main className="flex-1 flex flex-col justify-center items-center py-12 px-6 relative z-10 max-w-xl mx-auto w-full">
        <div className="w-full space-y-8 text-center animate-fade-in">
          <div className="card bg-white p-6 md:p-8 rounded-3xl border border-brand-border shadow-2xl text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none" />

            <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-display font-bold text-brand-text">
                Assinatura Confirmada!
              </h2>
              <p className="text-xs text-brand-text-muted max-w-sm mx-auto">
                Parabéns! Seu acesso à plataforma Evolução Clínica foi liberado instantaneamente.
              </p>
            </div>

            {/* Transaction Data Table */}
            <div className="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4 text-left space-y-3.5">
              <h3 className="text-[10px] font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Detalhes da Transação
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-brand-border/40">
                  <span className="text-brand-text-muted font-medium">Pedido / Transação</span>
                  <span className="text-brand-text font-mono font-semibold">{displayTransactionId}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-brand-border/40">
                  <span className="text-brand-text-muted font-medium">Plano Contratado</span>
                  <span className="text-brand-text font-bold">{displayPlanName}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-brand-border/40">
                  <span className="text-brand-text-muted font-medium">Valor Cobrado</span>
                  <span className="text-brand-primary font-bold">R$ {formattedAmount}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-brand-text-muted font-medium">Forma de Pagamento</span>
                  <span className="text-brand-text font-medium flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-brand-text-muted" />
                    {displayPaymentMethod}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Button */}
            <button
              onClick={handleProceed}
              className="btn-primary w-full py-3.5 font-bold text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Começar Onboarding</span>
              <ArrowRight size={16} />
            </button>

            <div className="flex justify-center items-center gap-1.5 text-[10px] text-brand-text-muted">
              <ShieldCheck className="w-4 h-4 text-brand-primary" />
              <span>Transação protegida e auditada pela Conexão Seres</span>
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
