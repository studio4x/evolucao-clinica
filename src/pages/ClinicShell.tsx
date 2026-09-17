import { Building2, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useClinicContextStore } from "../store/clinicContextStore";

export default function ClinicShell() {
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;

  if (!organization) return null;

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title="Visão da clínica"
        description="Contexto organizacional somente para leitura."
        icon={Building2}
      />

      <section className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm" aria-labelledby="clinic-context-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">Contexto ativo</p>
            <h2 id="clinic-context-heading" className="mt-1 text-2xl font-bold text-brand-text">{organization.tradeName || organization.name}</h2>
            {organization.tradeName && <p className="mt-1 text-sm text-brand-text-muted">{organization.name}</p>}
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            <ShieldCheck size={16} aria-hidden="true" />
            Acesso {organization.membershipRole}
          </span>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-brand-bg p-4"><dt className="text-xs text-brand-text-muted">Status operacional</dt><dd className="mt-1 font-semibold text-brand-text">{organization.operationalStatus}</dd></div>
          <div className="rounded-xl bg-brand-bg p-4"><dt className="text-xs text-brand-text-muted">Acesso clínico</dt><dd className="mt-1 font-semibold text-brand-text">{organization.clinicalAccessEnabled ? "Habilitado" : "Não habilitado"}</dd></div>
          <div className="rounded-xl bg-brand-bg p-4"><dt className="text-xs text-brand-text-muted">Pacientes compartilhados</dt><dd className="mt-1 font-semibold text-brand-text"><Link className="text-brand-primary" to="/painel/clinica/pacientes">Abrir pacientes</Link></dd></div>
        </dl>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-brand-text">Contratação e licenças</h2>
          <p className="mt-1 text-sm text-brand-text-muted">Consulte o status financeiro e o limite de licenças da clínica.</p>
        </div>
        <Link to="/painel/clinica/contratar" className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white"><CreditCard size={17} /> Abrir cobrança</Link>
      </section>

      <section className="rounded-2xl border border-dashed border-brand-border bg-white p-5" aria-labelledby="clinic-members-heading">
        <h2 id="clinic-members-heading" className="text-lg font-semibold text-brand-text">Membros</h2>
        <p className="mt-2 text-sm text-brand-text-muted">A equipe permanece separada dos pacientes compartilhados. Evoluções e documentos clínicos não são carregados neste shell.</p>
      </section>
    </div>
  );
}
