import express from "express";
import path from "path";
import { readFile } from "fs/promises";
import dotenv from "dotenv";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { Client as PostgresClient } from "pg";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
import { defaultColors, defaultSiteConfig, normalizeSiteConfig } from "./src/utils/brandConfig.js";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TRIAL_DURATION_DAYS = 7;
const DEFAULT_PRODUCTION_ORIGIN = "https://evolucaoclinica.app.br";
const PRODUCTION_ORIGIN = (process.env.VERCEL_PRODUCTION_URL || DEFAULT_PRODUCTION_ORIGIN).replace(/\/$/, "");

// Configuração do Supabase Admin
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Helper para formatar o campo 'from' corretamente (ex: "Nome" <email@dominio>)
function buildFromField(smtpFrom: string, smtpUser: string): string {
  if (!smtpFrom) return `"Evolução Clínica" <${smtpUser}>`;
  // Já tem formato correto com <email>
  if (smtpFrom.includes('<') && smtpFrom.includes('>')) return smtpFrom;
  // É só um e-mail
  if (smtpFrom.includes('@')) return smtpFrom;
  // É só um nome — adiciona o e-mail
  return `"${smtpFrom}" <${smtpUser}>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTrialEndsAt(baseDate = new Date()) {
  return new Date(baseDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function buildTrialSubscriptionWindow(baseDate = new Date()) {
  const trialEndsAt = getTrialEndsAt(baseDate);
  return {
    subscription_plan: "trial",
    subscription_status: "trialing",
    subscription_ends_at: trialEndsAt,
    trial_ends_at: trialEndsAt
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

const CRON_SECRET = process.env.CRON_SECRET || hashString(
  [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    PRODUCTION_ORIGIN
  ].filter(Boolean).join(":")
);

function buildCronBootstrapSql(cronSecret: string) {
  const cronSecretParam = encodeURIComponent(cronSecret);
  return `
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-evolution-reminders-job') THEN
    PERFORM cron.unschedule('send-evolution-reminders-job');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-trial-expiration-notices-job') THEN
    PERFORM cron.unschedule('send-trial-expiration-notices-job');
  END IF;
END $$;

SELECT cron.schedule(
  'send-evolution-reminders-job',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := '${PRODUCTION_ORIGIN}/api/cron/send-evolution-reminders?secret=${cronSecretParam}'
  );
  $$
);

SELECT cron.schedule(
  'send-trial-expiration-notices-job',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := '${PRODUCTION_ORIGIN}/api/cron/send-trial-expiration-notices?secret=${cronSecretParam}'
  );
  $$
);
`;
}

function appendBrandVersion(url: string, signature: string) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(signature)}`;
}

async function getBrandConfigSnapshot() {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("api_key")
    .eq("id", "brand_settings")
    .single();

  if (error || !data?.api_key) {
    return defaultSiteConfig;
  }

  try {
    return normalizeSiteConfig(JSON.parse(data.api_key));
  } catch (parseError) {
    console.error("[Brand] Falha ao ler configurações de marca:", parseError);
    return defaultSiteConfig;
  }
}

type EmailTheme = {
  brandName: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  secondaryHover: string;
  accent: string;
  accentHover: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
};

function normalizeHexColor(value: unknown, fallback: string) {
  const candidate = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildEmailTheme(config = defaultSiteConfig): EmailTheme {
  const colors = config.colors || defaultColors;

  return {
    brandName: config.pwa_app_name || defaultSiteConfig.pwa_app_name,
    primary: normalizeHexColor(colors.primary, defaultColors.primary),
    primaryHover: normalizeHexColor(colors.primary_hover, defaultColors.primary_hover),
    secondary: normalizeHexColor(colors.secondary, defaultColors.secondary),
    secondaryHover: normalizeHexColor(colors.secondary_hover, defaultColors.secondary_hover),
    accent: normalizeHexColor(colors.accent, defaultColors.accent),
    accentHover: normalizeHexColor(colors.accent_hover, defaultColors.accent_hover),
    bg: normalizeHexColor(colors.bg, defaultColors.bg),
    surface: normalizeHexColor(colors.surface, defaultColors.surface),
    text: normalizeHexColor(colors.text, defaultColors.text),
    textMuted: normalizeHexColor(colors.text_muted, defaultColors.text_muted),
    border: normalizeHexColor(colors.border, defaultColors.border)
  };
}

async function getEmailTheme() {
  const config = await getBrandConfigSnapshot();
  return buildEmailTheme(config);
}

function buildEmailButton(theme: EmailTheme, href: string, label: string, backgroundColor = theme.primary) {
  return `
    <a href="${href}" style="display:inline-block;background:${backgroundColor};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:700;letter-spacing:0.2px;">
      ${label}
    </a>
  `;
}

function buildEmailCard(theme: EmailTheme, title: string, bodyHtml: string, options: { titleColor?: string; background?: string; border?: string } = {}) {
  const background = options.background || hexToRgba(theme.primary, 0.06);
  const border = options.border || theme.border;
  const titleColor = options.titleColor || theme.primary;

  return `
    <div style="background:${background}; border:1px solid ${border}; border-radius:16px; padding:20px; margin:0 0 20px 0;">
      <p style="margin:0 0 10px 0; font-size:14px; font-weight:700; color:${titleColor};">${title}</p>
      ${bodyHtml}
    </div>
  `;
}

function buildEmailShell(theme: EmailTheme, options: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  bodyHtml: string;
  footerHtml?: string;
}) {
  return `
    <div style="font-family:'Segoe UI', Arial, sans-serif; max-width:680px; margin:0 auto; background:${theme.bg}; padding:24px;">
      <div style="background:${theme.surface}; border:1px solid ${theme.border}; border-radius:18px; overflow:hidden; box-shadow:0 12px 32px rgba(15, 23, 42, 0.08);">
        <div style="padding:28px; background:linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%); color:#ffffff;">
          <p style="margin:0 0 8px 0; font-size:12px; text-transform:uppercase; letter-spacing:1.4px; opacity:0.82;">${options.eyebrow || theme.brandName}</p>
          <h1 style="margin:0; font-size:26px; line-height:1.2;">${options.title}</h1>
          ${options.subtitle ? `<p style="margin:10px 0 0 0; font-size:15px; line-height:1.6; opacity:0.95;">${options.subtitle}</p>` : ""}
        </div>
        <div style="padding:28px; color:${theme.text}; line-height:1.7;">
          ${options.bodyHtml}
        </div>
        ${options.footerHtml ? `
          <div style="padding:16px 28px 24px; border-top:1px solid ${theme.border}; background:${hexToRgba(theme.bg, 0.92)}; color:${theme.textMuted}; font-size:12px; line-height:1.6;">
            ${options.footerHtml}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function getPostgresConnectionString() {
  return (
    process.env.DATABASE_URL
    || process.env.SUPABASE_DB_URL
    || process.env.SUPABASE_DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || ""
  );
}

async function reloadPostgrestSchemaCache() {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    return { skipped: true };
  }

  const client = new PostgresClient({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    await client.query("NOTIFY pgrst, 'reload schema';");
    return { skipped: false, success: true };
  } catch (error) {
    console.warn("[PostgREST] Falha ao recarregar schema cache:", error);
    return { skipped: false, success: false };
  } finally {
    await client.end().catch(() => {});
  }
}

async function insertNotificationRecord(record: {
  user_id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  image_url?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: record.user_id,
      title: record.title,
      message: record.message,
      type: record.type,
      link: record.link ?? null,
      image_url: record.image_url ?? null
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Falha ao inserir notificação no banco.");
  }

  return data;
}

async function bootstrapSupabaseCronJobs() {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    console.warn("[Cron Bootstrap] Nenhuma string de conexão Postgres disponível. Bootstrap dos cron jobs ignorado.");
    return { skipped: true };
  }

  const client = new PostgresClient({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    await client.query(buildCronBootstrapSql(CRON_SECRET));
    console.log("[Cron Bootstrap] Cron jobs do Supabase verificados e reprogramados com sucesso.");
    return { skipped: false, success: true };
  } catch (error) {
    console.error("[Cron Bootstrap] Falha ao garantir os cron jobs:", error);
    return { skipped: false, success: false };
  } finally {
    await client.end().catch(() => {});
  }
}

function getMimeTypeFromPath(filePath: string) {
  const cleanPath = filePath.split("?")[0].toLowerCase();
  if (cleanPath.endsWith(".png")) return "image/png";
  if (cleanPath.endsWith(".jpg") || cleanPath.endsWith(".jpeg")) return "image/jpeg";
  if (cleanPath.endsWith(".webp")) return "image/webp";
  if (cleanPath.endsWith(".gif")) return "image/gif";
  if (cleanPath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function imageUrlToDataUri(imageUrl: string) {
  if (!imageUrl) return "";

  try {
    const isAbsoluteUrl = /^https?:\/\//i.test(imageUrl);
    const cleanUrl = imageUrl.split("?")[0];
    let buffer: Buffer;
    let mimeType = getMimeTypeFromPath(cleanUrl);

    if (isAbsoluteUrl) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Falha ao carregar imagem ${imageUrl}: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = response.headers.get("content-type") || mimeType;
    } else {
      const publicPath = path.join(process.cwd(), "public", cleanUrl.replace(/^\//, ""));
      buffer = await readFile(publicPath);
    }

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("[Brand] Falha ao converter imagem para data URI:", error);
    return "";
  }
}

function buildWhiteBackgroundIconSvg(imageDataUri: string, size: number) {
  const padding = Math.max(16, Math.round(size * 0.18));
  const innerSize = size - padding * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    imageDataUri
      ? `<image href="${imageDataUri}" x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" preserveAspectRatio="xMidYMid meet" />`
      : "",
    `</svg>`
  ].join("");
}

function decodeBase64UrlToBuffer(value: string) {
  const normalized = String(value || "").trim().replace(/\s+/g, "");
  const padded = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(padded + padding, "base64");
}

function isValidVapidPublicKey(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    return decodeBase64UrlToBuffer(value).length === 65;
  } catch {
    return false;
  }
}

function isValidVapidPrivateKey(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    return decodeBase64UrlToBuffer(value).length === 32;
  } catch {
    return false;
  }
}

// Helper para obter/gerar configurações de notificações
async function getNotificationSettings() {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "notification_settings")
      .maybeSingle();

    let settings: any = {};
    if (data && data.api_key) {
      try {
        settings = JSON.parse(data.api_key);
      } catch (e) {
        console.error("Erro ao ler JSON de configuracoes de notificacoes:", e);
      }
    }

    const hasValidVapidPair =
      isValidVapidPublicKey(settings.vapid_public_key) &&
      isValidVapidPrivateKey(settings.vapid_private_key);

    // Gerar chaves VAPID padrão se não existirem ou se estiverem inválidas
    if (!hasValidVapidPair) {
      console.log("[Notifications] Gerando novo par de chaves VAPID...");
      const keys = webpush.generateVAPIDKeys();
      settings.vapid_public_key = keys.publicKey;
      settings.vapid_private_key = keys.privateKey;
      if (!settings.vapid_subject) {
        settings.vapid_subject = "mailto:suporte@conexaoseres.com.br";
      }

      await supabaseAdmin
        .from("settings")
        .upsert({
          id: "notification_settings",
          api_key: JSON.stringify(settings)
        }, { onConflict: "id" });
    }

    return {
      ...settings,
      vapid_public_key: String(settings.vapid_public_key || "").trim(),
      vapid_private_key: String(settings.vapid_private_key || "").trim(),
      manual_push_notification_ids: Array.isArray(settings.manual_push_notification_ids)
        ? settings.manual_push_notification_ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : []
    };
  } catch (err) {
    console.error("Erro no getNotificationSettings, gerando chaves temporarias em memoria:", err);
    const keys = webpush.generateVAPIDKeys();
    return {
      vapid_public_key: keys.publicKey,
      vapid_private_key: keys.privateKey,
      vapid_subject: "mailto:suporte@conexaoseres.com.br",
      manual_push_notification_ids: []
    };
  }
}

async function appendManualPushNotificationId(notificationId: string) {
  if (!notificationId) return;

  const settings = await getNotificationSettings();
  const manualIds = Array.isArray(settings.manual_push_notification_ids)
    ? [...settings.manual_push_notification_ids]
    : [];

  if (manualIds.includes(notificationId)) {
    return;
  }

  manualIds.push(notificationId);

  await supabaseAdmin
    .from("settings")
    .upsert({
      id: "notification_settings",
      api_key: JSON.stringify({
        ...settings,
        manual_push_notification_ids: manualIds
      })
    }, { onConflict: "id" });
}

async function getAccessControlSettings() {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "access_control_settings")
      .maybeSingle();

    if (error) throw error;

    let settings: any = {};
    if (data?.api_key) {
      try {
        settings = JSON.parse(data.api_key);
      } catch (parseError) {
        console.error("Erro ao ler JSON das configuracoes de acesso:", parseError);
      }
    }

    return {
      require_approval: settings.require_approval !== false
    };
  } catch (err) {
    console.error("Erro ao carregar configuracoes de acesso, usando padrao com aprovacao obrigatoria:", err);
    return {
      require_approval: true
    };
  }
}

// Middleware de Autenticação Supabase
async function requireAuth(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Token de autorizacao ausente" });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: "Token de autorizacao invalido ou expirado" });
    }
    
    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: err.message || "Erro de autenticacao" });
  }
}

async function requireAdmin(req: any, res: any, next: any) {
  try {
    const { data: prof, error } = await supabaseAdmin
      .from("professionals")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (error || !prof || prof.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem executar esta ação." });
    }

    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao validar permissões de administrador" });
  }
}

// Middleware para garantir que o profissional tem um plano ativo
async function requireActiveSubscription(req: any, res: any, next: any) {
  try {
    const { data: prof, error } = await supabaseAdmin
      .from("professionals")
      .select("role, subscription_status, subscription_ends_at")
      .eq("id", req.user.id)
      .single();

    if (error || !prof) {
      return res.status(403).json({ error: "Profissional nao encontrado ou inativo" });
    }

    if (prof.role === "admin") {
      return next();
    }

    const now = new Date();
    const endsAt = prof.subscription_ends_at ? new Date(prof.subscription_ends_at) : null;
    const isExpired = endsAt ? endsAt < now : false;
    const isActive = prof.subscription_status === "active" || prof.subscription_status === "trialing";

    if (!isActive || isExpired) {
      return res.status(403).json({ error: "Assinatura expirada ou inativa. Regularize seu plano." });
    }

    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao verificar assinatura" });
  }
}

type EmailProvider = "smtp" | "brevo";
type EmailDeliverySource = "notification" | "test-email" | "trial-expiration" | "report" | "subscription-success" | "subscription-failure" | "welcome";
type NotificationOrigin = "platform" | "manual";

type EmailDeliveryInput = {
  userId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  textContent: string;
  htmlContent?: string;
  source: EmailDeliverySource;
  relatedNotificationId?: string | null;
  allowFallback?: boolean;
  pdfBase64?: string;
  filename?: string;
};

type EmailDeliveryResult = {
  provider: EmailProvider;
  messageId: string | null;
};

function normalizeEmailProvider(value: any): EmailProvider {
  return value === "brevo" ? "brevo" : "smtp";
}

function hasSmtpEmailSettings(settings: any) {
  return Boolean(settings?.smtp_host && settings?.smtp_user && settings?.smtp_pass);
}

function hasBrevoEmailSettings(settings: any) {
  return Boolean(settings?.brevo_api_key && (settings?.brevo_sender_email || settings?.brevo_sender_name));
}

