import express from "express";
import path from "path";
import { readFile } from "fs/promises";
import dotenv from "dotenv";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TRIAL_DURATION_DAYS = 7;

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

function appendBrandVersion(url: string, signature: string) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(signature)}`;
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

// Helper para obter/gerar configurações de notificações
async function getNotificationSettings() {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "notification_settings")
      .single();

    let settings: any = {};
    if (data && data.api_key) {
      try {
        settings = JSON.parse(data.api_key);
      } catch (e) {
        console.error("Erro ao ler JSON de configuracoes de notificacoes:", e);
      }
    }

    // Gerar chaves VAPID padrão se não existirem
    if (!settings.vapid_public_key || !settings.vapid_private_key) {
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
        });
    }

    return settings;
  } catch (err) {
    console.error("Erro no getNotificationSettings, gerando chaves temporarias em memoria:", err);
    const keys = webpush.generateVAPIDKeys();
    return {
      vapid_public_key: keys.publicKey,
      vapid_private_key: keys.privateKey,
      vapid_subject: "mailto:suporte@conexaoseres.com.br"
    };
  }
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
    let version = "1.0";

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      logoLightUrl = parsed.logo_light_url || "";
      logoDarkUrl = parsed.logo_dark_url || "";
      faviconUrl = parsed.favicon_url || "";
      pwaIcon192 = parsed.pwa_icon_192_url || "";
      pwaIcon512 = parsed.pwa_icon_512_url || "";
      pwaMaskableIcon = parsed.pwa_maskable_icon_url || "";
      version = parsed.version || "1.0";
    }

    const assetSignature = hashString([
      logoLightUrl,
      logoDarkUrl,
      faviconUrl,
      pwaIcon192,
      pwaIcon512,
      pwaMaskableIcon,
      version
    ].join("|"));
    const brandIcon = faviconUrl || logoDarkUrl || logoLightUrl || "/favicon.png";
    const splashLogoWithVersion = appendBrandVersion(logoDarkUrl || logoLightUrl || "", assetSignature);
    const installIcon192 = appendBrandVersion("/api/pwa-install-icon?size=192", assetSignature);
    const installIcon512 = appendBrandVersion("/api/pwa-install-icon?size=512", assetSignature);

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
          "src": installIcon192,
          "sizes": "192x192",
          "type": "image/svg+xml",
          "purpose": "any"
        },
        {
          "src": installIcon512,
          "sizes": "512x512",
          "type": "image/svg+xml",
          "purpose": "any"
        },
        {
          "src": installIcon512,
          "sizes": "512x512",
          "type": "image/svg+xml",
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

    if (!error && data && data.api_key) {
      const parsed = JSON.parse(data.api_key);
      logoLightUrl = parsed.logo_light_url || "";
      logoDarkUrl = parsed.logo_dark_url || "";
      faviconUrl = parsed.favicon_url || "";
      pwaIcon192 = parsed.pwa_icon_192_url || "";
      pwaIcon512 = parsed.pwa_icon_512_url || "";
      pwaInstallLogo = parsed.pwa_install_logo_url || "";
    }

    const source = pwaInstallLogo || pwaIcon512 || pwaIcon192 || faviconUrl || logoDarkUrl || logoLightUrl || "/favicon.png";
    const dataUri = await imageUrlToDataUri(source);
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
    const { data: targetProf, error: targetProfError } = await supabaseAdmin
      .from("professionals")
      .select("id, full_name, google_email, role")
      .eq("id", targetUserId)
      .single();

    if (targetProfError || !targetProf) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const cleanupTargets: Array<{ table: string; column: string }> = [
      { table: "usage_logs", column: "professional_id" },
      { table: "evolutions", column: "professional_id" },
      { table: "patient_reports", column: "professional_id" },
      { table: "patients", column: "professional_id" },
      { table: "transactions", column: "professional_id" },
      { table: "support_tickets", column: "user_id" },
      { table: "notifications", column: "user_id" },
      { table: "push_subscriptions", column: "user_id" }
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

    const { data: supportFiles, error: supportFilesError } = await supabaseAdmin
      .storage
      .from("support_attachments")
      .list(`support/${targetUserId}`, { limit: 1000 });

    if (supportFilesError) {
      throw new Error(`Falha ao listar anexos de suporte do usuário: ${supportFilesError.message}`);
    }

    if (supportFiles && supportFiles.length > 0) {
      const supportPaths = supportFiles.map((file) => `support/${targetUserId}/${file.name}`);
      const { error: supportRemoveError } = await supabaseAdmin
        .storage
        .from("support_attachments")
        .remove(supportPaths);

      if (supportRemoveError) {
        throw new Error(`Falha ao remover anexos de suporte do usuário: ${supportRemoveError.message}`);
      }
    }

    const { error: profDeleteError } = await supabaseAdmin
      .from("professionals")
      .delete()
      .eq("id", targetUserId);

    if (profDeleteError) {
      throw new Error(`Falha ao remover o perfil do usuário: ${profDeleteError.message}`);
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authDeleteError && !/not found/i.test(authDeleteError.message || "")) {
      throw new Error(`Falha ao remover a conta de autenticação: ${authDeleteError.message}`);
    }

    return res.json({
      success: true,
      message: `Usuário ${targetProf.full_name || targetProf.google_email || targetUserId} excluído permanentemente.`
    });
  } catch (err: any) {
    console.error("Erro ao excluir usuário do admin:", err);
    return res.status(500).json({ error: err.message || "Erro ao excluir usuário." });
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
  imageUrl?: string
) {
  // A. Criar no banco (In-App)
  const { data: notification, error: insertError } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: targetUserId,
      title,
      message: content, // Ajustado ao banco existente
      type,
      link,
      image_url: imageUrl
    })
    .select()
    .single();

  if (insertError) throw insertError;

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

  if (settings.smtp_host && settings.smtp_user && settings.smtp_pass) {
    try {
      // Busca o e-mail do profissional diretamente da tabela professionals (mais confiável que auth.admin)
      const { data: profData } = await supabaseAdmin
        .from("professionals")
        .select("google_email")
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
        const transporter = nodemailer.createTransport({
          host: settings.smtp_host,
          port: Number(settings.smtp_port) || 587,
          secure: settings.smtp_secure !== undefined ? settings.smtp_secure : Number(settings.smtp_port) === 465,
          auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass
          },
          // Necessário para ambiente serverless (Vercel): sem pool de conexões persistentes
          pool: false,
          connectionTimeout: 15000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          tls: { rejectUnauthorized: false }
        } as any);

        const origin = process.env.VERCEL_PRODUCTION_URL || "https://evolucao.conexaoseres.com.br";
        const viewUrl = `${origin}${link || "/painel/notifications"}`;

        // Paleta de cores e ícones por tipo de notificação
        const typeConfig: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
          success: { color: "#166534", bg: "#f0fdf4", border: "#bbf7d0", icon: "✅", label: "Sucesso" },
          error:   { color: "#991b1b", bg: "#fff1f2", border: "#fecdd3", icon: "⚠️", label: "Erro" },
          warning: { color: "#92400e", bg: "#fffbeb", border: "#fde68a", icon: "🔔", label: "Atenção" },
          info:    { color: "#1e3a5f", bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ️", label: "Informação" },
        };
        const tc = typeConfig[type] || typeConfig.info;

        const mailOptions = {
          from: buildFromField(settings.smtp_from, settings.smtp_user),
          to: targetEmail,
          subject: `${tc.icon} ${title}`,
          text: `${title}\n\n${content}\n\nVer detalhes no app: ${viewUrl}`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <div style="background-color: #005C13; padding: 24px 28px; text-align: left;">
                <p style="margin: 0 0 4px 0; font-size: 12px; color: rgba(255,255,255,0.7); letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Evolução Clínica</p>
                <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">Notificação do Sistema</h1>
              </div>


              <!-- Conteúdo -->
              <div style="padding: 28px; color: #1f2937; line-height: 1.7;">
                ${imageUrl ? `<div style="margin-bottom: 20px; border-radius: 8px; overflow: hidden;"><img src="${imageUrl}" alt="Imagem" style="max-width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px;" /></div>` : ""}
                
                <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #111827; line-height: 1.4;">${title}</h2>
                <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151;">${content}</p>

                <!-- CTA -->
                <div style="text-align: center; margin: 28px 0 8px 0;">
                  <a href="${viewUrl}" 
                     style="display: inline-block; background-color: #005C13; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 15px; font-weight: 700; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,92,19,0.3); letter-spacing: 0.2px;">
                    Ver no Aplicativo →
                  </a>
                </div>
              </div>

              <!-- Divisor -->
              <div style="border-top: 1px solid #f3f4f6; margin: 0 28px;"></div>

              <!-- Footer -->
              <div style="padding: 18px 28px; background-color: #f9fafb;">
                <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
                  Esta mensagem foi enviada automaticamente pela plataforma <strong>Evolução Clínica</strong>.<br/>
                  Por favor, não responda a este e-mail.
                </p>
              </div>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        emailSent = true;
        console.log(`[Email] Notificação de e-mail enviada com sucesso para ${targetEmail}`);
      } else {
        emailError = "E-mail do destinatário não encontrado no cadastro do profissional.";
        console.warn(`[Email] E-mail não encontrado para userId: ${targetUserId}`);
      }
    } catch (emailErr: any) {
      emailError = emailErr.message || "Erro desconhecido no envio SMTP";
      console.error("Erro ao enviar e-mail via SMTP:", emailErr.message);
    }
  } else {
    emailError = "Servidor SMTP não configurado no painel admin.";
    console.log(`[Notifications] SMTP nao configurado. Notificacao de e-mail suprimida para o usuario ${targetUserId}.`);
  }

  return { notification, emailSent, emailTo, emailError };
}

async function sendTrialExpirationEmail(prof: { id: string; full_name: string | null; google_email: string | null; trial_ends_at: string | null }) {
  const settings = await getNotificationSettings();
  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    throw new Error("Servidor SMTP de notificações não configurado na plataforma.");
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

  const origin = process.env.VERCEL_PRODUCTION_URL || "https://evolucao.conexaoseres.com.br";
  const subscriptionUrl = `${origin}/painel/subscription`;
  const professionalName = prof.full_name || "Profissional";

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

  await transporter.sendMail({
    from: buildFromField(settings.smtp_from, settings.smtp_user),
    to: recipientEmail,
    subject: "Seu teste gratuito de 7 dias terminou",
    text: [
      `Olá, ${professionalName}.`,
      "",
      `Seu período de teste gratuito de ${TRIAL_DURATION_DAYS} dias terminou em ${trialEndsAtLabel}.`,
      "A partir de agora, o acesso completo à plataforma está bloqueado até a contratação de um plano.",
      `Para continuar utilizando o app, escolha um plano em: ${subscriptionUrl}`,
      "",
      "Se você já realizou a assinatura, basta acessar novamente o aplicativo para liberar o acesso."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #005C13, #0f7a1f); color: #ffffff; padding: 28px;">
          <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1.4px; opacity: 0.8;">Evolução Clínica</p>
          <h1 style="margin: 0; font-size: 24px; line-height: 1.25;">Seu teste gratuito terminou</h1>
        </div>
        <div style="padding: 28px; color: #111827; line-height: 1.7;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Olá, <strong>${professionalName}</strong>.</p>
          <p style="margin: 0 0 16px 0; font-size: 15px;">
            Seu período de teste gratuito de <strong>${TRIAL_DURATION_DAYS} dias</strong> terminou em <strong>${trialEndsAtLabel}</strong>.
            O acesso completo à plataforma foi encerrado até a contratação de um plano.
          </p>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px 20px; margin: 20px 0 24px 0;">
            <p style="margin: 0; font-size: 14px; color: #374151;">
              Para continuar utilizando prontuários, evoluções, Google Docs e a sincronização da agenda, escolha um dos planos disponíveis no botão abaixo.
            </p>
          </div>
          <div style="text-align: center; margin: 28px 0 8px 0;">
            <a href="${subscriptionUrl}" style="display: inline-block; background: #005C13; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px;">
              Assinar um plano agora
            </a>
          </div>
        </div>
        <div style="border-top: 1px solid #f3f4f6; padding: 18px 28px; background: #f9fafb; color: #6b7280; font-size: 12px; line-height: 1.6;">
          Se você já concluiu a assinatura, pode simplesmente voltar ao aplicativo para ter o acesso liberado novamente.
        </div>
      </div>
    `
  });
}

