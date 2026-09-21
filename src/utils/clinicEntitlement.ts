import type { ActiveClinicContext } from "../store/clinicContextStore";
import type { ClinicOrganization } from "../services/clinicContext";

export type EffectiveEntitlement = {
  source: "personal" | "organization";
  available: boolean;
  shouldPaywall: boolean;
  shouldRedirectToClinic: boolean;
};

export function resolveEffectiveEntitlement(input: {
  pathname: string;
  personalAvailable: boolean;
  personalEntitled?: boolean;
  accessMode: "personal" | "hybrid" | "clinic_only";
  activeContext: ActiveClinicContext;
  organizations: ClinicOrganization[];
  profileRole?: string | null;
}): EffectiveEntitlement {
  const isClinicRoute = input.pathname === "/painel/clinica" || input.pathname.startsWith("/painel/clinica/");
  if (input.activeContext.type === "organization") {
    const organizationId = input.activeContext.organizationId;
    const organization = input.organizations.find(({ id }) => id === organizationId);
    return {
      source: "organization",
      available: organization?.licenseActive === true,
      shouldPaywall: false,
      shouldRedirectToClinic: false,
    };
  }

  const shouldRedirectToClinic = !isClinicRoute
    && !input.personalAvailable
    && input.organizations.length > 0
    && (input.accessMode === "clinic_only" || input.accessMode === "hybrid");
  return {
    source: "personal",
    available: input.personalAvailable,
    shouldPaywall: !(input.personalEntitled ?? input.personalAvailable) && !shouldRedirectToClinic && input.profileRole !== "admin",
    shouldRedirectToClinic,
  };
}
