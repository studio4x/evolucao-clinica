export type PaymentConfirmationState = 'active' | 'pending' | 'cancelled' | 'error';

export type BillingSubscriptionSnapshot = {
  provider: string;
  status: string;
  current_period_end?: string | null;
  external_reporting_status?: string | null;
};

export function classifyPaymentConfirmation(
  subscription: BillingSubscriptionSnapshot,
  now = Date.now()
): PaymentConfirmationState {
  const hasFuturePeriod = Boolean(
    subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now
  );
  const active = subscription.provider === 'stripe'
    ? ['active', 'trialing'].includes(subscription.status) &&
      ['not_required', 'reported'].includes(subscription.external_reporting_status || '')
    : ['active', 'in_grace_period', 'canceled'].includes(subscription.status) && hasFuturePeriod;
  if (active) return 'active';
  if (['canceled', 'unpaid', 'refunded', 'expired', 'revoked'].includes(subscription.status)) return 'cancelled';
  if (['pending', 'processing', 'past_due', 'incomplete'].includes(subscription.status)) return 'pending';
  return 'error';
}

export function confirmedConversionKey(provider: string, transactionId: string) {
  return `purchase:${provider}:${transactionId.trim()}`;
}
