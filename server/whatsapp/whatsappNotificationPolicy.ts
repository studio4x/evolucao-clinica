import type { WhatsAppTemplateComponent } from "./whatsappTypes.js";

export type SupportStatus = "Recebido" | "Em análise" | "Aguardando informações" | "Respondido" | "Concluído";
export type SubscriptionStatus = "Ativa" | "Em análise" | "Pagamento pendente" | "Suspensa" | "Cancelada";
export type PaymentStatus = "Confirmado" | "Não concluído" | "Pendente" | "Cancelado" | "Estornado";
export type SecurityEvent = "Alteração de senha" | "Solicitação de redefinição de senha" | "Alteração de e-mail" | "Novo acesso à conta" | "Alteração de dados da conta";

export type WhatsAppAdministrativeNotification =
  | { key: "account_access_granted"; data: { firstName: string } }
  | { key: "support_ticket_updated"; data: { firstName: string; protocol: string; status: SupportStatus } }
  | { key: "subscription_status_updated"; data: { firstName: string; status: SubscriptionStatus; updatedAt: string } }
  | { key: "payment_confirmed" | "payment_failed"; data: { firstName: string; reference: string; status: PaymentStatus } }
  | { key: "account_security_notice"; data: { firstName: string; event: SecurityEvent; occurredAt: string } };

export type WhatsAppAdministrativeNotificationKey = WhatsAppAdministrativeNotification["key"];
export type WhatsAppNotificationSuppression = "suppressed_not_allowed" | "suppressed_clinical_content" | "suppressed_not_configured" | "suppressed_invalid_payload";

const TEMPLATE_ENV: Record<WhatsAppAdministrativeNotificationKey, string> = {
  account_access_granted: "WHATSAPP_TEMPLATE_ACCOUNT_ACCESS",
  support_ticket_updated: "WHATSAPP_TEMPLATE_SUPPORT_UPDATE",
  subscription_status_updated: "WHATSAPP_TEMPLATE_SUBSCRIPTION_UPDATE",
  payment_confirmed: "WHATSAPP_TEMPLATE_PAYMENT_UPDATE",
  payment_failed: "WHATSAPP_TEMPLATE_PAYMENT_UPDATE",
  account_security_notice: "WHATSAPP_TEMPLATE_SECURITY_NOTICE"
};
const CLINICAL_CONTENT = /\b(paciente|prontu[aá]rio|evolu[çc][aã]o|relat[oó]rio cl[ií]nico|transcri[çc][aã]o|grava[çc][aã]o|[aá]udio|atendimento|sess[aã]o|consulta|diagn[oó]stico|anamnese|prescri[çc][aã]o|rela[çc][aã]o assistencial|migra[çc][aã]o de prontu[aá]rios)\b/i;
const supportStatuses = new Set<SupportStatus>(["Recebido", "Em análise", "Aguardando informações", "Respondido", "Concluído"]);
const subscriptionStatuses = new Set<SubscriptionStatus>(["Ativa", "Em análise", "Pagamento pendente", "Suspensa", "Cancelada"]);
const paymentStatuses = new Set<PaymentStatus>(["Confirmado", "Não concluído", "Pendente", "Cancelado", "Estornado"]);
const securityEvents = new Set<SecurityEvent>(["Alteração de senha", "Solicitação de redefinição de senha", "Alteração de e-mail", "Novo acesso à conta", "Alteração de dados da conta"]);

export function containsClinicalWhatsAppContent(...values: Array<string | undefined | null>): boolean { return values.some((value) => CLINICAL_CONTENT.test(String(value || ""))); }
function clean(value: unknown, max: number) { return String(value ?? "").replace(/[\r\n\t\0-\x1F\x7F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function firstName(value: unknown) { return clean(value, 80).split(" ")[0] || "Profissional"; }
function body(parameters: string[]): WhatsAppTemplateComponent[] { return [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }]; }

export function resolveWhatsAppAdministrativeTemplate(notification: WhatsAppAdministrativeNotification, env: NodeJS.ProcessEnv = process.env): { allowed: true; templateName: string; languageCode: string; components: WhatsAppTemplateComponent[] } | { allowed: false; reason: WhatsAppNotificationSuppression } {
  const templateName = clean(env[TEMPLATE_ENV[notification.key]], 128);
  if (!templateName) return { allowed: false, reason: "suppressed_not_configured" };
  let parameters: string[];
  switch (notification.key) {
    case "account_access_granted": parameters = [firstName(notification.data.firstName)]; break;
    case "support_ticket_updated": if (!supportStatuses.has(notification.data.status)) return { allowed: false, reason: "suppressed_invalid_payload" }; parameters = [firstName(notification.data.firstName), clean(notification.data.protocol, 80), clean(notification.data.status, 60)]; break;
    case "subscription_status_updated": if (!subscriptionStatuses.has(notification.data.status)) return { allowed: false, reason: "suppressed_invalid_payload" }; parameters = [firstName(notification.data.firstName), clean(notification.data.status, 60), clean(notification.data.updatedAt, 40)]; break;
    case "payment_confirmed": case "payment_failed": if (!paymentStatuses.has(notification.data.status)) return { allowed: false, reason: "suppressed_invalid_payload" }; parameters = [firstName(notification.data.firstName), clean(notification.data.reference, 80), clean(notification.data.status, 60)]; break;
    case "account_security_notice": if (!securityEvents.has(notification.data.event)) return { allowed: false, reason: "suppressed_invalid_payload" }; parameters = [firstName(notification.data.firstName), clean(notification.data.event, 100), clean(notification.data.occurredAt, 40)]; break;
    default: return { allowed: false, reason: "suppressed_not_allowed" };
  }
  if (parameters.some((parameter) => !parameter || containsClinicalWhatsAppContent(parameter))) return { allowed: false, reason: "suppressed_clinical_content" };
  return { allowed: true, templateName, languageCode: clean(env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR", 16), components: body(parameters) };
}

export function mapSupportStatus(status: unknown): SupportStatus | null { return ({ open: "Recebido", in_progress: "Em análise", waiting_user: "Aguardando informações", responded: "Respondido", closed: "Concluído" } as Record<string, SupportStatus>)[String(status)] || null; }
export function mapSubscriptionStatus(status: unknown): SubscriptionStatus | null { return ({ active: "Ativa", trialing: "Ativa", pending: "Pagamento pendente", past_due: "Pagamento pendente", unpaid: "Suspensa", canceled: "Cancelada" } as Record<string, SubscriptionStatus>)[String(status)] || null; }
export function mapPaymentStatus(status: unknown): PaymentStatus | null { return ({ succeeded: "Confirmado", paid: "Confirmado", failed: "Não concluído", pending: "Pendente", canceled: "Cancelado", refunded: "Estornado" } as Record<string, PaymentStatus>)[String(status)] || null; }
