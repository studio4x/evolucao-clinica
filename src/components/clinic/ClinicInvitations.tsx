import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { invitationRequest, invitationErrorMessage, type ClinicInvitation } from "../../services/clinicInvitations";
import type { ClinicSeatSummary } from "../../services/clinicEntitlement";

export function ClinicInvitations({ organizationId, actorRole, seats, onChanged }: {
  organizationId: string; actorRole: "owner" | "manager"; seats: ClinicSeatSummary | null; onChanged(): Promise<void>;
}) {
  const [rows, setRows] = useState<ClinicInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "professional">("professional");
  const [clinical, setClinical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const currentOrg = useRef(organizationId); currentOrg.current = organizationId;
  const full = seats?.entitlement_mode === "full";
  const unavailable = clinical && (seats?.available_seats ?? 0) < 1;
  const token = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("authentication_required");
    return data.session.access_token;
  };
  const load = useCallback(async () => {
    const org = organizationId;
    try {
      const data = await invitationRequest(`?organizationId=${encodeURIComponent(org)}`, await token());
      if (currentOrg.current === org) setRows(data.invitations);
    } catch (error) { if (currentOrg.current === org) setMessage(invitationErrorMessage(error)); }
  }, [organizationId]);
  useEffect(() => { setRows([]); setEmail(""); setRole("professional"); setMessage(""); void load(); }, [load, actorRole]);
  const mutate = async (id?: string, action?: "resend" | "revoke") => {
    if (busy) return;
    const org = organizationId;
    setBusy(true); setMessage("");
    try {
      const data = await invitationRequest(id ? `/${id}/${action}` : "", await token(), id ? { organizationId: org } : { organizationId: org, email, role, clinical });
      if (currentOrg.current !== org) return;
      setEmail("");
      setMessage(data.deliveryStatus === "failed" ? "Convite criado, mas o envio falhou. A reserva permanece. Você pode reenviar ou revogar." : action === "revoke" ? "Convite revogado." : "Convite enviado.");
      await Promise.all([load(), onChanged()]);
    } catch (error) { if (currentOrg.current === org) setMessage(invitationErrorMessage(error)); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-brand-border bg-brand-surface p-5">
    <h2 className="text-xl font-semibold">Convites pendentes</h2>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void mutate(); }}>
      <label>E-mail<input className="block rounded border p-2" required type="email" maxLength={320} value={email} disabled={busy || !full} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Papel<select className="block rounded border p-2" value={role} disabled={busy || !full} onChange={(event) => setRole(event.target.value as typeof role)}>{actorRole === "owner" && <option value="manager">Gestor(a)</option>}<option value="professional">Profissional</option></select></label>
      <label className="flex gap-2 p-2"><input type="checkbox" checked={clinical} disabled={busy || !full} onChange={(event) => setClinical(event.target.checked)} />Acesso clínico</label>
      <button type="submit" className="rounded bg-[#105576] px-4 py-2 text-white disabled:opacity-50" disabled={busy || !full || unavailable}>Enviar convite</button>
    </form>
    {clinical && <p className="mt-3 text-sm">Este convite reservará 1 licença clínica enquanto estiver válido.</p>}
    {unavailable && <p role="alert" className="mt-2 text-sm">Não há licenças clínicas disponíveis.</p>}
    {!full && <p className="mt-2 text-sm">Novos convites e reenvios exigem acesso pleno da clínica.</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <ul className="mt-4 space-y-3">{rows.map((row) => <li key={row.invitation_id} className="rounded border border-brand-border p-3">
      <p>{row.normalized_email} · {row.intended_role === "manager" ? "Gestor(a)" : "Profissional"} · {row.intended_clinical_access ? "Acesso clínico" : "Administrativo"}</p>
      <p className="text-sm">Convite: pendente · Envio: {row.delivery_status === "sent" ? "enviado" : row.delivery_status === "failed" ? "falhou" : "pendente"} · Expira: {new Date(row.expires_at).toLocaleString("pt-BR")}</p>
      <p className="text-xs">Emissor: {row.invited_by} · Último envio: {row.sent_at ? new Date(row.sent_at).toLocaleString("pt-BR") : "—"}</p>
      <div className="mt-2 flex gap-3"><button disabled={busy || !full} onClick={() => void mutate(row.invitation_id, "resend")}>Reenviar</button><button disabled={busy} onClick={() => { if (window.confirm("Revogar este convite e liberar sua reserva?")) void mutate(row.invitation_id, "revoke"); }}>Revogar</button></div>
    </li>)}</ul>
    {!rows.length && <p className="mt-4 text-sm">Nenhum convite pendente.</p>}
  </section>;
}
