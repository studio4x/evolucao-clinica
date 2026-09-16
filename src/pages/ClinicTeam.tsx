import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CheckCircle2, CircleSlash, Crown, Loader2, ShieldCheck, UserRound, UserRoundCog, Users, XCircle } from "lucide-react";
import { PanelPageHeader } from "../components/layout/PanelPageHeader";
import { showAlert, showConfirm, showPrompt } from "../store/modalStore";
import { useAuthStore } from "../store/authStore";
import { useClinicContextStore } from "../store/clinicContextStore";
import { publicEffectFlags } from "../config/publicFlags";
import { supabase } from "../supabaseClient";
import {
  changeClinicTeamRole,
  ClinicTeamApiError,
  fetchClinicTeam,
  mutateClinicTeamMember,
  transferClinicOwner,
  type ClinicTeamMember,
} from "../services/clinicTeam";
import {
  ClinicEntitlementApiError,
  fetchClinicEntitlement,
  setClinicMemberClinicalAccess,
  type ClinicSeatSummary,
} from "../services/clinicEntitlement";

function memberLabel(member: ClinicTeamMember) {
  return member.full_name?.trim() || "Profissional";
}

function roleLabel(role: ClinicTeamMember["membership_role"]) {
  return role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Professional";
}

function statusLabel(status: ClinicTeamMember["status"]) {
  return status === "suspended" ? "Suspenso" : "Ativo";
}

function formatJoinedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

