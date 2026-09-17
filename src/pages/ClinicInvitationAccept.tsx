import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { invitationRequest, invitationErrorMessage } from "../services/clinicInvitations";
import { selectAcceptedClinicContext } from "../utils/clinicInvitationAccess";
import { ClinicAccessOptions } from "../components/clinic/ClinicAccessOptions";

type Handoff = { organizationName: string; role: string; clinical: boolean; expiresAt: string };
export default function ClinicInvitationAccept() {
  const { user, isAuthReady } = useAuthStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Handoff | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedOrganizationId, setAcceptedOrganizationId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setInfo(null);
    setError("");
    setAcceptedOrganizationId(null);
    invitationRequest("/handoff").then((data) => { if (active) setInfo(data); }).catch((cause) => { if (active) setError(invitationErrorMessage(cause)); });
    return () => { active = false; };
  }, [user?.id]);
  const openClinic = async (organizationId: string, accessToken: string) => {
    if (!user || useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
    const store = useClinicContextStore.getState();
    await store.refreshAfterMutation(user.id, accessToken);
    const refreshed = useClinicContextStore.getState();
    if (refreshed.userId !== user.id || refreshed.status !== "ready") throw new Error("context_unavailable");
    if (useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
    selectAcceptedClinicContext(refreshed, organizationId);
    const selected = useClinicContextStore.getState().activeContext;
    if (selected.type !== "organization" || selected.organizationId !== organizationId) throw new Error("context_unavailable");
    navigate("/painel/clinica", { replace: true });
  };
  const retryClinic = async () => {
    if (busy || !user || !acceptedOrganizationId) return;
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== user.id) throw new Error("authentication_required");
      await openClinic(acceptedOrganizationId, data.session.access_token);
    } catch {
      setError("Seu convite já foi aceito, mas não foi possível carregar a clínica. Tente novamente.");
    } finally { setBusy(false); }
  };
  const accept = async () => {
    if (busy || !user) return;
    setBusy(true); setError("");
    let accepted = false;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== user.id) throw new Error("authentication_required");
      const result = await invitationRequest("/accept", data.session.access_token, {});
      accepted = true;
      setAcceptedOrganizationId(result.organizationId);
      await openClinic(result.organizationId, data.session.access_token);
    } catch (cause) {
      setError(accepted
        ? "Seu convite já foi aceito, mas não foi possível carregar a clínica. Tente novamente."
        : invitationErrorMessage(cause));
    }
    finally { setBusy(false); }
  };
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await supabase.auth.signOut();
      navigate("/login?next=%2Fpainel%2Fconvite-clinica", { replace: true });
    } catch (cause) {
      setError(invitationErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return <main className="mx-auto max-w-lg p-6 text-[#105576]">
    <h1 className="text-2xl font-semibold">Convite para a clínica</h1>
    {error && <p role="alert" className="mt-4">{error}</p>}
    {!info && !error && !acceptedOrganizationId && <p className="mt-4">Carregando convite…</p>}
    {acceptedOrganizationId && <><p role="status" className="mt-4">Convite aceito com sucesso.</p><button type="button" className="mt-4 rounded bg-[#105576] p-3 text-white disabled:opacity-50" disabled={busy} onClick={() => void retryClinic()}>Acessar clínica</button></>}
    {!info && !acceptedOrganizationId && <ClinicAccessOptions />}
    {info && !acceptedOrganizationId && <><h2 className="mt-4 text-xl">{info.organizationName}</h2><p>{info.role === "manager" ? "Gestor(a)" : "Profissional"} · {info.clinical ? "Com acesso clínico" : "Somente acesso administrativo"}</p><p>Válido até {new Date(info.expiresAt).toLocaleString("pt-BR")}</p>
      {isAuthReady && !user ? <><p className="mt-4">Entre ou crie sua conta para continuar.</p><p>Use o mesmo e-mail que recebeu o convite. O acesso ou cadastro utiliza sua conta Google.</p><div className="mt-4 flex gap-4"><Link to="/login?next=%2Fpainel%2Fconvite-clinica">Entrar</Link><Link to="/login?next=%2Fpainel%2Fconvite-clinica">Criar conta</Link></div></> : user && <><p className="mt-4">Confirme para aceitar o convite com o e-mail da sua conta atual.</p><div className="mt-4 flex flex-col gap-3"><button className="rounded bg-[#105576] p-3 text-white disabled:opacity-50" disabled={busy} onClick={() => void accept()}>Aceitar convite</button><button type="button" className="rounded border border-[#105576] p-3 text-[#105576] transition hover:bg-white disabled:opacity-50" disabled={busy} onClick={() => void logout()}>Sair e acessar com outra conta</button></div></>}
    </>}
    {isAuthReady && (!info || acceptedOrganizationId) && <button type="button" className="mt-4 rounded border border-[#105576] p-3 text-[#105576] transition hover:bg-white disabled:opacity-50" disabled={busy} onClick={() => void logout()}>Sair e acessar com outra conta</button>}
  </main>;
}
