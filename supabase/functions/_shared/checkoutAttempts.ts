export type CheckoutAttemptStatus =
  | "started"
  | "session_created"
  | "provider_opened"
  | "pending"
  | "paid"
  | "cancelled"
  | "failed"
  | "expired";

const ATTEMPT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SAFE_ERROR_PATTERN = /^[a-z0-9_:-]{1,80}$/;

export function normalizeCheckoutAttemptId(value: unknown): string | null {
  const attemptId = typeof value === "string" ? value.trim() : "";
  return ATTEMPT_ID_PATTERN.test(attemptId) ? attemptId : null;
}

export function normalizeCheckoutErrorCode(value: unknown): string | null {
  const normalized = String(value || "checkout_failed")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .slice(0, 80);
  return SAFE_ERROR_PATTERN.test(normalized) ? normalized : "checkout_failed";
}

export async function recordCheckoutAttempt(
  admin: any,
  input: {
    attemptId: string | null;
    professionalId: string;
    planId: string;
    provider: "stripe" | "google_play" | "android_billing";
    channel: "web" | "android";
    status: CheckoutAttemptStatus;
    couponPresent?: boolean;
    errorCode?: string | null;
    providerReference?: string | null;
  },
): Promise<void> {
  if (!input.attemptId) return;

  const now = new Date().toISOString();
  const completed = ["paid", "cancelled", "failed", "expired"].includes(input.status);
  const payload = {
    attempt_id: input.attemptId,
    professional_id: input.professionalId,
    plan_id: input.planId,
    provider: input.provider,
    channel: input.channel,
    status: input.status,
    coupon_present: input.couponPresent === true,
    error_code: input.errorCode ? normalizeCheckoutErrorCode(input.errorCode) : null,
    provider_reference: input.providerReference?.slice(0, 255) || null,
    ...(["session_created", "provider_opened"].includes(input.status) ? { provider_opened_at: now } : {}),
    ...(completed ? { completed_at: now } : {}),
    updated_at: now,
  };

  const { error } = await admin.from("checkout_attempts").upsert(payload, { onConflict: "attempt_id" });
  if (error) {
    // Observabilidade nunca pode impedir o pagamento principal.
    console.warn("[checkout-attempts] Falha ao registrar etapa:", error.message);
  }
}