export default function ClinicTeam() {
  const user = useAuthStore((state) => state.user);
  const { organizations, activeContext, revalidateForUser } = useClinicContextStore();
  const [members, setMembers] = useState<ClinicTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProfessionalId, setBusyProfessionalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seatSummary, setSeatSummary] = useState<ClinicSeatSummary | null>(null);

  const organizationId = activeContext.type === "organization" ? activeContext.organizationId : null;
  const organization = organizationId ? organizations.find(({ id }) => id === organizationId) : null;
  const actorRole = organization?.membershipRole;
  const isAdmin = actorRole === "owner" || actorRole === "manager";

  const loadTeam = useCallback(async () => {
    if (!user || !organizationId || !isAdmin) return;
    const requestOrganizationId = organizationId;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || session.user.id !== user.id) throw new ClinicTeamApiError(401, "authentication_required");
      const [nextMembers, nextSeatSummary] = await Promise.all([
        fetchClinicTeam(session.access_token, requestOrganizationId),
        fetchClinicEntitlement(session.access_token, requestOrganizationId),
      ]);
      const currentContext = useClinicContextStore.getState().activeContext;
      if (currentContext.type === "organization" && currentContext.organizationId === requestOrganizationId) {
        setMembers(nextMembers);
        setSeatSummary(nextSeatSummary);
      }
    } catch (cause) {
      const teamError = cause instanceof ClinicTeamApiError ? cause : new ClinicTeamApiError(503, "team_operation_failed");
      setMembers([]);
      setSeatSummary(null);
      setError(teamError.code);
      if (teamError.status === 401 || teamError.status === 403) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id === user.id) await revalidateForUser(user.id, session.access_token);
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, organizationId, revalidateForUser, user]);

  useEffect(() => {
    setMembers([]);
    void loadTeam();
  }, [loadTeam]);

  const refreshAfterMutation = useCallback(async () => {
    await loadTeam();
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || session.user.id !== user.id) return;
    await revalidateForUser(user.id, session.access_token);
    if (useClinicContextStore.getState().activeContext.type !== "organization") {
      setMembers([]);
      return;
    }
    await loadTeam();
  }, [loadTeam, revalidateForUser, user]);

  const runMemberAction = useCallback(async (
    member: ClinicTeamMember,
    action: "suspend" | "reactivate" | "remove",
  ) => {
    if (!organizationId || !user || busyProfessionalId) return;
    const actionLabel = action === "suspend" ? "suspender" : action === "reactivate" ? "reativar" : "remover da clínica";
    const message = action === "remove"
      ? `Você está prestes a remover ${memberLabel(member)} da clínica. A membership será preservada como histórico e não poderá ser reutilizada. Deseja continuar?`
      : `Deseja ${actionLabel} ${memberLabel(member)}?`;
    const confirmed = await showConfirm(message, {
      title: action === "remove" ? "Remover da clínica" : action === "suspend" ? "Suspender membro" : "Reativar membro",
      confirmLabel: action === "remove" ? "Remover da clínica" : action === "suspend" ? "Suspender" : "Reativar",
      cancelLabel: "Cancelar",
      variant: action === "remove" ? "danger" : "warning",
      icon: action === "remove" ? "trash" : "question",
    });
    if (!confirmed) return;
    const reason = await showPrompt("Motivo opcional para o registro administrativo:", {
      title: "Registrar motivo",
      confirmLabel: "Continuar",
      cancelLabel: "Pular",
      placeholder: "Motivo (opcional)",
      icon: "info",
    });
    setBusyProfessionalId(member.professional_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || session.user.id !== user.id) throw new Error("authentication_required");
      await mutateClinicTeamMember(session.access_token, organizationId, member.professional_id, action, reason || undefined);
      await refreshAfterMutation();
    } catch (cause) {
      await showAlert(cause instanceof ClinicTeamApiError && cause.status === 403
        ? "Esta ação não está autorizada para o seu papel ou o membro já mudou de estado. A equipe será atualizada."
        : "Não foi possível atualizar a membership. A equipe será atualizada.", {
        title: "Ação não concluída",
        variant: "danger",
        icon: "warning",
      });
      await refreshAfterMutation();
    } finally {
      setBusyProfessionalId(null);
    }
  }, [busyProfessionalId, organizationId, refreshAfterMutation, user]);

  const runRoleChange = useCallback(async (member: ClinicTeamMember, newRole: "manager" | "professional") => {
    if (!organizationId || !user || busyProfessionalId || member.membership_role === newRole) return;
    const confirmed = await showConfirm(
      `Alterar ${memberLabel(member)} de ${roleLabel(member.membership_role)} para ${roleLabel(newRole)}?`,
      { title: "Alterar papel", confirmLabel: "Alterar papel", cancelLabel: "Cancelar", variant: "info", icon: "question" },
    );
    if (!confirmed) return;
    const reason = await showPrompt("Motivo opcional para o registro administrativo:", {
      title: "Registrar motivo",
      confirmLabel: "Continuar",
      cancelLabel: "Pular",
      placeholder: "Motivo (opcional)",
      icon: "info",
    });
    setBusyProfessionalId(member.professional_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || session.user.id !== user.id) throw new Error("authentication_required");
      await changeClinicTeamRole(session.access_token, organizationId, member.professional_id, newRole, reason || undefined);
      await refreshAfterMutation();
    } catch {
      await showAlert("Não foi possível alterar o papel. A equipe será atualizada.", { title: "Papel não alterado", variant: "danger", icon: "warning" });
      await refreshAfterMutation();
    } finally {
      setBusyProfessionalId(null);
    }
  }, [busyProfessionalId, organizationId, refreshAfterMutation, user]);

  const runOwnerTransfer = useCallback(async (member: ClinicTeamMember) => {
    if (!organizationId || !user || busyProfessionalId || actorRole !== "owner") return;
    const confirmed = await showConfirm(
      `Novo owner: ${memberLabel(member)}. Você continuará como manager e o acesso clínico atual de ambos não será alterado. Confirmar transferência?`,
      { title: "Transferir ownership", confirmLabel: "Transferir ownership", cancelLabel: "Cancelar", variant: "warning", icon: "shield" },
    );
    if (!confirmed) return;
    setBusyProfessionalId(member.professional_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || session.user.id !== user.id) throw new Error("authentication_required");
      await transferClinicOwner(session.access_token, organizationId, member.professional_id);
      await refreshAfterMutation();
    } catch {
      await showAlert("A transferência não foi concluída. A equipe será atualizada.", { title: "Ownership não transferido", variant: "danger", icon: "warning" });
      await refreshAfterMutation();
    } finally {
      setBusyProfessionalId(null);
    }
  }, [actorRole, busyProfessionalId, organizationId, refreshAfterMutation, user]);

  const runClinicalAccessChange = useCallback(async (member: ClinicTeamMember) => {
    if (!organizationId || !user || actorRole !== "owner" || member.status !== "active" || busyProfessionalId) return;
    const enabled = !member.clinical_access_enabled;
    if (enabled && seatSummary && seatSummary.available_seats < 1) {
      await showAlert("Não há licenças disponíveis para habilitar o acesso clínico. Gerenciamento de quantidade será disponibilizado em etapa posterior.", {
        title: "Nenhuma licença disponível", variant: "warning", icon: "info",
      });
      return;
    }
    const confirmed = await showConfirm(
      `${enabled ? "Habilitar" : "Desabilitar"} o acesso clínico de ${memberLabel(member)}?`,
      { title: enabled ? "Habilitar acesso clínico" : "Desabilitar acesso clínico", confirmLabel: enabled ? "Habilitar" : "Desabilitar", cancelLabel: "Cancelar", variant: enabled ? "info" : "warning", icon: "question" },
    );
    if (!confirmed) return;
    const reason = await showPrompt("Motivo opcional para o registro administrativo:", {
      title: "Registrar motivo", confirmLabel: "Continuar", cancelLabel: "Pular", placeholder: "Motivo (opcional)", icon: "info",
    });
    setBusyProfessionalId(member.professional_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || session.user.id !== user.id) throw new Error("authentication_required");
      await setClinicMemberClinicalAccess(session.access_token, organizationId, member.professional_id, enabled, reason || undefined);
      await refreshAfterMutation();
    } catch (cause) {
      await showAlert(cause instanceof ClinicEntitlementApiError && cause.status === 409
        ? "Não há licenças disponíveis para habilitar o acesso clínico. Gerenciamento de quantidade será disponibilizado em etapa posterior."
        : "Não foi possível atualizar o acesso clínico. A equipe será atualizada.", {
          title: "Acesso clínico não alterado", variant: "danger", icon: "warning",
        });
      await refreshAfterMutation();
    } finally {
      setBusyProfessionalId(null);
    }
  }, [actorRole, busyProfessionalId, organizationId, refreshAfterMutation, seatSummary, user]);

  const visibleMembers = useMemo(() => members.filter((member) => member.status === "active" || member.status === "suspended"), [members]);

  if (!publicEffectFlags.clinicFeature) return <Navigate to="/painel/dashboard" replace />;
  if (!organization || !isAdmin) return <Navigate to="/painel/clinica" replace />;

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title="Equipe"
        description={`Membros administrativos de ${organization.tradeName || organization.name}.`}
        icon={Users}
      />

      {seatSummary?.entitlement_mode === "restricted" && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Clínica em modo restrito. Ações de expansão permanecem desabilitadas.
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Não foi possível carregar a equipe agora. O contexto será revalidado antes de novas ações.
        </div>
      )}

      <section className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm sm:p-6" aria-labelledby="team-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-text-muted">Contexto organizacional</p>
            <h2 id="team-heading" className="mt-1 text-xl font-bold text-brand-text">{organization.tradeName || organization.name}</h2>
            <p className="mt-1 text-sm text-brand-text-muted">Seu papel: {roleLabel(actorRole as ClinicTeamMember["membership_role"])}</p>
          </div>
          <button type="button" onClick={() => void loadTeam()} disabled={loading} className="min-h-11 rounded-xl border border-brand-border px-4 py-2 text-sm font-semibold text-brand-text transition hover:bg-brand-bg disabled:cursor-wait disabled:opacity-60">
            {loading ? <Loader2 className="mr-2 inline animate-spin" size={16} aria-hidden="true" /> : null}
            Atualizar equipe
          </button>
        </div>

        {seatSummary && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo de licenças">
            <SeatMetric label="Licenças contratadas" value={seatSummary.contracted_seats} />
            <SeatMetric label="Licenças em uso" value={seatSummary.active_seats} />
            <SeatMetric label="Licenças reservadas" value={seatSummary.reserved_seats} />
            <SeatMetric label="Licenças disponíveis" value={seatSummary.available_seats} />
          </div>
        )}

        {loading && visibleMembers.length === 0 ? (
          <div className="flex items-center gap-3 py-12 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={20} aria-hidden="true" />Carregando equipe…</div>
        ) : visibleMembers.length === 0 ? (
          <p className="py-12 text-center text-sm text-brand-text-muted">Nenhum membro disponível.</p>
        ) : (
          <>
            <div className="mt-6 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Membros da equipe da clínica</caption>
                <thead><tr className="border-b border-brand-border text-xs uppercase tracking-wide text-brand-text-muted"><th className="px-3 py-3">Membro</th><th className="px-3 py-3">Papel</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Acesso clínico</th><th className="px-3 py-3">Ações</th></tr></thead>
                <tbody>{visibleMembers.map((member) => <TeamRow key={member.membership_id} member={member} actorRole={actorRole as "owner" | "manager"} actorId={user?.id} busy={busyProfessionalId === member.professional_id} onAction={runMemberAction} onRoleChange={runRoleChange} onTransfer={runOwnerTransfer} onClinicalAccess={runClinicalAccessChange} entitlementMode={seatSummary?.entitlement_mode || "none"} availableSeats={seatSummary?.available_seats ?? 0} />)}</tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-3 md:hidden">{visibleMembers.map((member) => <TeamCard key={member.membership_id} member={member} actorRole={actorRole as "owner" | "manager"} actorId={user?.id} busy={busyProfessionalId === member.professional_id} onAction={runMemberAction} onRoleChange={runRoleChange} onTransfer={runOwnerTransfer} onClinicalAccess={runClinicalAccessChange} entitlementMode={seatSummary?.entitlement_mode || "none"} availableSeats={seatSummary?.available_seats ?? 0} />)}</div>
          </>
        )}
      </section>
    </div>
  );
}

