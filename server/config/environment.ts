import { createHash } from "node:crypto";
import {
  assertIntegrationEnabled,
  loadIntegrationFlags,
  parseAppEnvironment,
  requireEnvironmentValue,
  validateSupabaseEnvironmentBinding,
  type ExternalIntegration,
} from "../../src/config/environment.js";

function readJwtPayload(value: string): Record<string, unknown> | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function validateServiceRoleKey(input: { key: string; expectedProjectRef: string; expectedSha256?: string }) {
  const payload = readJwtPayload(input.key);
  if (payload) {
    if (payload.role !== "service_role") throw new Error("SUPABASE_SERVICE_ROLE_KEY não possui papel service_role.");
    if (payload.ref && String(payload.ref).toLowerCase() !== input.expectedProjectRef.toLowerCase()) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY pertence a outro projeto Supabase.");
    }
  }
  if (input.expectedSha256) {
    const actual = createHash("sha256").update(input.key).digest("hex");
    if (actual !== input.expectedSha256.trim().toLowerCase()) {
      throw new Error("Fingerprint da SUPABASE_SERVICE_ROLE_KEY não corresponde ao ambiente.");
    }
  }
}

function validatePublicSupabaseKey(input: { key: string; expectedProjectRef: string }) {
  const payload = readJwtPayload(input.key);
  if (!payload) return;

  if (payload.role !== "anon" && payload.role !== "publishable") {
    throw new Error("VITE_SUPABASE_ANON_KEY não possui papel público compatível.");
  }
  if (payload.ref && String(payload.ref).toLowerCase() !== input.expectedProjectRef.toLowerCase()) {
    throw new Error("VITE_SUPABASE_ANON_KEY pertence a outro projeto Supabase.");
  }
}

export function loadServerEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const appEnv = parseAppEnvironment(env.APP_ENV);
  const publicAppEnv = parseAppEnvironment(env.VITE_APP_ENV);
  if (appEnv !== publicAppEnv) throw new Error("APP_ENV e VITE_APP_ENV devem identificar o mesmo ambiente.");

  const serviceRoleKey = requireEnvironmentValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = requireEnvironmentValue(env, "VITE_SUPABASE_ANON_KEY");
  const expectedProjectRef = requireEnvironmentValue(env, "EXPECTED_SUPABASE_PROJECT_REF");
  const supabase = validateSupabaseEnvironmentBinding({
    appEnv,
    url: requireEnvironmentValue(env, "VITE_SUPABASE_URL"),
    key: serviceRoleKey,
    expectedProjectRef,
    productionProjectRef: env.PRODUCTION_SUPABASE_PROJECT_REF,
  });
  validateServiceRoleKey({
    key: serviceRoleKey,
    expectedProjectRef,
    expectedSha256: env.SUPABASE_SERVICE_ROLE_KEY_SHA256,
  });
  validatePublicSupabaseKey({ key: supabaseAnonKey, expectedProjectRef });

  const publicOrigin = new URL(requireEnvironmentValue(env, "PUBLIC_APP_URL")).origin;
  const productionOrigin = new URL(requireEnvironmentValue(env, "PRODUCTION_APP_ORIGIN")).origin;
  if (appEnv === "staging" && publicOrigin === productionOrigin) {
    throw new Error("Staging não pode usar a origem pública de produção.");
  }
  if (appEnv === "production" && publicOrigin !== productionOrigin) {
    throw new Error("PUBLIC_APP_URL de produção não corresponde à origem autorizada.");
  }

  const integrations = loadIntegrationFlags(env);
  if (integrations.cron && !String(env.CRON_SECRET || "").trim()) {
    throw new Error("CRON_SECRET é obrigatório quando CRON_JOBS_ENABLED=true.");
  }
  if (integrations.whatsapp && !String(env.WHATSAPP_OTP_SECRET || "").trim()) {
    throw new Error("WHATSAPP_OTP_SECRET é obrigatório quando WHATSAPP_SEND_ENABLED=true.");
  }

  return {
    appEnv,
    publicOrigin,
    productionOrigin,
    supabase,
    serviceRoleKey,
    supabaseAnonKey,
    integrations,
    clinicFeatureEnabled: String(env.CLINIC_FEATURE_ENABLED || "").trim().toLowerCase() === "true",
    assertEnabled: (integration: ExternalIntegration) => assertIntegrationEnabled(integrations, integration),
  };
}

export type ServerEnvironment = ReturnType<typeof loadServerEnvironment>;
