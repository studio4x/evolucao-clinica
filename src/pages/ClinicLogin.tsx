import { Building2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleSecurityModal } from "../components/common/GoogleSecurityModal";
import { SplashScreen } from "../components/layout/SplashScreen";
import { AppVersion } from "../components/layout/AppVersion";
import { publicEffectFlags } from "../config/publicFlags";
import { requestGoogleOAuth } from "../services/googleAuth";
import { supabase } from "../supabaseClient";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import {
  clearClinicLoginIntent,
  getClinicAccessTypeLabel,
  getClinicRoleLabel,
  getClinicWorkspacePath,
  setClinicLoginIntent,
} from "../utils/clinicAccess";

const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha inválidos.";

export default function ClinicLogin() {
  const navigate = useNavigate();
  const { user, isAuthReady } = useAuthStore();
  const { organizations, status, error: contextError, userId, selectContext } = useClinicContextStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [error, setError] = useState("");
  const selectedOrganizationRef = useRef<string | null>(null);

  useEffect(() => {
    setClinicLoginIntent();
  }, []);

  useEffect(() => {
    if (!user || userId !== user.id || status !== "ready" || organizations.length !== 1) return;
    const organization = organizations[0];
    if (selectedOrganizationRef.current === organization.id) return;
    selectedOrganizationRef.current = organization.id;
    selectContext({ type: "organization", organizationId: organization.id });
    clearClinicLoginIntent();
    navigate(getClinicWorkspacePath(organization), { replace: true });
  }, [navigate, organizations, selectContext, status, user, userId]);

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPassword("");
    if (signInError) setError(INVALID_CREDENTIALS_MESSAGE);
    setBusy(false);
  };

  const handleGoogleLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const { error: oauthError } = await requestGoogleOAuth({
      requiredScopes: "login",
      currentGrantedScopes: [],
      redirectTo: `${window.location.origin}/login/clinica`,
    });
    if (oauthError) {
      setError("Não foi possível iniciar o acesso com Google. Tente novamente.");
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    useClinicContextStore.getState().reset();
    clearClinicLoginIntent();
    navigate("/login", { replace: true });
  };

  const handleOrganizationSelection = (organizationId: string) => {
    const organization = organizations.find(({ id }) => id === organizationId);
    if (!organization) return;
    selectContext({ type: "organization", organizationId });
    clearClinicLoginIntent();
    navigate(getClinicWorkspacePath(organization), { replace: true });
  };

  if (!publicEffectFlags.clinicFeature) {
    return <ClinicAccessUnavailable onBack={() => navigate("/login", { replace: true })} />;
  }

  if (!isAuthReady) return <SplashScreen message="Iniciando Evolução Clínica..." />;
  if (user && (status === "idle" || status === "loading" || userId !== user.id)) {
    return <SplashScreen message="Validando seus contextos de acesso..." />;
  }

  if (user && status === "ready" && organizations.length === 0) {
    return <ClinicAccessUnavailable onBack={() => navigate("/login", { replace: true })} onLogout={() => void handleLogout()} />;
  }

  if (user && status === "ready" && organizations.length === 1) {
    return <SplashScreen message="Abrindo sua clínica..." />;
  }

  if (user && status === "error") {
    return <ClinicAccessUnavailable onBack={() => navigate("/login", { replace: true })} message={contextError === "feature_unavailable" ? undefined : "Não foi possível validar o acesso à clínica agora."} />;
  }

  if (user && organizations.length > 1) {
    return (
      <ClinicLoginFrame>
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary"><Building2 size={28} /></div>
          <h1 className="mt-5 text-2xl font-bold text-brand-primary">Escolha a clínica que deseja acessar</h1>
          <p className="mt-2 text-sm leading-6 text-brand-text-muted">Selecione um contexto autorizado para continuar.</p>
        </div>
        <div className="space-y-3">
          {organizations.map((organization) => (
            <button key={organization.id} type="button" onClick={() => handleOrganizationSelection(organization.id)} className="w-full rounded-2xl border border-brand-border bg-white p-4 text-left shadow-sm transition hover:border-brand-primary hover:shadow-md">
              <span className="flex items-start justify-between gap-3"><span className="font-semibold text-brand-text">{organization.tradeName || organization.name}</span><Building2 size={18} className="shrink-0 text-brand-primary" /></span>
              <span className="mt-2 block text-sm text-brand-text-muted">{getClinicRoleLabel(organization.membershipRole)} · {getClinicAccessTypeLabel(organization)}</span>
            </button>
          ))}
        </div>
        <ClinicBackLink />
      </ClinicLoginFrame>
    );
  }

  return (
    <ClinicLoginFrame>
      <div className="mb-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary"><Building2 size={28} /></div>
        <h1 className="mt-5 text-2xl font-bold text-brand-primary">Acesso à Clínica</h1>
        <p className="mt-2 text-sm leading-6 text-brand-text-muted">Entre para acessar o espaço da sua clínica.</p>
      </div>

      <form className="space-y-4" onSubmit={handlePasswordLogin}>
        <label className="block text-sm font-semibold text-brand-text">E-mail<input className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 font-normal outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="block text-sm font-semibold text-brand-text">Senha<input className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3.5 py-3 font-normal outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3.5 text-sm font-bold text-white transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-60"><LogIn size={18} />{busy ? "Entrando..." : "Entrar na clínica"}</button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-brand-text-muted"><span className="h-px flex-1 bg-brand-border" /><span>ou</span><span className="h-px flex-1 bg-brand-border" /></div>
      <button type="button" disabled={busy} onClick={() => setGoogleModalOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-3 text-sm font-semibold text-brand-primary transition hover:border-brand-primary disabled:opacity-60">Continuar com Google</button>
      <div className="mt-5 flex items-start gap-2 rounded-xl bg-brand-bg px-3.5 py-3 text-xs leading-5 text-brand-text-muted"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand-accent" />Sua conta é a mesma do Evolução Clínica. O acesso à clínica é validado pelos vínculos autorizados.</div>
      <ClinicBackLink />
      <GoogleSecurityModal isOpen={googleModalOpen} onClose={() => setGoogleModalOpen(false)} onConfirm={() => void handleGoogleLogin()} mode="login" />
    </ClinicLoginFrame>
  );
}

function ClinicLoginFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-[#edf4fa] px-4 py-8 font-sans"><div className="w-full max-w-md rounded-[28px] border border-brand-border/80 bg-white p-6 shadow-xl shadow-brand-primary/5 sm:p-8"><div className="mb-6 flex items-center justify-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-sm font-bold text-white">EC</div><span className="font-semibold text-brand-primary">Evolução Clínica</span></div>{children}<div className="mt-7 border-t border-brand-border pt-4"><AppVersion /></div></div></div>;
}

function ClinicBackLink() {
  return <Link to="/login" className="mt-6 inline-flex w-full items-center justify-center text-sm font-semibold text-brand-primary hover:underline">Voltar ao acesso normal</Link>;
}

function ClinicAccessUnavailable({ onBack, onLogout, message = "Esta conta não possui acesso ativo a uma clínica." }: { onBack: () => void; onLogout?: () => void; message?: string }) {
  return <ClinicLoginFrame><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Building2 size={28} /></div><h1 className="mt-5 text-2xl font-bold text-brand-primary">Acesso à Clínica</h1><p className="mt-3 text-sm leading-6 text-brand-text-muted">{message}</p><div className="mt-7 space-y-3"><button type="button" onClick={onBack} className="w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-white">Voltar para o acesso normal</button>{onLogout && <button type="button" onClick={onLogout} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border px-4 py-3 text-sm font-semibold text-brand-text"><LogOut size={16} />Sair</button>}</div></div></ClinicLoginFrame>;
}
