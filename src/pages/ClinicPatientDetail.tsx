import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Clock, LayoutDashboard, Loader2, Pencil, Plus, UserRound } from "lucide-react";
import { ClinicPatientEvolutions } from "../components/clinic/ClinicPatientEvolutions";
import { PatientDetailGrid, PatientDetailHeader } from "../components/patients/PatientDetailLayout";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { fetchClinicTeam, type ClinicTeamMember } from "../services/clinicTeam";
import { addClinicPatientAssignment, ClinicPatientsApiError, fetchClinicPatient, revokeClinicPatientAssignment, updateClinicPatient, type ClinicPatientDetail } from "../services/clinicPatients";
import { archiveClinicPatient, reactivateClinicPatient, reassignClinicPrimary, ClinicOperationalApiError } from "../services/clinicOperational";
import { showConfirm } from "../store/modalStore";
import { getClinicAssignmentRoleLabel, getClinicMembershipRoleLabel } from "../utils/clinicAdminPresentation";

function roleLabel(role: string) { return getClinicAssignmentRoleLabel(role); }

type ClinicMobileTab = "overview" | "history";

const clinicMobileTabs = [
  { id: "overview", label: "Resumo", icon: LayoutDashboard },
  { id: "history", label: "Histórico", icon: Clock },
] as const;

