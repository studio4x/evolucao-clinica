import { useCallback, useEffect, useState } from "react";
import { Building2, CreditCard, FileClock, Loader2, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { fetchClinicDashboard, type ClinicDashboard } from "../services/clinicOperational";
import { getClinicRoleLabel } from "../utils/clinicAccess";

function Card({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">{label}</p><p className="mt-2 text-3xl font-bold text-brand-text">{value}</p>{detail && <p className="mt-1 text-sm text-brand-text-muted">{detail}</p>}</div>;
}

export default function ClinicShell() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;
  const [dashboard, setDashboard] = useState<ClinicDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !organizationId) return;
    setLoading(true); setError("");
    try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); setDashboard(await fetchClinicDashboard(session.access_token, organizationId)); }
    catch { setDashboard(null); setError("Não foi possível carregar o resumo operacional desta clínica."); }
    finally { setLoading(false); }
  }, [organizationId, user]);
  useEffect(() => { void load(); }, [load]);

  if (!organization) return null;
  const isProfessional = organization.membershipRole === "professional";
  const admin = dashboard?.scope === "administrative" && !isProfessional;
  const org = dashboard?.organization || organization;
  const entitlement = org.entitlementMode === "full" ? "Operacional" : org.entitlementMode === "restricted" ? "Restrito" : "Indisponível";

  return <div className="space-y-6">
    <PanelPageHeader title={org.tradeName || org.name || "Visão da clínica"} description="Resumo operacional sem conteúdo clínico agregado." icon={Building2} />
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando indicadores...</div> : dashboard && <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {admin ? <><Card label="Pacientes ativos" value={dashboard.patients?.active || 0} detail={`${dashboard.patients?.archived || 0} arquivados`} /><Card label="Equipe ativa" value={dashboard.team?.active || 0} detail={`${dashboard.team?.suspended || 0} suspensos`} /><Card label="Licenças" value={dashboard.seats?.active || 0} detail={`${dashboard.seats?.available || 0} disponíveis`} /><Card label="Convites pendentes" value={dashboard.invitations?.pending || 0} detail={`${dashboard.invitations?.pendingClinical || 0} clínicos`} /></> : <><Card label="Meus pacientes" value={dashboard.myPatients?.active || 0} /><Card label="Primários" value={dashboard.myPatients?.primary || 0} /><Card label="Secundários" value={dashboard.myPatients?.secondary || 0} /><Card label="Consultores" value={dashboard.myPatients?.consultant || 0} /></>}
      </section>
      <section className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-brand-text">Status da clínica</h2><p className="mt-1 text-sm text-brand-text-muted">Acesso clínico pessoal: {org.clinicalAccessEnabled ? "Habilitado" : "Não habilitado"} · Operação da clínica: {entitlement}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700"><ShieldCheck size={16} /> {getClinicRoleLabel(org.membershipRole)}</span></div>{admin && <p className="mt-4 text-sm text-brand-text-muted">Atribuições ativas: {dashboard.assignments?.active || 0} · Primários {dashboard.assignments?.primary || 0} · Secundários {dashboard.assignments?.secondary || 0} · Consultores {dashboard.assignments?.consultant || 0}</p>}</section>
      <section className="flex flex-wrap gap-3"><Link to="/painel/clinica/pacientes" className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white"><Users size={17} /> Pacientes</Link>{admin && <><Link to="/painel/clinica/equipe" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold"><Users size={17} /> Equipe</Link><Link to="/painel/clinica/auditoria" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold"><FileClock size={17} /> Auditoria</Link><Link to="/painel/clinica/contratar" className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold"><CreditCard size={17} /> Cobrança</Link></>}</section>
    </>}
  </div>;
}