function formatCurrencyLabel(amount: number, currency = "BRL") {
  const safeAmount = Number(amount || 0);

  if (!Number.isFinite(safeAmount)) {
    return currency.toUpperCase();
  }

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase()
    }).format(safeAmount);
  } catch {
    return `${safeAmount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function normalizePaymentDescriptor(value: unknown) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  return label || "Google Pay";
}

function normalizePlanFeatureList(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((feature) => String(feature || "").trim())
    .filter(Boolean);
}

async function recordEmailDelivery(data: {
  userId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  message: string;
  provider: EmailProvider;
  source: EmailDeliverySource;
  status: "sent" | "failed";
  errorMessage?: string | null;
  providerMessageId?: string | null;
  relatedNotificationId?: string | null;
}) {
  try {
    await supabaseAdmin.from("email_deliveries").insert({
      user_id: data.userId || null,
      recipient_email: data.recipientEmail,
      recipient_name: data.recipientName || null,
      subject: data.subject,
      message: data.message,
      provider: data.provider,
      source: data.source,
      status: data.status,
      error_message: data.errorMessage || null,
      provider_message_id: data.providerMessageId || null,
      related_notification_id: data.relatedNotificationId || null
    });
  } catch (err) {
    console.error("[EmailHistory] Falha ao registrar envio de e-mail:", err);
  }
}

async function sendEmailViaSmtp(
  settings: any,
  input: EmailDeliveryInput
) {
  if (!hasSmtpEmailSettings(settings)) {
    throw new Error("Servidor SMTP não configurado na plataforma.");
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: settings.smtp_secure !== undefined ? settings.smtp_secure : Number(settings.smtp_port) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    },
    pool: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false }
  } as any);

  const fromField = buildFromField(settings.smtp_from, settings.smtp_user);
  const mailOptions: any = {
    from: fromField,
    to: input.recipientEmail,
    subject: input.subject,
    text: input.textContent,
    html: input.htmlContent || undefined,
  };

  if (input.pdfBase64 && input.filename) {
    mailOptions.attachments = [
      {
        filename: input.filename,
        content: Buffer.from(input.pdfBase64, 'base64'),
        contentType: 'application/pdf'
      }
    ];
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId || null };
}

async function sendEmailViaBrevo(
  settings: any,
  input: EmailDeliveryInput
) {
  if (!settings?.brevo_api_key) {
    throw new Error("Brevo não configurado na plataforma.");
  }

  const senderEmail = settings.brevo_sender_email || settings.smtp_user || "";
  if (!senderEmail) {
    throw new Error("Sender da Brevo não configurado.");
  }

  const senderName = settings.brevo_sender_name || settings.smtp_from || "Evolução Clínica";
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": settings.brevo_api_key
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: input.recipientEmail,
          ...(input.recipientName ? { name: input.recipientName } : {})
        }
      ],
      subject: input.subject,
      ...(input.htmlContent ? { htmlContent: input.htmlContent } : {}),
      ...(input.textContent ? { textContent: input.textContent } : {}),
      ...(input.pdfBase64 && input.filename ? {
        attachment: [
          {
            name: input.filename,
            content: input.pdfBase64
          }
        ]
      } : {})
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data?.message || data?.error || `Brevo retornou HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return { messageId: data?.messageId || data?.messageID || null };
}

async function sendTransactionalEmail(
  settings: any,
  input: EmailDeliveryInput
): Promise<EmailDeliveryResult> {
  const preferredProvider = normalizeEmailProvider(settings?.email_provider);
  const providers: EmailProvider[] = preferredProvider === "brevo" ? ["brevo", "smtp"] : ["smtp", "brevo"];
  const allowFallback = input.allowFallback !== false;
  const attempts = allowFallback ? providers : [preferredProvider];
  let lastError: Error | null = null;

  for (const provider of attempts) {
    try {
      if (provider === "brevo") {
        if (!hasBrevoEmailSettings(settings)) {
          throw new Error("Brevo não configurado na plataforma.");
        }

        const result = await sendEmailViaBrevo(settings, input);
        await recordEmailDelivery({
          userId: input.userId,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          subject: input.subject,
          message: input.textContent,
          provider,
          source: input.source,
          status: "sent",
          providerMessageId: result.messageId,
          relatedNotificationId: input.relatedNotificationId
        });
        return { provider, messageId: result.messageId };
      }

      if (!hasSmtpEmailSettings(settings)) {
        throw new Error("Servidor SMTP não configurado na plataforma.");
      }

      const result = await sendEmailViaSmtp(settings, input);
      await recordEmailDelivery({
        userId: input.userId,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        subject: input.subject,
        message: input.textContent,
        provider,
        source: input.source,
        status: "sent",
        providerMessageId: result.messageId,
        relatedNotificationId: input.relatedNotificationId
      });
      return { provider, messageId: result.messageId };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || "Erro desconhecido ao enviar e-mail.");
      console.warn(`[Email] Falha ao enviar via ${provider}:`, lastError.message);
    }
  }

  await recordEmailDelivery({
    userId: input.userId,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
    message: input.textContent,
    provider: preferredProvider,
    source: input.source,
    status: "failed",
    errorMessage: lastError?.message || "Falha ao enviar e-mail.",
    relatedNotificationId: input.relatedNotificationId
  });

  throw lastError || new Error("Falha ao enviar e-mail.");
}

async function revokeGoogleGrant(googleAccessToken?: string | null) {
  const token = String(googleAccessToken || "").trim();
  if (!token) {
    return { revoked: false, skipped: true };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ token })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[Account] Não foi possível revogar o acesso do Google:", response.status, errorText);
      return { revoked: false, skipped: false };
    }

    return { revoked: true, skipped: false };
  } catch (err) {
    console.warn("[Account] Falha ao tentar revogar o Google:", err);
    return { revoked: false, skipped: false };
  }
}

async function deleteProfessionalAccount(targetUserId: string) {
  if (!targetUserId) {
    throw new Error("ID do usuário ausente");
  }

  const { data: targetProf, error: targetProfError } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email, role")
    .eq("id", targetUserId)
    .single();

  if (targetProfError || !targetProf) {
    throw new Error("Usuário não encontrado.");
  }

  // 1. Limpeza em tabelas filhas (públicas)
  const cleanupTargets: Array<{ table: string; column: string }> = [
    { table: "usage_logs", column: "professional_id" },
    { table: "evolutions", column: "professional_id" },
    { table: "patient_reports", column: "professional_id" },
    { table: "patients", column: "professional_id" },
    { table: "transactions", column: "professional_id" },
    { table: "support_tickets", column: "user_id" },
    { table: "notifications", column: "user_id" },
    { table: "push_subscriptions", column: "user_id" },
    { table: "evolution_templates", column: "professional_id" },
    { table: "migration_requests", column: "user_id" },
    { table: "onboarding_notifications", column: "user_id" }
  ];

  for (const target of cleanupTargets) {
    const { error } = await supabaseAdmin
      .from(target.table)
      .delete()
      .eq(target.column, targetUserId);

    if (error) {
      throw new Error(`Falha ao remover dados de ${target.table}: ${error.message}`);
    }
  }

  // 2. Limpeza de anexos no Storage
  try {
    const { data: supportFiles, error: supportFilesError } = await supabaseAdmin
      .storage
      .from("support_attachments")
      .list(`support/${targetUserId}`, { limit: 1000 });

    if (supportFilesError) {
      console.warn(`[DeleteUser] Falha ao listar anexos de suporte do usuário: ${supportFilesError.message}`);
    } else if (supportFiles && supportFiles.length > 0) {
      const supportPaths = supportFiles.map((file) => `support/${targetUserId}/${file.name}`);
      const { error: supportRemoveError } = await supabaseAdmin
        .storage
        .from("support_attachments")
        .remove(supportPaths);

      if (supportRemoveError) {
        console.warn(`[DeleteUser] Falha ao remover anexos de suporte do usuário: ${supportRemoveError.message}`);
      }
    }
  } catch (storageError) {
    console.warn("[DeleteUser] Falha inesperada ao limpar anexos de suporte:", storageError);
  }

  // 3. Remover o perfil do profissional da tabela public.professionals
  const { error: profDeleteError } = await supabaseAdmin
    .from("professionals")
    .delete()
    .eq("id", targetUserId);

  if (profDeleteError) {
    throw new Error(`Falha ao remover o perfil profissional da tabela 'professionals': ${profDeleteError.message}`);
  }

  // 4. Por fim, excluir a conta de autenticação (auth.users)
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
  if (authDeleteError && !/not found/i.test(authDeleteError.message || "")) {
    let errorDetail = "";
    if (authDeleteError instanceof Error) {
      errorDetail = `${authDeleteError.name || 'Error'}: ${authDeleteError.message}`;
      if ((authDeleteError as any).status) {
        errorDetail += ` (Status: ${(authDeleteError as any).status})`;
      }
    } else if (typeof authDeleteError === 'object' && authDeleteError !== null) {
      const details: string[] = [];
      for (const [key, value] of Object.entries(authDeleteError)) {
        details.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
      errorDetail = details.length > 0 ? details.join(', ') : JSON.stringify(authDeleteError);
    } else {
      errorDetail = String(authDeleteError);
    }
    throw new Error(`Falha ao remover a conta de autenticação: ${errorDetail}`);
  }

  return targetProf;
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/debug-env", (req, res) => {
  const envs = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    HAS_GEMINI_KEY: !!(process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY),
    HAS_PICKER_KEY: !!process.env.VITE_GOOGLE_PICKER_API_KEY,
    PORT: PORT
  };
  res.json(envs);
});

app.get("/api/brand-bootstrap", async (_req, res) => {
  try {
    const config = await getBrandConfigSnapshot();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json(config);
  } catch (err: any) {
    console.error("Error generating brand bootstrap payload:", err);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(500).json(defaultSiteConfig);
  }
});

app.get("/api/gemini-key", requireAuth, async (req: any, res) => {
  res.status(410).json({ error: "Este endpoint foi desativado por motivos de segurança. A chave de API do Gemini não é mais exposta ao cliente." });
});

app.post("/api/ai/transcribe", requireAuth, async (req: any, res) => {
  try {
    const { audioBase64, mimeType, prompt, audioDuration } = req.body;

    if (!audioBase64 || !mimeType) {
      return res.status(400).json({ error: "Parâmetros 'audioBase64' e 'mimeType' são obrigatórios." });
    }

    // 1. Obter a chave do Gemini
    let apiKey = "";
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "gemini")
      .maybeSingle();

    if (!error && data?.api_key) {
      apiKey = data.api_key;
    } else {
      apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || "";
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Chave do Gemini não configurada no servidor." });
    }

    // 2. Instanciar o SDK do Gemini no Backend de forma protegida
    const ai = new GoogleGenAI({ apiKey });
    const modelName = "gemini-2.5-flash";

    console.log(`[AI-Backend] Transcrevendo áudio via backend (duração estimada: ${audioDuration || 0}s)...`);
    
    const transcriptionPrompt = prompt || `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

    const geminiResponse = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: transcriptionPrompt },
          { inlineData: { data: audioBase64, mimeType: mimeType } }
        ]
      }
    });

    const transcription = geminiResponse.text;
    if (!transcription) {
      throw new Error("O Gemini não retornou nenhum texto de transcrição.");
    }

    // 3. Registrar o log de consumo diretamente no banco
    const usageMetadata = (geminiResponse as any).usageMetadata;
    if (usageMetadata) {
      const promptTokens = usageMetadata.promptTokenCount || 0;
      const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = usageMetadata.totalTokenCount || 0;
      const costUsd = (promptTokens * 0.00000030) + (candidatesTokens * 0.00000250);

      try {
        await supabaseAdmin.from('usage_logs').insert({
          professional_id: req.user.id,
          model: modelName,
          prompt_tokens: promptTokens,
          candidates_tokens: candidatesTokens,
          total_tokens: totalTokens,
          cost_usd: costUsd,
          audio_duration_seconds: audioDuration || 0,
          created_at: new Date().toISOString()
        });
        console.log("[AI-Backend] Log de consumo gravado com sucesso.");
      } catch (dbError) {
        console.error("[AI-Backend] Erro ao gravar log de consumo:", dbError);
      }
    }

    res.json({ success: true, transcription });
  } catch (err: any) {
    console.error("Erro na transcrição via backend:", err);
    res.status(500).json({ error: err.message || "Erro interno ao processar a transcrição." });
  }
});


const DEFAULT_PUBLIC_PAYMENT_SETTINGS = {
  environment: "TEST",
  googleMerchantId: "BCR2DN7TTCHMTFAJ",
  stripeProdPublishableKey: "pk_live_wDyGJo2Rl2ikV2HaBXzZey1o",
  stripeSandboxPublishableKey: "pk_test_0b7fQSiyaxD7OjUH6lKL6Slh"
};

app.get("/api/payment-settings", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "payment_settings")
      .maybeSingle();

    let parsed: any = {};
    if (!error && data?.api_key) {
      try {
        parsed = JSON.parse(data.api_key);
      } catch (parseError) {
        console.error("Erro ao interpretar payment_settings:", parseError);
      }
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({
      ...DEFAULT_PUBLIC_PAYMENT_SETTINGS,
      environment: parsed.environment || DEFAULT_PUBLIC_PAYMENT_SETTINGS.environment,
      googleMerchantId: parsed.googleMerchantId || DEFAULT_PUBLIC_PAYMENT_SETTINGS.googleMerchantId,
      stripeProdPublishableKey: parsed.stripeProdPublishableKey || DEFAULT_PUBLIC_PAYMENT_SETTINGS.stripeProdPublishableKey,
      stripeSandboxPublishableKey: parsed.stripeSandboxPublishableKey || DEFAULT_PUBLIC_PAYMENT_SETTINGS.stripeSandboxPublishableKey
    });
  } catch (err: any) {
    console.error("Erro ao carregar payment_settings públicos:", err);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json(DEFAULT_PUBLIC_PAYMENT_SETTINGS);
  }
});

// Rota dinâmica para o manifest.webmanifest do PWA
app.get(["/manifest.webmanifest", "/api/manifest"], async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('api_key')
      .eq('id', 'brand_settings')
      .single();

    let logoLightUrl = "";
    let logoDarkUrl = "";
    let faviconUrl = "";
    let pwaIcon192 = "";
    let pwaIcon512 = "";
    let pwaMaskableIcon = "";
    let pwaPushNotificationIcon = "";
    let version = "1.0";

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      logoLightUrl = parsed.logo_light_url || "";
      logoDarkUrl = parsed.logo_dark_url || "";
      faviconUrl = parsed.favicon_url || "";
      pwaIcon192 = parsed.pwa_icon_192_url || "";
      pwaIcon512 = parsed.pwa_icon_512_url || "";
      pwaMaskableIcon = parsed.pwa_maskable_icon_url || "";
      pwaPushNotificationIcon = parsed.pwa_push_notification_icon_url || "";
      version = parsed.version || "1.0";
    }

    const assetSignature = hashString([
      logoLightUrl,
      logoDarkUrl,
      faviconUrl,
      pwaIcon192,
      pwaIcon512,
      pwaMaskableIcon,
      pwaPushNotificationIcon,
      version
    ].join("|"));
    const brandIcon = faviconUrl || logoDarkUrl || logoLightUrl || "/favicon.png";
    const splashLogoWithVersion = appendBrandVersion(logoDarkUrl || logoLightUrl || "", assetSignature);
    const manifest = {
      "id": "/",
      "name": "Evolução Clínica",
      "short_name": "Evolução Clínica",
      "description": "Prontuário eletrônico e evolução clínica profissional com IA para fisioterapeutas e profissionais da saúde.",
      "lang": "pt-BR",
      "start_url": "/?utm_source=pwa",
      "scope": "/",
      "display": "standalone",
      "orientation": "portrait",
      "theme_color": "#005C13",
      "background_color": "#ffffff",
      "categories": ["medical", "productivity", "health"],
      "prefer_related_applications": false,
      "icons": [
        {
          "src": appendBrandVersion("/icon-192x192.png", assetSignature),
          "sizes": "192x192",
          "type": "image/png",
          "purpose": "any"
        },
        {
          "src": appendBrandVersion("/icon-512x512.png", assetSignature),
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "any"
        },
        {
          "src": appendBrandVersion("/icon-512x512-maskable.png", assetSignature),
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "maskable"
        },
        {
          "src": splashLogoWithVersion,
          "sizes": "1024x1024",
          "type": "image/png",
          "purpose": "any maskable"
        }
      ],
      "screenshots": [
        {
          "src": "/screenshot-1.png",
          "sizes": "1024x1024",
          "type": "image/png",
          "label": "Tela de Login",
          "form_factor": "wide"
        },
        {
          "src": "/screenshot-2.png",
          "sizes": "1024x1024",
          "type": "image/png",
          "label": "Painel de Controle",
          "form_factor": "wide"
        }
      ],
      "share_target": {
        "action": "/api/share-target",
        "method": "POST",
        "enctype": "multipart/form-data",
        "params": {
          "title": "title",
          "text": "text",
          "url": "url",
          "files": [
            {
              "name": "audio",
              "accept": [
                "audio/*",
                "video/*",
                "application/ogg",
                ".opus",
                ".ogg",
                ".mp3",
                ".wav",
                ".m4a",
                ".weba",
                "*/*"
              ]
            }
          ]
        }
      }
    };

    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return res.json(manifest);
  } catch (err: any) {
    console.error("Error generating manifest:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Rota dinâmica para ícone branco usado no prompt nativo de instalação
app.get(["/api/pwa-install-icon", "/api/pwa-install-icon.svg"], async (req, res) => {
  try {
    const sizeParam = Number(req.query.size);
    const size = Number.isFinite(sizeParam) && sizeParam > 0 ? Math.min(Math.max(sizeParam, 128), 1024) : 512;

    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('api_key')
      .eq('id', 'brand_settings')
      .single();

    let logoLightUrl = "";
    let logoDarkUrl = "";
    let faviconUrl = "";
    let pwaIcon192 = "";
    let pwaIcon512 = "";
    let pwaInstallLogo = "";
    let pwaPushNotificationIcon = "";

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      logoLightUrl = parsed.logo_light_url || "";
      logoDarkUrl = parsed.logo_dark_url || "";
      faviconUrl = parsed.favicon_url || "";
      pwaIcon192 = parsed.pwa_icon_192_url || "";
      pwaIcon512 = parsed.pwa_icon_512_url || "";
      pwaInstallLogo = parsed.pwa_install_logo_url || "";
      pwaPushNotificationIcon = parsed.pwa_push_notification_icon_url || "";
    }

    const candidateSources = [
      pwaPushNotificationIcon,
      pwaInstallLogo,
      pwaIcon512,
      pwaIcon192,
      faviconUrl,
      logoDarkUrl,
      logoLightUrl,
      "/favicon.png"
    ].filter(Boolean) as string[];

    let dataUri = "";
    for (const source of candidateSources) {
      dataUri = await imageUrlToDataUri(source);
      if (dataUri) break;
    }

    const svg = buildWhiteBackgroundIconSvg(dataUri, size);

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.send(svg);
  } catch (err: any) {
    console.error("Erro ao gerar ícone branco do PWA:", err);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="100%" height="100%" fill="#ffffff"/></svg>`);
  }
});

