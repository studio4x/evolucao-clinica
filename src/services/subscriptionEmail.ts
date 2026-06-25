import { supabase } from '../supabaseClient';

export type SubscriptionEmailKind = 'success' | 'failure';

export interface SubscriptionEmailPayload {
  kind: SubscriptionEmailKind;
  planId: string;
  paymentMethodLabel?: string;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  amount?: number | null;
  currency?: string | null;
  nextRenewalAt?: string | null;
  failureMessage?: string | null;
}

export interface SubscriptionEmailResponse {
  success: boolean;
  emailSent: boolean;
  error?: string | null;
  emailError?: string | null;
  data?: unknown;
}

export async function sendSubscriptionPaymentEmail(payload: SubscriptionEmailPayload): Promise<SubscriptionEmailResponse> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) {
    return {
      success: false,
      emailSent: false,
      error: 'Usuário não autenticado para envio do e-mail.'
    };
  }

  const response = await fetch('/api/subscriptions/payment-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  return {
    success: response.ok ? data.success !== false : false,
    emailSent: Boolean(data.emailSent),
    error: data.error || data.emailError || (!response.ok ? response.statusText : null),
    emailError: data.emailError || null,
    data
  };
}
