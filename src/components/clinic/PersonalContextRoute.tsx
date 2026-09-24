import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useClinicContextStore } from "../../store/clinicContextStore";

export function isPersonalShellRouteAllowedForClinicalProfessional(pathname: string) {
  return pathname === "/painel/tutorial";
}

export function PersonalContextRoute({ children }: { children: ReactNode }) {
  const { activeContext, organizations } = useClinicContextStore();
  const location = useLocation();
  if (activeContext.type === "organization") {
    const organization = organizations.find(({ id }) => id === activeContext.organizationId);
    if (organization?.membershipRole === "professional"
      && organization.clinicalAccessEnabled
      && organization.licenseActive
      && isPersonalShellRouteAllowedForClinicalProfessional(location.pathname)) {
      return <>{children}</>;
    }
    const destination = organization?.membershipRole === "professional"
      ? "/painel/clinica/pacientes"
      : "/painel/clinica";
    return <Navigate to={destination} replace />;
  }
  return <>{children}</>;
}

