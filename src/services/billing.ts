import { supabase } from '../supabaseClient';
import { resolveSupabaseFunctionErrorMessage } from '../utils/supabaseFunctionErrors';
import type { CheckoutAttribution } from './analytics';

export type BillingPlanId = 'monthly' | 'yearly';

export type NativeBillingEvent = {
  type:
    | 'alternative_selected'
    | 'play_purchase'
    | 'play_purchase_pending'
    | 'billing_cancelled'
    | 'billing_error'
    | 'stripe_payment_completed'
    | 'stripe_payment_cancelled'
    | 'stripe_payment_failed';
  planId?: BillingPlanId;
  externalTransactionToken?: string;
  productId?: string;
  purchaseToken?: string;
  orderId?: string;
  restored?: boolean;
  message?: string;
};

declare global {
  interface Window {
    NativeBillingBridge?: {
      isAvailable(): boolean;
      startSubscription(planId: string, accountId: string): void;
      restorePurchases(accountId: string): void;
      presentStripePaymentSheet(
        clientSecret: string,
        publishableKey: string,
        isProduction: boolean
      ): void;
    };
  }
}

export function hasNativeBillingBridge() {
  if (typeof window === 'undefined' || !window.NativeBillingBridge) return false;
  try {
    return window.NativeBillingBridge.isAvailable();
  } catch {
    return false;
  }
}

async function invokeBillingFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const message = await resolveSupabaseFunctionErrorMessage(
      error,
      'Não foi possível iniciar o pagamento.'
    );
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || 'Resposta inválida do serviço de pagamento.');
  return data as T;
}

export async function createStripeCheckoutSession(planId: BillingPlanId, couponCode?: string, attribution?: CheckoutAttribution, checkoutAttemptId?: string) {
  return invokeBillingFunction<{ checkoutUrl: string }>('create-stripe-checkout-session', { planId, couponCode, attribution, checkoutAttemptId });
}

export async function createStripeCustomerPortalSession() {
  return invokeBillingFunction<{ portalUrl: string }>('create-stripe-customer-portal-session', {});
}

export async function createStripeMobileSubscription(
  planId: BillingPlanId,
  externalTransactionToken: string,
  couponCode?: string,
  attribution?: CheckoutAttribution,
  checkoutAttemptId?: string
) {
  return invokeBillingFunction<{
    clientSecret: string;
    publishableKey: string;
    subscriptionId: string;
    isProduction: boolean;
  }>('create-stripe-mobile-subscription', {
    planId,
    externalTransactionToken,
    couponCode,
    attribution,
    checkoutAttemptId
  });
}

export async function verifyGooglePlaySubscription(input: {
  planId: BillingPlanId;
  productId: string;
  purchaseToken: string;
}) {
  return invokeBillingFunction<{
    status: string;
    currentPeriodEnd: string | null;
    entitled: boolean;
  }>('verify-google-play-subscription', input);
}

export async function waitForConfirmedSubscription(
  userId: string,
  planId: BillingPlanId,
  attempts = 20,
  checkoutSessionId?: string,
  expectedSubscriptionId?: string
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase
      .from('billing_subscriptions')
      .select('provider, plan_id, provider_subscription_id, status, current_period_end, external_reporting_status, metadata, updated_at')
      .eq('professional_id', userId)
      .eq('plan_id', planId)
      .maybeSingle();

    if (!error && data) {
      if (expectedSubscriptionId && data.provider_subscription_id !== expectedSubscriptionId) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        continue;
      }
      if (checkoutSessionId && data.metadata?.checkoutSessionId !== checkoutSessionId) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        continue;
      }
      const entitled = data.provider === 'stripe'
        ? (data.status === 'active' || data.status === 'trialing') &&
          ['not_required', 'reported'].includes(data.external_reporting_status)
        : ['active', 'in_grace_period', 'canceled'].includes(data.status) &&
          Boolean(data.current_period_end && new Date(data.current_period_end).getTime() > Date.now());
      if (entitled) return data;
      if (['canceled', 'unpaid', 'refunded', 'expired'].includes(data.status)) {
        throw new Error('O pagamento não foi confirmado pelo provedor.');
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error(
    'O pagamento foi recebido e ainda está sendo confirmado. Aguarde alguns instantes e consulte sua assinatura novamente.'
  );
}

export async function getConfirmedStripeTransaction(subscriptionId: string, planId: BillingPlanId) {
  const normalizedSubscriptionId = subscriptionId.trim();
  if (!/^sub_[A-Za-z0-9]+$/.test(normalizedSubscriptionId)) return null;
  const { data, error } = await supabase
    .from('transactions')
    .select('provider_transaction_id, amount, currency, plan_id, status, payment_provider')
    .eq('stripe_subscription_id', normalizedSubscriptionId)
    .eq('plan_id', planId)
    .eq('payment_provider', 'stripe')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const amount = Number(data?.amount);
  const transactionId = typeof data?.provider_transaction_id === 'string' ? data.provider_transaction_id.trim() : '';
  const currency = typeof data?.currency === 'string' ? data.currency.trim().toUpperCase() : '';
  if (!transactionId || !Number.isFinite(amount) || amount <= 0 || currency !== 'BRL') return null;
  return { transactionId, amount, currency, planId };
}

export function addNativeBillingListener(listener: (event: NativeBillingEvent) => void) {
  const handler = (rawEvent: Event) => {
    const detail = (rawEvent as CustomEvent<NativeBillingEvent>).detail;
    if (detail?.type) listener(detail);
  };
  window.addEventListener('native-billing', handler);
  return () => window.removeEventListener('native-billing', handler);
}
