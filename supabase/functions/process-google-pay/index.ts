// supabase/functions/process-google-pay/index.ts
// Supabase Edge Function (Deno) para processar assinatura real no Stripe com tokens do Google Pay

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePaymentDescriptor(value: unknown) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  return label || "Google Pay";
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
    const { userId, planId, paymentToken, paymentDescriptor } = await req.json();

    if (!userId || !planId || !paymentToken) {
      throw new Error("Parâmetros obrigatórios ausentes: userId, planId, paymentToken.");
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

    // 1. Inicializar cliente administrativo do Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
      throw new Error("Ocorreu uma falha na cobrança do cartão. Verifique os dados de pagamento e tente novamente.");
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
        .map((feature: string) => `<li style="margin: 0 0 8px 0;">${feature}</li>`)
        .join("");
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #005C13, #0b7c1c); color: #ffffff; padding: 28px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1.4px; opacity: 0.78;">Evolução Clínica</p>
            <h1 style="margin: 0; font-size: 24px; line-height: 1.25;">Assinatura confirmada com sucesso</h1>
          </div>
          <div style="padding: 28px; color: #111827; line-height: 1.7;">
            <p style="margin: 0 0 14px 0; font-size: 16px;">Olá, <strong>${profData.full_name || "Profissional"}</strong>.</p>
            <p style="margin: 0 0 18px 0; font-size: 15px;">
              Seu pedido foi processado com sucesso usando <strong>${paymentLabel}</strong>.
              O valor confirmado foi <strong>${amountLabel}</strong>.
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px 20px; margin: 18px 0 22px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #005C13;">Boas-vindas ao ${planData.name}</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">${planData.description || "Você agora tem acesso ao pacote de recursos selecionado."}</p>
              <ul style="margin: 0; padding-left: 18px; color: #374151; font-size: 14px;">
                ${featureRowsHtml}
              </ul>
            </div>
            <div style="border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px 20px; margin: 18px 0 22px 0;">
              <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #111827;">Resumo da transação</p>
              <ul style="margin: 0; padding-left: 18px; color: #374151; font-size: 14px;">
                <li style="margin: 0 0 8px 0;">Plano: ${planData.name}</li>
                <li style="margin: 0 0 8px 0;">Valor: ${amountLabel}</li>
                <li style="margin: 0 0 8px 0;">Forma de pagamento: ${paymentLabel}</li>
                <li style="margin: 0 0 8px 0;">Assinatura Google Pay: ${subscription.id}</li>
                ${latestInvoice?.id ? `<li style="margin: 0 0 8px 0;">Fatura Google Pay: ${latestInvoice.id}</li>` : ""}
                <li style="margin: 0;">Próxima renovação: ${renewalLabel}</li>
              </ul>
            </div>
          </div>
        </div>
      `;
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
