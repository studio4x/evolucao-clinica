const publicEnv: Record<string, string | undefined> =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

const enabled = (name: string) => String(publicEnv[name] || "").trim().toLowerCase() === "true";
const isStaging = String(publicEnv.VITE_APP_ENV || "").trim().toLowerCase() === "staging";

export const publicEffectFlags = {
  analytics: enabled("VITE_ANALYTICS_SEND_ENABLED"),
  billing: enabled("VITE_BILLING_ENABLED"),
  // Homologação precisa exercitar o fluxo real de OAuth + Drive/Docs.
  // Produção e demais ambientes continuam obedecendo à flag explícita.
  google: isStaging || enabled("VITE_GOOGLE_INTEGRATIONS_ENABLED"),
  clinicFeature: enabled("VITE_CLINIC_FEATURE_ENABLED"),
};

export function assertPublicEffectEnabled(effect: keyof typeof publicEffectFlags) {
  if (!publicEffectFlags[effect]) throw new Error(`Integração ${effect} desabilitada neste ambiente.`);
}
