import { supabase } from '../supabaseClient';
import type { BillingPlanId } from './billing';

export type ClientCheckoutAttemptStatus = 'started' | 'provider_opened' | 'cancelled' | 'failed';

const safeErrorCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || 'checkout_failed');
  if (/cancel/i.test(message)) return 'checkout_cancelled';
  if (/coupon|cupom/i.test(message)) return 'coupon_invalid';
  if (/network|fetch|offline/i.test(message)) return 'network_unavailable';
  if (/active subscription|assinatura ativa/i.test(message)) return 'subscription_already_active';
  if (/price|preço|configur/i.test(message)) return 'billing_configuration';
  return 'checkout_failed';
};

export async function recordClientCheckoutAttempt(input: {
  attemptId: string;
  userId: string;
  planId: BillingPlanId;
  provider: 'stripe' | 'android_billing';
  channel: 'web' | 'android';
  status: ClientCheckoutAttemptStatus;
  couponPresent?: boolean;
  error?: unknown;
}): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    attempt_id: input.attemptId,
    professional_id: input.userId,
    plan_id: input.planId,
    provider: input.provider,
    channel: input.channel,
    status: input.status,
    coupon_present: input.couponPresent === true,
    error_code: input.status === 'failed' ? safeErrorCode(input.error) : null,
    provider_opened_at: input.status === 'provider_opened' ? now : null,
    completed_at: input.status === 'cancelled' || input.status === 'failed' ? now : null,
    updated_at: now,
  };

  const query = input.status === 'started'
    ? supabase.from('checkout_attempts').insert(payload)
    : supabase
        .from('checkout_attempts')
        .update({
          status: input.status,
          ...(input.status === 'failed' ? { error_code: safeErrorCode(input.error) } : {}),
          ...(input.status === 'provider_opened' ? { provider_opened_at: now } : {}),
          ...(input.status === 'cancelled' || input.status === 'failed' ? { completed_at: now } : {}),
          updated_at: now,
        })
        .eq('attempt_id', input.attemptId)
        .eq('professional_id', input.userId);

  const { error } = await query;
  if (error) console.warn('[checkout-attempts] Não foi possível registrar a etapa do checkout:', error.message);
}

const ACTIVE_ATTEMPT_KEY = 'evolucao-clinica:active-checkout-attempt';

export function rememberCheckoutAttempt(input: { attemptId: string; planId: BillingPlanId }) {
  window.sessionStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify(input));
}

export function readCheckoutAttempt(): { attemptId: string; planId: BillingPlanId } | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ACTIVE_ATTEMPT_KEY) || 'null');
    return parsed?.attemptId && (parsed.planId === 'monthly' || parsed.planId === 'yearly') ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCheckoutAttempt() {
  window.sessionStorage.removeItem(ACTIVE_ATTEMPT_KEY);
}
