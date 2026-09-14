import { parseAppEnvironment, validateSupabaseEnvironmentBinding } from "./environment";

const viteEnv = import.meta.env as Record<string, string | undefined>;

export const publicAppEnvironment = parseAppEnvironment(viteEnv.VITE_APP_ENV);

export const publicSupabaseEnvironment = validateSupabaseEnvironmentBinding({
  appEnv: publicAppEnvironment,
  url: String(viteEnv.VITE_SUPABASE_URL || ""),
  key: String(viteEnv.VITE_SUPABASE_ANON_KEY || ""),
  expectedProjectRef: String(viteEnv.VITE_EXPECTED_SUPABASE_PROJECT_REF || ""),
  productionProjectRef: String(viteEnv.VITE_PRODUCTION_SUPABASE_PROJECT_REF || ""),
});
