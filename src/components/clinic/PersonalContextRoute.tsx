import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useClinicContextStore } from "../../store/clinicContextStore";

export function PersonalContextRoute({ children }: { children: ReactNode }) {
  const activeContext = useClinicContextStore((state) => state.activeContext);
  if (activeContext.type === "organization") return <Navigate to="/painel/clinica" replace />;
  return <>{children}</>;
}