// 4. Enviar Notificação (In-App, Push e E-mail)
app.post("/api/notifications/send", requireAuth, async (req: any, res) => {
  const { userId, title, content, type = "info", link, imageUrl } = req.body;
  
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
    const result = await sendNotificationInternal(targetUserId, title, content, type, link, imageUrl);
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


// 4.1. Cron para Enviar Lembretes de Evoluções Clínicas Pendentes
app.get("/api/cron/send-evolution-reminders", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // Proteção da rota com segredo se configurado
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
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
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
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

    const { toEmail, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom } = req.body;
    
    if (!toEmail || !smtpHost || !smtpUser || !smtpPass) {
      return res.status(400).json({ error: "E-mail de destino, Host, Usuario e Senha SMTP sao obrigatorios" });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort) || 587,
      secure: smtpSecure !== undefined ? smtpSecure : Number(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      // Necessário para ambiente serverless (Vercel)
      pool: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false }
    } as any);

    const mailOptions = {
      from: buildFromField(smtpFrom, smtpUser),
      to: toEmail,
      subject: "[Evolução Clínica] Teste de Conexão SMTP 🎉",
      text: "Se você recebeu este e-mail, significa que as configurações do seu servidor SMTP global estão corretas e prontas para uso no sistema de notificações!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #005C13; padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0; font-size: 22px;">Teste de SMTP Globals</h2>
          </div>
          <div style="padding: 24px; background-color: #ffffff; color: #333333; line-height: 1.6;">
            <p style="font-size: 16px; font-weight: bold; color: #111111;">Conexão SMTP Funcionando! 🎉</p>
            <p style="font-size: 15px; margin-bottom: 24px;">Este é um e-mail de teste disparado a partir das configurações preenchidas na plataforma. Seu servidor está configurado corretamente.</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #888888; border-top: 1px solid #eeeeee;">
            <p style="margin: 0;">Evolução Clínica - Plataforma Inteligente</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de teste:", err);
    res.status(500).json({ error: err.message || "Erro desconhecido ao disparar e-mail de teste." });
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
    const { toEmail, subject, textContent } = req.body;

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

    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      return res.status(500).json({ error: "Servidor SMTP de notificações não configurado na plataforma." });
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

    // Formatar como HTML (quebrando linhas)
    const formattedHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background-color: #005C13; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Relatório de Desenvolvimento / Evolução</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Paciente: ${patient.full_name}</p>
        </div>
        <div style="padding: 24px; background-color: #ffffff; color: #333333; line-height: 1.6; font-size: 15px; white-space: pre-wrap; font-family: inherit;">
          ${textContent.replace(/\n/g, "<br/>")}
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 11px; color: #888888; border-top: 1px solid #eeeeee;">
          <p style="margin: 0;">Enviado com segurança via Evolução Clínica - Plataforma Inteligente</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: buildFromField(settings.smtp_from, settings.smtp_user),
      to: toEmail,
      subject: subject,
      text: textContent,
      html: formattedHtml
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });

  } catch (err: any) {
    console.error("Erro ao enviar e-mail com relatório:", err);
    res.status(500).json({ error: err.message || "Erro ao enviar e-mail." });
  }
});

// API 404 Catch-all
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Error handling middleware to ensure JSON responses for API errors
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

      app.all("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

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
