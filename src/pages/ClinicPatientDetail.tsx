import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, UserRound } from "lucide-react";
import { ClinicPatientEvolutions } from "../components/clinic/ClinicPatientEvolutions";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { fetchClinicTeam, type ClinicTeamMember } from "../services/clinicTeam";
import { addClinicPatientAssignment, ClinicPatientsApiError, fetchClinicPatient, revokeClinicPatientAssignment, updateClinicPatient, type ClinicPatientDetail } from "../services/clinicPatients";

function roleLabel(role: string) { return role === "primary" ? "Primary" : role === "secondary" ? "Secondary" : "Consultor"; }

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
  const [fullName, setFullName] = useState(""); const [birthDate, setBirthDate] = useState(""); const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
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
      if (next.organizationId !== organizationId) throw new Error();
      const nextMembers = isManager && organizationId ? (await fetchClinicTeam(session.access_token, organizationId)).filter((member) => member.status === "active" && member.clinical_access_enabled) : [];
      if (version !== loadVersion.current) return;
      setPatient(next); setFullName(next.fullName); setBirthDate(next.birthDate || ""); setPhone(next.phone || "");
      setMembers(nextMembers);
    } catch { if (version === loadVersion.current) setError("Não foi possível carregar este paciente ou você não possui acesso."); }
  }, [isManager, organizationId, organizationPatientId, user]);
  useEffect(() => { void load(); return () => { loadVersion.current += 1; }; }, [load]);

  if (!organizationId || !organization || !organizationPatientId) return <Navigate to="/painel/clinica/pacientes" replace />;
  const canEdit = isManager || patient?.currentAssignmentRole === "primary";
  const assignedIds = new Set(patient?.assignments.map((item) => item.professionalId));
  const candidates = members.filter((member) => !assignedIds.has(member.professional_id));

  async function save() {
    if (!patient) return; setBusy(true); setError(null);
    try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await updateClinicPatient(session.access_token, patient.organizationPatientId, { fullName, birthDate: birthDate || null, phone: phone || null, status: patient.status }); setEditing(false); await load(); } catch { setError("Não foi possível salvar os dados do paciente."); } finally { setBusy(false); }
  }
  async function add(professionalId: string, role: "secondary" | "consultant") { setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await addClinicPatientAssignment(session.access_token, organizationPatientId, professionalId, role); await load(); } catch { setError("Não foi possível adicionar a atribuição."); } finally { setBusy(false); } }
  async function revoke(id: string) { setBusy(true); try { const { data: { session } } = await supabase.auth.getSession(); if (!session?.access_token) throw new Error(); await revokeClinicPatientAssignment(session.access_token, organizationPatientId, id); await load(); } catch { setError("Não foi possível revogar a atribuição."); } finally { setBusy(false); } }

  return <div className="space-y-6"><PanelPageHeader title={patient?.fullName || "Paciente da clínica"} description="Dados cadastrais compartilhados nesta organização." icon={UserRound} /><Link to="/painel/clinica/pacientes" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary"><ArrowLeft size={17} /> Voltar para pacientes</Link>{error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}{!patient ? <div className="flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando...</div> : <><section className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-brand-text">Dados cadastrais</h2><p className="mt-1 text-sm text-brand-text-muted">Acesso atual: {patient.currentAssignmentRole ? roleLabel(patient.currentAssignmentRole) : "Gestão da clínica"}</p></div>{canEdit && <button onClick={() => setEditing((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-brand-border px-3 py-2 text-sm font-semibold"><Pencil size={16} /> {editing ? "Cancelar" : "Editar"}</button>}</div>{editing ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Nome<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label><label className="text-sm font-semibold">Nascimento<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label><label className="text-sm font-semibold">Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label><button disabled={busy} onClick={() => void save()} className="rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white sm:col-span-2">Salvar</button></div> : <dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-brand-text-muted">Nome</dt><dd className="mt-1 font-semibold">{patient.fullName}</dd></div><div><dt className="text-xs text-brand-text-muted">Nascimento</dt><dd className="mt-1 font-semibold">{patient.birthDate || "Não informado"}</dd></div><div><dt className="text-xs text-brand-text-muted">Telefone</dt><dd className="mt-1 font-semibold">{patient.phone || "Não informado"}</dd></div></dl>}</section><section className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-brand-text">Profissionais atribuídos</h2><div className="mt-4 space-y-3">{patient.assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-bg p-3"><div><p className="font-semibold">{assignment.fullName || "Profissional"}</p><p className="text-xs text-brand-text-muted">{assignment.professionalTitle || "Profissional"}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-semibold">{roleLabel(assignment.assignmentRole)}</span>{isManager && assignment.assignmentRole !== "primary" && <button disabled={busy} onClick={() => void revoke(assignment.id)} className="text-xs font-semibold text-red-700">Revogar</button>}</div></div>)}</div>{isManager && candidates.length > 0 && <div className="mt-6 grid gap-3 sm:grid-cols-2"><select defaultValue="" onChange={(event) => { const [id, role] = event.target.value.split(":"); if (id && role) void add(id, role as "secondary" | "consultant"); event.currentTarget.value = ""; }} className="rounded-xl border border-brand-border p-3 text-sm"><option value="">Adicionar profissional...</option>{candidates.map((member) => <optgroup key={member.professional_id} label={member.full_name || "Profissional"}><option value={`${member.professional_id}:secondary`}>Secondary</option><option value={`${member.professional_id}:consultant`}>Consultor</option></optgroup>)}</select></div>}</section>{patient.canReadEvolutions && <ClinicPatientEvolutions key={`${patient.organizationPatientId}:${user?.id}`} patient={patient} />}</>}</div>;
}
