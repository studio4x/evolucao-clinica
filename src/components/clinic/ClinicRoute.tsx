import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { publicEffectFlags } from "../../config/publicFlags";
import { useAuthStore } from "../../store/authStore";
import { useClinicContextStore } from "../../store/clinicContextStore";
import { SplashScreen } from "../layout/SplashScreen";

export function ClinicRoute({ children }: { children: ReactNode }) {
  const { user, isAuthReady } = useAuthStore();
  const { organizations, activeContext, status } = useClinicContextStore();

  if (!publicEffectFlags.clinicFeature) return <Navigate to="/painel/dashboard" replace />;
  if (!isAuthReady) return <SplashScreen message="Preparando o contexto da clínica..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (status === "idle" || status === "loading") return <SplashScreen message="Validando seu acesso à clínica..." />;
  if (status === "error") return <Navigate to="/painel/dashboard" replace />;

  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;
  if (!organization) return <Navigate to="/painel/dashboard" replace />;

  return <>{children}</>;
}

