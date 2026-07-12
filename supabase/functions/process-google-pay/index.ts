// supabase/functions/process-google-pay/index.ts
// Supabase Edge Function (Deno) para processar assinatura real no Stripe com tokens do Google Pay

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const defaultBrandColors = {
  primary: "#005C13",
  primary_hover: "#00470e",
  secondary: "#5C4716",
  secondary_hover: "#4a3912",
  accent: "#8CC63F",
  accent_hover: "#7ab332",
  bg: "#fdfbf7",
  surface: "#ffffff",
  text: "#1c1917",
  text_muted: "#57534e",
  border: "#e7e5e4",
};

function normalizePaymentDescriptor(value: unknown) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  return label || "Google Pay";
}

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

function buildEmailTheme(config: any = {}) {
  const colors = config?.colors || defaultBrandColors;

  return {
    brandName: config?.pwa_app_name || "Evolução Clínica",
    primary: normalizeHexColor(colors.primary, defaultBrandColors.primary),
    primaryHover: normalizeHexColor(colors.primary_hover, defaultBrandColors.primary_hover),
    secondary: normalizeHexColor(colors.secondary, defaultBrandColors.secondary),
    secondaryHover: normalizeHexColor(colors.secondary_hover, defaultBrandColors.secondary_hover),
    accent: normalizeHexColor(colors.accent, defaultBrandColors.accent),
    accentHover: normalizeHexColor(colors.accent_hover, defaultBrandColors.accent_hover),
    bg: normalizeHexColor(colors.bg, defaultBrandColors.bg),
    surface: normalizeHexColor(colors.surface, defaultBrandColors.surface),
    text: normalizeHexColor(colors.text, defaultBrandColors.text),
    textMuted: normalizeHexColor(colors.text_muted, defaultBrandColors.text_muted),
    border: normalizeHexColor(colors.border, defaultBrandColors.border),
  };
}

function buildEmailButton(theme: ReturnType<typeof buildEmailTheme>, href: string, label: string, backgroundColor = theme.primary) {
  return `<a href="${href}" style="display:inline-block;background:${backgroundColor};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:700;letter-spacing:0.2px;">${label}</a>`;
}

