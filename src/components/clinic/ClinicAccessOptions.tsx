import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { publicEffectFlags } from "../../config/publicFlags";
import { supabase } from "../../supabaseClient";
import { useAuthStore } from "../../store/authStore";
import { useClinicContextStore } from "../../store/clinicContextStore";
import { selectAcceptedClinicContext } from "../../utils/clinicInvitationAccess";

// Entry into server-resolved memberships never approves the personal account.
export function ClinicAccessOptions() {
  const { user, isAuthReady } = useAuthStore();
  const { organizations, userId, status } = useClinicContextStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!publicEffectFlags.clinicFeature || !isAuthReady || !user
    || userId !== user.id || (!busy && status !== "error" && (status !== "ready" || organizations.length === 0))) return null;

  const enter = async (organizationId?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session || data.session.user.id !== user.id) throw new Error("authentication_required");
      if (useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
      await useClinicContextStore.getState().refreshAfterMutation(user.id, data.session.access_token);
      const refreshed = useClinicContextStore.getState();
      if (refreshed.userId !== user.id || refreshed.status !== "ready") throw new Error("context_unavailable");
      if (useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
      if (!organizationId) return;
      selectAcceptedClinicContext(refreshed, organizationId);
      const selected = useClinicContextStore.getState().activeContext;
      if (selected.type !== "organization" || selected.organizationId !== organizationId) throw new Error("context_unavailable");
      navigate("/painel/clinica", { replace: true });
    } catch {
      setError("Não foi possível confirmar seu acesso à clínica. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="my-4 w-full text-left" aria-label="Acesso às clínicas">
    <h2 className="font-semibold">Acessar uma clínica</h2>
    <p className="mt-2 text-sm">Escolha uma clínica à qual você já possui acesso.</p>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {busy && <p role="status" className="mt-2 text-sm">Validando seu acesso à clínica…</p>}
    <div className="mt-3 flex flex-col gap-3">
      {status === "error" && <button type="button" disabled={busy} onClick={() => void enter()}
        className="rounded border border-[#105576] p-3 disabled:opacity-50">Atualizar acesso às clínicas</button>}
      {organizations.map((organization) => <button key={organization.id} type="button"
        disabled={busy} onClick={() => void enter(organization.id)}
        className="rounded bg-[#105576] p-3 text-white disabled:opacity-50">
        Acessar {organization.tradeName || organization.name}
      </button>)}
    </div>
  </section>;
}
