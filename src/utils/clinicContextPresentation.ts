export type ClinicContextSelectorMode = "hidden" | "static_clinic" | "clinics_only" | "personal_plus_clinics";

export function getClinicContextSelectorMode(
  accessMode: "personal" | "hybrid" | "clinic_only",
  organizationCount: number,
): ClinicContextSelectorMode {
  if (organizationCount === 0) return "hidden";
  if (accessMode === "clinic_only") return organizationCount === 1 ? "static_clinic" : "clinics_only";
  if (accessMode === "hybrid") return "personal_plus_clinics";
  return "personal_plus_clinics";
}