// Rota dinâmica para o favicon do site/PWA
app.get(["/favicon.png", "/favicon.ico", "/api/favicon"], async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('api_key')
      .eq('id', 'brand_settings')
      .single();

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      if (parsed.favicon_url) {
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return res.redirect(parsed.favicon_url);
      }
    }
  } catch (err) {
    console.error("Erro ao obter favicon dinâmico:", err);
  }
  // Fallback para o favicon local
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.sendFile(path.join(process.cwd(), "public", "favicon.png"));
});

// --- API NOTIFICATIONS ---

// 1. Obter VAPID Public Key
app.get("/api/notifications/vapid-public-key", async (req, res) => {
  try {
    const settings = await getNotificationSettings();
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({ publicKey: settings.vapid_public_key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Inscrever para Push
app.post("/api/notifications/subscribe", requireAuth, async (req: any, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Dados de inscricao invalidos" });
  }

  try {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert({
        user_id: req.user.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys
      }, {
        onConflict: "endpoint"
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("Erro ao salvar inscricao push:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Desinscrever de Push
app.post("/api/notifications/unsubscribe", requireAuth, async (req: any, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: "Endpoint ausente" });
  }

  try {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", req.user.id)
      .eq("endpoint", endpoint);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("Erro ao desinscrever push:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/professionals/:userId", requireAuth, requireAdmin, async (req: any, res) => {
  const targetUserId = req.params.userId;

  if (!targetUserId) {
    return res.status(400).json({ error: "ID do usuário ausente" });
  }

  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: "Não é possível excluir a própria conta administrativa." });
  }

  try {
    const targetProf = await deleteProfessionalAccount(targetUserId);

    return res.json({
      success: true,
      message: `Usuário ${targetProf.full_name || targetProf.google_email || targetUserId} excluído permanentemente.`
    });
  } catch (err: any) {
    console.error("Erro ao excluir usuário do admin:", err);
    return res.status(500).json({ error: err.message || "Erro ao excluir usuário." });
  }
});

app.post("/api/account/delete", requireAuth, async (req: any, res) => {
  try {
    const { googleAccessToken } = req.body || {};

    const googleRevokeResult = await revokeGoogleGrant(googleAccessToken);
    const targetProf = await deleteProfessionalAccount(req.user.id);

    return res.json({
      success: true,
      googleRevoked: googleRevokeResult.revoked,
      googleRevokeSkipped: googleRevokeResult.skipped,
      message: `A conta de ${targetProf.full_name || targetProf.google_email || req.user.id} foi excluída definitivamente.`
    });
  } catch (err: any) {
    console.error("Erro ao excluir a própria conta:", err);
    return res.status(500).json({ error: err.message || "Erro ao excluir a conta." });
  }
});

app.post("/api/admin/professionals", requireAuth, requireAdmin, async (req: any, res) => {
  const { firstName, lastName, email, password } = req.body || {};

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedFirstName = String(firstName || '').trim();
  const normalizedLastName = String(lastName || '').trim();
  const cleanPassword = String(password || '');
  const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();

  if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !cleanPassword) {
    return res.status(400).json({ error: "Nome, sobrenome, e-mail e senha são obrigatórios." });
  }

  if (cleanPassword.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const accessControlSettings = await getAccessControlSettings();
    const requireApproval = accessControlSettings.require_approval !== false;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        name: normalizedFirstName,
        family_name: normalizedLastName
      }
    });

    if (authError || !authData?.user) {
      const errorMessage = authError?.message || "Não foi possível criar o usuário no Auth.";
      if (/already|exists|duplicate/i.test(errorMessage)) {
        return res.status(409).json({ error: "Já existe um usuário com esse e-mail." });
      }
      return res.status(500).json({ error: errorMessage });
    }

    const createdUser = authData.user;
    const now = new Date().toISOString();
    const targetStatus = requireApproval ? "pending" : "active";

    const { error: profileError } = await supabaseAdmin
      .from("professionals")
      .insert({
        id: createdUser.id,
        full_name: fullName,
        google_email: normalizedEmail,
        photo_url: createdUser.user_metadata?.avatar_url || null,
        role: "therapist",
        status: targetStatus,
        subscription_plan: "trial",
        subscription_status: "trialing",
        subscription_ends_at: null,
        trial_ends_at: null,
        created_at: now,
        updated_at: now
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.id).catch(() => {});
      throw profileError;
    }

    let notificationResult: any = null;
    try {
      await sendWelcomeEmail(createdUser.id, targetStatus).catch((err) => {
        console.warn("[AdminCreateProfessional] E-mail de boas-vindas não enviado:", err?.message || err);
      });
      if (requireApproval) {
        notificationResult = await sendOnboardingPendingNotice({
          id: createdUser.id,
          email: normalizedEmail,
          user_metadata: {
            full_name: fullName
          }
        });
      } else {
        notificationResult = await sendOnboardingAccessGrantedNotice(createdUser.id, {
          title: "Sua conta foi criada",
          content: "Seu acesso à plataforma foi criado e liberado pela administração. Use seu e-mail e a senha recebida para entrar.",
          type: "success",
          link: "/login"
        });
      }
    } catch (notificationError) {
      console.error("[AdminCreateProfessional] Erro ao notificar novo profissional:", notificationError);
    }

    return res.status(201).json({
      success: true,
      status: targetStatus,
      requireApproval,
      user: {
        id: createdUser.id,
        email: normalizedEmail,
        full_name: fullName
      },
      notification: notificationResult
    });
  } catch (err: any) {
    console.error("Erro ao criar profissional manualmente:", err);
    return res.status(500).json({ error: err.message || "Erro ao criar profissional." });
  }
});

async function getAdminRecipients() {
  const { data: admins, error } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email")
    .eq("role", "admin");

  if (error) throw error;
  return admins || [];
}

async function getOnboardingLog(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("onboarding_notifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertOnboardingLog(userId: string, patch: Record<string, any>) {
  const { error } = await supabaseAdmin
    .from("onboarding_notifications")
    .upsert({
      user_id: userId,
      updated_at: new Date().toISOString(),
      ...patch
    });

  if (error) throw error;
}

async function getProfessionalDeliveryEmail(userId: string) {
  const { data: profData } = await supabaseAdmin
    .from("professionals")
    .select("google_email, full_name")
    .eq("id", userId)
    .single();

  let targetEmail = profData?.google_email || null;
  if (!targetEmail) {
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      targetEmail = authUser?.user?.email || null;
    } catch (_) {
      // Mantém o fallback silencioso se o Auth não responder.
    }
  }

  return {
    email: targetEmail,
    name: profData?.full_name || null
  };
}

function buildWelcomeEmailContent(options: {
  recipientName: string;
  status: "pending" | "active";
  loginUrl: string;
  theme: EmailTheme;
}) {
  const { theme } = options;
  const isPending = options.status === "pending";
  const statusTitle = isPending ? "Seu cadastro está em análise" : "Sua conta já está liberada";
  const introText = isPending
    ? "Você já faz parte da plataforma. O próximo passo é a liberação do seu acesso por um administrador."
    : "Sua conta foi criada com sucesso e você já pode entrar na plataforma para começar a usar os recursos.";
  const nextStepText = isPending
    ? "Assim que a aprovação acontecer, você receberá acesso completo ao painel."
    : "Use seu e-mail para acessar o painel e explorar os recursos liberados no seu plano.";
  const featureItems = [
    "Prontuários e evoluções clínicas organizados no Google Docs",
    "Transcrição e automação para acelerar a rotina clínica",
    "Gestão de pacientes, acompanhamento e notificações",
    "Fluxos pensados para segurança e organização do atendimento"
  ];

  const textContent = [
    `Bem-vindo(a), ${options.recipientName}!`,
    "",
    "Sua conta na Evolução Clínica foi criada com sucesso.",
    statusTitle,
    introText,
    "",
    "O que você encontra na plataforma:",
    ...featureItems.map((item) => `- ${item}`),
    "",
    nextStepText,
    "",
    `Acesse a plataforma: ${options.loginUrl}`,
    "",
    "Equipe Evolução Clínica"
  ].join("\n");

  const htmlContent = buildEmailShell(theme, {
    title: "Bem-vindo(a) à plataforma",
    subtitle: statusTitle,
    bodyHtml: `
      <p style="margin:0 0 16px 0; font-size:16px; line-height:1.7;">Olá, <strong>${escapeHtml(options.recipientName)}</strong>.</p>
      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:${theme.textMuted};">${introText}</p>
      ${buildEmailCard(theme, "O que você encontrará", `
        <div style="margin:0; color:${theme.text}; font-size:14px; line-height:1.8;">
          ${featureItems.map((item) => `<div style="margin:0 0 8px 0;">• ${item}</div>`).join("")}
        </div>
      `)}
      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:${theme.textMuted};">${nextStepText}</p>
      <div style="text-align:center; margin:28px 0 8px 0;">
        ${buildEmailButton(theme, options.loginUrl, "Acessar a plataforma")}
      </div>
    `,
    footerHtml: "Se tiver qualquer dúvida, responda este e-mail e nossa equipe poderá ajudar."
  });

  return { textContent, htmlContent, subject: isPending ? "Bem-vindo(a) à Evolução Clínica" : "Sua conta foi criada com sucesso" };
}

async function sendWelcomeEmail(userId: string, status: "pending" | "active") {
  const { data: existingWelcome, error: welcomeDeliveryError } = await supabaseAdmin
    .from("email_deliveries")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "welcome")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();

  if (welcomeDeliveryError) {
    console.warn("[WelcomeEmail] Não foi possível verificar envios anteriores:", welcomeDeliveryError.message);
  }

  if (existingWelcome) {
    return { skipped: true };
  }

  const { data: prof, error } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email, status")
    .eq("id", userId)
    .single();

  if (error || !prof) {
    throw new Error("Profissional não encontrado para e-mail de boas-vindas.");
  }

  const recipient = await getProfessionalDeliveryEmail(userId);
  if (!recipient.email) {
    throw new Error("E-mail do profissional não encontrado para boas-vindas.");
  }

  const settings = await getNotificationSettings();
  const loginUrl = `${PRODUCTION_ORIGIN}/login`;
  const recipientName = prof.full_name || recipient.name || "Profissional";
  const theme = await getEmailTheme();
  const content = buildWelcomeEmailContent({
    recipientName,
    status: status || (prof.status === "pending" ? "pending" : "active"),
    loginUrl,
    theme
  });

  await sendTransactionalEmail(settings, {
    userId,
    recipientEmail: recipient.email,
    recipientName,
    subject: content.subject,
    textContent: content.textContent,
    htmlContent: content.htmlContent,
    source: "welcome",
    allowFallback: true
  });

  return { skipped: false };
}

async function ensureProfessionalProfile(user: any, status: "pending" | "active") {
  const fullName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.user_metadata?.given_name
    || user?.email
    || "Profissional";

  const trialWindow = buildTrialSubscriptionWindow();

  const { error } = await supabaseAdmin
    .from("professionals")
      .upsert({
      id: user.id,
      full_name: fullName,
      google_email: user.email,
      photo_url: user?.user_metadata?.avatar_url || null,
      role: "therapist",
      status,
      ...trialWindow
    });

  if (error) throw error;
}

async function ensurePendingProfessionalProfile(user: any) {
  return ensureProfessionalProfile(user, "pending");
}

async function ensureActiveProfessionalProfile(user: any) {
  return ensureProfessionalProfile(user, "active");
}

async function sendOnboardingPendingNotice(user: any) {
  const log = await getOnboardingLog(user.id);
  if (log?.pending_notified_at) {
    return { skipped: true };
  }

  const userLabel = user?.user_metadata?.full_name || user?.email || "Profissional";
  const adminRecipients = await getAdminRecipients();
  const adminCount = adminRecipients.length;

  await sendNotificationInternal(
    user.id,
    "Cadastro recebido e em análise",
    "Seu cadastro foi criado com sucesso e agora está aguardando a liberação de um administrador.",
    "warning",
    "/pending"
  );

  for (const admin of adminRecipients) {
    try {
      await sendNotificationInternal(
        admin.id,
        "Novo cadastro aguardando aprovação",
        `O profissional ${userLabel} realizou o cadastro e está aguardando aprovação no painel administrativo.`,
        "info",
        "/admin/professionals"
      );
    } catch (err) {
      console.error("[Onboarding] Erro ao notificar admin sobre cadastro pendente:", err);
    }
  }

  await upsertOnboardingLog(user.id, {
    pending_notified_at: new Date().toISOString()
  });

  return { skipped: false, adminCount };
}

async function sendOnboardingAccessGrantedNotice(
  targetUserId: string,
  options: {
    title?: string;
    content?: string;
    type?: string;
    link?: string;
  } = {}
) {
  const log = await getOnboardingLog(targetUserId);
  if (log?.approved_notified_at) {
    return { skipped: true };
  }

  const { data: prof, error } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email")
    .eq("id", targetUserId)
    .single();

  if (error || !prof) {
    throw new Error("Profissional não encontrado para notificação de aprovação.");
  }

  const fullName = prof.full_name || prof.google_email || "Profissional";

  const notificationResult = await sendNotificationInternal(
    targetUserId,
    options.title || "Acesso liberado",
    options.content || "Seu cadastro foi liberado. Você já pode acessar a plataforma normalmente.",
    options.type || "success",
    options.link || "/painel/dashboard"
  );

  await upsertOnboardingLog(targetUserId, {
    approved_notified_at: new Date().toISOString()
  });

  return { skipped: false, fullName, ...notificationResult };
}

async function sendOnboardingApprovalNotice(targetUserId: string) {
  return sendOnboardingAccessGrantedNotice(targetUserId, {
    title: "Acesso liberado",
    content: "Seu cadastro foi aprovado. Você já pode acessar a plataforma normalmente.",
    type: "success",
    link: "/painel/dashboard"
  });
}

async function bootstrapOnboardingAccess(user: any) {
  const accessControlSettings = await getAccessControlSettings();
  const requireApproval = accessControlSettings.require_approval !== false;

  const { data: prof, error: profError } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email, photo_url, role, status, subscription_plan, subscription_status, subscription_ends_at, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profError) throw profError;

  if (!prof) {
    await ensureActiveProfessionalProfile(user);
    await sendWelcomeEmail(user.id, "active").catch((err) => {
      console.warn("[Onboarding] E-mail de boas-vindas não enviado:", err?.message || err);
    });
    await sendOnboardingAccessGrantedNotice(user.id, {
      title: "Acesso liberado",
      content: `Sua conta foi criada com ${TRIAL_DURATION_DAYS} dias de teste gratuito. Durante esse período, você tem acesso completo como assinante. Ao final do prazo, será necessário escolher um plano para continuar.`,
      type: "success",
      link: "/painel/dashboard"
    });

    const { data: createdProfile, error: fetchError } = await supabaseAdmin
      .from("professionals")
      .select("id, full_name, google_email, photo_url, role, status, subscription_plan, subscription_status, subscription_ends_at, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    return {
      success: true,
      requireApproval,
      profile: createdProfile,
      autoActivated: true
    };
  }

  if (prof.status === "pending" && !requireApproval) {
    const { error: updateError } = await supabaseAdmin
      .from("professionals")
      .update({
        status: "active",
        ...buildTrialSubscriptionWindow(),
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    await sendOnboardingAccessGrantedNotice(user.id, {
      title: "Acesso liberado",
      content: "Seu cadastro foi liberado automaticamente. Você já pode acessar a plataforma normalmente.",
      type: "success",
      link: "/painel/dashboard"
    });
  } else if (prof.status === "pending") {
    await ensurePendingProfessionalProfile(user);
    await sendOnboardingPendingNotice(user);
  }

  const { data: refreshedProfile, error: refreshError } = await supabaseAdmin
    .from("professionals")
    .select("id, full_name, google_email, photo_url, role, status, subscription_plan, subscription_status, subscription_ends_at, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

  if (refreshError) throw refreshError;

  return {
    success: true,
    requireApproval,
    profile: refreshedProfile,
    autoActivated: prof.status === "pending" && !requireApproval
  };
}

app.post("/api/onboarding/bootstrap", requireAuth, async (req: any, res) => {
  try {
    const result = await bootstrapOnboardingAccess(req.user);
    return res.json(result);
  } catch (err: any) {
    console.error("[Onboarding] Erro ao processar bootstrap de acesso:", err);
    return res.status(500).json({ error: err.message || "Falha ao processar acesso do profissional." });
  }
});

app.post("/api/onboarding/pending", requireAuth, async (req: any, res) => {
  try {
    const result = await bootstrapOnboardingAccess(req.user);
    return res.json(result);
  } catch (err: any) {
    console.error("[Onboarding] Erro ao processar notificação de cadastro pendente:", err);
    return res.status(500).json({ error: err.message || "Falha ao notificar cadastro pendente." });
  }
});

app.post("/api/onboarding/approved", requireAuth, requireAdmin, async (req: any, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: "targetUserId ausente" });
  }

  try {
    const result = await sendOnboardingApprovalNotice(targetUserId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Onboarding] Erro ao processar notificação de aprovação:", err);
    return res.status(500).json({ error: err.message || "Falha ao notificar aprovação." });
  }
});

// Helper para enviar notificação (In-App, Push e E-mail)
async function sendNotificationInternal(
  targetUserId: string,
  title: string,
  content: string,
  type: string = "info",
  link?: string,
  imageUrl?: string,
  source: NotificationOrigin = "platform"
) {
  const notificationRecord = {
    user_id: targetUserId,
    title,
    message: content, // Ajustado ao banco existente
    type,
    link,
    image_url: imageUrl
  };

  // A. Criar no banco (In-App)
  const notification = await insertNotificationRecord(notificationRecord);

  if (source === "manual") {
    try {
      await appendManualPushNotificationId(notification.id);
    } catch (markError) {
      console.warn("[Notifications] Não foi possível registrar origem manual:", markError);
    }
  }

  const settings = await getNotificationSettings();

  // B. Enviar Push Notification (se houver inscricoes)
  try {
    webpush.setVapidDetails(
      settings.vapid_subject,
      settings.vapid_public_key,
      settings.vapid_private_key
    );

    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);

    if (subscriptions && subscriptions.length > 0) {
      const payload = JSON.stringify({
        title,
        body: content,
        link: link || "/painel/notifications",
        image: imageUrl
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            payload
          );
        } catch (pushErr: any) {
          console.warn("Falha no envio do push para endpoint:", sub.endpoint, pushErr.message);
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
        }
      }
    }
  } catch (pushGeneralError: any) {
    console.error("Erro geral no disparo de Push:", pushGeneralError.message);
  }

  // C. Enviar e-mail por SMTP se configurado
  let emailSent = false;
  let emailError: string | null = null;
  let emailTo: string | null = null;

  if (hasSmtpEmailSettings(settings) || hasBrevoEmailSettings(settings)) {
    try {
      // Busca o e-mail do profissional diretamente da tabela professionals (mais confiável que auth.admin)
      const { data: profData } = await supabaseAdmin
        .from("professionals")
        .select("google_email, full_name")
        .eq("id", targetUserId)
        .single();

      // Fallback: tenta também pelo auth se o profissional não tiver google_email
      let targetEmail = profData?.google_email || null;
      if (!targetEmail) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
          targetEmail = authUser?.user?.email || null;
        } catch (_) {
          // ignora se falhar, já tentamos pelo profissional
        }
      }

      emailTo = targetEmail;

      if (targetEmail) {
        const viewUrl = `${PRODUCTION_ORIGIN}${link || "/painel/notifications"}`;
        const theme = await getEmailTheme();
        const safeTitle = escapeHtml(title);
        const safeContent = escapeHtml(content);
        const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";

        // Paleta de cores e ícones por tipo de notificação
        const typeConfig: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
          success: { color: "#166534", bg: "#f0fdf4", border: "#bbf7d0", icon: "✅", label: "Sucesso" },
          error:   { color: "#991b1b", bg: "#fff1f2", border: "#fecdd3", icon: "⚠️", label: "Erro" },
          warning: { color: "#92400e", bg: "#fffbeb", border: "#fde68a", icon: "🔔", label: "Atenção" },
          info:    { color: "#1e3a5f", bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ️", label: "Informação" },
        };
        const tc = typeConfig[type] || typeConfig.info;

        const htmlContent = buildEmailShell(theme, {
          title: "Notificação do Sistema",
          subtitle: `${tc.label} • ${escapeHtml(title)}`,
          bodyHtml: `
            ${safeImageUrl ? `<div style="margin:0 0 20px 0; border-radius:10px; overflow:hidden; border:1px solid ${theme.border};"><img src="${safeImageUrl}" alt="Imagem" style="display:block; max-width:100%; max-height:240px; object-fit:cover; width:100%;" /></div>` : ""}
            <h2 style="margin:0 0 12px 0; font-size:18px; font-weight:700; color:${theme.text}; line-height:1.4;">${safeTitle}</h2>
            <p style="margin:0 0 24px 0; font-size:15px; color:${theme.textMuted};">${safeContent}</p>
            <div style="text-align:center; margin:28px 0 8px 0;">
              ${buildEmailButton(theme, viewUrl, "Ver no Aplicativo →")}
            </div>
          `,
          footerHtml: "Esta mensagem foi enviada automaticamente pela plataforma <strong>Evolução Clínica</strong>.<br/>Por favor, não responda a este e-mail."
        });
        const emailResult = await sendTransactionalEmail(settings, {
          userId: targetUserId,
          recipientEmail: targetEmail,
          recipientName: profData?.full_name || null,
          subject: `${tc.icon} ${title}`,
          textContent: `${title}\n\n${content}\n\nVer detalhes no app: ${viewUrl}`,
          htmlContent,
          source: "notification",
          relatedNotificationId: notification.id,
          allowFallback: true
        });

        emailSent = true;
        console.log(`[Email] Notificação de e-mail enviada com sucesso para ${targetEmail} via ${emailResult.provider}`);
      } else {
        emailError = "E-mail do destinatário não encontrado no cadastro do profissional.";
        console.warn(`[Email] E-mail não encontrado para userId: ${targetUserId}`);
      }
    } catch (emailErr: any) {
      emailError = emailErr.message || "Erro desconhecido no envio SMTP";
      console.error("Erro ao enviar e-mail via provedor configurado:", emailErr.message);
    }
  } else {
    emailError = "Nenhum provedor de e-mail configurado no painel admin.";
    console.log(`[Notifications] Nenhum provedor configurado. Notificacao de e-mail suprimida para o usuario ${targetUserId}.`);
  }

  return { notification, emailSent, emailTo, emailError };
}

