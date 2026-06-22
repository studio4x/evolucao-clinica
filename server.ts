import express from "express";
import path from "path";
import dotenv from "dotenv";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

              <!-- Tipo badge -->
              <div style="background-color: ${tc.bg}; border-bottom: 1px solid ${tc.border}; padding: 12px 28px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">${tc.icon}</span>
                <span style="font-size: 13px; font-weight: 700; color: ${tc.color}; text-transform: uppercase; letter-spacing: 0.5px;">${tc.label}</span>
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

    // 2. Buscar todos os pacientes ativos com lembretes habilitados
    const { data: patients, error: patientsError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("status", "active")
      .eq("evolution_reminder_active", true);

    if (patientsError) throw patientsError;

    if (!patients || patients.length === 0) {
      return res.json({ success: true, message: "Nenhum paciente com lembrete de evolucao ativo." });
    }

    let notificationsSentCount = 0;

    for (const patient of patients) {
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
