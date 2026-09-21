import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, Loader2, LogOut, ShieldCheck, Stethoscope } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { supabase } from "../supabaseClient";
import { invitationRequest, invitationErrorMessage, ClinicInvitationError } from "../services/clinicInvitations";
import { ClinicAccessOptions } from "../components/clinic/ClinicAccessOptions";

type Handoff = { organizationName: string; role: string; clinical: boolean; expiresAt: string };
type InvitationState = "loading_handoff" | "unauthenticated" | "ready_to_accept" | "accepting" | "accepted_loading_context" | "accepted_success" | "accepted_recovery" | "already_completed" | "unavailable" | "fatal_error";

const roleLabel = (role: string) => role === "manager" ? "Gestor(a)" : "Profissional";
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function ClinicInvitationAccept() {
  const { user, isAuthReady } = useAuthStore();
  const clinicContext = useClinicContextStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState<Handoff | null>(null);
  const [phase, setPhase] = useState<InvitationState>("loading_handoff");
  const [acceptedOrganizationId, setAcceptedOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase === "accepting" || phase === "accepted_loading_context" || phase === "accepted_success") return;
    let active = true;
    setPhase("loading_handoff");
    setInfo(null);
    setError("");
    invitationRequest("/handoff").then((data) => {
      if (!active) return;
      setInfo(data);
      setPhase(isAuthReady && !user ? "unauthenticated" : "ready_to_accept");
    }).catch((cause) => {
      if (!active) return;
      const unavailable = cause instanceof ClinicInvitationError && cause.code === "invitation_unavailable";
      const hasExistingClinic = Boolean(user && clinicContext.userId === user.id && clinicContext.status === "ready" && clinicContext.organizations.length > 0);
      setPhase(unavailable && hasExistingClinic ? "already_completed" : unavailable ? "unavailable" : "fatal_error");
      setError(invitationErrorMessage(cause));
    });
    return () => { active = false; };
  }, [isAuthReady, user?.id]);

  useEffect(() => {
    if (info && phase === "loading_handoff" && isAuthReady) setPhase(user ? "ready_to_accept" : "unauthenticated");
  }, [info, isAuthReady, phase, user]);

  const openClinic = async (organizationId: string, accessToken: string) => {
    if (!user || useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
    await useClinicContextStore.getState().hydrateAcceptedClinicContext(user.id, accessToken, organizationId);
    if (useAuthStore.getState().user?.id !== user.id) throw new Error("authentication_required");
  };

  const retryClinic = async () => {
    if (phase === "accepted_loading_context" || !user || !acceptedOrganizationId) return;
    setPhase("accepted_loading_context");
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== user.id) throw new Error("authentication_required");
      await openClinic(acceptedOrganizationId, data.session.access_token);
      setPhase("accepted_success");
      navigate("/painel/clinica", { replace: true });
    } catch {
      setPhase("accepted_recovery");
    }
  };

  const accept = async () => {
    if (phase !== "ready_to_accept" || !user) return;
    setPhase("accepting");
    setError("");
    let acceptedId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== user.id) throw new Error("authentication_required");
      // This is the only accept call. Recovery below never submits the invite again.
      const result = await invitationRequest("/accept", data.session.access_token, {});
      acceptedId = result.organizationId;
      setAcceptedOrganizationId(acceptedId);
      setPhase("accepted_loading_context");
      await openClinic(acceptedId, data.session.access_token);
      setPhase("accepted_success");
      navigate("/painel/clinica", { replace: true });
    } catch (cause) {
      setPhase(acceptedId ? "accepted_recovery" : "fatal_error");
      setError(acceptedId ? "" : invitationErrorMessage(cause));
    }
  };

  const logout = async () => {
    if (phase === "accepting" || phase === "accepted_loading_context") return;
    setError("");
    try {
      await supabase.auth.signOut();
      navigate("/login?next=%2Fpainel%2Fconvite-clinica", { replace: true });
    } catch (cause) {
      setPhase("fatal_error");
      setError(invitationErrorMessage(cause));
    }
  };

  const isAccepted = ["accepted_loading_context", "accepted_success", "accepted_recovery"].includes(phase);
  const canLogout = !["accepting", "accepted_loading_context"].includes(phase);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-8 text-brand-text sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col justify-center">
        <header className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-sm"><Stethoscope size={23} /></div>
          <div><p className="font-display text-lg font-bold text-brand-primary">Evolução Clínica</p><p className="text-xs text-brand-text-muted">Acesso seguro para profissionais</p></div>
        </header>
        <section className="rounded-3xl border border-brand-border/70 bg-white/95 p-6 shadow-xl shadow-sky-100/70 sm:p-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-brand-primary"><ShieldCheck size={14} /> CONVITE PARA CLÍNICA</div>

          {phase === "loading_handoff" && <StatusBlock title="Preparando seu convite" text="Estamos validando seu acesso de forma segura." loading />}
          {phase === "unauthenticated" && <><h1 className="font-display text-3xl font-bold text-brand-primary">{info?.organizationName}</h1><p className="mt-3 text-base leading-7 text-brand-text-muted">Você foi convidado para fazer parte desta clínica no Evolução Clínica.</p><InviteDetails info={info} /><p className="mt-6 text-sm text-brand-text-muted">Entre ou crie sua conta para continuar usando o mesmo e-mail que recebeu o convite.</p><ClinicAccessOptions /></>}
          {phase === "ready_to_accept" && <><h1 className="font-display text-3xl font-bold text-brand-primary">{info?.organizationName}</h1><p className="mt-3 text-base leading-7 text-brand-text-muted">Você foi convidado para fazer parte desta clínica no Evolução Clínica.</p><InviteDetails info={info} /><div className="mt-8 flex flex-col gap-3"><button type="button" className="min-h-11 rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:opacity-60" onClick={() => void accept()}>Aceitar convite</button><button type="button" className="min-h-11 rounded-xl border border-brand-border px-5 py-3 font-semibold text-brand-primary transition hover:bg-brand-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary" onClick={() => void logout()}>Sair e acessar com outra conta</button></div></>}
          {phase === "accepting" && <StatusBlock title="Confirmando seu acesso" text="Estamos preparando seu acesso à clínica." loading />}
          {phase === "accepted_loading_context" && <StatusBlock title="Convite aceito" text="Estamos preparando seu acesso à clínica." loading />}
          {phase === "accepted_success" && <StatusBlock title="Convite aceito" text="Seu acesso à clínica foi confirmado." success />}
          {phase === "accepted_recovery" && <><StatusBlock title="Convite aceito" text="Seu acesso foi confirmado. Só falta atualizar o ambiente da clínica." /><div className="mt-7 flex flex-col gap-3"><button type="button" className="min-h-11 rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary" onClick={() => void retryClinic()}>Atualizar acesso</button><button type="button" className="min-h-11 rounded-xl border border-brand-border px-5 py-3 font-semibold text-brand-primary" onClick={() => void logout()}>Sair e acessar com outra conta</button></div></>}
          {phase === "already_completed" && <><StatusBlock title="Convite já aceito" text="Sua conta já possui acesso a uma clínica." success /><Link className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white" to="/painel/clinica">Acessar clínica</Link></>}
          {(phase === "unavailable" || phase === "fatal_error") && <StatusBlock title="Não foi possível validar este convite" text={error || "Ele pode ter expirado, sido utilizado ou substituído."} />}
          {error && ["fatal_error", "unavailable"].includes(phase) && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {isAccepted && canLogout && <button type="button" className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-border px-5 py-3 font-semibold text-brand-primary" onClick={() => void logout()}><LogOut size={17} /> Sair e acessar com outra conta</button>}
        </section>
      </div>
    </main>
  );
}

function InviteDetails({ info }: { info: Handoff | null }) {
  if (!info) return null;
  return <div className="mt-7 grid gap-3 sm:grid-cols-3">
    <Detail label="Função" value={roleLabel(info.role)} />
    <Detail label="Acesso" value={info.clinical ? "Acesso clínico" : "Acesso administrativo"} />
    <Detail label="Validade" value={dateLabel(info.expiresAt)} icon={<Clock3 size={14} />} />
  </div>;
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-brand-border/70 bg-brand-bg/40 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-brand-text-muted">{label}</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-primary">{icon}{value}</p></div>;
}

function StatusBlock({ title, text, loading, success }: { title: string; text: string; loading?: boolean; success?: boolean }) {
  return <div className="py-5 text-center"><div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${success ? "bg-emerald-50 text-emerald-600" : "bg-sky-50 text-brand-primary"}`}>{success ? <CheckCircle2 size={34} /> : loading ? <Loader2 size={30} className="animate-spin" /> : <ShieldCheck size={30} />}</div><h1 className="mt-5 font-display text-2xl font-bold text-brand-primary">{title}</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-brand-text-muted">{text}</p></div>;
}
