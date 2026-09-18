import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";

export type InvitationMail = {
  recipient: string; organizationName: string; role: "manager" | "professional";
  clinical: boolean; expiresAt: string; token: string;
};
export type InvitationEnvironment = "staging" | "production";
export type RenderedInvitationMail = {
  subject: string; text: string; html: string; fromName: string;
  headers: Record<string, string>;
};
export type SensitiveTransport = {
  provider: "smtp" | "mock"; ready: boolean;
  send(mail: InvitationMail): Promise<{ messageId: string }>;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Sensitive content exists in memory for transport only. Never use the generic
// sendTransactionalEmail/recordEmailDelivery path or a provider template.
export function renderInvitationMail(mail: InvitationMail, environment: InvitationEnvironment | string = "staging"): RenderedInvitationMail {
  if (!/^[a-f0-9]{64}$/.test(mail.token)) throw new Error("invalid_invitation");
  if (environment !== "staging" && environment !== "production") throw new Error("unsupported_invitation_environment");
  const isStaging = environment === "staging";
  const link = `${isStaging ? "https://staging.evolucaoclinica.app.br" : "https://www.evolucaoclinica.app.br"}/convite-clinica#invite=${mail.token}`;
  const role = mail.role === "manager" ? "Gestor(a)" : "Profissional";
  const expires = new Date(mail.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const access = mail.clinical ? "Com acesso clínico." : "Somente acesso administrativo, sem licença clínica.";
  const intro = `Você recebeu um convite para ${mail.organizationName}, como ${role}.`;
  const instruction = "Entre ou crie sua conta com o mesmo e-mail que recebeu este convite. O convite só será aceito após sua confirmação.";
  const stagingBanner = '<div role="note" style="margin:0 0 20px;padding:14px 16px;border:1px solid #f0b429;border-radius:8px;background:#fff8e1;color:#5c4300;font-size:14px;line-height:1.45"><strong>AMBIENTE DE HOMOLOGAÇÃO</strong><br/>Esta mensagem foi enviada pelo ambiente de testes do Evolução Clínica.</div>';
  const stagingFooter = '<hr style="border:0;border-top:1px solid #dce7ec;margin:24px 0 16px"/><p style="margin:0;font-size:12px;line-height:1.5;color:#5f7480">Ambiente: Staging / Homologação<br/>Evolução Clínica</p>';
  const subject = isStaging ? "[STAGING] Convite para acessar a clínica no Evolução Clínica" : "Convite para sua equipe — Evolução Clínica";
  const textPrefix = isStaging ? "[STAGING — AMBIENTE DE HOMOLOGAÇÃO]\n\n" : "";
  const textFooter = isStaging ? "\n\nAmbiente: Staging / Homologação\nEvolução Clínica" : "";
  const headers = isStaging ? { "X-Evolucao-Environment": "staging", "X-Evolucao-Message-Type": "clinic-invitation" } : {};
  return {
    subject,
    fromName: isStaging ? "Evolução Clínica [STAGING]" : "Evolução Clínica",
    headers,
    text: `${textPrefix}${intro}\n${access}\nVálido até ${expires}.\n${instruction}\n${isStaging ? "Abrir convite de teste" : "Aceitar convite"}: ${link}${textFooter}`,
    html: `<div style="font-family:Arial,sans-serif;color:#105576;max-width:560px;width:100%;box-sizing:border-box;margin:auto;padding:24px">${isStaging ? stagingBanner : ""}<h1>Evolução Clínica</h1><p>${escapeHtml(intro)}</p><p>${access}</p><p>Válido até ${escapeHtml(expires)}.</p><p>${instruction}</p><a href="${link}" style="display:inline-block;background:#105576;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">${isStaging ? "Abrir convite de teste" : "Aceitar convite"}</a><p>Se não esperava este convite, ignore esta mensagem.</p>${isStaging ? stagingFooter : ""}</div>`,
  };
}

// Dedicated STAGING credentials only. No settings lookup, fallback, tracking,
// logs, provider response persistence or generic e-mail ledger.
export function createInvitationTransport(env: NodeJS.ProcessEnv): SensitiveTransport {
  const keys = ["CLINIC_INVITATION_SMTP_HOST", "CLINIC_INVITATION_SMTP_USER", "CLINIC_INVITATION_SMTP_PASS", "CLINIC_INVITATION_SMTP_FROM"];
  const port = Number(env.CLINIC_INVITATION_SMTP_PORT || 587);
  const invitationEnvironment = env.APP_ENV === "staging" ? "staging" : null;
  const ready = invitationEnvironment === "staging" && keys.every((key) => Boolean(env[key]?.trim())) && [465, 587].includes(port)
    && env.CLINIC_INVITATION_SMTP_TRACKING_DISABLED === "true";
  return {
    provider: "smtp", ready,
    async send(mail) {
      if (!ready) throw new Error("transport_unavailable");
      const messageId = `${randomUUID()}@staging.evolucaoclinica.app.br`;
      const transport = nodemailer.createTransport({
        host: env.CLINIC_INVITATION_SMTP_HOST, port, secure: port === 465, requireTLS: true,
        auth: { user: env.CLINIC_INVITATION_SMTP_USER, pass: env.CLINIC_INVITATION_SMTP_PASS },
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
        logger: false, debug: false, transactionLog: false,
        disableFileAccess: true, disableUrlAccess: true,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      });
      try {
        const rendered = renderInvitationMail(mail, invitationEnvironment!);
        const result = await transport.sendMail({
          from: { name: rendered.fromName, address: env.CLINIC_INVITATION_SMTP_FROM! },
          to: mail.recipient, messageId: `<${messageId}>`, subject: rendered.subject, text: rendered.text, html: rendered.html, headers: rendered.headers,
          disableFileAccess: true, disableUrlAccess: true,
        });
        if (result.rejected?.length || !result.accepted?.length) throw new Error("transport_failed");
        return { messageId };
      } catch { throw new Error("transport_failed"); }
      finally { transport.close(); }
    },
  };
}
