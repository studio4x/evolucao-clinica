import type { ClinicOrganization } from "../services/clinicContext";

export const CLINIC_LOGIN_INTENT_KEY = "clinic_login_intent";

export function setClinicLoginIntent() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CLINIC_LOGIN_INTENT_KEY, "true");
  } catch {
    // A intenção é apenas uma preferência de navegação; a autorização vem do servidor.
  }
}

export function clearClinicLoginIntent() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CLINIC_LOGIN_INTENT_KEY);
  } catch {
    // Best effort only.
  }
}

export function hasAuthorizedOrganizationAccess(input: {
  featureEnabled: boolean;
  contextStatus: string;
  contextUserId: string | null;
  userId: string;
  activeContext: { type: string; organizationId?: string };
  organizations: Array<{ id: string }>;
}) {
  return input.featureEnabled
    && input.contextStatus === "ready"
    && input.contextUserId === input.userId
    && input.activeContext.type === "organization"
    && input.organizations.some(({ id }) => id === input.activeContext.organizationId);
}

export function getClinicWorkspacePath(organization: Pick<ClinicOrganization, "membershipRole">) {
  return ["owner", "manager"].includes(organization.membershipRole)
    ? "/painel/clinica"
    : "/painel/clinica/pacientes";
}

export function getClinicRoleLabel(role: string) {
  return role === "owner" ? "Proprietário" : role === "manager" ? "Gestor" : "Profissional";
}

export function getClinicAccessTypeLabel(organization: Pick<ClinicOrganization, "membershipRole" | "clinicalAccessEnabled">) {
  return ["owner", "manager"].includes(organization.membershipRole) && !organization.clinicalAccessEnabled
    ? "Administrativo"
    : "Clínico";
}
