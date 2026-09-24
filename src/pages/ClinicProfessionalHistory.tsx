import { useEffect, useState } from "react";
import { Clock, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { fetchClinicPatients, type ClinicPatientSummary } from "../services/clinicPatients";
import { clinicEvolutionRequest } from "../services/clinicEvolutions";

type HistoryEntry = { patient: ClinicPatientSummary; evolution: any };

export default function ClinicProfessionalHistory() {
  const user = useAuthStore((state) => state.user);
  const { activeContext } = useClinicContextStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || !organizationId) return;
      setLoading(true); setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("session_required");
        const patients = await fetchClinicPatients(session.access_token, organizationId);
        const patientEntries = await Promise.all(patients.map(async (patient) => {
          try {
            const result = await clinicEvolutionRequest(patient.organization_patient_id);
            return (result.evolutions || []).map((evolution: any) => ({ patient, evolution }));
          } catch {
            return [];
          }
        }));
        if (!cancelled) setEntries(patientEntries.flat().sort((a, b) => String(b.evolution.created_at || b.evolution.session_date).localeCompare(String(a.evolution.created_at || a.evolution.session_date))));
      } catch {
        if (!cancelled) setError("Não foi possível carregar o histórico clínico. Seu acesso pode ter mudado.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId, user]);

  return <div className="space-y-6">
    <PanelPageHeader title="Histórico" description="Evoluções clínicas disponíveis neste contexto." icon={Clock} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <div className="flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando histórico...</div> : !entries.length && !error ? <section className="rounded-2xl border border-brand-border bg-white p-6 text-sm text-brand-text-muted shadow-sm">Nenhuma evolução clínica disponível neste contexto.</section> : <section className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm"><div className="divide-y divide-brand-border/60">{entries.map(({ patient, evolution }) => <article key={evolution.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-semibold text-brand-text">{patient.full_name}</p><p className="mt-1 text-sm text-brand-text-muted">{evolution.session_date?.split("-").reverse().join("/") || "Data não informada"}{evolution.session_time ? ` · ${evolution.session_time}` : ""} · {evolution.status === "signed" ? "Assinada" : "Em andamento"}</p></div><Link to={`/painel/clinica/pacientes/${patient.organization_patient_id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary"><ExternalLink size={15} /> Abrir paciente</Link></article>)}</div></section>}
  </div>;
}
