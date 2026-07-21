type SubscriptionAccessInput = {
  profileRole?: string | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: string | null;
};

function hasNotExpired(subscriptionEndsAt?: string | null) {
  if (!subscriptionEndsAt) return true;
  const timestamp = Date.parse(subscriptionEndsAt);
  return Number.isNaN(timestamp) || timestamp >= Date.now();
}

export function hasActivePaidAccess(input: SubscriptionAccessInput) {
  if (input.profileRole === 'admin' || input.subscriptionPlan === 'none') return true;

  return (
    (input.subscriptionPlan === 'monthly' || input.subscriptionPlan === 'yearly') &&
    (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing') &&
    hasNotExpired(input.subscriptionEndsAt)
  );
}

export function hasActiveYearlyAccess(input: SubscriptionAccessInput) {
  if (input.profileRole === 'admin' || input.subscriptionPlan === 'none') return true;

  return (
    input.subscriptionPlan === 'yearly' &&
    (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing') &&
    hasNotExpired(input.subscriptionEndsAt)
  );
}