async function sendTrialExpirationEmail(prof: { id: string; full_name: string | null; google_email: string | null; trial_ends_at: string | null }) {
  const settings = await getNotificationSettings();
  if (!hasSmtpEmailSettings(settings) && !hasBrevoEmailSettings(settings)) {
    throw new Error("Nenhum provedor de e-mails configurado na plataforma.");
  }

  const recipientEmail = prof.google_email || null;
  if (!recipientEmail) {
    throw new Error("E-mail do profissional não encontrado no cadastro.");
  }

  const trialEndsAtDate = prof.trial_ends_at ? new Date(prof.trial_ends_at) : null;
  const trialEndsAtLabel = trialEndsAtDate
    ? trialEndsAtDate.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "há alguns dias";

  const subscriptionUrl = `${PRODUCTION_ORIGIN}/painel/subscription`;
  const professionalName = prof.full_name || "Profissional";
  const theme = await getEmailTheme();

  await sendTransactionalEmail(settings, {
    userId: prof.id,
    recipientEmail,
    recipientName: professionalName,
    subject: "Seu teste gratuito de 7 dias terminou",
    textContent: [
      `Olá, ${professionalName}.`,
      "",
      `Seu período de teste gratuito de ${TRIAL_DURATION_DAYS} dias terminou em ${trialEndsAtLabel}.`,
      "A partir de agora, o acesso completo à plataforma está bloqueado até a contratação de um plano.",
      `Para continuar utilizando o app, escolha um plano em: ${subscriptionUrl}`,
      "",
      "Se você já realizou a assinatura, basta acessar novamente o aplicativo para liberar o acesso."
    ].join("\n"),
    htmlContent: buildEmailShell(theme, {
      title: "Seu teste gratuito terminou",
      subtitle: `Expirou em ${trialEndsAtLabel}`,
      bodyHtml: `
        <p style="margin:0 0 16px 0; font-size:16px;">Olá, <strong>${escapeHtml(professionalName)}</strong>.</p>
        <p style="margin:0 0 16px 0; font-size:15px; color:${theme.textMuted};">
          Seu período de teste gratuito de <strong>${TRIAL_DURATION_DAYS} dias</strong> terminou em <strong>${trialEndsAtLabel}</strong>.
          O acesso completo à plataforma foi encerrado até a contratação de um plano.
        </p>
        ${buildEmailCard(theme, "O que fazer agora", `
          <p style="margin:0; font-size:14px; color:${theme.text};">
            Para continuar utilizando prontuários, evoluções, Google Docs e a sincronização da agenda, escolha um dos planos disponíveis no botão abaixo.
          </p>
        `, { titleColor: theme.secondary })}
        <div style="text-align:center; margin:28px 0 8px 0;">
          ${buildEmailButton(theme, subscriptionUrl, "Assinar um plano agora")}
        </div>
      `,
      footerHtml: "Se você já concluiu a assinatura, pode simplesmente voltar ao aplicativo para ter o acesso liberado novamente."
    }),
    source: "trial-expiration",
    allowFallback: true
  });
}