type TeamActionsProps = {
  member: ClinicTeamMember;
  actorRole: "owner" | "manager";
  actorId?: string;
  busy: boolean;
  onAction: (member: ClinicTeamMember, action: "suspend" | "reactivate" | "remove") => void;
  onRoleChange: (member: ClinicTeamMember, role: "manager" | "professional") => void;
  onTransfer: (member: ClinicTeamMember) => void;
  onClinicalAccess: (member: ClinicTeamMember) => void;
  entitlementMode: "full" | "restricted" | "none";
  availableSeats: number;
};

function canManage(actorRole: TeamActionsProps["actorRole"], member: ClinicTeamMember, actorId?: string) {
  if (member.professional_id === actorId || member.membership_role === "owner") return false;
  return actorRole === "owner" || member.membership_role === "professional";
}

function TeamActions({ member, actorRole, actorId, busy, onAction, onRoleChange, onTransfer, onClinicalAccess, entitlementMode, availableSeats }: TeamActionsProps) {
  const allowed = canManage(actorRole, member, actorId);
  const canManageClinical = actorRole === "owner" && member.status === "active";
  if (!allowed && !canManageClinical) return <span className="text-xs text-brand-text-muted">Sem ações</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actorRole === "owner" && member.status === "active" && (
        <select aria-label={`Alterar papel de ${memberLabel(member)}`} value={member.membership_role} disabled={busy} onChange={(event) => void onRoleChange(member, event.target.value as "manager" | "professional")} className="min-h-10 rounded-lg border border-brand-border bg-white px-2 text-xs text-brand-text focus:border-brand-primary focus:outline-none">
          <option value="professional">Professional</option>
          <option value="manager">Manager</option>
        </select>
      )}
      {member.status === "active" ? <button type="button" onClick={() => void onAction(member, "suspend")} disabled={busy} className="min-h-10 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60">Suspender</button> : <button type="button" onClick={() => void onAction(member, "reactivate")} disabled={busy} className="min-h-10 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">Reativar</button>}
      <button type="button" onClick={() => void onAction(member, "remove")} disabled={busy} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Remover da clínica</button>
      {actorRole === "owner" && member.status === "active" && <button type="button" onClick={() => void onTransfer(member)} disabled={busy} className="min-h-10 rounded-lg border border-brand-border px-3 text-xs font-semibold text-brand-primary hover:bg-brand-bg disabled:opacity-60">Transferir ownership</button>}
      {canManageClinical && (member.clinical_access_enabled || entitlementMode === "full") && <button type="button" onClick={() => void onClinicalAccess(member)} disabled={busy || (!member.clinical_access_enabled && availableSeats < 1)} title={!member.clinical_access_enabled && availableSeats < 1 ? "Não há licenças disponíveis para habilitar o acesso clínico." : undefined} className="min-h-10 rounded-lg border border-brand-primary/30 px-3 text-xs font-semibold text-brand-primary hover:bg-brand-bg disabled:cursor-not-allowed disabled:opacity-60">{member.clinical_access_enabled ? "Desabilitar acesso clínico" : "Habilitar acesso clínico"}</button>}
    </div>
  );
}

