import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import {
  addNativeBillingListener,
  createStripeCheckoutSession,
  createStripeMobileSubscription,
  getConfirmedStripeTransaction,
  hasNativeBillingBridge,
  type BillingPlanId,
  type NativeBillingEvent,
  verifyGooglePlaySubscription,
  waitForConfirmedSubscription
} from '../../services/billing';
import { getCheckoutAttribution, trackBeginCheckout, trackStripeAndroidPurchaseOnce } from '../../services/analytics';

export type ConfirmedBillingResult = {
  provider: 'stripe' | 'google_play';
  planId: BillingPlanId;
  status: string;
  currentPeriodEnd?: string | null;
  subscriptionId?: string | null;
  transactionId?: string | null;
  amount?: number | null;
  currency?: string | null;
};

export type PendingBillingConfirmation = {
  provider: 'stripe' | 'google_play';
  planId: BillingPlanId;
  subscriptionId: string;
  productId?: string;
  purchaseToken?: string;
};

type Props = {
  planId: BillingPlanId;
  couponCode?: string;
  planName?: string;
  price?: number;
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onPendingConfirmation?: (result: PendingBillingConfirmation) => void;
  onSuccess?: (result: ConfirmedBillingResult) => void;
  onError?: (error: Error) => void;
};

export function StripeSubscriptionButton({
  planId,
  couponCode,
  planName,
  price,
  disabled,
  onLoadingChange,
  onPendingConfirmation,
  onSuccess,
  onError
}: Props) {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const activePlanRef = useRef<BillingPlanId | null>(null);
  const checkoutContextRef = useRef<{
    attemptId: string;
    attribution: ReturnType<typeof getCheckoutAttribution>;
  } | null>(null);

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
          const checkoutContext = checkoutContextRef.current;
          const attribution = checkoutContext ? await checkoutContext.attribution : await getCheckoutAttribution();
          const mobile = await createStripeMobileSubscription(
            activePlan,
            event.externalTransactionToken,
            couponCode,
            attribution,
            checkoutContext?.attemptId
          );
          window.NativeBillingBridge?.presentStripePaymentSheet(
            mobile.clientSecret,
            mobile.publishableKey,
            mobile.isProduction
          );
          onPendingConfirmation?.({
            provider: 'stripe',
            planId: activePlan,
            subscriptionId: mobile.subscriptionId
          });
          return;
        }

        if (event.type === 'play_purchase' || event.type === 'play_purchase_pending') {
          if (!event.productId || !event.purchaseToken) {
            throw new Error('Dados da compra Google Play incompletos.');
          }
          const checkoutContext = checkoutContextRef.current;
          const attribution = checkoutContext ? await checkoutContext.attribution : await getCheckoutAttribution();
          const verified = await verifyGooglePlaySubscription({
            planId: activePlan,
            productId: event.productId,
            purchaseToken: event.purchaseToken,
            attribution,
            checkoutAttemptId: checkoutContext?.attemptId
          });
          if (!verified.entitled) {
            setBusy(false);
            onPendingConfirmation?.({
              provider: 'google_play',
              planId: activePlan,
              subscriptionId: event.purchaseToken,
              productId: event.productId,
              purchaseToken: event.purchaseToken
            });
            return;
          }
          setBusy(false);
          onSuccess?.({
            provider: 'google_play',
            planId: activePlan,
            status: verified.status,
            currentPeriodEnd: verified.currentPeriodEnd,
            subscriptionId: event.purchaseToken,
            transactionId: verified.transactionId,
            amount: verified.amount,
            currency: verified.currency
          });
          return;
        }

        if (event.type === 'stripe_payment_completed') {
          if (!user) throw new Error('Sessão expirada. Entre novamente para confirmar o pagamento.');
          const confirmed = await waitForConfirmedSubscription(user.id, activePlan);
          let transaction: Awaited<ReturnType<typeof getConfirmedStripeTransaction>> = null;
          try {
            transaction = confirmed.provider_subscription_id
              ? await getConfirmedStripeTransaction(confirmed.provider_subscription_id, activePlan)
              : null;
            if (transaction) {
              trackStripeAndroidPurchaseOnce({
                transactionId: transaction.transactionId,
                planName: planName || activePlan,
                amount: transaction.amount,
                currency: transaction.currency,
                paymentProvider: 'stripe',
                status: 'paid'
              });
            }
          } catch {
            console.warn('[billing] Confirmed Stripe purchase could not be recorded in Firebase Analytics.');
          }
          setBusy(false);
          onSuccess?.({
            provider: 'stripe',
            planId: activePlan,
            status: confirmed.status,
            currentPeriodEnd: confirmed.current_period_end,
            subscriptionId: confirmed.provider_subscription_id,
            transactionId: transaction?.transactionId,
            amount: transaction?.amount,
            currency: transaction?.currency
          });
          return;
        }

        if (event.type === 'billing_cancelled' || event.type === 'stripe_payment_cancelled') {
          setBusy(false);
          return;
        }

        if (event.type === 'billing_error' || event.type === 'stripe_payment_failed') {
          throw new Error(event.message || 'Não foi possível concluir o pagamento.');
        }
      } catch (error) {
        fail(error);
      }
    };

    return addNativeBillingListener((event) => void handleEvent(event));
  }, [couponCode, onError, onPendingConfirmation, onSuccess, planName, user]);

  const start = async () => {
    if (!user || loading || disabled) return;
    activePlanRef.current = planId;
    setBusy(true);

    try {
      const checkoutAttemptId = crypto.randomUUID();
      if (hasNativeBillingBridge()) {
        trackBeginCheckout(planId, planName || planId, price || 0, 'android_billing', checkoutAttemptId);
        checkoutContextRef.current = {
          attemptId: checkoutAttemptId,
          attribution: getCheckoutAttribution()
        };
        window.NativeBillingBridge?.startSubscription(planId, user.id);
        return;
      }

      const attribution = await getCheckoutAttribution();
      trackBeginCheckout(planId, planName || planId, price || 0, 'stripe', checkoutAttemptId);
      const { checkoutUrl } = await createStripeCheckoutSession(planId, couponCode, attribution, checkoutAttemptId);
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
