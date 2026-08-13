export type FirstStripePurchaseInput = {
  provider: string;
  paymentStatus: string;
  subscriptionId: string;
  transactionId: string;
  value: number;
  currency: string;
  planId: string;
  planName: string;
  hasPreviousPaidTransaction: boolean;
};

export function buildFirstStripePurchaseEvent(input: FirstStripePurchaseInput) {
  const subscriptionId = input.subscriptionId.trim();
  const transactionId = input.transactionId.trim();
  const currency = input.currency.trim().toUpperCase();
  const planId = input.planId.trim().slice(0, 100);
  const planName = input.planName.trim().slice(0, 100);
  if (
    input.provider !== "stripe" ||
    input.paymentStatus !== "paid" ||
    input.hasPreviousPaidTransaction ||
    !subscriptionId ||
    !transactionId ||
    !Number.isFinite(input.value) ||
    input.value <= 0 ||
    !/^[A-Z]{3}$/.test(currency) ||
    !planId ||
    !planName
  ) return null;

  return {
    eventKey: `stripe:purchase_stripe:${subscriptionId}`,
    eventName: "purchase_stripe" as const,
    params: {
      transaction_id: transactionId.slice(0, 100),
      value: input.value,
      currency,
      payment_provider: "stripe",
      plan_id: planId,
      plan_name: planName,
      is_first_activation: true,
    },
  };
}