function MemberIdentity({ member }: { member: ClinicTeamMember }) {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-bg text-brand-primary"><UserRound size={18} aria-hidden="true" /></span><span><span className="block font-semibold text-brand-text">{memberLabel(member)}</span><span className="block text-xs text-brand-text-muted">{member.professional_title || "Profissional"}{member.joined_at ? ` · Desde ${formatJoinedAt(member.joined_at)}` : ""}</span></span></div>;
}

function MemberStatus({ status }: { status: ClinicTeamMember["status"] }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status === "suspended" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{status === "suspended" ? <CircleSlash size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}{statusLabel(status)}</span>;
}

function TeamRow(props: TeamActionsProps) {
  const { member, actorRole, actorId, busy, onAction, onRoleChange, onTransfer, onClinicalAccess, entitlementMode, availableSeats } = props;
  return <tr className="border-b border-brand-border/70 align-top last:border-0"><td className="px-3 py-4"><MemberIdentity member={member} /></td><td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 text-sm text-brand-text">{member.membership_role === "owner" ? <Crown size={15} aria-hidden="true" /> : member.membership_role === "manager" ? <UserRoundCog size={15} aria-hidden="true" /> : <UserRound size={15} aria-hidden="true" />}{roleLabel(member.membership_role)}</span></td><td className="px-3 py-4"><MemberStatus status={member.status} /></td><td className="px-3 py-4 text-sm text-brand-text">{member.clinical_access_enabled ? "Habilitado" : "Não habilitado"}</td><td className="px-3 py-4"><TeamActions {...props} /></td></tr>;
}

function TeamCard(props: TeamActionsProps) {
  const { member } = props;
  return <article className="rounded-2xl border border-brand-border p-4"><MemberIdentity member={member} /><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-brand-text-muted">Papel</dt><dd className="mt-1 font-semibold text-brand-text">{roleLabel(member.membership_role)}</dd></div><div><dt className="text-xs text-brand-text-muted">Status</dt><dd className="mt-1"><MemberStatus status={member.status} /></dd></div><div><dt className="text-xs text-brand-text-muted">Acesso clínico</dt><dd className="mt-1 font-semibold text-brand-text">{member.clinical_access_enabled ? "Habilitado" : "Não habilitado"}</dd></div></dl><div className="mt-4"><TeamActions {...props} /></div></article>;
}

function SeatMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-brand-border bg-brand-bg/40 p-3"><p className="text-xs text-brand-text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-brand-text">{value}</p></div>;
}
