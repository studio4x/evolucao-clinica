const publicEnv: Record<string, string | undefined> =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

const enabled = (name: string) => String(publicEnv[name] || "").trim().toLowerCase() === "true";

export const publicEffectFlags = {
  analytics: enabled("VITE_ANALYTICS_SEND_ENABLED"),
  billing: enabled("VITE_BILLING_ENABLED"),
  google: enabled("VITE_GOOGLE_INTEGRATIONS_ENABLED"),
  clinicFeature: enabled("VITE_CLINIC_FEATURE_ENABLED"),
  patientAnamnesisLinkForms: enabled("VITE_PATIENT_ANAMNESIS_LINK_FORMS_ENABLED"),
};

export function assertPublicEffectEnabled(effect: keyof typeof publicEffectFlags) {
  if (!publicEffectFlags[effect]) throw new Error(`Integração ${effect} desabilitada neste ambiente.`);
}