// 4. Enviar Notificação (In-App, Push e E-mail)
app.post("/api/notifications/send", requireAuth, async (req: any, res) => {
  const { userId, title, content, type = "info", link, imageUrl } = req.body;
  const notificationSource: NotificationOrigin = req.body.source === "platform" ? "platform" : "manual";
  
  if (!title || !content) {
    return res.status(400).json({ error: "Titulo e mensagem sao obrigatorios" });
  }

  const targetUserId = userId || req.user.id;
  const isSelf = targetUserId === req.user.id;
  
  // Relação de segurança
  let isAuthorized = isSelf;
  if (!isSelf) {
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("role")
      .eq("id", req.user.id)
      .single();
    if (prof && prof.role === "admin") {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({ error: "Nao autorizado a enviar notificacoes para outros usuarios" });
  }

  try {
    const result = await sendNotificationInternal(targetUserId, title, content, type, link, imageUrl, notificationSource);
    res.json({
      success: true,
      notification: result.notification,
      email: {
        sent: result.emailSent,
        to: result.emailTo,
        error: result.emailError
      }
    });
  } catch (err: any) {
    console.error("Erro ao disparar notificacao:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4.0. Notificação de Tickets de Suporte (In-App, Push e E-mail)
app.post("/api/support/notify", requireAuth, async (req: any, res) => {
  const { ticketId, action, message, previousStatus, newStatus } = req.body;

  if (!ticketId || !action) {
    return res.status(400).json({ error: "ticketId e action sao obrigatorios" });
  }

  try {
    // 1. Obter o ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: "Chamado nao encontrado" });
    }

    // 2. Obter perfis do criador do chamado e do remetente atual
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from("professionals")
      .select("full_name, subscription_plan, role")
      .eq("id", ticket.user_id)
      .single();

    const { data: sender, error: senderError } = await supabaseAdmin
      .from("professionals")
      .select("full_name, role")
      .eq("id", req.user.id)
      .single();

    // 3. Validar autorização (apenas o próprio dono do ticket ou admins)
    const isSenderAdmin = sender?.role === "admin";
    const isOwner = ticket.user_id === req.user.id;

    if (!isSenderAdmin && !isOwner) {
      return res.status(403).json({ error: "Nao autorizado a disparar notificacoes para este chamado" });
    }

    const isVip = creator?.subscription_plan === "yearly";
    const vipPrefix = isVip ? "👑 [VIP] " : "";
    const link = `/painel/support/${ticketId}`;

    let notificationsSent = 0;

    // Helper para notificar todos os administradores cadastrados (menos o próprio remetente)
    const notifyAdmins = async (title: string, content: string, type: string = "info") => {
      const { data: admins } = await supabaseAdmin
        .from("professionals")
        .select("id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          if (admin.id !== req.user.id) {
            await sendNotificationInternal(admin.id, title, content, type, link);
            notificationsSent++;
          }
        }
      }
    };

    if (action === "create") {
      // A. Notificar o próprio usuário que criou
      const userPlanLabel = creator?.subscription_plan === "yearly"
        ? "Anual/VIP"
        : creator?.subscription_plan === "monthly"
        ? "Mensal"
        : "Gratuito/Avaliação";
      const slaLabel = creator?.subscription_plan === "yearly"
        ? "2 horas úteis"
        : creator?.subscription_plan === "monthly"
        ? "24 horas úteis (12h úteis para faturamento)"
        : "48 horas úteis";

      await sendNotificationInternal(
        ticket.user_id,
        "Chamado Criado com Sucesso",
        `Recebemos o seu chamado sobre '${ticket.subject}'. O prazo de resposta para o seu plano (${userPlanLabel}) é de até ${slaLabel}. Obrigado!`,
        "success",
        link
      );
      notificationsSent++;

      // B. Notificar os administradores
      await notifyAdmins(
        `${vipPrefix}Novo Chamado: ${ticket.subject}`,
        `O profissional ${creator?.full_name || "Desconhecido"} abriu o chamado de suporte.`,
        "info"
      );
    }
    else if (action === "message") {
      const messageSnippet = message
        ? (message.length > 100 ? message.substring(0, 100) + "..." : message)
        : "Anexo enviado.";

      if (isSenderAdmin) {
        // Suporte respondeu -> Notificar usuário
        let title = "Nova Resposta no Chamado";
        let content = `O suporte respondeu ao seu chamado '${ticket.subject}': "${messageSnippet}"`;

        // Se a primeira resposta foi dada agora (dentro de 10 segundos)
        const isFirstResponseNow = ticket.first_response_at &&
          (Math.abs(new Date(ticket.first_response_at).getTime() - Date.now()) < 10000);

        if (isFirstResponseNow) {
          title = "Chamado em Atendimento";
          content = `Seu chamado '${ticket.subject}' agora está em atendimento. O suporte respondeu: "${messageSnippet}"`;
        }

        await sendNotificationInternal(
          ticket.user_id,
          title,
          content,
          "info",
          link
        );
        notificationsSent++;
      } else {
        // Usuário respondeu -> Notificar admins
        await notifyAdmins(
          `${vipPrefix}Nova Resposta: ${ticket.subject}`,
          `O profissional ${sender?.full_name || "Desconhecido"} respondeu: "${messageSnippet}"`,
          "info"
        );
      }
    }
    else if (action === "status_change") {
      if (newStatus === "closed") {
        if (isSenderAdmin) {
          // Encerrado pelo admin -> Notificar usuário
          await sendNotificationInternal(
            ticket.user_id,
            "Chamado Encerrado",
            `Seu chamado sobre '${ticket.subject}' foi finalizado e encerrado pelo suporte.`,
            "success",
            link
          );
          notificationsSent++;
        } else {
          // Encerrado pelo usuário -> Notificar admins
          await notifyAdmins(
            `${vipPrefix}Chamado Encerrado`,
            `O profissional ${sender?.full_name || "Desconhecido"} finalizou e encerrou o chamado '${ticket.subject}'.`,
            "info"
          );
        }
      }
      else if (newStatus === "in_progress") {
        // Em atendimento (somente se feito por admin)
        if (isSenderAdmin) {
          await sendNotificationInternal(
            ticket.user_id,
            "Chamado em Atendimento",
            `Seu chamado sobre '${ticket.subject}' agora está em andamento/atendimento pela nossa equipe.`,
            "info",
            link
          );
          notificationsSent++;
        }
      }
      else if (newStatus === "open" && previousStatus === "closed") {
        // Reaberto pelo usuário -> Notificar admins
        if (!isSenderAdmin) {
          await notifyAdmins(
            `${vipPrefix}Chamado Reaberto`,
            `O profissional ${sender?.full_name || "Desconhecido"} reabriu o chamado '${ticket.subject}'.`,
            "info"
          );
        }
      }
    }

    res.json({ success: true, notificationsSent });
  } catch (err: any) {
    console.error("Erro ao disparar notificacao de suporte:", err);
    res.status(500).json({ error: err.message });
  }
});


// 4.0.5. Notificação de Solicitações de Migração de Prontuários (In-App, Push e E-mail)
app.post("/api/migrations/notify", requireAuth, async (req: any, res) => {
  const { requestId, action, previousStatus, newStatus } = req.body;

  if (!requestId || !action) {
    return res.status(400).json({ error: "requestId e action sao obrigatorios" });
  }

  try {
    // 1. Obter a solicitação
    const { data: request, error: requestError } = await supabaseAdmin
      .from("migration_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !request) {
      return res.status(404).json({ error: "Solicitacao de migracao nao encontrada" });
    }

    // 2. Obter perfis do criador e do remetente
    const { data: creator } = await supabaseAdmin
      .from("professionals")
      .select("full_name, subscription_plan, role")
      .eq("id", request.user_id)
      .single();

    const { data: sender } = await supabaseAdmin
      .from("professionals")
      .select("full_name, role")
      .eq("id", req.user.id)
      .single();

    const isSenderAdmin = sender?.role === "admin";
    const isOwner = request.user_id === req.user.id;

    if (!isSenderAdmin && !isOwner) {
      return res.status(403).json({ error: "Nao autorizado" });
    }

    const link = `/painel/migration`;
    let notificationsSent = 0;

    const notifyAdmins = async (title: string, content: string, type: string = "info") => {
      const { data: admins } = await supabaseAdmin
        .from("professionals")
        .select("id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          if (admin.id !== req.user.id) {
            await sendNotificationInternal(admin.id, title, content, type, link);
            notificationsSent++;
          }
        }
      }
    };

    if (action === "create") {
      const platformLabel = request.previous_platform === 'other_software' 
        ? request.other_platform_name 
        : request.previous_platform === 'excel_word' 
        ? 'Excel/Word' 
        : request.previous_platform === 'paper' 
        ? 'Papel' 
        : request.previous_platform;

      // Notificar o próprio usuário
      await sendNotificationInternal(
        request.user_id,
        "Solicitação de Migração Recebida",
        `Sua solicitação de importação de prontuários da plataforma '${platformLabel}' foi recebida. Analisaremos os dados em breve!`,
        "success",
        link
      );
      notificationsSent++;

      // Notificar administradores
      await notifyAdmins(
        `👑 Nova Solicitação de Migração`,
        `O profissional ${creator?.full_name || "Desconhecido"} enviou arquivos para importar o prontuário do paciente ${request.patient_name}.`,
        "info"
      );
    }
    else if (action === "status_change") {
      if (isSenderAdmin) {
        let statusLabel = "";
        let type: "info" | "success" | "error" = "info";
        
        if (newStatus === "in_progress") {
          statusLabel = "está em andamento";
          type = "info";
        } else if (newStatus === "completed") {
          statusLabel = "foi concluída com sucesso! Seus pacientes e históricos foram importados.";
          type = "success";
        } else if (newStatus === "cancelled") {
          statusLabel = "foi cancelada";
          type = "error";
        }

        await sendNotificationInternal(
          request.user_id,
          "Atualização da Migração de Prontuários",
          `Sua solicitação de migração ${statusLabel}. ` + (request.admin_notes ? `Observações do suporte: "${request.admin_notes}"` : ""),
          type,
          link
        );
        notificationsSent++;
      }
    }

    res.json({ success: true, notificationsSent });
  } catch (err: any) {
    console.error("Erro ao disparar notificacao de migracao:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper para extrair texto de buffers de documentos
async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (ext === 'txt' || ext === 'csv') {
    return buffer.toString('utf-8');
  } 
  else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } 
  else if (ext === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  else {
    throw new Error(`Formato de arquivo não suportado para análise automática: .${ext}`);
  }
}

// 4.0.6. Analisar Documento de Migração de Prontuários (Apenas Admins)
app.post("/api/migrations/extract-text", requireAuth, async (req: any, res) => {
  const { requestId } = req.body;
  const user = req.user;

  if (!requestId) return res.status(400).json({ error: "requestId é obrigatório" });

  try {
    const { data: prof, error: profError } = await supabaseAdmin.from("professionals").select("role").eq("id", user.id).single();
    if (profError || !prof || prof.role !== "admin") return res.status(403).json({ error: "Apenas administradores podem usar esta ferramenta." });

    const { data: request, error: requestError } = await supabaseAdmin.from("migration_requests").select("*").eq("id", requestId).single();
    if (requestError || !request) return res.status(404).json({ error: "Solicitação não encontrada." });
    if (!request.attachment_url) return res.status(400).json({ error: "Nenhum arquivo anexo na solicitação." });

    console.log(`[Concierge-AI] Baixando arquivo: ${request.attachment_url}`);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from("support_attachments").download(request.attachment_url);
    if (downloadError || !fileData) return res.status(500).json({ error: "Falha ao baixar o arquivo." });

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileName = request.attachment_name || "document.bin";

    console.log(`[Concierge-AI] Extraindo texto de: ${fileName}`);
    let extractedText = "";
    try {
      extractedText = await extractTextFromBuffer(buffer, fileName);
    } catch (parseErr: any) {
      return res.status(400).json({ error: parseErr.message || "Erro ao extrair o texto." });
    }

    if (!extractedText.trim()) return res.status(400).json({ error: "O arquivo parece estar vazio." });

    res.json({ success: true, text: extractedText });
  } catch (err: any) {
    console.error("Erro na extração de texto:", err);
    res.status(500).json({ error: err.message || "Erro interno ao extrair texto." });
  }
});

app.post("/api/migrations/analyze-chunk", requireAuth, async (req: any, res) => {
  const { textChunk } = req.body;
  const user = req.user;

  if (!textChunk) return res.status(400).json({ error: "textChunk é obrigatório" });

  try {
    const { data: prof, error: profError } = await supabaseAdmin.from("professionals").select("role").eq("id", user.id).single();
    if (profError || !prof || prof.role !== "admin") return res.status(403).json({ error: "Apenas administradores podem usar esta ferramenta." });

    let apiKey = "";
    try {
      const { data: settingsData, error: settingsError } = await supabaseAdmin.from("settings").select("api_key").eq("id", "gemini").single();
      if (!settingsError && settingsData?.api_key) apiKey = settingsData.api_key;
    } catch (e) { }

    if (!apiKey) apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || "";
    if (!apiKey) return res.status(500).json({ error: "Chave do Gemini ausente no servidor." });

    const ai = new GoogleGenAI({ apiKey });

    console.log(`[Concierge-AI] Analisando chunk de texto (${textChunk.length} caracteres)...`);
    const prompt = `Analise o texto a seguir contendo anotações de evolução clínica de um paciente. 
Identifique todas as sessões de terapia/atendimento listadas no texto.
Para cada sessão identificada, extraia:
1. A data da sessão no formato YYYY-MM-DD. Se a data estiver parcial (ex: "10 de Março"), infira o ano com base no contexto ou assuma 2026. Se não houver data, tente deduzir ou use a data atual.
2. O horário da sessão no formato HH:MM (se houver, senão retorne nulo).
3. O conteúdo clínico completo da evolução/anotação dessa sessão (remova cabeçalhos repetitivos desnecessários, mas preserve todo o relato do atendimento).

Retorne os dados estritamente em formato JSON válido como um array de objetos. Não adicione markdown (como \`\`\`json ou similar), blocos de código ou explicações. Retorne EXCLUSIVAMENTE o JSON estruturado no formato:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "content": "Texto da evolução..."
  }
]

Texto a ser analisado:
${textChunk}`;

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const responseText = geminiResponse.text || "";
    if (!responseText) throw new Error("O Gemini não retornou nenhum texto.");

    const sessions = JSON.parse(responseText);
    res.json({ success: true, sessions });

  } catch (err: any) {
    console.error("Erro no processamento da migração por IA (chunk):", err);
    res.status(500).json({ error: err.message || "Erro interno ao processar arquivo com IA." });
  }
});

app.post("/api/migrations/save-analysis", requireAuth, async (req: any, res) => {
  const { requestId, sessions } = req.body;
  const user = req.user;

  if (!requestId || !sessions) return res.status(400).json({ error: "requestId e sessions são obrigatórios." });

  try {
    const { data: prof, error: profError } = await supabaseAdmin.from("professionals").select("role").eq("id", user.id).single();
    if (profError || !prof || prof.role !== "admin") return res.status(403).json({ error: "Apenas administradores podem usar esta ferramenta." });

    const { error: updateError } = await supabaseAdmin
      .from("migration_requests")
      .update({ ai_analysis_result: sessions })
      .eq("id", requestId);

    if (updateError) throw updateError;
    res.json({ success: true });
  } catch (err: any) {
    console.error("Erro ao salvar análise:", err);
    res.status(500).json({ error: err.message || "Erro interno ao salvar análise." });
  }
});

app.post("/api/migrations/import-sessions", requireAuth, async (req: any, res) => {
  const { requestId, sessionsToImport, patientName, professionalId, forcePatientId } = req.body;
  const user = req.user;

  if (!requestId || !sessionsToImport || !patientName || !professionalId) {
    return res.status(400).json({ error: "Dados incompletos para importação." });
  }

  try {
    const { data: prof, error: profError } = await supabaseAdmin.from("professionals").select("role").eq("id", user.id).single();
    if (profError || !prof || prof.role !== "admin") return res.status(403).json({ error: "Apenas administradores podem usar esta ferramenta." });

    let currentPatientId = forcePatientId;

    if (!currentPatientId) {
      const { data: existingPatient } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("professional_id", professionalId)
        .eq("full_name", patientName)
        .maybeSingle();

      if (existingPatient) {
        currentPatientId = existingPatient.id;
      } else {
        const { data: newPatient, error: createPatientError } = await supabaseAdmin
          .from("patients")
          .insert({ professional_id: professionalId, full_name: patientName, status: "active" })
          .select("id")
          .single();

        if (createPatientError) throw createPatientError;
        currentPatientId = newPatient.id;
      }
    }

    let launchedCount = 0;
    const errors = [];

    for (const session of sessionsToImport) {
      const { error: evolutionError } = await supabaseAdmin
        .from("evolutions")
        .insert({
          professional_id: professionalId,
          patient_id: currentPatientId,
          session_date: session.date,
          session_time: session.time || null,
          transcription_text: session.content,
          transcription_status: "completed",
          google_doc_append_status: "pending",
          status: "draft"
        });

      if (evolutionError) {
        errors.push({ date: session.date, error: evolutionError.message });
      } else {
        launchedCount++;
      }
    }

    res.json({ success: true, launchedCount, patientId: currentPatientId, errors });
  } catch (err: any) {
    console.error("Erro na importação em lote:", err);
    res.status(500).json({ error: err.message || "Erro interno ao importar sessões." });
  }
});


// 4.1. Cron para Enviar Lembretes de Evoluções Clínicas Pendentes
app.get("/api/cron/send-evolution-reminders", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = CRON_SECRET;
  
  if (authHeader !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
    return res.status(401).json({ error: "Nao autorizado" });
  }

  try {
    // 1. Obter data/hora atual no fuso horário do Brasil (America/Sao_Paulo: UTC-3)
    const tzOffset = -3;
    const now = new Date();
    const brazilTime = new Date(now.getTime() + (tzOffset * 60 * 60 * 1000));
    
    const currentDayOfWeek = brazilTime.getUTCDay(); // 0 = Domingo, 1 = Segunda, ...
    const currentDateStr = brazilTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = brazilTime.getUTCHours();
    const currentMinute = brazilTime.getUTCMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    console.log(`[Cron] Iniciando verificação de lembretes. Horário Brasil: ${currentDateStr} ${currentTimeStr}, Dia da Semana: ${currentDayOfWeek}`);

    // 2. Buscar todos os pacientes ativos com lembretes habilitados, incluindo a relação com o profissional
    const { data: patients, error: patientsError } = await supabaseAdmin
      .from("patients")
      .select("*, professionals:professional_id!inner(role, status, subscription_status, subscription_ends_at)")
      .eq("status", "active")
      .eq("evolution_reminder_active", true);

    if (patientsError) throw patientsError;

    if (!patients || patients.length === 0) {
      return res.json({ success: true, message: "Nenhum paciente com lembrete de evolucao ativo." });
    }

    let notificationsSentCount = 0;

    for (const patient of patients) {
      // Verifica se o profissional tem assinatura ativa
      const prof = (patient as any).professionals;
      if (!prof) continue;

      if (prof.status !== "active") {
        continue; // Profissional inativo
      }

      if (prof.role !== "admin") {
        const endsAt = prof.subscription_ends_at ? new Date(prof.subscription_ends_at) : null;
        const isExpired = endsAt ? endsAt < now : false;
        const isActive = prof.subscription_status === "active" || prof.subscription_status === "trialing";

        if (!isActive || isExpired) {
          continue; // Sem plano ativo
        }
      }

      // Verifica se o dia da semana atual está nos dias cadastrados
      const days = patient.session_days || [];
      if (!days.includes(currentDayOfWeek)) {
        continue;
      }

      // Verifica se há horário configurado e se o horário atual já passou do horário da sessão
      if (!patient.session_time) {
        continue;
      }

      const sessionTimeStr = patient.session_time.substring(0, 5); // "HH:MM"
      if (currentTimeStr < sessionTimeStr) {
        continue; // Sessão ainda não ocorreu hoje
      }

      // Verifica se já existe evolução registrada para este paciente hoje
      const { data: evolutions, error: evolutionsError } = await supabaseAdmin
        .from("evolutions")
        .select("id")
        .eq("patient_id", patient.id)
        .eq("session_date", currentDateStr)
        .limit(1);

      if (evolutionsError) {
        console.error(`[Cron] Erro ao buscar evoluções do paciente ${patient.id}:`, evolutionsError.message);
        continue;
      }

      // Se já evoluiu hoje, não precisa enviar lembrete
      if (evolutions && evolutions.length > 0) {
        continue;
      }

      // Verifica se o lembrete já foi enviado hoje para evitar duplicidade no mesmo dia
      const startOfDay = new Date(brazilTime);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startOfDayUTC = new Date(startOfDay.getTime() - (tzOffset * 60 * 60 * 1000));

      const { data: sentNotifications, error: sentNotificationsError } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", patient.professional_id)
        .eq("link", `/painel/patients/${patient.id}`)
        .like("title", "%Lembrete de Evolução%")
        .gte("created_at", startOfDayUTC.toISOString());

      if (sentNotificationsError) {
        console.error(`[Cron] Erro ao verificar lembretes enviados para o paciente ${patient.id}:`, sentNotificationsError.message);
        continue;
      }

      if (sentNotifications && sentNotifications.length > 0) {
        continue; // Lembrete já disparado hoje
      }

      // Dispara a notificação (In-App, Push e E-mail)
      try {
        console.log(`[Cron] Enviando lembrete de evolução para o profissional ${patient.professional_id} sobre o paciente ${patient.full_name}`);
        
        await sendNotificationInternal(
          patient.professional_id,
          `🔔 Lembrete de Evolução: ${patient.full_name}`,
          `O atendimento do(a) paciente ${patient.full_name} foi agendado para hoje às ${sessionTimeStr}. Não se esqueça de preencher a evolução clínica correspondente.`,
          "warning",
          `/painel/patients/${patient.id}`
        );
        
        notificationsSentCount++;
      } catch (sendErr: any) {
        console.error(`[Cron] Falha ao enviar lembrete do paciente ${patient.id}:`, sendErr.message);
      }
    }

    res.json({
      success: true,
      message: `Verificação de lembretes concluída. Lembretes enviados hoje: ${notificationsSentCount}`
    });
  } catch (err: any) {
    console.error("[Cron] Erro no job de lembretes de evoluções:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4.2. Cron para enviar e-mail quando o trial gratuito de 7 dias expirar
app.get("/api/cron/send-trial-expiration-notices", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = CRON_SECRET;

  if (authHeader !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
    return res.status(401).json({ error: "Nao autorizado" });
  }

  try {
    const now = new Date();
    const { data: expiredTrials, error } = await supabaseAdmin
      .from("professionals")
      .select("id, full_name, google_email, trial_ends_at, subscription_plan, subscription_status, trial_expiration_email_sent_at, status")
      .eq("status", "active")
      .eq("subscription_plan", "trial")
      .eq("subscription_status", "trialing")
      .lte("trial_ends_at", now.toISOString())
      .is("trial_expiration_email_sent_at", null);

    if (error) throw error;

    if (!expiredTrials || expiredTrials.length === 0) {
      return res.json({ success: true, message: "Nenhum trial expirado encontrado." });
    }

    let emailsSent = 0;
    let updateFailures = 0;

    for (const prof of expiredTrials) {
      try {
        await sendTrialExpirationEmail(prof);

        const { error: updateError } = await supabaseAdmin
          .from("professionals")
          .update({
            subscription_status: "canceled",
            subscription_ends_at: prof.trial_ends_at || now.toISOString(),
            trial_expiration_email_sent_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq("id", prof.id);

        if (updateError) {
          updateFailures++;
          console.error(`[Cron Trial] Erro ao atualizar profissional ${prof.id}:`, updateError.message);
          continue;
        }

        emailsSent++;
      } catch (sendErr: any) {
        console.error(`[Cron Trial] Falha ao enviar e-mail de expiração para ${prof.id}:`, sendErr.message);
      }
    }

    res.json({
      success: true,
      message: `Processamento concluído. E-mails enviados: ${emailsSent}. Falhas na atualização: ${updateFailures}.`
    });
  } catch (err: any) {
    console.error("[Cron Trial] Erro no job de expiração do trial:", err);
    res.status(500).json({ error: err.message || "Erro ao processar expiração do trial." });
  }
});

// 5. Testar Servidor SMTP (Apenas Admin)
app.post("/api/notifications/test-email", requireAuth, async (req: any, res) => {
  try {
    // A. Verificar se o usuario logado e administrador
    const { data: prof, error: profError } = await supabaseAdmin
      .from("professionals")
      .select("role")
      .eq("id", req.user.id)
      .single();
      
    if (profError || !prof || prof.role !== "admin") {
      return res.status(403).json({ error: "Nao autorizado. Apenas administradores podem testar o servidor SMTP." });
    }

    const {
      toEmail,
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPass,
      smtpFrom,
      brevoApiKey,
      brevoSenderName,
      brevoSenderEmail
    } = req.body;
    
    if (!toEmail) {
      return res.status(400).json({ error: "E-mail de destino é obrigatório." });
    }

    const testSettings = {
      email_provider: provider || "smtp",
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_secure: smtpSecure,
      smtp_user: smtpUser,
      smtp_pass: smtpPass,
      smtp_from: smtpFrom,
      brevo_api_key: brevoApiKey,
      brevo_sender_name: brevoSenderName,
      brevo_sender_email: brevoSenderEmail
    };

    const theme = await getEmailTheme();

    const result = await sendTransactionalEmail(testSettings, {
      recipientEmail: toEmail,
      recipientName: null,
      subject: "[Evolução Clínica] Teste de Conexão de E-mail 🎉",
      textContent: "Se você recebeu este e-mail, significa que as configurações do provedor de envio estão corretas e prontas para uso no sistema.",
      htmlContent: buildEmailShell(theme, {
        title: "Teste de e-mail global",
        subtitle: "Conexão de e-mail funcionando",
        bodyHtml: `
          <p style="font-size:16px; font-weight:700; color:${theme.text}; margin:0 0 12px 0;">Conexão de e-mail funcionando! 🎉</p>
          <p style="font-size:15px; margin:0 0 24px 0; color:${theme.textMuted};">Este é um e-mail de teste disparado a partir das configurações preenchidas na plataforma. Seu provedor está configurado corretamente.</p>
        `,
        footerHtml: "Evolução Clínica - Plataforma Inteligente"
      }),
      source: "test-email",
      allowFallback: false
    });

    res.json({ success: true, provider: result.provider });
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de teste:", err);
    res.status(500).json({ error: err.message || "Erro desconhecido ao disparar e-mail de teste." });
  }
});

// 5.1. E-mail de confirmação/falha de assinatura
app.post("/api/subscriptions/payment-email", requireAuth, async (req: any, res) => {
  try {
    const { kind, planId, paymentMethodLabel, subscriptionId, invoiceId, invoiceUrl, invoicePdfUrl, amount, currency, nextRenewalAt, failureMessage } = req.body || {};

    if (!kind || !planId) {
      return res.status(400).json({ error: "kind e planId sao obrigatorios." });
    }

    if (kind !== "success" && kind !== "failure") {
      return res.status(400).json({ error: "kind deve ser success ou failure." });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("professionals")
      .select("full_name, google_email")
      .eq("id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Profissional não encontrado para envio do e-mail." });
    }

    const recipientEmail = profile.google_email || req.user.email || "";
    if (!recipientEmail) {
      return res.status(400).json({ error: "E-mail do profissional não encontrado no cadastro." });
    }

    const { data: planData, error: planError } = await supabaseAdmin
      .from("plans")
      .select("name, description, features, price")
      .eq("id", planId)
      .maybeSingle();

    if (planError) {
      return res.status(500).json({ error: planError.message || "Erro ao buscar dados do plano." });
    }

    const planName = planData?.name
      || (planId === "monthly" ? "Plano Mensal" : planId === "yearly" ? "Plano Anual" : "Plano de Assinatura");
    const planDescription = planData?.description || "";
    const planFeatures = normalizePlanFeatureList(planData?.features);
    const fallbackAmount = Number(planData?.price || 0);
    const priceToShow = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : fallbackAmount;
    const amountLabel = priceToShow > 0 ? formatCurrencyLabel(priceToShow, String(currency || "BRL")) : null;
    const paymentDescriptor = normalizePaymentDescriptor(paymentMethodLabel);
    const professionalName = profile.full_name || "Profissional";
    const renewalLabel = nextRenewalAt ? new Date(nextRenewalAt).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }) : null;
    const subscriptionDateLabel = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const highlightedFeatures = planFeatures.slice(0, 4);
    const featureBullets = highlightedFeatures.length > 0
      ? highlightedFeatures
      : planId === "yearly"
        ? ["Tudo do plano mensal", "Suporte prioritário via e-mail", "Melhor custo-benefício anualizado", "Novos recursos em primeira mão"]
        : ["Pacientes ilimitados", "Evoluções clínicas com IA ilimitadas", "Integração com Google Docs em tempo real", "Gravação e transcrição de áudio nativa"];

    const settings = await getNotificationSettings();
    const theme = await getEmailTheme();
    const isSuccess = kind === "success";
    const subject = isSuccess
      ? `[Evolução Clínica] Assinatura confirmada - ${planName}`
      : `[Evolução Clínica] Falha ao processar sua assinatura - ${planName}`;

    const transactionLines = [
      `Plano: ${planName}`,
      amountLabel ? `Valor: ${amountLabel}` : null,
      paymentDescriptor ? `Forma de pagamento: ${paymentDescriptor}` : null,
      subscriptionId ? `Assinatura Google Pay: ${subscriptionId}` : null,
      invoiceId ? `Fatura Google Pay: ${invoiceId}` : null,
      renewalLabel ? `Próxima renovação: ${renewalLabel}` : null,
      `Data do processamento: ${subscriptionDateLabel}`
    ].filter(Boolean) as string[];

    const transactionRowsHtml = transactionLines
      .map((line) => `<div style="margin:0 0 8px 0;">• ${escapeHtml(line)}</div>`)
      .join("");

    const featureRowsHtml = featureBullets
      .map((feature) => `<div style="margin:0 0 8px 0;">• ${escapeHtml(feature)}</div>`)
      .join("");

    const invoiceButtonsHtml = [
      invoiceUrl ? buildEmailButton(theme, escapeHtml(invoiceUrl), "Ver fatura", theme.primary) : "",
      invoicePdfUrl ? buildEmailButton(theme, escapeHtml(invoicePdfUrl), "Baixar PDF", theme.secondary) : ""
    ].join("");

    const textContent = isSuccess
      ? [
          `Olá, ${professionalName}.`,
          "",
          `Seu pedido foi processado com sucesso usando ${paymentDescriptor}.`,
          amountLabel ? `Valor confirmado: ${amountLabel}.` : null,
          subscriptionId ? `Assinatura Google Pay: ${subscriptionId}.` : null,
          invoiceId ? `Fatura Google Pay: ${invoiceId}.` : null,
          renewalLabel ? `Próxima renovação: ${renewalLabel}.` : null,
          "",
          `Boas-vindas ao ${planName}.`,
          planDescription ? `Resumo do plano: ${planDescription}` : null,
          "Você terá acesso aos benefícios abaixo:",
          ...featureBullets.map((feature) => `- ${feature}`),
          "",
          "Se precisar de apoio, responda este e-mail ou acesse a área de suporte da plataforma."
        ].filter(Boolean).join("\n")
      : [
          `Olá, ${professionalName}.`,
          "",
          `Não foi possível concluir a cobrança via ${paymentDescriptor}.`,
          failureMessage ? `Motivo informado: ${failureMessage}` : "A cobrança não foi aprovada ou a validação da transação falhou.",
          `Plano selecionado: ${planName}.`,
          amountLabel ? `Valor da tentativa: ${amountLabel}.` : null,
          "",
          "Nenhum plano foi ativado nesta tentativa.",
          "Você pode revisar os dados do cartão no Google Pay e tentar novamente.",
          "Se preferir, basta refazer a assinatura diretamente na plataforma.",
          "",
          "Se precisar de ajuda, responda este e-mail ou fale com o suporte."
        ].filter(Boolean).join("\n");

    const htmlContent = isSuccess
      ? buildEmailShell(theme, {
          title: "Assinatura confirmada com sucesso",
          subtitle: `Processada com ${escapeHtml(paymentDescriptor)}`,
          bodyHtml: `
            <p style="margin:0 0 14px 0; font-size:16px;">Olá, <strong>${escapeHtml(professionalName)}</strong>.</p>
            <p style="margin:0 0 18px 0; font-size:15px; color:${theme.textMuted};">
              Seu pedido foi processado com sucesso usando <strong>${escapeHtml(paymentDescriptor)}</strong>.
              ${amountLabel ? `O valor confirmado foi <strong>${escapeHtml(amountLabel)}</strong>.` : ""}
            </p>
            ${buildEmailCard(theme, `Boas-vindas ao ${escapeHtml(planName)}`, `
              <p style="margin:0 0 12px 0; font-size:14px; color:${theme.textMuted};">${escapeHtml(planDescription || "Você agora tem acesso ao pacote de recursos selecionado.")}</p>
              <div style="margin:0; color:${theme.text}; font-size:14px; line-height:1.8;">
                ${featureRowsHtml}
              </div>
            `, { titleColor: theme.primary })}
            ${buildEmailCard(theme, "Resumo da transação", `
              <div style="margin:0; color:${theme.text}; font-size:14px; line-height:1.8;">
                ${transactionRowsHtml}
              </div>
            `, { titleColor: theme.secondary, background: hexToRgba(theme.secondary, 0.06) })}
            ${invoiceButtonsHtml ? `<div style="margin-top:16px;">${invoiceButtonsHtml}</div>` : ""}
          `,
          footerHtml: "Este e-mail contém o comprovante de confirmação da sua assinatura e os dados principais da transação."
        })
      : buildEmailShell(theme, {
          title: "Falha ao processar a assinatura",
          subtitle: `Tentativa via ${escapeHtml(paymentDescriptor)}`,
          bodyHtml: `
            <p style="margin:0 0 14px 0; font-size:16px;">Olá, <strong>${escapeHtml(professionalName)}</strong>.</p>
            <p style="margin:0 0 18px 0; font-size:15px; color:${theme.textMuted};">
              Não foi possível concluir a cobrança via <strong>${escapeHtml(paymentDescriptor)}</strong>.
              ${failureMessage ? `Motivo informado: <strong>${escapeHtml(failureMessage)}</strong>` : "A cobrança não foi aprovada ou a validação da transação falhou."}
            </p>
            ${buildEmailCard(theme, "Detalhes da tentativa", `
              <div style="margin:0; color:${theme.text}; font-size:14px; line-height:1.8;">
                ${transactionRowsHtml}
              </div>
            `, { titleColor: theme.secondary, background: hexToRgba(theme.secondary, 0.06) })}
            ${buildEmailCard(theme, "O que fazer agora", `
              <div style="margin:0; color:${theme.text}; font-size:14px; line-height:1.8;">
                <div style="margin:0 0 8px 0;">• Revise os dados de pagamento no Google Pay e tente novamente.</div>
                <div style="margin:0 0 8px 0;">• Se houver dúvida, fale com o suporte para revisar a cobrança.</div>
                <div style="margin:0;">• Nenhuma ativação de plano foi concluída nesta tentativa.</div>
              </div>
            `, { titleColor: theme.primary })}
          `,
          footerHtml: "Assim que a transação for aprovada, você receberá um novo e-mail de confirmação."
        });

    let emailSent = false;
    let emailError: string | null = null;

    try {
      await sendTransactionalEmail(settings, {
        userId: req.user.id,
        recipientEmail,
        recipientName: professionalName,
        subject,
        textContent,
        htmlContent,
        source: isSuccess ? "subscription-success" : "subscription-failure",
        allowFallback: true
      });
      emailSent = true;
    } catch (sendError: any) {
      emailError = sendError?.message || "Falha ao enviar o e-mail de assinatura.";
      console.warn("[Subscriptions] Falha ao enviar e-mail de assinatura:", emailError);
    }

    return res.json({
      success: true,
      emailSent,
      emailError,
      recipientEmail
    });
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de assinatura:", err);
    res.status(500).json({ error: err.message || "Erro ao enviar e-mail da assinatura." });
  }
});

// --- API RELATÓRIOS E PDI POR IA ---

// 1. Gerar Relatório ou PDI com Gemini IA
app.post("/api/patients/:id/ai-report", requireAuth, requireActiveSubscription, async (req: any, res) => {
  try {
    const patientId = req.params.id;
    const { period, startDate, endDate, type, googleAccessToken } = req.body;

    if (!period || !type) {
      return res.status(400).json({ error: "Parâmetros 'period' e 'type' são obrigatórios." });
    }

    if (!googleAccessToken) {
      return res.status(400).json({ error: "O token do Google Drive/Docs (googleAccessToken) é obrigatório para ler o prontuário." });
    }

    // A. Validar se o paciente pertence ao profissional logado
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("professional_id", req.user.id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: "Paciente não encontrado ou não pertence a este profissional." });
    }

    if (!patient.google_doc_id) {
      return res.status(400).json({ error: "Este paciente não possui um documento do Google Docs (prontuário) vinculado." });
    }

    // B. Obter informações do profissional logado
    const { data: professional, error: profError } = await supabaseAdmin
      .from("professionals")
      .select("full_name, professional_title, professional_register")
      .eq("id", req.user.id)
      .single();

    const profName = professional?.full_name || req.user.user_metadata?.full_name || "Profissional";
    const profTitle = professional?.professional_title || "Terapeuta";
    const profRegister = professional?.professional_register || null;
    // Linha de rodapé: inclui o número de registro caso exista
    const profSignature = profRegister
      ? `${profName} — ${profTitle} | Registro: ${profRegister}`
      : `${profName} — ${profTitle}`;

    // C. Determinar o intervalo de datas (para repassar ao prompt da IA)
    let start: string | null = null;
    let end: string | null = null;

    const today = new Date();
    if (period === "3_months") {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      start = d.toISOString().split('T')[0];
    } else if (period === "6_months") {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      start = d.toISOString().split('T')[0];
    } else if (period === "custom") {
      if (!startDate) {
        return res.status(400).json({ error: "Data inicial é obrigatória para o período personalizado." });
      }
      start = startDate;
      if (endDate) {
        end = endDate;
      }
    }

    const formatDateForPrompt = (dateStr: string | null) => {
      if (!dateStr) return "";
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    };

    const periodText = period === "3_months" 
      ? "últimos 3 meses (desde " + formatDateForPrompt(start) + " até hoje)" 
      : period === "6_months" 
      ? "últimos 6 meses (desde " + formatDateForPrompt(start) + " até hoje)" 
      : `período personalizado de ${formatDateForPrompt(start)} a ${end ? formatDateForPrompt(end) : 'hoje'}`;

    // D. Buscar conteúdo do prontuário no Google Docs
    console.log(`[AI-Report] Buscando conteúdo do documento GDocs: ${patient.google_doc_id}...`);
    const docUrl = `https://docs.googleapis.com/v1/documents/${patient.google_doc_id}`;
    const docRes = await fetch(docUrl, {
      headers: {
        "Authorization": `Bearer ${googleAccessToken}`
      }
    });

    if (!docRes.ok) {
      const errText = await docRes.text();
      console.error(`[AI-Report] Erro ao buscar Google Doc (${docRes.status}):`, errText);
      if (docRes.status === 401) {
        return res.status(401).json({ error: "Sessão do Google expirada. Por favor, reautentique clicando no botão do Google no painel." });
      }
      return res.status(400).json({ error: `Erro da API do Google Docs (${docRes.status}): ${docRes.statusText}` });
    }

    const doc: any = await docRes.json();
    let docContent = "";

    if (doc.body && doc.body.content) {
      doc.body.content.forEach((element: any) => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach((el: any) => {
            if (el.textRun && el.textRun.content) {
              docContent += el.textRun.content;
            }
          });
        } else if (element.table && element.table.tableRows) {
          element.table.tableRows.forEach((row: any) => {
            if (row.tableCells) {
              row.tableCells.forEach((cell: any) => {
                if (cell.content) {
                  cell.content.forEach((cellElement: any) => {
                    if (cellElement.paragraph && cellElement.paragraph.elements) {
                      cellElement.paragraph.elements.forEach((el: any) => {
                        if (el.textRun && el.textRun.content) {
                          docContent += el.textRun.content;
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }

    if (!docContent.trim()) {
      return res.status(400).json({ error: "O prontuário do paciente no Google Docs está vazio ou não possui texto clínico legível." });
    }

    // E. Configurar a chave do Gemini
    let apiKey = "";
    try {
      const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from("settings")
        .select("api_key")
        .eq("id", "gemini")
        .single();
      if (!settingsError && settingsData?.api_key) {
        apiKey = settingsData.api_key;
      }
    } catch (e) {
      console.warn("Erro ao ler chave do Gemini do banco:", e);
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || "";
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Configuração do Gemini (chave de API) ausente no servidor." });
    }

    // F. Preparar prompt e chamar Gemini
    const ai = new GoogleGenAI({ apiKey });

    let systemPrompt = "";
    if (type === "evolution_report") {
      systemPrompt = `Você é um assistente de IA especializado na área da saúde e terapia (Terapia Ocupacional, Fonoaudiologia, Psicologia, etc.).
Sua tarefa é analisar o prontuário em texto corrido de um paciente (obtido diretamente de seu arquivo no Google Docs) e gerar um "Relatório de Evolução Periódico" detalhado e profissional, com uma linguagem ética, científica e acolhedora, voltado para pais, médicos ou escolas.

FILTRAGEM DE PERÍODO CRÍTICA:
O prontuário abaixo contém registros de várias sessões clínicas, geralmente contendo cabeçalhos ou prefixos como "Data da sessão: DD/MM/AAAA às HH:MM" ou semelhantes.
Você DEVE identificar cronologicamente as sessões e analisar APENAS as sessões clínicas que ocorreram no seguinte período: ${periodText}.
Ignore completamente qualquer relato de sessão ocorrido antes ou depois desse intervalo.
Caso o documento não possua datas explícitas nas sessões, analise os registros clínicos mais recentes do documento que façam sentido temporal.
Se o documento não contiver relatos suficientes para o período solicitado, avise em tom profissional e retorne um texto explicando isso.

FORMATO DE SAÍDA OBRIGATÓRIO — MARKDOWN:
Você DEVE retornar o relatório inteiramente em formato Markdown, seguindo EXATAMENTE esta estrutura:

# Relatório de Evolução Clínica
**Paciente:** [Nome do Paciente]  
**Período Analisado:** [Período]  
**Profissional:** [Nome do Profissional]  
**Especialidade:** [Cargo/Especialidade]  
${profRegister ? `**Registro Profissional:** ${profRegister}  ` : ''}
**Data de Emissão:** [Data de hoje em DD/MM/AAAA]

---

## 1. Resumo do Período
[Parágrafo descritivo sobre o processo terapêutico no período]

## 2. Marcos Alcançados
- [Marco 1]
- [Marco 2]
- [Marco 3]
(use quantos itens forem necessários)

## 3. Pontos que Precisam de Atenção
- [Ponto 1]
- [Ponto 2]

## 4. Recomendações e Conclusão
[Parágrafos com sugestões práticas para família/escola e considerações finais]

---
*Documento gerado por ${profSignature}*

Regras de formatação:
- Use **negrito** para destacar termos clínicos importantes, nomes de habilidades ou conquistas relevantes.
- Use listas com hífen (- item) para enumerar marcos e pontos de atenção.
- Separe seções com linha horizontal (---) quando necessário.
- NÃO use numeração tipo "1." no texto corrido das seções — apenas nos cabeçalhos de seção (## 1., ## 2., etc.).
- NÃO inclua blocos de código, tabelas ou qualquer outro elemento Markdown além dos mencionados acima.

Dados do Paciente:
- Nome: ${patient.full_name}
- Notas gerais do prontuário: ${patient.notes || "Nenhuma nota cadastrada"}

Dados do Profissional:
- Nome: ${profName}
- Especialidade/Cargo: ${profTitle}${profRegister ? ` | Registro: ${profRegister}` : ''}

IMPORTANTE: A especialidade é "${profTitle}". Use esse contexto para calibrar os objetivos terapêuticos, terminologia e ênfases do relatório. Por exemplo, um Terapeuta Ocupacional foca em AVDs e integração sensorial; um Fonoaudiólogo em comunicação e deglutição; um Psicólogo em comportamento e saúde mental; e assim por diante.

Conteúdo do Prontuário Lido do Google Docs:
----------------------------------------
${docContent}
----------------------------------------

Escreva em português brasileiro de forma fluida, ética e extremamente profissional.`;
    } else {
      systemPrompt = `Você é um assistente de IA especializado na área da saúde e terapia (Terapia Ocupacional, Fonoaudiologia, Psicologia, etc.).
Sua tarefa é analisar o prontuário em texto corrido de um paciente (obtido diretamente de seu arquivo no Google Docs) e criar um "Rascunho de Plano de Desenvolvimento Individual (PDI)" para orientar os próximos passos da terapia, bem como fornecer estratégias práticas para a escola e para a família.

FILTRAGEM DE PERÍODO CRÍTICA:
O prontuário abaixo contém registros de várias sessões clínicas, geralmente contendo cabeçalhos ou prefixos como "Data da sessão: DD/MM/AAAA às HH:MM" ou semelhantes.
Você DEVE identificar cronologicamente as sessões e analisar APENAS as sessões clínicas que ocorreram no seguinte período: ${periodText}.
Ignore completamente qualquer relato de sessão ocorrido antes ou depois desse intervalo.
Caso o documento não possua datas explícitas nas sessões, analise os registros clínicos mais recentes do documento que façam sentido temporal.
Se o documento não contiver relatos suficientes para o período solicitado, avise em tom profissional e retorne um texto explicando isso.

FORMATO DE SAÍDA OBRIGATÓRIO — MARKDOWN:
Você DEVE iniciar a sua resposta DIRETAMENTE com a linha de título "# Plano de Desenvolvimento Individual (PDI)".
NÃO INCLUA nenhuma introdução, saudação, análise prévia de dados/sessão/nomes, justificativas ou qualquer comentário explicativo antes do título.
O texto gerado deve começar imediatamente com a linha "# Plano de Desenvolvimento Individual (PDI)".

Você DEVE retornar o PDI inteiramente em formato Markdown, seguindo EXATAMENTE esta estrutura:

# Plano de Desenvolvimento Individual (PDI)
**Paciente:** [Nome do Paciente]  
**Data do Plano:** [Data de hoje em DD/MM/AAAA]  
**Profissional:** [Nome do Profissional]  
**Especialidade:** [Cargo/Especialidade]  
${profRegister ? `**Registro Profissional:** ${profRegister}  ` : ''}

---

## 1. Objetivos Terapêuticos Gerais
- [Objetivo 1]
- [Objetivo 2]

## 2. Estratégias para a Família
- [Estratégia 1]
- [Estratégia 2]

## 3. Estratégias para a Escola
- [Orientação 1]
- [Orientação 2]

## 4. Próximos Passos na Terapia
- [Meta 1]
- [Meta 2]

---
*Documento elaborado por ${profSignature}*

Regras de formatação:
- Use **negrito** para destacar termos clínicos importantes, objetivos prioritários ou estratégias-chave.
- Use listas com hífen (- item) para todas as enumerações.
- Separe seções com linha horizontal (---) quando necessário.
- NÃO use numeração tipo "1." no texto corrido — apenas nos cabeçalhos de seção (## 1., ## 2., etc.).
- NÃO inclua blocos de código, tabelas ou qualquer outro elemento Markdown além dos mencionados acima.

Dados do Paciente:
- Nome: ${patient.full_name}
- Notas gerais do prontuário: ${patient.notes || "Nenhuma nota cadastrada"}

Dados do Profissional:
- Nome: ${profName}
- Especialidade/Cargo: ${profTitle}${profRegister ? ` | Registro: ${profRegister}` : ''}

IMPORTANTE: A especialidade é "${profTitle}". Use esse contexto para calibrar os objetivos e estratégias do PDI com termos e enfoques específicos dessa área. Por exemplo, um Terapeuta Ocupacional foca em AVDs, independência funcional e integração sensorial; um Fonoaudiólogo em comunicação, linguagem e deglutição; um Psicólogo em comportamento, vínculo e regulação emocional; e assim por diante.

Conteúdo do Prontuário Lido do Google Docs:
----------------------------------------
${docContent}
----------------------------------------

Escreva em português brasileiro de forma prática, detalhada e empática.`;
    }

    console.log(`[AI-Report] Enviando solicitação ao Gemini para o paciente ${patient.full_name} (${type})...`);
    
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt
    });

    let reportText = geminiResponse.text || "";
    if (!reportText) {
      throw new Error("O Gemini não retornou nenhum texto.");
    }

    // Limpeza programática de qualquer introdução conversacional ou observação de metadados
    if (type === "evolution_report") {
      const targetHeader = "# Relatório de Evolução Clínica";
      const index = reportText.indexOf(targetHeader);
      if (index !== -1) {
        reportText = reportText.substring(index);
      }
    } else {
      const targetHeader = "# Plano de Desenvolvimento Individual (PDI)";
      const index = reportText.indexOf(targetHeader);
      if (index !== -1) {
        reportText = reportText.substring(index);
      }
    }

    res.json({ report: reportText.trim() });

  } catch (err: any) {
    console.error("Erro na geração de relatório com IA:", err);
    res.status(500).json({ error: err.message || "Erro interno ao gerar o relatório." });
  }
});

// 2. Enviar Relatório por E-mail
app.post("/api/patients/:id/send-report-email", requireAuth, requireActiveSubscription, async (req: any, res) => {
  try {
    const patientId = req.params.id;
    const { toEmail, subject, textContent, pdfBase64, filename, reportId, origin } = req.body;

    if (!toEmail || !subject || !textContent) {
      return res.status(400).json({ error: "Parâmetros 'toEmail', 'subject' e 'textContent' são obrigatórios." });
    }

    // A. Validar se o paciente pertence ao profissional
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("professional_id", req.user.id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: "Paciente não encontrado ou não pertence a este profissional." });
    }

    // B. Obter configurações do SMTP
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "notification_settings")
      .single();

    let settings: any = {};
    if (settingsData && settingsData.api_key) {
      try {
        settings = JSON.parse(settingsData.api_key);
      } catch (e) {
        console.error("Erro ao ler JSON de configuracoes de SMTP:", e);
      }
    }

    if (!hasSmtpEmailSettings(settings) && !hasBrevoEmailSettings(settings)) {
      return res.status(500).json({ error: "Nenhum provedor de e-mails está configurado na plataforma." });
    }

    const theme = await getEmailTheme();
    const publicLink = reportId ? `${origin || "https://evolucaoclinica.app.br"}/public/reports/${reportId}` : null;

    // Formatar como HTML (quebrando linhas)
    const formattedHtml = buildEmailShell(theme, {
      title: "Relatório de Desenvolvimento / Evolução",
      subtitle: `Paciente: ${escapeHtml(patient.full_name)}`,
      bodyHtml: `
        <div style="padding:0; background:${theme.surface}; color:${theme.text}; line-height:1.7; font-size:15px; white-space:pre-wrap; font-family:inherit;">
          ${escapeHtml(textContent).replace(/\n/g, "<br/>")}
        </div>
        ${publicLink ? `
        <div style="margin-top: 30px; text-align: center; border-top: 1px dashed ${theme.border || '#e7e5e4'}; padding-top: 25px;">
          <p style="font-size: 14px; color: ${theme.textMuted || '#78716c'}; margin-bottom: 15px; font-family: inherit;">
            Este documento foi assinado digitalmente. Para visualizar o documento original assinado e realizar o download do PDF homologado, clique no botão abaixo:
          </p>
          <a href="${publicLink}" style="display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px; font-family: inherit; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            Visualizar PDF Assinado 🔒
          </a>
          <p style="font-size: 11px; color: ${theme.textMuted || '#78716c'}; margin-top: 12px; font-family: inherit;">
            Se o botão não funcionar, copie e cole este link no navegador:<br/>
            <a href="${publicLink}" style="color: #3b82f6; text-decoration: underline;">${publicLink}</a>
          </p>
        </div>
        ` : ""}
      `,
      footerHtml: "Enviado com segurança via Evolução Clínica - Plataforma Inteligente"
    });

    const result = await sendTransactionalEmail(settings, {
      userId: req.user.id,
      recipientEmail: toEmail,
      recipientName: patient.full_name,
      subject,
      textContent,
      htmlContent: formattedHtml,
      source: "report",
      allowFallback: true,
      pdfBase64,
      filename
    });

    res.json({ success: true, provider: result.provider });
  } catch (err: any) {
    console.error("Erro ao enviar e-mail com relatório:", err);
    res.status(500).json({ error: err.message || "Erro ao enviar e-mail." });
  }
});

// --- API BUSCA SEMÂNTICA (RAG CLÍNICO) ---

// 1. Indexar evoluções pendentes de um paciente
app.post("/api/patients/:id/semantic-index", requireAuth, requireActiveSubscription, async (req: any, res) => {
  try {
    const patientId = req.params.id;
    
    // Validar se o paciente pertence ao profissional
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, full_name")
      .eq("id", patientId)
      .eq("professional_id", req.user.id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: "Paciente não encontrado ou não pertence a este profissional." });
    }

    // Buscar evoluções sem embedding
    const { data: evos, error: evosError } = await supabaseAdmin
      .from("evolutions")
      .select("id, transcription_text")
      .eq("patient_id", patientId)
      .eq("professional_id", req.user.id)
      .eq("transcription_status", "completed")
      .is("embedding", null);

    if (evosError) throw evosError;

    if (!evos || evos.length === 0) {
      return res.json({ success: true, indexedCount: 0, message: "Todas as evoluções já estão indexadas." });
    }

    // Obter chave do Gemini
    let apiKey = "";
    try {
      const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from("settings")
        .select("api_key")
        .eq("id", "gemini")
        .single();
      if (!settingsError && settingsData?.api_key) {
        apiKey = settingsData.api_key;
      }
    } catch (e) {
      console.warn("Erro ao ler chave do Gemini do banco:", e);
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || "";
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Configuração do Gemini (chave de API) ausente no servidor." });
    }

    const ai = new GoogleGenAI({ apiKey });
    let indexedCount = 0;

    for (const evo of evos) {
      if (!evo.transcription_text?.trim()) continue;

      try {
        const response = await ai.models.embedContent({
          model: "gemini-embedding-001",
          contents: evo.transcription_text.trim(),
          config: {
            outputDimensionality: 768
          }
        });

        if (response.embeddings && response.embeddings[0]?.values) {
          const embeddingVector = response.embeddings[0].values;
          const vectorString = `[${embeddingVector.join(",")}]`;

          const { error: updateError } = await supabaseAdmin
            .from("evolutions")
            .update({ embedding: vectorString } as any)
            .eq("id", evo.id);

          if (updateError) {
            console.error(`Erro ao atualizar embedding da evolução ${evo.id}:`, updateError);
          } else {
            indexedCount++;
          }
        }
      } catch (embedError) {
        console.error(`Erro ao gerar embedding para evolução ${evo.id}:`, embedError);
      }
    }

    res.json({
      success: true,
      indexedCount,
      totalPending: evos.length,
      message: `${indexedCount} evoluções indexadas com sucesso.`
    });

  } catch (err: any) {
    console.error("Erro na indexação semântica das evoluções:", err);
    res.status(500).json({ error: err.message || "Erro interno ao indexar evoluções." });
  }
});

// 2. Realizar busca semântica em evoluções (RAG Clínico)
app.post("/api/patients/:id/semantic-search", requireAuth, requireActiveSubscription, async (req: any, res) => {
  try {
    const patientId = req.params.id;
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "O parâmetro 'query' é obrigatório." });
    }

    // Validar se o paciente pertence ao profissional
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, full_name")
      .eq("id", patientId)
      .eq("professional_id", req.user.id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: "Paciente não encontrado ou não pertence a este profissional." });
    }

    // Obter chave do Gemini
    let apiKey = "";
    try {
      const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from("settings")
        .select("api_key")
        .eq("id", "gemini")
        .single();
      if (!settingsError && settingsData?.api_key) {
        apiKey = settingsData.api_key;
      }
    } catch (e) {
      console.warn("Erro ao ler chave do Gemini do banco:", e);
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || "";
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Configuração do Gemini (chave de API) ausente no servidor." });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Auto-indexação silenciosa de evoluções pendentes antes de buscar
    const { data: pendingEvos, error: pendingError } = await supabaseAdmin
      .from("evolutions")
      .select("id, transcription_text")
      .eq("patient_id", patientId)
      .eq("professional_id", req.user.id)
      .eq("transcription_status", "completed")
      .is("embedding", null);

    if (!pendingError && pendingEvos && pendingEvos.length > 0) {
      console.log(`[RAG-Index] Indexando ${pendingEvos.length} evoluções pendentes para o paciente ${patient.full_name}...`);
      for (const evo of pendingEvos) {
        if (!evo.transcription_text?.trim()) continue;
        try {
          const embedRes = await ai.models.embedContent({
            model: "gemini-embedding-001",
            contents: evo.transcription_text.trim(),
            config: {
              outputDimensionality: 768
            }
          });
          if (embedRes.embeddings && embedRes.embeddings[0]?.values) {
            const vectorString = `[${embedRes.embeddings[0].values.join(",")}]`;
            await supabaseAdmin
              .from("evolutions")
              .update({ embedding: vectorString } as any)
              .eq("id", evo.id);
          }
        } catch (e) {
          console.error(`[RAG-Index] Erro ao indexar evolução ${evo.id}:`, e);
        }
      }
    }

    // Gerar embedding para a consulta
    const queryEmbedResponse = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: query.trim(),
      config: {
        outputDimensionality: 768
      }
    });

    if (!queryEmbedResponse.embeddings || !queryEmbedResponse.embeddings[0]?.values) {
      throw new Error("Não foi possível gerar embeddings para a pergunta.");
    }

    const queryVector = queryEmbedResponse.embeddings[0].values;
    const queryVectorString = `[${queryVector.join(",")}]`;

    // Buscar evoluções por similaridade vetorial via RPC match_evolutions
    const { data: matchResults, error: matchError } = await supabaseAdmin
      .rpc("match_evolutions", {
        query_embedding: queryVectorString,
        match_threshold: 0.35,
        match_count: 5,
        p_patient_id: patientId,
        p_professional_id: req.user.id
      });

    if (matchError) {
      console.error("Erro na busca vetorial match_evolutions:", matchError);
      throw matchError;
    }

    // Se nenhum trecho corresponder
    if (!matchResults || matchResults.length === 0) {
      return res.json({
        answer: "Não encontrei nenhuma informação relevante ou menções semelhantes nas evoluções gravadas deste paciente para a pergunta feita.",
        sources: []
      });
    }

    // Construir contexto textual para a IA
    const contextText = matchResults
      .map((evo: any, idx: number) => {
        return `[Fonte ${idx + 1}]
Data da sessão: ${evo.session_date || new Date(evo.created_at).toLocaleDateString("pt-BR")}
Texto: ${evo.transcription_text.trim()}
---`;
      })
      .join("\n\n");

    const systemPrompt = `Você é um assistente virtual integrado ao prontuário médico de um paciente, focado em ajudar terapeutas a resgatar informações do histórico de sessões.
Sua tarefa é responder a perguntas sobre o histórico do paciente baseando-se nas anotações clínicas fornecidas no contexto abaixo.

Informações importantes para a sua escrita:
1. Responda de forma profissional, direta, acolhedora e precisa, com tom clínico/terapêutico.
2. Cite explicitamente a data de cada sessão ao mencionar informações extraídas dela (ex: "Na sessão de 15/05/2026, foi relatado que..." ou "...(sessão de 12/04/2026).").
3. Se o contexto fornecido não contiver a resposta para a pergunta, diga de forma simples e natural que não encontrou anotações sobre esse assunto nas sessões registradas.
4. Mantenha a resposta curta, concisa e de leitura rápida.
5. Use formatação Markdown simples (negrito, listas de itens) para deixar o texto agradável de ler.
6. **MUITO IMPORTANTE**: Nunca utilize termos de computação, engenharia de software ou IA na sua resposta. Não use frases como "conforme o contexto fornecido", "baseado nos documentos recuperados", "segundo a base de dados", "a inteligência artificial identificou", etc. Escreva com naturalidade, como se você conhecesse o histórico do paciente.

REGISTROS DE EVOLUÇÕES DO PACIENTE:
${contextText}`;

    // Chamar o modelo Gemini para sintetizar a resposta
    console.log(`[RAG-Search] Sintetizando resposta para a pergunta: "${query}"...`);
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: query.trim() }] }
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      }
    });

    const answer = geminiResponse.text || "Não foi possível formular uma resposta.";

    res.json({
      answer,
      sources: matchResults.map((evo: any) => ({
        id: evo.id,
        session_date: evo.session_date,
        created_at: evo.created_at,
        transcription_text: evo.transcription_text
      }))
    });

  } catch (err: any) {
    console.error("Erro na busca semântica RAG:", err);
    res.status(500).json({ error: err.message || "Erro interno ao realizar busca semântica." });
  }
});

