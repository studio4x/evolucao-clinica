import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ClipboardList, Loader2, Search, UserPlus } from "lucide-react";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { ClinicPatientsApiError, fetchClinicPatients, type ClinicPatientSummary } from "../services/clinicPatients";
import { getClinicAssignmentRoleLabel } from "../utils/clinicAdminPresentation";

function roleLabel(role: ClinicPatientSummary["current_assignment_role"]) {
  return role ? getClinicAssignmentRoleLabel(role) : "Clínica";
}

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR").format(date);
}

export default function ClinicPatients() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizations.find((item) => item.id === organizationId);
  const isManager = organization?.membershipRole === "owner" || organization?.membershipRole === "manager";
  const [patients, setPatients] = useState<ClinicPatientSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new ClinicPatientsApiError(401, "authentication_required");
      setPatients(await fetchClinicPatients(session.access_token, organizationId, search));
    } catch (cause) {
      setError(cause instanceof ClinicPatientsApiError && cause.code === "not_authorized" ? "Você não possui acesso a estes pacientes." : "Não foi possível carregar os pacientes da clínica.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, user]);

  useEffect(() => { void load(); }, [load]);
  if (!organizationId || !organization) return <Navigate to="/painel/clinica" replace />;
  const visiblePatients = statusFilter === "all" ? patients : patients.filter((patient) => patient.status === statusFilter);

  return (
    <div className="space-y-6">
      <PanelPageHeader title="Pacientes da clínica" description="Pacientes compartilhados somente dentro desta clínica." icon={ClipboardList} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block min-w-[260px] flex-1"><span className="sr-only">Buscar paciente</span><Search className="pointer-events-none absolute left-3 top-3.5 text-brand-text-muted" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-brand-border bg-white py-3 pl-10 pr-3 text-sm" placeholder="Buscar por nome" /></label>
        <label className="text-sm font-semibold"><span className="sr-only">Filtrar status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-brand-border bg-white px-3 py-3"><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select></label>
        {isManager && <Link to="/painel/clinica/pacientes/new" className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white"><UserPlus size={17} /> Novo paciente</Link>}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? <div className="flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando pacientes...</div> : visiblePatients.length === 0 ? <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-sm text-brand-text-muted">Nenhum paciente neste filtro.</div> : <div className="grid gap-3">{visiblePatients.map((patient) => <Link key={patient.organization_patient_id} to={`/painel/clinica/pacientes/${patient.organization_patient_id}`} className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm transition hover:border-brand-primary"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-brand-text">{patient.full_name}</h2><p className="mt-1 text-sm text-brand-text-muted">Nascimento: {formatDate(patient.birth_date)} · Principal: {patient.primary_professional_name || "Profissional"}</p></div><span className="rounded-full bg-brand-bg px-3 py-1 text-xs font-semibold text-brand-primary">{roleLabel(patient.current_assignment_role)}</span></div><p className="mt-3 text-xs text-brand-text-muted">{patient.assignment_count} profissional(is) atribuído(s) · {patient.status === "active" ? "Ativo" : "Arquivado"}</p></Link>)}</div>}
      <p className="text-xs text-brand-text-muted">Os registros clínicos e evoluções permanecem privados de cada profissional nesta fase.</p>
    </div>
  );
}
