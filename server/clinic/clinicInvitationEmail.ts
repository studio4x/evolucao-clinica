import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";

export type InvitationMail = {
  recipient: string; organizationName: string; role: "manager" | "professional";
  clinical: boolean; expiresAt: string; token: string;
};
export type SensitiveTransport = {
  provider: "smtp" | "mock"; ready: boolean;
  send(mail: InvitationMail): Promise<{ messageId: string }>;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Sensitive content exists in memory for transport only. Never use the generic
// sendTransactionalEmail/recordEmailDelivery path or a provider template.
export function renderInvitationMail(mail: InvitationMail) {
  if (!/^[a-f0-9]{64}$/.test(mail.token)) throw new Error("invalid_invitation");
  const link = `https://staging.evolucaoclinica.app.br/convite-clinica#invite=${mail.token}`;
  const role = mail.role === "manager" ? "Gestor(a)" : "Profissional";
  const expires = new Date(mail.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const access = mail.clinical ? "Com acesso clínico." : "Somente acesso administrativo, sem licença clínica.";
  const intro = `Você recebeu um convite para ${mail.organizationName}, como ${role}.`;
  const instruction = "Entre ou crie sua conta com o mesmo e-mail que recebeu este convite. O convite só será aceito após sua confirmação.";
  return {
    subject: "Convite para sua equipe — Evolução Clínica",
    text: `${intro}\n${access}\nVálido até ${expires}.\n${instruction}\nAceitar convite: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;color:#105576;max-width:560px;margin:auto;padding:24px"><h1>Evolução Clínica</h1><p>${escapeHtml(intro)}</p><p>${access}</p><p>Válido até ${escapeHtml(expires)}.</p><p>${instruction}</p><a href="${link}" style="display:inline-block;background:#105576;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Aceitar convite</a><p>Se não esperava este convite, ignore esta mensagem.</p></div>`,
  };
}

// Dedicated STAGING credentials only. No settings lookup, fallback, tracking,
// logs, provider response persistence or generic e-mail ledger.
export function createInvitationTransport(env: NodeJS.ProcessEnv): SensitiveTransport {
  const keys = ["CLINIC_INVITATION_SMTP_HOST", "CLINIC_INVITATION_SMTP_USER", "CLINIC_INVITATION_SMTP_PASS", "CLINIC_INVITATION_SMTP_FROM"];
  const port = Number(env.CLINIC_INVITATION_SMTP_PORT || 587);
  const ready = keys.every((key) => Boolean(env[key]?.trim())) && [465, 587].includes(port)
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
        const result = await transport.sendMail({
          from: { name: "Evolução Clínica", address: env.CLINIC_INVITATION_SMTP_FROM! },
          to: mail.recipient, messageId: `<${messageId}>`, ...renderInvitationMail(mail),
          disableFileAccess: true, disableUrlAccess: true,
        });
        if (result.rejected?.length || !result.accepted?.length) throw new Error("transport_failed");
        return { messageId };
      } catch { throw new Error("transport_failed"); }
      finally { transport.close(); }
    },
  };
}
