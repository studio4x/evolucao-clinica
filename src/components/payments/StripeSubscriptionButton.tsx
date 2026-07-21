import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import {
  addNativeBillingListener,
  createStripeCheckoutSession,
  createStripeMobileSubscription,
  hasNativeBillingBridge,
  type BillingPlanId,
  type NativeBillingEvent,
  verifyGooglePlaySubscription,
  waitForConfirmedSubscription
} from '../../services/billing';

export type ConfirmedBillingResult = {
  provider: 'stripe' | 'google_play';
  planId: BillingPlanId;
  status: string;
  currentPeriodEnd?: string | null;
  subscriptionId?: string | null;
};

type Props = {
  planId: BillingPlanId;
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onSuccess?: (result: ConfirmedBillingResult) => void;
  onError?: (error: Error) => void;
};

export function StripeSubscriptionButton({
  planId,
  disabled,
  onLoadingChange,
  onSuccess,
  onError
}: Props) {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const activePlanRef = useRef<BillingPlanId | null>(null);

  const setBusy = (value: boolean) => {
    setLoading(value);
    onLoadingChange?.(value);
    if (!value) activePlanRef.current = null;
  };

  const fail = (error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    setBusy(false);
    onError?.(normalized);
  };

  useEffect(() => {
    if (!hasNativeBillingBridge()) return;

    const handleEvent = async (event: NativeBillingEvent) => {
      // Compras restauradas são tratadas uma única vez pelo listener global do app.
      if (event.restored === true) return;
      const activePlan = activePlanRef.current;
      if (!activePlan || (event.planId && event.planId !== activePlan)) return;

      try {
        if (event.type === 'alternative_selected') {
          if (!event.externalTransactionToken) throw new Error('A Play Store não retornou o token da escolha.');
          const mobile = await createStripeMobileSubscription(activePlan, event.externalTransactionToken);
          window.NativeBillingBridge?.presentStripePaymentSheet(
            mobile.clientSecret,
            mobile.publishableKey,
            mobile.isProduction
          );
          return;
        }

        if (event.type === 'play_purchase') {
          if (!event.productId || !event.purchaseToken) {
            throw new Error('Dados da compra Google Play incompletos.');
          }
          const verified = await verifyGooglePlaySubscription({
            planId: activePlan,
            productId: event.productId,
            purchaseToken: event.purchaseToken
          });
          if (!verified.entitled) throw new Error('A compra ainda não foi concluída pela Google Play.');
          setBusy(false);
          onSuccess?.({
            provider: 'google_play',
            planId: activePlan,
            status: verified.status,
            currentPeriodEnd: verified.currentPeriodEnd,
            subscriptionId: event.orderId || event.purchaseToken
          });
          return;
        }

        if (event.type === 'stripe_payment_completed') {
          if (!user) throw new Error('Sessão expirada. Entre novamente para confirmar o pagamento.');
          const confirmed = await waitForConfirmedSubscription(user.id, activePlan);
          setBusy(false);
          onSuccess?.({
            provider: 'stripe',
            planId: activePlan,
            status: confirmed.status,
            currentPeriodEnd: confirmed.current_period_end,
            subscriptionId: confirmed.provider_subscription_id
          });
          return;
        }

        if (event.type === 'billing_cancelled' || event.type === 'stripe_payment_cancelled') {
          setBusy(false);
          return;
        }

        if (event.type === 'play_purchase_pending') {
          throw new Error('A compra está pendente na Google Play. O acesso será liberado após a confirmação.');
        }

        if (event.type === 'billing_error' || event.type === 'stripe_payment_failed') {
          throw new Error(event.message || 'Não foi possível concluir o pagamento.');
        }
      } catch (error) {
        fail(error);
      }
    };

    return addNativeBillingListener((event) => void handleEvent(event));
  }, [onError, onSuccess, user]);

  const start = async () => {
    if (!user || loading || disabled) return;
    activePlanRef.current = planId;
    setBusy(true);

    try {
      if (hasNativeBillingBridge()) {
        window.NativeBillingBridge?.startSubscription(planId, user.id);
        return;
      }

      const { checkoutUrl } = await createStripeCheckoutSession(planId);
      window.location.assign(checkoutUrl);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={Boolean(disabled || loading || !user)}
      className="w-full min-h-12 px-5 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-sm transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
      <span>{loading ? 'Abrindo pagamento seguro…' : 'Assinar com segurança'}</span>
      {!loading && <ShieldCheck className="w-4 h-4" />}
    </button>
  );
}
