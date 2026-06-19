// supabase/functions/process-google-pay/index.ts
// Supabase Edge Function (Deno) para processar assinatura real no Stripe com tokens do Google Pay

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Trata requisição OPTIONS para CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, planId, paymentToken } = await req.json();

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
      .select("stripe_sandbox_price_id, stripe_prod_price_id, name")
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
    const invoice = subscription.latest_invoice as any;
    if (invoice) {
      const amountPaid = invoice.amount_paid ? invoice.amount_paid / 100 : 0;
      const { error: txInsertError } = await supabaseAdmin
        .from("transactions")
        .upsert(
          {
            professional_id: userId,
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: subscription.id,
            amount: amountPaid,
            currency: invoice.currency || 'brl',
            plan_id: planId,
            status: "paid",
            stripe_invoice_url: invoice.hosted_invoice_url,
            invoice_pdf_url: invoice.invoice_pdf,
            created_at: new Date().toISOString()
          },
          { onConflict: 'stripe_invoice_id' }
        );

      if (txInsertError) {
        console.error(`Erro ao registrar transação no process-google-pay: ${txInsertError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Assinatura criada com sucesso!",
        subscriptionId: subscription.id,
        status: status,
        endsAt: currentPeriodEnd,
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
