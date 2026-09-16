import { resolveSupabaseFunctionErrorMessage } from "../utils/supabaseFunctionErrors";
import { supabase } from "../supabaseClient";

export type ClinicBillingCatalogItem = {
  plan_code: "clinic_monthly" | "clinic_yearly";
  billing_interval: "month" | "year";
  currency: string;
  base_amount_minor: number;
  seat_amount_minor: number;
  minimum_contracted_seats: number;
};

export type ClinicBillingStatus = {
  organization_id: string;
  organization_name: string;
  operational_status: string;
  role: "owner" | "manager";
  subscription: null | {
    plan_code: string;
    billing_interval: string;
    currency: string;
    base_amount_minor: number;
    seat_amount_minor: number;
    minimum_contracted_seats: number;
    contracted_seats: number;
    financial_status: string;
    grace_period_ends_at: string | null;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    pending_contracted_seats: number | null;
    pending_seat_change_effective_at: string | null;
    canceled_at: string | null;
  };
  seats: { contracted_seats: number; active_seats: number; reserved_seats: number; available_seats: number };
  entitlement_mode: string;
};

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await resolveSupabaseFunctionErrorMessage(error, "Não foi possível concluir a operação de cobrança."));
  if (!data || data.error) throw new Error(data?.error || "Resposta inválida do serviço de cobrança.");
  return data as T;
}

export function fetchClinicBillingStatus(organizationId: string) {
  return invoke<{ billing: ClinicBillingStatus; clinic_billing_enabled: boolean }>("clinic-billing-status", { organizationId });
}

export function fetchClinicBillingCatalog(organizationId: string) {
  return invoke<{ catalog: ClinicBillingCatalogItem[] }>("clinic-billing-catalog", { organizationId });
}

export function createClinicCheckout(organizationId: string, planCode: string, contractedSeats: number, checkoutAttemptId?: string) {
  return invoke<{ checkoutUrl: string; attemptId: string }>("create-clinic-stripe-checkout-session", { organizationId, planCode, contractedSeats, checkoutAttemptId });
}

export function changeClinicSeats(organizationId: string, contractedSeats: number) {
  return invoke<{ status: string; operation?: string; target_seats: number }>("clinic-billing-seats", { organizationId, contractedSeats, idempotencyKey: crypto.randomUUID() });
}

export function cancelClinicSubscription(organizationId: string) {
  return invoke<{ status: string; cancel_at_period_end: boolean }>("clinic-billing-cancel", { organizationId, idempotencyKey: crypto.randomUUID() });
}
