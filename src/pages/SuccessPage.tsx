import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { CheckCircle2, ArrowRight, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { getOnboardingDestination } from '../utils/onboarding';

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

            <div className="flex justify-center items-center gap-1.5 text-[10px] text-brand-text-muted select-none">
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
