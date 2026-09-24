import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { publicEffectFlags } from "../../config/publicFlags";
import { useAuthStore } from "../../store/authStore";
import { useClinicContextStore } from "../../store/clinicContextStore";
import { SplashScreen } from "../layout/SplashScreen";

export function ClinicRoute({ children }: { children: ReactNode }) {
  const { user, isAuthReady } = useAuthStore();
  const { organizations, activeContext, status } = useClinicContextStore();
  const location = useLocation();
  const navigate = useNavigate();

  if (!publicEffectFlags.clinicFeature) return <Navigate to="/painel/dashboard" replace />;
  if (!isAuthReady) return <SplashScreen message="Preparando o contexto da clínica..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (status === "idle" || status === "loading") return <SplashScreen message="Validando seu acesso à clínica..." />;
  if (status === "error") return <Navigate to="/painel/dashboard" replace />;

  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;
  if (!organization) {
    if (organizations.length > 1) {
      return <section className="mx-auto max-w-xl space-y-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-brand-text">Escolha o contexto da clínica</h1>
        <p className="text-sm text-brand-text-muted">Sua conta tem mais de uma clínica e precisa de uma escolha explícita antes de abrir o espaço clínico.</p>
        <div className="grid gap-3">{organizations.map((item) => <button key={item.id} type="button" onClick={() => { useClinicContextStore.getState().selectContext({ type: "organization", organizationId: item.id }); navigate("/painel/clinica/pacientes", { replace: true }); }} className="rounded-xl border border-brand-border px-4 py-3 text-left font-semibold text-brand-primary hover:border-brand-primary">{item.tradeName || item.name}<span className="mt-1 block text-xs font-normal text-brand-text-muted">{item.membershipRole === "professional" ? "Profissional" : "Gestão"}</span></button>)}</div>
      </section>;
    }
    return <Navigate to="/painel/dashboard" replace />;
  }
  if (organization.membershipRole === "professional") {
    if (!organization.clinicalAccessEnabled || !organization.licenseActive) return <Navigate to="/painel/dashboard" replace />;
    if (location.pathname === "/painel/clinica/equipe" || location.pathname === "/painel/clinica/auditoria" || location.pathname === "/painel/clinica/contratar") {
      return <Navigate to="/painel/clinica/pacientes" replace />;
    }
  }

  return <>{children}</>;
}

