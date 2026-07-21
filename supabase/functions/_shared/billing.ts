import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type BillingEnvironment = "PRODUCTION" | "TEST";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) throw new Error("Supabase Service Role não configurada.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireAuthenticatedUser(req: Request, admin: any) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new BillingHttpError(401, "Usuário não autenticado.");
  }

  const { data: { user }, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !user) throw new BillingHttpError(401, "Sessão inválida ou expirada.");
  return user;
}

export class BillingHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getBillingConfig(admin: any) {
  const { data } = await admin
    .from("settings")
    .select("api_key")
    .eq("id", "payment_settings")
    .maybeSingle();

  let publicSettings: Record<string, unknown> = {};
  try {
    publicSettings = data?.api_key ? JSON.parse(data.api_key) : {};
  } catch {
    publicSettings = {};
  }

  const configuredEnvironment = String(
    Deno.env.get("PAYMENT_ENVIRONMENT") || publicSettings.environment || "TEST",
  ).toUpperCase();
  const environment: BillingEnvironment = configuredEnvironment === "PRODUCTION" ? "PRODUCTION" : "TEST";
  const isProduction = environment === "PRODUCTION";

  const stripeSecretKey = Deno.env.get(
    isProduction ? "STRIPE_SECRET_KEY_PROD" : "STRIPE_SECRET_KEY_TEST",
  ) || "";
  const stripePublishableKey = Deno.env.get(
    isProduction ? "STRIPE_PUBLISHABLE_KEY_PROD" : "STRIPE_PUBLISHABLE_KEY_TEST",
  ) || String(
    isProduction
      ? publicSettings.stripeProdPublishableKey || ""
      : publicSettings.stripeSandboxPublishableKey || "",
  );
  const stripeWebhookSecret = Deno.env.get(
    isProduction ? "STRIPE_WEBHOOK_SECRET_PROD" : "STRIPE_WEBHOOK_SECRET_TEST",
  ) || "";

  return {
    environment,
    isProduction,
    stripeSecretKey,
    stripePublishableKey,
    stripeWebhookSecret,
    stripePaymentMethodConfigurationId:
      Deno.env.get(
        isProduction
          ? "STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_PROD"
          : "STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_TEST",
      ) ||
      Deno.env.get("STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID") || "",
    appOrigin: (Deno.env.get("APP_ORIGIN") || "https://www.evolucaoclinica.app.br").replace(/\/$/, ""),
    googlePackageName: Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.evolucaoclinica.app",
  };
}

export function createStripe(secretKey: string) {
  if (!secretKey) {
    throw new BillingHttpError(
      503,
      "A chave secreta Stripe do ambiente ativo ainda não foi configurada no Supabase Secrets.",
    );
  }

  return new Stripe(secretKey, {
    // wallet_options.link e payment_method_configuration exigem Basil ou superior.
    apiVersion: "2025-04-30.basil" as any,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export async function getPlan(admin: any, planId: unknown, isProduction: boolean) {
  const normalizedPlanId = String(planId || "").trim();
  if (!['monthly', 'yearly'].includes(normalizedPlanId)) {
    throw new BillingHttpError(400, "Plano inválido.");
  }

  const { data, error } = await admin
    .from("plans")
    .select("id, name, price, stripe_sandbox_price_id, stripe_prod_price_id, google_play_product_id, google_play_base_plan_id")
    .eq("id", normalizedPlanId)
    .single();

  if (error || !data) throw new BillingHttpError(404, "Plano não encontrado.");
  const stripePriceId = isProduction ? data.stripe_prod_price_id : data.stripe_sandbox_price_id;
  return { ...data, stripePriceId };
}

export async function getProfessional(admin: any, userId: string) {
  const { data, error } = await admin
    .from("professionals")
    .select("id, google_email, full_name, stripe_customer_id, subscription_plan, subscription_status, subscription_ends_at, billing_provider")
    .eq("id", userId)
    .single();

  if (error || !data) throw new BillingHttpError(404, "Profissional não encontrado.");
  return data;
}

export async function ensureNoActiveSubscription(admin: any, userId: string) {
  const { data } = await admin
    .from("billing_subscriptions")
    .select("provider, status, provider_subscription_id, current_period_end")
    .eq("professional_id", userId)
    .maybeSingle();

  const canceledButEntitled = data?.status === "canceled" &&
    Boolean(data.current_period_end && new Date(data.current_period_end).getTime() > Date.now());
  if (data && (["active", "trialing", "in_grace_period"].includes(data.status) || canceledButEntitled)) {
    throw new BillingHttpError(
      409,
      `Já existe uma assinatura ativa gerenciada por ${data.provider === "google_play" ? "Google Play" : "Stripe"}.`,
    );
  }
}

export async function getOrCreateStripeCustomer(
  admin: any,
  stripe: Stripe,
  professional: any,
) {
  if (professional.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(professional.stripe_customer_id);
      if (!(customer as any).deleted) return customer as any;
    } catch (error) {
      console.warn("[billing] Cliente Stripe salvo não foi encontrado; criando outro.", error);
    }
  }

  const email = String(professional.google_email || "").trim();
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) {
      await admin.from("professionals").update({
        stripe_customer_id: existing.data[0].id,
        updated_at: new Date().toISOString(),
      }).eq("id", professional.id);
      return existing.data[0];
    }
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: professional.full_name || undefined,
    metadata: { supabaseUserId: professional.id },
  });

  await admin.from("professionals").update({
    stripe_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }).eq("id", professional.id);

  return customer;
}

export function stripeSubscriptionStatus(status: string) {
  if (status === "active" || status === "trialing") return status;
  if (status === "past_due" || status === "unpaid") return status;
  if (status === "incomplete") return "pending";
  return "canceled";
}

