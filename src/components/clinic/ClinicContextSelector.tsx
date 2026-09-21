import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { publicEffectFlags } from "../../config/publicFlags";
import { useClinicContextStore } from "../../store/clinicContextStore";
import { getClinicContextSelectorMode } from "../../utils/clinicContextPresentation";

type ClinicContextSelectorProps = { collapsed?: boolean };

export function ClinicContextSelector({ collapsed = false }: ClinicContextSelectorProps) {
  const navigate = useNavigate();
  const { organizations, personalAvailable, accessMode, activeContext, status, selectContext } = useClinicContextStore();
  const [isChanging, setIsChanging] = useState(false);

  const selectorMode = getClinicContextSelectorMode(accessMode, organizations.length, personalAvailable);
  if (!publicEffectFlags.clinicFeature || selectorMode === "hidden") return null;

  const value = activeContext.type === "organization" ? activeContext.organizationId : "personal";

  const handleChange = async (organizationId: string) => {
    const nextContext = organizationId === "personal"
      ? { type: "personal" as const }
      : { type: "organization" as const, organizationId };
    selectContext(nextContext);
    const selectedOrganization = organizations.find(({ id }) => id === organizationId);
    navigate(nextContext.type === "organization"
      ? selectedOrganization?.operationalStatus === "pending_setup" ? "/painel/clinica/contratar" : "/painel/clinica"
      : "/painel/dashboard");

    setIsChanging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id) {
        await useClinicContextStore.getState().revalidateForUser(session.user.id, session.access_token);
      }
    } finally {
      setIsChanging(false);
    }
  };

  if (status === "ready" && selectorMode === "static_clinic") {
    const organization = organizations[0];
    return (
      <div className={`block ${collapsed ? "px-1" : "px-0"}`} data-testid="clinic-context-static">
        <span className={`mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-text-muted ${collapsed ? "justify-center" : ""}`}>
          <Building2 size={14} aria-hidden="true" />
          {!collapsed && "Contexto atual"}
        </span>
        {!collapsed && (
          <div className="rounded-lg border border-brand-border bg-white px-3 py-2">
            <span className="block text-sm font-medium text-brand-text">{organization.tradeName || organization.name}</span>
            {organization.planLabel && <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Plano Clínica</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <label className={`block ${collapsed ? "px-1" : "px-0"}`}>
      <span className="sr-only">Selecionar contexto</span>
      <span className={`mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-text-muted ${collapsed ? "justify-center" : ""}`}>
        <Building2 size={14} aria-hidden="true" />
        {!collapsed && "Contexto atual"}
      </span>
      <span className="relative block">
        <select
          aria-label="Selecionar contexto"
          value={value}
          disabled={status === "loading" || isChanging}
          onChange={(event) => void handleChange(event.target.value)}
          className={`w-full appearance-none rounded-lg border border-brand-border bg-white text-sm text-brand-text outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:cursor-wait disabled:opacity-60 ${collapsed ? "px-1 py-2 text-[0px]" : "px-3 py-2 pr-8"}`}
        >
          {selectorMode === "personal_plus_clinics" && <option value="personal">Minha conta</option>}
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.tradeName || organization.name}</option>
          ))}
        </select>
        {!collapsed && <ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-brand-text-muted" aria-hidden="true" />}
      </span>
    </label>
  );
}

