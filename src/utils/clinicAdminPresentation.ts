export const clinicRoleLabel: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gestor",
  professional: "Profissional",
};

export const clinicMemberStatusLabel: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  removed: "Removido",
};

export const clinicEntitlementLabel: Record<string, string> = {
  full: "Acesso completo",
  restricted: "Acesso restrito",
  none: "Indisponível",
};

export const clinicPlanLabel: Record<string, string> = {
  clinic_monthly: "Plano Clínica Mensal",
  clinic_yearly: "Plano Clínica Anual",
};

export const clinicBillingIntervalLabel: Record<string, string> = {
  month: "Mensal",
  year: "Anual",
  monthly: "Mensal",
  yearly: "Anual",
};

export const clinicAssignmentRoleLabel: Record<string, string> = {
  primary: "Principal",
  secondary: "Secundário",
  consultant: "Consultor",
};

export const clinicMembershipRoleLabel: Record<string, string> = clinicRoleLabel;

export const clinicBillingErrorLabel: Record<string, string> = {
  clinic_billing_disabled: "Alterações de cobrança estão temporariamente indisponíveis.",
  payment_action_required: "O pagamento da alteração precisa ser concluído.",
  billing_operation_in_progress: "Já existe uma alteração de cobrança em andamento.",
};

export function getClinicPlanLabel(planCode: string | null | undefined) {
  return (planCode && clinicPlanLabel[planCode]) || "Plano Clínica";
}

export function getClinicBillingIntervalLabel(interval: string | null | undefined) {
  return (interval && clinicBillingIntervalLabel[interval]) || "Não informado";
}

export function getClinicAssignmentRoleLabel(role: string | null | undefined) {
  return (role && clinicAssignmentRoleLabel[role]) || "Profissional";
}

export function getClinicMembershipRoleLabel(role: string | null | undefined) {
  return (role && clinicMembershipRoleLabel[role]) || "Profissional";
}

export function getClinicBillingErrorLabel(code: string | null | undefined) {
  if (!code) return null;
  return clinicBillingErrorLabel[code] || null;
}

export const clinicFinancialStatusLabel: Record<string, string> = {
  active: "Ativo",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
  pending_setup: "Configuração pendente",
  unpaid: "Não pago",
};

type ClinicAccess = {
  role: string;
  clinicalAccessEnabled: boolean;
  licenseActive?: boolean;
};

export function getClinicAccessLabel(access: ClinicAccess) {
  if (["owner", "manager"].includes(access.role) && !access.clinicalAccessEnabled) return "Acesso administrativo";
  return access.licenseActive === true ? "Licença ativa" : "Sem licença clínica";
}

export type AdminClinicAffiliation = ClinicAccess & {
  organizationId: string;
  name: string;
  planLabel?: string | null;
  currentPeriodEnd?: string | null;
};

export type AdminExpiryLine = { key: string; label?: string; value: string; expired?: boolean };

export function getAdminExpiryLines(professional: {
  professional_access_mode?: "personal" | "hybrid" | "clinic_only";
  subscription_plan?: string;
  subscription_ends_at?: string;
  clinics?: AdminClinicAffiliation[];
}, now = new Date()): AdminExpiryLine[] {
  const clinics = professional.clinics || [];
  const organizationLines = clinics
    .filter((clinic) => clinic.clinicalAccessEnabled && clinic.licenseActive === true)
    .map((clinic) => ({
      key: clinic.organizationId,
      label: professional.professional_access_mode === "hybrid" ? `Clínica ${clinic.name}` : undefined,
      value: clinic.currentPeriodEnd ? new Date(clinic.currentPeriodEnd).toLocaleDateString("pt-BR") : "Gerenciado pela clínica",
      expired: Boolean(clinic.currentPeriodEnd && new Date(clinic.currentPeriodEnd) < now),
    }));

  if (professional.professional_access_mode === "clinic_only") return organizationLines.length
    ? organizationLines
    : [{ key: "clinic-managed", value: "Gerenciado pela clínica" }];

  const personalLine: AdminExpiryLine = professional.subscription_plan === "none" || professional.subscription_plan === "courtesy"
    ? { key: "personal", label: professional.professional_access_mode === "hybrid" ? "Pessoal" : undefined, value: "Sem Expiração" }
    : professional.subscription_ends_at
      ? { key: "personal", label: professional.professional_access_mode === "hybrid" ? "Pessoal" : undefined, value: new Date(professional.subscription_ends_at).toLocaleDateString("pt-BR"), expired: new Date(professional.subscription_ends_at) < now }
      : { key: "personal", label: professional.professional_access_mode === "hybrid" ? "Pessoal" : undefined, value: "-" };

  return professional.professional_access_mode === "hybrid" ? [personalLine, ...organizationLines] : [personalLine];
}