export function isStripeEntitled(status: string) {
  return status === "active" || status === "trialing";
}

export async function projectSubscription(
  admin: any,
  input: {
    userId: string;
    provider: "stripe" | "google_play";
    planId: string;
    status: string;
    currentPeriodEnd?: string | null;
  },
) {
  const entitled = input.provider === "stripe"
    ? isStripeEntitled(input.status)
    : ["active", "in_grace_period", "canceled"].includes(input.status) &&
      Boolean(input.currentPeriodEnd && new Date(input.currentPeriodEnd).getTime() > Date.now());

  const update: Record<string, unknown> = {
    billing_provider: input.provider,
    subscription_plan: input.planId,
    subscription_status: entitled
      ? "active"
      : ["pending", "past_due"].includes(input.status)
        ? "past_due"
        : input.status === "unpaid"
          ? "unpaid"
          : "canceled",
    updated_at: new Date().toISOString(),
  };
  if (input.currentPeriodEnd) update.subscription_ends_at = input.currentPeriodEnd;

  const { error } = await admin.from("professionals").update(update).eq("id", input.userId);
  if (error) throw error;
  return entitled;
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function getGoogleAccessToken() {
  const rawCredentials = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "";
  if (!rawCredentials) {
    throw new BillingHttpError(
      503,
      "A conta de serviço da Google Play Developer API ainda não foi configurada no Supabase Secrets.",
    );
  }

  let credentials: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new BillingHttpError(503, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON contém JSON inválido.");
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new BillingHttpError(503, "Credenciais da conta de serviço Google incompletas.");
  }

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Falha ao autenticar na Google Play Developer API.");
  }
  return String(body.access_token);
}

export async function googlePublisherRequest(path: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Google Play Developer API retornou HTTP ${response.status}.`);
    (error as any).status = response.status;
    (error as any).body = body;
    throw error;
  }
  return body;
}

export async function verifyPlayPurchase(packageName: string, purchaseToken: string) {
  return await googlePublisherRequest(
    `applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}

export function parsePlaySubscription(subscription: any) {
  const lineItems = Array.isArray(subscription?.lineItems) ? subscription.lineItems : [];
  const latestExpiry = lineItems
    .map((item: any) => item?.expiryTime)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const state = String(subscription?.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED");
  const normalized = state.replace("SUBSCRIPTION_STATE_", "").toLowerCase();
  const entitledStates = new Set(["active", "in_grace_period", "canceled"]);
  const hasFutureExpiry = latestExpiry ? new Date(latestExpiry).getTime() > Date.now() : false;

  return {
    status: normalized,
    entitled: entitledStates.has(normalized) && hasFutureExpiry,
    currentPeriodEnd: latestExpiry,
    productIds: lineItems.map((item: any) => item?.productId).filter(Boolean),
    latestOrderId: lineItems
      .map((item: any) => item?.latestSuccessfulOrderId)
      .filter(Boolean)
      .at(-1) || subscription?.latestOrderId || null,
    acknowledgementState: subscription?.acknowledgementState || null,
  };
}

export async function acknowledgePlayPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
) {
  return await googlePublisherRequest(
    `applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", body: "{}" },
  );
}

export async function reportExternalStripeTransaction(input: {
  packageName: string;
  externalTransactionId: string;
  initialExternalTransactionId?: string | null;
  externalTransactionToken?: string | null;
  amountInMinorUnits: number;
  taxInMinorUnits?: number;
  currency: string;
  transactionTime: string;
  testPurchase?: boolean;
}) {
  const recurringTransaction: Record<string, unknown> = {
    externalSubscription: { subscriptionType: "RECURRING" },
  };
  if (input.initialExternalTransactionId) {
    recurringTransaction.initialExternalTransactionId = input.initialExternalTransactionId;
  } else if (input.externalTransactionToken) {
    recurringTransaction.externalTransactionToken = input.externalTransactionToken;
  } else {
    throw new Error("Token da escolha de faturamento ou transação inicial não encontrado.");
  }

  const tax = Math.max(0, input.taxInMinorUnits || 0);
  const preTax = Math.max(0, input.amountInMinorUnits - tax);
  const body: Record<string, unknown> = {
    originalPreTaxAmount: {
      currency: input.currency.toUpperCase(),
      priceMicros: String(preTax * 10000),
    },
    originalTaxAmount: {
      currency: input.currency.toUpperCase(),
      priceMicros: String(tax * 10000),
    },
    transactionTime: input.transactionTime,
    recurringTransaction,
    userTaxAddress: { regionCode: "BR" },
  };
  if (input.testPurchase) body.testPurchase = {};

  try {
    return await googlePublisherRequest(
      `applications/${encodeURIComponent(input.packageName)}/externalTransactions?externalTransactionId=${encodeURIComponent(input.externalTransactionId)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  } catch (error) {
    if ((error as any)?.status === 409) return { duplicate: true };
    throw error;
  }
}

export async function refundExternalStripeTransaction(
  packageName: string,
  externalTransactionId: string,
) {
  return await googlePublisherRequest(
    `applications/${encodeURIComponent(packageName)}/externalTransactions/${encodeURIComponent(externalTransactionId)}:refund`,
    {
      method: "POST",
      body: JSON.stringify({
        refundTime: new Date().toISOString(),
        fullRefund: {},
      }),
    },
  );
}

export async function refundGooglePlayOrder(packageName: string, orderId: string) {
  return await googlePublisherRequest(
    `applications/${encodeURIComponent(packageName)}/orders/${encodeURIComponent(orderId)}:refund?revoke=true`,
    { method: "POST" },
  );
}
