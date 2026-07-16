import type { LifecycleState } from "./lifecycleTypes.js";

export function normalizeProfessionSegment(value: unknown): string {
  const normalized = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("terapeuta ocupacional")) return "occupational_therapy";
  if (normalized.includes("psicolog")) return "psychology";
  if (normalized.includes("fisioter")) return "physiotherapy";
  if (normalized.includes("fonoaudi")) return "speech_therapy";
  if (normalized.includes("psicopedagog")) return "psychopedagogy";
  if (normalized.includes("nutri")) return "nutrition";
  if (normalized.includes("enferm")) return "nursing";
  if (normalized.includes("medic") || normalized.includes("doutor") || normalized.includes("cirurg")) return "medical";
  if (normalized.includes("clinica") || normalized.includes("clínica")) return "clinic";
  return "other";
}

export function calculateActivationLevel(input: {
  loggedIn: boolean;
  patientsCount: number;
  linkedRecordsCount: number;
  evolutionsCount: number;
  usageDaysCount: number;
  resourcesCount: number;
}): number {
  if (input.resourcesCount > 1 || (input.evolutionsCount >= 3 && input.usageDaysCount >= 2 && input.resourcesCount > 0)) return 6;
  if (input.evolutionsCount >= 3 && input.usageDaysCount >= 2) return 5;
  if (input.evolutionsCount > 0) return 4;
  if (input.linkedRecordsCount > 0) return 3;
  if (input.patientsCount > 0) return 2;
  if (input.loggedIn) return 1;
  return 0;
}

export function activationStatusForLevel(level: number, subscriptionStatus?: string | null): string {
  if (subscriptionStatus === "canceled") return "churned";
  if (level >= 6) return "advanced";
  if (level >= 5) return "recurring";
  if (level >= 4) return "activated";
  if (level === 3) return "record_linked";
  if (level === 2) return "patient_created";
  if (level === 1) return "profile_started";
  return "registered";
}

export function calculateTrialDaysRemaining(trialEndsAt: string | null | undefined, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function firstName(fullName: string | null | undefined, email?: string | null): string {
  const value = String(fullName || email || "Profissional").trim();
  return value.split(/\s+/)[0] || "Profissional";
}

export function buildLifecycleState(input: Omit<LifecycleState, "activationLevel" | "activationStatus"> & { subscriptionStatus?: string | null }): LifecycleState {
  const activationLevel = calculateActivationLevel({
    loggedIn: Boolean(input.lastLoginAt),
    patientsCount: input.patientsCount,
    linkedRecordsCount: input.linkedRecordsCount,
    evolutionsCount: input.evolutionsCount,
    usageDaysCount: input.usageDaysCount,
    resourcesCount: input.resourcesCount
  });
  return { ...input, activationLevel, activationStatus: activationStatusForLevel(activationLevel, input.subscriptionStatus) };
}
