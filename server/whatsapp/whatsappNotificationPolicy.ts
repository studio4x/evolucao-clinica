import type { WhatsAppTemplateComponent } from "./whatsappTypes.js";

export type WhatsAppAdministrativeNotificationKey =
  | "account_access_granted"
  | "support_ticket_updated"
  | "subscription_status_updated"
  | "payment_confirmed"
  | "payment_failed"
  | "account_security_notice";

export type WhatsAppNotificationSuppression =
  | "suppressed_not_requested"
  | "suppressed_not_allowed"
  | "suppressed_clinical_content"
  | "suppressed_no_consent"
  | "suppressed_no_number"
  | "suppressed_not_configured";

type TemplateDefinition = {
  env: "WHATSAPP_TEMPLATE_ACCOUNT_ACCESS" | "WHATSAPP_TEMPLATE_SUPPORT_UPDATE" | "WHATSAPP_TEMPLATE_SUBSCRIPTION_UPDATE" | "WHATSAPP_TEMPLATE_PAYMENT_UPDATE" | "WHATSAPP_TEMPLATE_SECURITY_NOTICE";
  fallback: string;
};

const TEMPLATES: Record<WhatsAppAdministrativeNotificationKey, TemplateDefinition> = {
  account_access_granted: { env: "WHATSAPP_TEMPLATE_ACCOUNT_ACCESS", fallback: "ec_acesso_liberado" },
  support_ticket_updated: { env: "WHATSAPP_TEMPLATE_SUPPORT_UPDATE", fallback: "ec_suporte_atualizado" },
  subscription_status_updated: { env: "WHATSAPP_TEMPLATE_SUBSCRIPTION_UPDATE", fallback: "ec_assinatura_atualizada" },
  payment_confirmed: { env: "WHATSAPP_TEMPLATE_PAYMENT_UPDATE", fallback: "ec_pagamento_atualizado" },
  payment_failed: { env: "WHATSAPP_TEMPLATE_PAYMENT_UPDATE", fallback: "ec_pagamento_atualizado" },
  account_security_notice: { env: "WHATSAPP_TEMPLATE_SECURITY_NOTICE", fallback: "ec_seguranca_conta" }
};

// This is deliberately broad. A false positive keeps a message in the safer
// in-app/push/e-mail channels; a false negative could expose clinical context.
const CLINICAL_CONTENT = /\b(paciente|prontu[aá]rio|evolu[çc][aã]o|relat[oó]rio cl[ií]nico|transcri[çc][aã]o|grava[çc][aã]o|[aá]udio|atendimento|sess[aã]o|consulta|diagn[oó]stico|anamnese|prescri[çc][aã]o|profissional.*paciente|migra[çc][aã]o de prontu[aá]rios)\b/i;

export function isWhatsAppAdministrativeNotificationKey(value: unknown): value is WhatsAppAdministrativeNotificationKey {
  return typeof value === "string" && value in TEMPLATES;
}

export function containsClinicalWhatsAppContent(...values: Array<string | undefined | null>): boolean {
  return values.some((value) => CLINICAL_CONTENT.test(String(value || "")));
}

export function resolveWhatsAppAdministrativeTemplate(input: {
  requested: boolean;
  notificationKey?: unknown;
  title?: string;
  content?: string;
  firstName?: string;
  env?: NodeJS.ProcessEnv;
}): { allowed: true; templateName: string; languageCode: string; components: WhatsAppTemplateComponent[] } | { allowed: false; reason: WhatsAppNotificationSuppression } {
  if (!input.requested) return { allowed: false, reason: "suppressed_not_requested" };
  if (!isWhatsAppAdministrativeNotificationKey(input.notificationKey)) return { allowed: false, reason: "suppressed_not_allowed" };
  if (containsClinicalWhatsAppContent(input.title, input.content)) return { allowed: false, reason: "suppressed_clinical_content" };

  const env = input.env || process.env;
  const definition = TEMPLATES[input.notificationKey];
  const templateName = String(env[definition.env] || "").trim();
  if (!templateName) return { allowed: false, reason: "suppressed_not_configured" };
  const languageCode = String(env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR").trim();
  const firstName = String(input.firstName || "Profissional").trim().split(/\s+/)[0].slice(0, 80) || "Profissional";

  // Only the recipient first name is allowed as a parameter. Titles, content,
  // support messages and technical details never cross this boundary.
  return {
    allowed: true,
    templateName,
    languageCode,
    components: [{ type: "body", parameters: [{ type: "text", text: firstName }] }]
  };
}
