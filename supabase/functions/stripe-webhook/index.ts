// supabase/functions/stripe-webhook/index.ts
// Supabase Edge Function (Deno) para processar webhooks assíncronos da Stripe

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Assinatura do webhook ausente.", { status: 400 });
    }

    const body = await req.text();

    // 1. Inicializar cliente administrativo do Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Carregar configurações globais de pagamento do banco de dados (para obter a chave secreta da Stripe)
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("api_key")
      .eq("id", "payment_settings")
      .single();

    if (settingsError || !settingsData || !settingsData.api_key) {
      return new Response("Configurações de pagamento não encontradas.", { status: 500 });
    }

    const settings = JSON.parse(settingsData.api_key);
    const isProduction = settings.environment === "PRODUCTION";
    
    const stripeSecretKey = isProduction ? settings.stripeProdSecretKey : settings.stripeSandboxSecretKey;
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || 
                          (isProduction ? settings.stripeWebhookSecretProd : settings.stripeWebhookSecretSandbox);

    if (!stripeSecretKey) {
      return new Response("Chave Secreta da Stripe não configurada.", { status: 500 });
    }

    // Inicializa o SDK da Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 3. Validar a assinatura do Webhook
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret || "");
    } catch (err: any) {
      console.error(`Falha ao validar assinatura do webhook: ${err.message}`);
      return new Response(`Erro de Assinatura: ${err.message}`, { status: 400 });
    }

    console.log(`Evento Webhook recebido: ${event.type}`);

    // 4. Processar o Evento
    switch (event.type) {
      // 4.1. Evento disparado quando uma fatura de assinatura é paga com sucesso (primeira compra e renovações)
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription;
        
        if (subscriptionId) {
          // Busca a assinatura na Stripe para obter os metadados de userId e planId
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata.supabaseUserId;
          const planId = subscription.metadata.planId;

          if (userId && planId) {
            const endsAt = new Date(subscription.current_period_end * 1000).toISOString();
            
            console.log(`Prorrogando assinatura do usuário ${userId} até ${endsAt} para o plano ${planId}`);
            
            const { error: updateError } = await supabaseAdmin
              .from("professionals")
              .update({
                subscription_plan: planId,
                subscription_status: "active",
                subscription_ends_at: endsAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", userId);

            if (updateError) {
              console.error(`Erro ao atualizar banco: ${updateError.message}`);
              return new Response("Erro ao atualizar assinatura no banco de dados.", { status: 500 });
            }
          }
        }
        break;
      }

      // 4.2. Evento disparado quando a assinatura sofre alterações (ex: upgrade, cancelamento pendente)
      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const userId = subscription.metadata.supabaseUserId;
        const planId = subscription.metadata.planId;

        if (userId && planId) {
          const endsAt = new Date(subscription.current_period_end * 1000).toISOString();
          const status = subscription.status === "active" ? "active" : 
                         subscription.status === "trialing" ? "trialing" : "canceled";

          console.log(`Atualizando status da assinatura do usuário ${userId} para ${status}`);

          await supabaseAdmin
            .from("professionals")
            .update({
              subscription_status: status,
              subscription_ends_at: endsAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }
        break;
      }

      // 4.3. Evento disparado quando a assinatura é cancelada ou expira de vez
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        const userId = subscription.metadata.supabaseUserId;

        if (userId) {
          console.log(`Assinatura cancelada para o usuário ${userId}`);
          
          await supabaseAdmin
            .from("professionals")
            .update({
              subscription_status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
        }
        break;
      }

      default:
        console.log(`Evento não processado: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Erro interno no Webhook:", error.message);
    return new Response(`Erro Interno: ${error.message}`, { status: 500 });
  }
});
