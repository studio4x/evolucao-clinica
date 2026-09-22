import { useCallback, useEffect, useState } from "react";
import { FileClock, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { ClinicOperationalApiError, fetchClinicAudit, type ClinicAuditCursor, type ClinicAuditEvent } from "../services/clinicOperational";

const EVENT_OPTIONS = [
  ["", "Todos os eventos"],
  ["organization_patient_archived", "Paciente arquivado"],
  ["organization_patient_reactivated", "Paciente reativado"],
  ["patient_primary_reassigned", "Profissional principal alterado"],
  ["patient_assignment_role_changed", "Papel clínico alterado"],
  ["patient_assignment_created", "Acesso clínico concedido"],
  ["patient_assignment_revoked", "Acesso clínico revogado"],
  ["organization_patient_clinical_records_viewed", "Prontuário clínico consultado"],
  ["organization_evolution_viewed", "Evolução consultada"],
  ["organization_evolution_exported", "Evolução exportada"],
  ["member_role_changed", "Papel da equipe alterado"],
  ["member_suspended", "Membro suspenso"],
  ["member_reactivated", "Membro reativado"],
  ["member_removed", "Membro removido"],
] as const;

const EVENT_LABELS: Record<string, string> = Object.fromEntries(EVENT_OPTIONS);

function eventLabel(event: ClinicAuditEvent) {
  return EVENT_LABELS[event.event_type] || "Evento operacional";
}

function eventDescription(event: ClinicAuditEvent) {
  const subject = event.patient_display_name || event.subject_professional_name || event.professional_name;
  if (event.event_type === "patient_primary_reassigned") return `${subject || "Paciente"}: profissional principal atualizado${event.keep_previous_as_secondary ? "; profissional anterior mantido como secundário" : ""}.`;
  if (event.event_type === "patient_assignment_role_changed") return `${subject || "Acesso clínico"}: papel atualizado.`;
  if (event.event_type === "organization_patient_clinical_records_viewed") return `${subject || "Paciente"}: registros clínicos consultados pela gestão da clínica.`;
  if (event.event_type === "organization_evolution_viewed") return `${subject || "Profissional"}: evolução consultada pela gestão da clínica.`;
  if (event.event_type === "organization_evolution_exported") return `${subject || "Profissional"}: evolução exportada pela gestão da clínica.`;
  return subject ? `${subject}.` : "Alteração operacional registrada.";
}

export default function ClinicAudit() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext } = useClinicContextStore();
  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizations.find((item) => item.id === organizationId);
  const isManager = organization?.membershipRole === "owner" || organization?.membershipRole === "manager";
  const [events, setEvents] = useState<ClinicAuditEvent[]>([]);
  const [eventType, setEventType] = useState("");
  const [cursor, setCursor] = useState<ClinicAuditCursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextCursor: ClinicAuditCursor = null, append = false) => {
    if (!user || !organizationId || !isManager) return;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new ClinicOperationalApiError(401, "authentication_required");
      const result = await fetchClinicAudit(session.access_token, organizationId, { limit: 25, cursor: nextCursor, eventType: eventType || undefined });
      setEvents((current) => append ? [...current, ...result.events] : result.events);
      setCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof ClinicOperationalApiError && cause.status === 403 ? "A auditoria está disponível apenas para Owner e Manager." : "Não foi possível carregar a auditoria operacional.");
    } finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [eventType, isManager, organizationId, user]);

  useEffect(() => { void load(); }, [load]);
  if (!organizationId || !organization || !isManager) return <Navigate to="/painel/clinica" replace />;

  return <div className="space-y-6">
    <PanelPageHeader title="Auditoria operacional" description="Histórico de alterações administrativas da clínica, sem conteúdo clínico." icon={FileClock} />
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
      <label htmlFor="clinic-audit-event" className="text-sm font-semibold text-brand-text">Filtrar evento</label>
      <select id="clinic-audit-event" value={eventType} onChange={(event) => { setEventType(event.target.value); setCursor(null); }} className="rounded-xl border border-brand-border bg-white px-3 py-2 text-sm">
        {EVENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="flex items-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={18} /> Carregando eventos...</div> : <>
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
        {events.length === 0 ? <p className="p-6 text-sm text-brand-text-muted">Nenhum evento operacional encontrado.</p> : <ul className="divide-y divide-brand-border">{events.map((event) => <li key={event.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-brand-text">{eventLabel(event)}</p><p className="mt-1 text-sm text-brand-text-muted">{eventDescription(event)}</p></div><time className="text-xs text-brand-text-muted" dateTime={event.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.created_at))}</time></div></li>)}</ul>}
      </div>
      {cursor && <button type="button" onClick={() => void load(cursor, true)} disabled={loadingMore} className="rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm font-semibold text-brand-text disabled:opacity-50">{loadingMore ? "Carregando..." : "Carregar mais"}</button>}
    </>}
  </div>;
}
