import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { fetchClinicTeam, type ClinicTeamMember } from "../services/clinicTeam";
import { createClinicPatient, ClinicPatientsApiError } from "../services/clinicPatients";

export default function ClinicPatientForm() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizations.find((item) => item.id === organizationId);
  const isManager = organization?.membershipRole === "owner" || organization?.membershipRole === "manager";
  const navigate = useNavigate();
  const [members, setMembers] = useState<ClinicTeamMember[]>([]);
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [primaryProfessionalId, setPrimaryProfessionalId] = useState("");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [consultants, setConsultants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !organizationId || !isManager) return;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setMembers((await fetchClinicTeam(session.access_token, organizationId)).filter((member) => member.status === "active" && member.clinical_access_enabled));
    })();
  }, [isManager, organizationId, user]);

  if (!organizationId || !organization || !isManager) return <Navigate to="/painel/clinica/pacientes" replace />;
  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const availableSecondary = members.filter((member) => member.professional_id !== primaryProfessionalId && !consultants.includes(member.professional_id));
  const availableConsultants = members.filter((member) => member.professional_id !== primaryProfessionalId && !secondary.includes(member.professional_id));

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new ClinicPatientsApiError(401, "authentication_required");
      const created = await createClinicPatient(session.access_token, { organizationId, fullName, birthDate: birthDate || null, phone: phone || null, primaryProfessionalId, secondaryProfessionalIds: secondary, consultantProfessionalIds: consultants });
      navigate(`/painel/clinica/pacientes/${created.organization_patient_id}`);
    } catch { setError("Não foi possível criar o paciente. Confira o profissional Primary e tente novamente."); } finally { setBusy(false); }
  }

  return <div className="space-y-6"><PanelPageHeader title="Novo paciente da clínica" description="Cadastre somente os dados necessários para o atendimento compartilhado." icon={UserPlus} /><form onSubmit={submit} className="max-w-2xl space-y-5 rounded-2xl border border-brand-border bg-white p-6 shadow-sm"><label className="block text-sm font-semibold">Nome completo<input required minLength={2} maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Data de nascimento<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label><label className="block text-sm font-semibold">Telefone<input value={phone} maxLength={32} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal" /></label></div><label className="block text-sm font-semibold">Profissional Primary<select required value={primaryProfessionalId} onChange={(event) => setPrimaryProfessionalId(event.target.value)} className="mt-2 w-full rounded-xl border border-brand-border p-3 font-normal"><option value="">Selecione</option>{members.map((member) => <option key={member.professional_id} value={member.professional_id}>{member.full_name || "Profissional"} · {member.membership_role}</option>)}</select></label><fieldset><legend className="text-sm font-semibold">Profissionais Secondary (somente leitura)</legend><div className="mt-2 grid gap-2">{availableSecondary.map((member) => <label key={member.professional_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={secondary.includes(member.professional_id)} onChange={() => toggle(setSecondary, member.professional_id)} />{member.full_name || "Profissional"}</label>)}</div></fieldset><fieldset><legend className="text-sm font-semibold">Consultores (somente leitura)</legend><div className="mt-2 grid gap-2">{availableConsultants.map((member) => <label key={member.professional_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consultants.includes(member.professional_id)} onChange={() => toggle(setConsultants, member.professional_id)} />{member.full_name || "Profissional"}</label>)}</div></fieldset>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex flex-wrap gap-3"><Link to="/painel/clinica/pacientes" className="inline-flex items-center gap-2 rounded-xl border border-brand-border px-4 py-3 text-sm font-semibold"><ArrowLeft size={17} /> Voltar</Link><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 className="animate-spin" size={17} />} Criar paciente</button></div></form></div>;
}
