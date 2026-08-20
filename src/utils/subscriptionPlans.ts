export type SubscriptionPlan = 'trial' | 'monthly' | 'yearly' | 'courtesy' | 'none';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type ProfessionalAccountStatus = 'active' | 'pending' | 'inactive';

type ManagedSubscriptionInput = {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  accountStatus: ProfessionalAccountStatus;
};

export function normalizeManagedSubscription(input: ManagedSubscriptionInput): ManagedSubscriptionInput {
  if (input.subscriptionPlan !== 'courtesy') return input;

  return {
    ...input,
    subscriptionStatus: 'active',
    subscriptionEndsAt: null,
    accountStatus: 'active'
  };
}

export function isPaidSubscriberForMetrics(input: {
  subscription_plan?: string | null;
  subscription_status?: string | null;
  status?: string | null;
}) {
  return (
    (input.subscription_plan === 'monthly' || input.subscription_plan === 'yearly') &&
    input.subscription_status === 'active' &&
    input.status === 'active'
  );
}

export function getSubscriptionPlanLabel(plan?: string | null) {
  switch (plan) {
    case 'monthly': return 'Plano Mensal';
    case 'yearly': return 'Plano Anual';
    case 'courtesy': return 'Plano Cortesia';
    case 'trial': return 'Teste (Trial)';
    case 'none': return 'Vitalício';
    default: return 'Sem Plano';
  }
}
