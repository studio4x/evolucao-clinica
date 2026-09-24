import { Building2, ShieldCheck } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useClinicContextStore } from "../store/clinicContextStore";
import Subscription from "./Subscription";

export default function ContextSubscription() {
  const { activeContext, organizations } = useClinicContextStore();
  if (activeContext.type !== "organization") return <Subscription />;

  const organization = organizations.find(({ id }) => id === activeContext.organizationId);
  if (!organization) return <Navigate to="/painel/clinica" replace />;
  if (["owner", "manager"].includes(organization.membershipRole)) {
    return <Navigate to="/painel/clinica/contratar" replace />;
  }
  if (organization.membershipRole !== "professional"
    || !organization.clinicalAccessEnabled
    || !organization.licenseActive) return <Subscription />;

  return <div className="space-y-6">
    <PanelPageHeader title="Plano Clínica" description="Seu acesso é fornecido pela licença da clínica." icon={Building2} />
    <section className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={21} /><div><h2 className="text-lg font-semibold text-brand-text">Licença vinculada à clínica</h2><p className="mt-2 text-sm leading-6 text-brand-text-muted">Seu acesso ao Evolução Clínica está vinculado à licença da clínica.</p><p className="mt-2 text-sm leading-6 text-brand-text-muted">Enquanto essa licença estiver ativa, você pode utilizar os recursos disponibilizados pela clínica.</p></div></div>
      <p className="mt-5 rounded-xl bg-brand-bg px-4 py-3 text-sm font-semibold text-brand-text">{organization.tradeName || organization.name}</p>
      <Link to="/painel/clinica/pacientes" className="mt-5 inline-flex rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white">Voltar ao espaço da clínica</Link>
    </section>
  </div>;
}