export default function ClinicPatientDetail() {
  const { organizationPatientId } = useParams();
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizations.find((item) => item.id === organizationId);
  const isManager = organization?.membershipRole === "owner" || organization?.membershipRole === "manager";
  const [patient, setPatient] = useState<ClinicPatientDetail | null>(null);
  const [members, setMembers] = useState<ClinicTeamMember[]>([]);
  const [editing, setEditing] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<ClinicMobileTab>("overview");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setPatient(null); setMembers([]);
    if (!user || !organizationPatientId) return;
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new ClinicPatientsApiError(401, "authentication_required");
      const next = await fetchClinicPatient(session.access_token, organizationPatientId);
      if (next.organizationId !== organizationId) throw new Error("organization_mismatch");
      const nextMembers = isManager && organizationId ? (await fetchClinicTeam(session.access_token, organizationId)).filter((member) => member.status === "active" && member.clinical_access_enabled) : [];
      if (version !== loadVersion.current) return;
      setPatient(next); setFullName(next.fullName); setBirthDate(next.birthDate || ""); setPhone(next.phone || ""); setMembers(nextMembers);
    } catch { if (version === loadVersion.current) setError("Não foi possível carregar este paciente ou você não possui acesso."); }
  }, [isManager, organizationId, organizationPatientId, user]);

  useEffect(() => { void load(); return () => { loadVersion.current += 1; }; }, [load]);

  if (!organizationId || !organization || !organizationPatientId) return <Navigate to="/painel/clinica/pacientes" replace />;
  const currentAssignment = patient?.assignments.find((assignment) => assignment.professionalId === user?.id && assignment.status === "active");
  const canEdit = isManager || currentAssignment?.canEdit === true;
  const assignedIds = new Set(patient?.assignments.map((item) => item.professionalId));
  const candidates = members.filter((member) => !assignedIds.has(member.professional_id));
  const currentPrimaryId = patient?.assignments.find((assignment) => assignment.assignmentRole === "primary")?.professionalId;
  const primaryCandidates = members.filter((member) => member.status === "active" && member.clinical_access_enabled && member.professional_id !== currentPrimaryId);
  const overviewVisibility = activeMobileTab === "overview" ? "contents xl:block" : "hidden xl:block";
  const historyVisibility = activeMobileTab === "history" ? "contents xl:block" : "hidden xl:block";

  async function save() { if (!patient) return; setBusy(true); setError(null); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await updateClinicPatient(session.access_token, patient.organizationPatientId, { fullName, birthDate: birthDate || null, phone: phone || null }); setEditing(false); await load(); } catch { setError("Não foi possível salvar os dados do paciente."); } finally { setBusy(false); } }
  async function add(professionalId: string, role: "secondary" | "consultant") { setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await addClinicPatientAssignment(session.access_token, organizationPatientId, professionalId, role); await load(); } catch { setError("Não foi possível adicionar a atribuição."); } finally { setBusy(false); } }
  async function revoke(id: string) { setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await revokeClinicPatientAssignment(session.access_token, organizationPatientId, id); await load(); } catch { setError("Não foi possível revogar a atribuição."); } finally { setBusy(false); } }
  async function lifecycle(action: "archive" | "reactivate") { if (!patient || !isManager) return; const confirmed = await showConfirm(action === "archive" ? "Arquivar este paciente? Os dados e atribuições serão preservados, mas novas evoluções ficarão bloqueadas." : "Reativar este paciente? As atribuições existentes serão preservadas.", { title: action === "archive" ? "Arquivar paciente" : "Reativar paciente", confirmLabel: action === "archive" ? "Arquivar" : "Reativar", cancelLabel: "Cancelar", variant: action === "archive" ? "warning" : "info", icon: "question" }); if (!confirmed) return; setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); if (action === "archive") await archiveClinicPatient(session.access_token, patient.organizationPatientId); else await reactivateClinicPatient(session.access_token, patient.organizationPatientId); await load(); } catch (cause) { setError(cause instanceof ClinicOperationalApiError && cause.status === 403 ? "Esta ação exige Owner ou Manager com acesso operacional válido." : "Não foi possível atualizar o ciclo de vida do paciente."); } finally { setBusy(false); } }
  async function reassignPrimary() { if (!patient || !isManager) return; const target = (document.getElementById("clinic-primary-target") as HTMLSelectElement | null)?.value; const keep = (document.getElementById("clinic-primary-keep") as HTMLInputElement | null)?.checked || false; if (!target) return; const confirmed = await showConfirm("Confirmar a troca do profissional principal? O histórico de evoluções permanece com seus autores.", { title: "Reatribuir principal", confirmLabel: "Reatribuir", cancelLabel: "Voltar", variant: "warning", icon: "question" }); if (!confirmed) return; setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await reassignClinicPrimary(session.access_token, patient.organizationPatientId, target, keep); await load(); } catch (cause) { setError(cause instanceof ClinicOperationalApiError && cause.status === 403 ? "Esta reatribuição não está autorizada ou a licença clínica está restrita." : "Não foi possível reatribuir o profissional principal."); } finally { setBusy(false); } }

  return <div className="patient-mobile-swipe-surface space-y-6">
    <PatientDetailHeader
      icon={UserRound}
      title={patient?.fullName || "Paciente"}
      description={patient?.status === "active" ? "Paciente ativo" : "Paciente arquivado"}
      actions={patient && <>
        {isManager && <button disabled={busy} onClick={() => void lifecycle(patient.status === "active" ? "archive" : "reactivate")} className="btn-outline h-10 w-10 shrink-0 p-0 sm:h-auto sm:w-auto sm:px-4" title={patient.status === "active" ? "Arquivar paciente" : "Reativar paciente"}><span className="sm:hidden">{patient.status === "active" ? "A" : "R"}</span><span className="hidden sm:inline">{patient.status === "active" ? "Arquivar" : "Reativar"}</span></button>}
        {canEdit && <button disabled={busy} onClick={() => setEditing((value) => !value)} className="btn-outline flex h-10 w-10 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:px-4" title="Editar paciente"><Pencil size={16} className="sm:mr-1.5" /><span className="hidden sm:inline">{editing ? "Cancelar" : "Editar"}</span></button>}
        {patient.canCreateEvolution && patient.canReadEvolutions && patient.status === "active" && <Link to={`/painel/clinica/pacientes/${patient.organizationPatientId}/evolucoes/nova`} className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:px-4" title="Nova evolução"><Plus size={18} className="sm:mr-1.5" /><span className="hidden sm:inline">Nova Evolução</span></Link>}
      </>}
      tabs={clinicMobileTabs}
      activeTab={activeMobileTab}
      onTabChange={(tabId) => setActiveMobileTab(tabId as ClinicMobileTab)}
    />
    {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}
    <PatientDetailGrid>
      <div className={`${overviewVisibility} xl:col-span-1 xl:space-y-6`}>
        <section className="card order-2 p-6 xl:order-none"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-brand-text">Dados do paciente</h2><p className="mt-1 text-sm text-brand-text-muted">{patient?.currentAssignmentRole ? `Acesso: ${roleLabel(patient.currentAssignmentRole)}` : "Acesso clínico"} · {patient?.status === "active" ? "Ativo" : "Arquivado"}</p></div>{patient?.patientStatus && <span className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 text-xs font-semibold text-brand-text-muted">{patient.patientStatus}</span>}</div>{!patient ? <div className="mt-6 flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando paciente...</div> : editing ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Nome<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="input-field mt-2 font-normal" /></label><label className="text-sm font-semibold">Nascimento<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="input-field mt-2 font-normal" /></label><label className="text-sm font-semibold">Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="input-field mt-2 font-normal" /></label><button disabled={busy} onClick={() => void save()} className="btn-primary sm:col-span-2">Salvar alterações</button></div> : <dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-brand-text-muted">Nome</dt><dd className="mt-1 font-semibold text-brand-text">{patient.fullName}</dd></div><div><dt className="text-xs text-brand-text-muted">Nascimento</dt><dd className="mt-1 font-semibold text-brand-text">{patient.birthDate || "Não informado"}</dd></div><div><dt className="text-xs text-brand-text-muted">Telefone</dt><dd className="mt-1 font-semibold text-brand-text">{patient.phone || "Não informado"}</dd></div></dl>}</section>
        {patient && <section className="card order-3 p-6 xl:order-none"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-brand-text">Profissionais vinculados</h2><p className="mt-1 text-xs text-brand-text-muted">Acesso e autoria permanecem controlados pela clínica.</p></div><span className="rounded-full bg-brand-bg px-2.5 py-1 text-xs font-semibold text-brand-text-muted">{patient.assignments.length}</span></div><div className="mt-4 space-y-3">{patient.assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-bg/60 p-3"><div><p className="font-semibold text-brand-text">{assignment.fullName || "Profissional"}</p><p className="text-xs text-brand-text-muted">{assignment.professionalTitle || "Profissional"}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-semibold">{roleLabel(assignment.assignmentRole)}</span>{isManager && assignment.assignmentRole !== "primary" && <button disabled={busy} onClick={() => void revoke(assignment.id)} className="text-xs font-semibold text-red-700">Revogar</button>}</div></div>)}{!patient.assignments.length && <p className="text-sm text-brand-text-muted">Nenhum profissional vinculado.</p>}</div>{isManager && primaryCandidates.length > 0 && <div className="mt-5 rounded-xl border border-brand-border bg-brand-bg p-4"><h3 className="font-semibold text-brand-text">Reatribuir profissional principal</h3><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><select id="clinic-primary-target" defaultValue="" className="input-field bg-white text-sm"><option value="">Selecione o novo profissional principal</option>{primaryCandidates.map((member) => <option key={member.professional_id} value={member.professional_id}>{member.full_name || "Profissional"} · {getClinicMembershipRoleLabel(member.membership_role)}</option>)}</select><button disabled={busy} onClick={() => void reassignPrimary()} className="btn-primary">Reatribuir</button></div><label className="mt-3 flex items-center gap-2 text-sm"><input id="clinic-primary-keep" type="checkbox" /> Manter o profissional principal anterior como secundário</label></div>}{isManager && candidates.length > 0 && <div className="mt-4"><select defaultValue="" onChange={(event) => { const [id, role] = event.target.value.split(":"); if (id && role) void add(id, role as "secondary" | "consultant"); event.currentTarget.value = ""; }} className="input-field text-sm"><option value="">Adicionar profissional...</option>{candidates.map((member) => <optgroup key={member.professional_id} label={member.full_name || "Profissional"}><option value={`${member.professional_id}:secondary`}>Profissional secundário</option><option value={`${member.professional_id}:consultant`}>Consultor</option></optgroup>)}</select></div>}</section>}
      </div>
      <div className={`${historyVisibility} xl:col-span-2 xl:space-y-6`}>{patient && patient.canReadEvolutions && <ClinicPatientEvolutions key={`${patient.organizationPatientId}:${user?.id}`} patient={patient} />}{patient && !patient.canReadEvolutions && <section className="card p-6"><h2 className="font-semibold text-brand-text">Histórico de evoluções</h2><p className="mt-2 text-sm text-brand-text-muted">Seu acesso clínico não inclui o histórico deste paciente.</p></section>}</div>
    </PatientDetailGrid>
  </div>;
}