// Endpoint público para visualização de relatórios assinados
app.get("/api/public/reports/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    
    // 1. Buscar relatório assinado
    const { data: report, error: reportError } = await supabaseAdmin
      .from("patient_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report || report.status !== 'signed') {
      return res.status(404).json({ error: "Documento não encontrado ou indisponível." });
    }

    // 2. Buscar paciente
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, full_name, birth_date")
      .eq("id", report.patient_id)
      .single();

    // 3. Buscar profissional
    const { data: professional, error: professionalError } = await supabaseAdmin
      .from("professionals")
      .select("id, full_name, professional_register, professional_title")
      .eq("id", report.professional_id)
      .single();

    // 4. Buscar configurações públicas da marca (opcional)
    const { data: brandSettings } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "brand_settings")
      .single();

    res.json({
      report,
      patient,
      professional,
      brandSettings: brandSettings?.api_key ? JSON.parse(brandSettings.api_key) : null
    });
  } catch (err: any) {
    console.error("Erro ao obter relatório público:", err);
    res.status(500).json({ error: err.message || "Erro ao obter relatório." });
  }
});

// API 404 Catch-all
app.all(/^\/api\/.*$/, (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express error:", err);
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } else {
    next(err);
  }
});

export async function startServer() {
  try {
    // Startup check for Gemini API Key
    const startupKey = process.env.GEMINI_API_KEY;
    if (!startupKey) {
      console.warn("Chave da API Gemini não detectada no início do servidor.");
    } else {
      console.log(`Servidor iniciado com chave Gemini detectada.`);
    }

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      
      // Suporte para Share Target POST (Evita erro 405 caso o SW nao intercepte a tempo)
      app.post("/share-target", (req, res) => {
        console.log("Recebido POST /share-target via Servidor. Redirecionando para APP...");
        res.sendFile(path.join(distPath, "index.html"));
      });

      app.use((req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    await bootstrapSupabaseCronJobs();

    if (!process.env.VERCEL) {
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });

      // Increase timeout to 5 minutes for long audio processing
      server.timeout = 300000;
      server.keepAliveTimeout = 301000;
      server.headersTimeout = 302000;
    }
  } catch (err) {
    console.error("CRITICAL STARTUP ERROR:", err);
  }
}

// Start the server if not in a Vercel environment
if (!process.env.VERCEL) {
  startServer();
}
