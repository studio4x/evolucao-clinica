import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useClinicContextStore } from "../../store/clinicContextStore";

export function PersonalContextRoute({ children }: { children: ReactNode }) {
  const { activeContext, organizations } = useClinicContextStore();
  if (activeContext.type === "organization") {
    const organization = organizations.find(({ id }) => id === activeContext.organizationId);
    const destination = organization?.membershipRole === "professional"
      ? "/painel/clinica/pacientes"
      : "/painel/clinica";
    return <Navigate to={destination} replace />;
  }
  return <>{children}</>;
}