function buildEmailCard(theme: ReturnType<typeof buildEmailTheme>, title: string, bodyHtml: string, options: { titleColor?: string; background?: string; border?: string } = {}) {
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

function buildEmailShell(theme: ReturnType<typeof buildEmailTheme>, options: {
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

function normalizePlanFeatures(features: unknown) {
  if (!Array.isArray(features)) return [];
  return features
    .map((feature) => String(feature || "").trim())
    .filter(Boolean);
}

function formatCurrencyLabel(amount: number, currency = "BRL") {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const stripeFailureTranslations: Record<string, string> = {
  incorrect_number: "O numero do cartao vinculado ao Google Pay foi rejeitado. Revise o cartao salvo na carteira e tente novamente.",
  invalid_number: "O numero do cartao vinculado ao Google Pay foi considerado invalido pela operadora.",
  expired_card: "O cartao vinculado ao Google Pay esta expirado. Atualize o cartao e tente novamente.",
  insufficient_funds: "O cartao vinculado ao Google Pay nao possui limite ou saldo suficiente para concluir a cobranca.",
  do_not_honor: "A operadora recusou a cobranca do cartao vinculado ao Google Pay. Tente outro cartao ou contate o banco.",
  generic_decline: "A operadora recusou a cobranca do cartao vinculado ao Google Pay.",
  processing_error: "A operadora nao conseguiu processar a cobranca agora. Tente novamente em alguns minutos.",
  card_not_supported: "O cartao vinculado ao Google Pay nao oferece suporte para esta cobranca recorrente.",
};

function buildStripeFailureMessage(code?: string | null, rawMessage?: string | null) {
  if (code && stripeFailureTranslations[code]) {
    return stripeFailureTranslations[code];
  }

  if (rawMessage) {
    return `A Stripe recusou a cobranca inicial: ${rawMessage}`;
  }

  return "Ocorreu uma falha na cobranca do cartao. Verifique os dados de pagamento e tente novamente.";
}

async function getStripeFailureDetails(
  stripe: Stripe,
  subscription: any,
  latestInvoice: any,
) {
  const invoiceId = typeof latestInvoice === "string"
    ? latestInvoice
    : latestInvoice?.id || null;

  let failureCode: string | null = null;
  let failureMessage: string | null = null;

  if (invoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ["payment_intent.latest_charge"],
      });
      const paymentIntent = typeof invoice.payment_intent === "object" && invoice.payment_intent
        ? invoice.payment_intent as any
        : null;
      failureCode =
        paymentIntent?.last_payment_error?.decline_code ||
        paymentIntent?.last_payment_error?.code ||
        paymentIntent?.latest_charge?.failure_code ||
        null;
      failureMessage =
        paymentIntent?.last_payment_error?.message ||
        paymentIntent?.latest_charge?.failure_message ||
        null;
    } catch (invoiceError) {
      console.error("[process-google-pay] Falha ao consultar invoice para diagnostico:", invoiceError);
    }
  }

  if (failureCode || failureMessage) {
    return { failureCode, failureMessage };
  }

  try {
    const events = await stripe.events.list({
      limit: 25,
      created: {
        gte: Math.max((subscription.created || Math.floor(Date.now() / 1000)) - 300, 0),
      },
    });

    for (const event of events.data) {
      const eventObject = event.data?.object as any;
      const belongsToSubscription =
        eventObject?.subscription === subscription.id ||
        eventObject?.id === subscription.id ||
        eventObject?.invoice === invoiceId ||
        eventObject?.customer === subscription.customer;

      if (!belongsToSubscription) continue;

      if (event.type === "payment_intent.payment_failed") {
        failureCode =
          eventObject?.last_payment_error?.decline_code ||
          eventObject?.last_payment_error?.code ||
          failureCode;
        failureMessage =
          eventObject?.last_payment_error?.message ||
          failureMessage;
        break;
      }

      if (event.type === "charge.failed") {
        failureCode = eventObject?.failure_code || failureCode;
        failureMessage = eventObject?.failure_message || failureMessage;
        break;
      }
    }
  } catch (eventsError) {
    console.error("[process-google-pay] Falha ao consultar eventos da Stripe para diagnostico:", eventsError);
  }

  return { failureCode, failureMessage };
}

async function recordEmailDelivery(supabaseAdmin: any, payload: {
  userId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message: string;
  provider: "brevo" | "smtp";
  source: "subscription-success" | "subscription-failure";
  status: "sent" | "failed";
  errorMessage?: string | null;
  providerMessageId?: string | null;
}) {
  await supabaseAdmin.from("email_deliveries").insert({
    user_id: payload.userId,
    recipient_email: payload.recipientEmail,
    recipient_name: payload.recipientName,
    subject: payload.subject,
    message: payload.message,
    provider: payload.provider,
    source: payload.source,
    status: payload.status,
    error_message: payload.errorMessage || null,
    provider_message_id: payload.providerMessageId || null,
  });
}

async function sendBrevoEmail(settings: any, payload: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  textContent: string;
  htmlContent: string;
}) {
  const apiKey = settings?.brevo_api_key || "";
  const senderEmail = settings?.brevo_sender_email || settings?.smtp_user || "";
  const senderName = settings?.brevo_sender_name || settings?.smtp_from || "Evolução Clínica";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo não configurado para envio de e-mail transacional.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: payload.recipientEmail,
          name: payload.recipientName,
        },
      ],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Brevo retornou HTTP ${response.status}`);
  }

  return data?.messageId || data?.messageID || null;
}

serve(async (req) => {
  // Trata requisição OPTIONS para CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validar autenticação do usuário via JWT enviado no Header Authorization
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de autorização inválido ou ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Inicializar cliente administrativo do Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Recupera usuário associado ao token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, planId, paymentToken, paymentDescriptor } = await req.json();

    if (!userId || !planId || !paymentToken) {
      throw new Error("Parâmetros obrigatórios ausentes: userId, planId, paymentToken.");
    }

    // Validar propriedade: o usuário logado deve ser o dono do userId ou ser um administrador
    if (user.id !== userId) {
      const { data: prof, error: profError } = await supabaseAdmin
        .from("professionals")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profError || !prof || prof.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Permissão negada. Você não tem permissão para realizar assinaturas para outro profissional." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Resolve o token ID real de forma robusta (Google Pay retorna JSON ou Objeto)
    let tokenId = "";
    if (typeof paymentToken === "string") {
      if (paymentToken.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(paymentToken);
          tokenId = parsed.id || paymentToken;
        } catch (_) {
          tokenId = paymentToken;
        }
      } else {
        tokenId = paymentToken;
      }
    } else if (typeof paymentToken === "object" && paymentToken !== null) {
      tokenId = paymentToken.id || "";
    }

    if (!tokenId) {
      throw new Error("Token de pagamento inválido ou não fornecido.");
    }

    // 2. Carregar configurações globais de pagamento do banco de dados (tabela settings)
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "payment_settings")
      .single();

    if (settingsError || !settingsData || !settingsData.api_key) {
      throw new Error("Configurações de pagamento (Google Pay/Stripe) não encontradas no painel administrativo.");
    }

    const settings = JSON.parse(settingsData.api_key);
    const { data: brandSettingsData } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "brand_settings")
      .maybeSingle();
    const brandTheme = brandSettingsData?.api_key
      ? buildEmailTheme(JSON.parse(brandSettingsData.api_key))
      : buildEmailTheme();
    const isProduction = settings.environment === "PRODUCTION";
    
    // Define a chave secreta da Stripe de acordo com o modo configurado
    const stripeSecretKey = isProduction ? settings.stripeProdSecretKey : settings.stripeSandboxSecretKey;
    if (!stripeSecretKey) {
      throw new Error(`Chave Secreta da Stripe para o modo ${settings.environment} não foi configurada no admin.`);
    }

    // Inicializa o SDK do Stripe com a chave ativa
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 3. Buscar informações do profissional no banco (ex: e-mail)
    const { data: profData, error: profError } = await supabaseAdmin
      .from("professionals")
      .select("google_email, full_name")
      .eq("id", userId)
      .single();

    if (profError || !profData) {
      throw new Error(`Profissional com ID ${userId} não encontrado no banco de dados.`);
    }

    // 4. Buscar informações do plano no banco (ex: stripe_price_id)
    const { data: planData, error: planError } = await supabaseAdmin
      .from("plans")
      .select("stripe_sandbox_price_id, stripe_prod_price_id, name, price, description, features")
      .eq("id", planId)
      .single();

    if (planError || !planData) {
      throw new Error(`Plano com ID ${planId} não encontrado no banco de dados.`);
    }

    const stripePriceId = isProduction ? planData.stripe_prod_price_id : planData.stripe_sandbox_price_id;
    if (!stripePriceId) {
      throw new Error(`O ID de Preço do Stripe correspondente ao plano "${planData.name}" em modo ${settings.environment} não está configurado.`);
    }

    // 5. Integrar com o Stripe Billing para criar a assinatura recorrente
    // 5.1. Criar ou buscar um Customer (Cliente) no Stripe
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: profData.google_email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: profData.google_email,
        name: profData.full_name,
        metadata: {
          supabaseUserId: userId,
        },
      });
    }

    // 5.2. Associar o Token do Google Pay (tok_...) ao cliente como fonte de pagamento padrão
    const source = await stripe.customers.createSource(customer.id, {
      source: tokenId,
    });

    await stripe.customers.update(customer.id, {
      default_source: source.id,
    });

    // 5.3. Criar a assinatura recorrente no Stripe Billing
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: stripePriceId }],
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        supabaseUserId: userId,
        planId: planId,
      },
    });

    // 6. Tratar status do pagamento da primeira fatura
    const status = subscription.status; // 'active', 'trialing', 'incomplete', etc.
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const latestInvoice = subscription.latest_invoice as any;
    const amountPaid = latestInvoice?.amount_paid ? latestInvoice.amount_paid / 100 : Number(planData.price || 0);

    if (status === "incomplete") {
      const { failureCode, failureMessage } = await getStripeFailureDetails(stripe, subscription, latestInvoice);
      await stripe.subscriptions.cancel(subscription.id).catch((cancelError) => {
        console.error("[process-google-pay] Falha ao cancelar assinatura incompleta:", cancelError);
      });
      throw new Error(buildStripeFailureMessage(failureCode, failureMessage));
    }

    // 7. Atualizar as informações da assinatura na tabela 'professionals' do Supabase
    const { error: dbError } = await supabaseAdmin
      .from("professionals")
      .update({
        subscription_plan: planId,
        subscription_status: status === "active" ? "active" : "trialing",
        subscription_ends_at: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (dbError) {
      throw new Error(`Erro ao atualizar o perfil do profissional no banco: ${dbError.message}`);
    }

    // 8. Registrar a transação no banco de dados
    if (latestInvoice) {
      const { error: txInsertError } = await supabaseAdmin
        .from("transactions")
        .upsert(
          {
            professional_id: userId,
            stripe_invoice_id: latestInvoice.id,
            stripe_subscription_id: subscription.id,
            amount: amountPaid,
            currency: latestInvoice.currency || 'brl',
            plan_id: planId,
            status: "paid",
            stripe_invoice_url: latestInvoice.hosted_invoice_url,
            invoice_pdf_url: latestInvoice.invoice_pdf,
            created_at: new Date().toISOString()
          },
          { onConflict: 'stripe_invoice_id' }
        );

      if (txInsertError) {
        console.error(`Erro ao registrar transação no process-google-pay: ${txInsertError.message}`);
      }
    }

    try {
      const { data: notificationSettingsData } = await supabaseAdmin
        .from("settings")
        .select("api_key")
        .eq("id", "notification_settings")
        .maybeSingle();

      const notificationSettings = notificationSettingsData?.api_key
        ? JSON.parse(notificationSettingsData.api_key)
        : {};
      const paymentLabel = normalizePaymentDescriptor(paymentDescriptor);
      const renewalLabel = new Date(currentPeriodEnd).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const amountLabel = formatCurrencyLabel(amountPaid, latestInvoice?.currency || "BRL");
      const featureBullets = normalizePlanFeatures(planData.features).slice(0, 4);
      const selectedFeatures = featureBullets.length > 0
        ? featureBullets
        : planId === "yearly"
          ? ["Tudo do plano mensal", "Suporte prioritário via e-mail", "Melhor custo-benefício anualizado", "Novos recursos em primeira mão"]
          : ["Pacientes ilimitados", "Evoluções clínicas com IA ilimitadas", "Integração com Google Docs em tempo real", "Gravação e transcrição de áudio nativa"];
      const subject = `[Evolução Clínica] Assinatura confirmada - ${planData.name}`;
      const textContent = [
        `Olá, ${profData.full_name || "Profissional"}.`,
        "",
        `Seu pedido foi processado com sucesso usando ${paymentLabel}.`,
        `Valor confirmado: ${amountLabel}.`,
        `Assinatura Google Pay: ${subscription.id}.`,
        latestInvoice?.id ? `Fatura Google Pay: ${latestInvoice.id}.` : null,
        `Próxima renovação: ${renewalLabel}.`,
        "",
        `Boas-vindas ao ${planData.name}.`,
        planData.description ? `Resumo do plano: ${planData.description}` : null,
        "Você terá acesso aos benefícios abaixo:",
        ...selectedFeatures.map((feature: string) => `- ${feature}`),
      ].filter(Boolean).join("\n");
      const featureRowsHtml = selectedFeatures
        .map((feature: string) => `<div style="margin:0 0 8px 0;">• ${feature}</div>`)
        .join("");
      const htmlContent = buildEmailShell(brandTheme, {
        title: "Assinatura confirmada com sucesso",
        subtitle: `Processada com ${paymentLabel}`,
        bodyHtml: `
          <p style="margin:0 0 14px 0; font-size:16px;">Olá, <strong>${profData.full_name || "Profissional"}</strong>.</p>
          <p style="margin:0 0 18px 0; font-size:15px; color:${brandTheme.textMuted};">
            Seu pedido foi processado com sucesso usando <strong>${paymentLabel}</strong>.
            O valor confirmado foi <strong>${amountLabel}</strong>.
          </p>
          ${buildEmailCard(brandTheme, `Boas-vindas ao ${planData.name}`, `
            <p style="margin:0 0 12px 0; font-size:14px; color:${brandTheme.textMuted};">${planData.description || "Você agora tem acesso ao pacote de recursos selecionado."}</p>
            <div style="margin:0; color:${brandTheme.text}; font-size:14px; line-height:1.8;">
              ${featureRowsHtml}
            </div>
          `, { titleColor: brandTheme.primary })}
          ${buildEmailCard(brandTheme, "Resumo da transação", `
            <div style="margin:0; color:${brandTheme.text}; font-size:14px; line-height:1.8;">
              <div style="margin:0 0 8px 0;">• Plano: ${planData.name}</div>
              <div style="margin:0 0 8px 0;">• Valor: ${amountLabel}</div>
              <div style="margin:0 0 8px 0;">• Forma de pagamento: ${paymentLabel}</div>
              <div style="margin:0 0 8px 0;">• Assinatura Google Pay: ${subscription.id}</div>
              ${latestInvoice?.id ? `<div style="margin:0 0 8px 0;">• Fatura Google Pay: ${latestInvoice.id}</div>` : ""}
              <div style="margin:0;">• Próxima renovação: ${renewalLabel}</div>
            </div>
          `, { titleColor: brandTheme.secondary, background: hexToRgba(brandTheme.secondary, 0.06) })}
        `,
        footerHtml: "Seu comprovante de assinatura foi enviado com os dados principais da transação."
      });
      const providerMessageId = await sendBrevoEmail(notificationSettings, {
        recipientEmail: profData.google_email,
        recipientName: profData.full_name || "Profissional",
        subject,
        textContent,
        htmlContent,
      });

      await recordEmailDelivery(supabaseAdmin, {
        userId,
        recipientEmail: profData.google_email,
        recipientName: profData.full_name || "Profissional",
        subject,
        message: textContent,
        provider: "brevo",
        source: "subscription-success",
        status: "sent",
        providerMessageId,
      });
    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : "Falha ao enviar e-mail de assinatura.";
      console.error("[process-google-pay] Falha ao enviar e-mail de assinatura:", errorMessage);
      await recordEmailDelivery(supabaseAdmin, {
        userId,
        recipientEmail: profData.google_email,
        recipientName: profData.full_name || "Profissional",
        subject: `[Evolução Clínica] Assinatura confirmada - ${planData.name}`,
        message: `Seu pedido foi processado com sucesso usando ${normalizePaymentDescriptor(paymentDescriptor)}.`,
        provider: "brevo",
        source: "subscription-success",
        status: "failed",
        errorMessage,
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Assinatura criada com sucesso!",
        subscriptionId: subscription.id,
        status: status,
        endsAt: currentPeriodEnd,
        planName: planData.name,
        amountPaid,
        currency: latestInvoice?.currency || 'brl',
        invoiceId: latestInvoice?.id || null,
        invoiceUrl: latestInvoice?.hosted_invoice_url || null,
        invoicePdfUrl: latestInvoice?.invoice_pdf || null
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Erro no processamento do pagamento:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
