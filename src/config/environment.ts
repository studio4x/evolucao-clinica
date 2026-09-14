export const APP_ENVIRONMENTS = ["production", "staging", "development", "test"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const EXTERNAL_INTEGRATION_ENV_VARS = {
  email: "EMAIL_SEND_ENABLED",
  whatsapp: "WHATSAPP_SEND_ENABLED",
  push: "PUSH_SEND_ENABLED",
  n8n: "N8N_CALLS_ENABLED",
  batchDispatch: "BATCH_DISPATCH_ENABLED",
  gemini: "GEMINI_ENABLED",
  analytics: "ANALYTICS_SEND_ENABLED",
  meta: "META_DELIVERY_ENABLED",
  cron: "CRON_JOBS_ENABLED",
  billing: "BILLING_ENABLED",
  google: "GOOGLE_INTEGRATIONS_ENABLED",
  lifecycle: "LIFECYCLE_SEND_ENABLED",
} as const;

export type ExternalIntegration = keyof typeof EXTERNAL_INTEGRATION_ENV_VARS;
export type IntegrationFlags = Record<ExternalIntegration, boolean>;

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

export function requireEnvironmentValue(env: Record<string, string | undefined>, name: string): string {
  const value = String(env[name] || "").trim();
  if (!value) throw new EnvironmentConfigurationError(`${name} não configurada.`);
  return value;
}

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  const normalized = String(value || "").trim().toLowerCase();
  if (!APP_ENVIRONMENTS.includes(normalized as AppEnvironment)) {
    throw new EnvironmentConfigurationError("APP_ENV deve ser production, staging, development ou test.");
  }
  return normalized as AppEnvironment;
}

export function parseExplicitBoolean(value: string | undefined): boolean {
  return String(value || "").trim().toLowerCase() === "true";
}

export function loadIntegrationFlags(env: Record<string, string | undefined>): IntegrationFlags {
  return Object.fromEntries(
    Object.entries(EXTERNAL_INTEGRATION_ENV_VARS).map(([integration, variable]) => [
      integration,
      parseExplicitBoolean(env[variable]),
    ]),
  ) as IntegrationFlags;
}

export function extractSupabaseProjectRef(urlValue: string): string {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new EnvironmentConfigurationError("VITE_SUPABASE_URL inválida.");
  }
  if (url.protocol !== "https:") {
    throw new EnvironmentConfigurationError("VITE_SUPABASE_URL deve usar HTTPS.");
  }
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
  if (!match) {
    throw new EnvironmentConfigurationError("VITE_SUPABASE_URL deve apontar para um projeto Supabase hospedado.");
  }
  return match[1].toLowerCase();
}

export function validateSupabaseEnvironmentBinding(input: {
  appEnv: AppEnvironment;
  url: string;
  key: string;
  expectedProjectRef: string;
  productionProjectRef?: string;
}): { projectRef: string; url: string; key: string } {
  if (!input.url.trim()) throw new EnvironmentConfigurationError("VITE_SUPABASE_URL não configurada.");
  if (!input.key.trim()) throw new EnvironmentConfigurationError("Chave Supabase obrigatória não configurada.");
  if (!input.expectedProjectRef.trim()) throw new EnvironmentConfigurationError("EXPECTED_SUPABASE_PROJECT_REF não configurada.");

  const projectRef = extractSupabaseProjectRef(input.url);
  const expectedProjectRef = input.expectedProjectRef.trim().toLowerCase();
  const productionProjectRef = String(input.productionProjectRef || "").trim().toLowerCase();
  if (projectRef !== expectedProjectRef) {
    throw new EnvironmentConfigurationError("O project ref da URL Supabase não corresponde ao EXPECTED_SUPABASE_PROJECT_REF.");
  }
  if (input.appEnv === "staging" && !productionProjectRef) {
    throw new EnvironmentConfigurationError("PRODUCTION_SUPABASE_PROJECT_REF é obrigatório em staging.");
  }
  if (input.appEnv === "staging" && projectRef === productionProjectRef) {
    throw new EnvironmentConfigurationError("Staging não pode usar o projeto Supabase de produção.");
  }
  if (input.appEnv === "production" && productionProjectRef && projectRef !== productionProjectRef) {
    throw new EnvironmentConfigurationError("Produção não pode usar um project ref Supabase diferente do projeto autorizado.");
  }
  return { projectRef, url: input.url.trim(), key: input.key.trim() };
}

export function assertIntegrationEnabled(flags: IntegrationFlags, integration: ExternalIntegration): void {
  if (!flags[integration]) {
    throw new EnvironmentConfigurationError(
      `Integração bloqueada pelo ambiente: ${EXTERNAL_INTEGRATION_ENV_VARS[integration]}=false.`,
    );
  }
}
