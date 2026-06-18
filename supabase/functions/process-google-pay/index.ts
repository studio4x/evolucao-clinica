// supabase/functions/process-google-pay/index.ts
// Exemplo de Supabase Edge Function (Deno) para processar o token do Google Pay com Stripe em Produção

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    // 1. Determinar valor e moeda com base no plano
    let amount = 4990; // R$ 49.90 (em centavos para Stripe)
    let durationDays = 30;

    if (planId === "yearly") {
      amount = 49900; // R$ 499.00
      durationDays = 365;
    }

    // 2. Criar uma cobrança (Charge) ou pagamento (PaymentIntent) usando o token do Google Pay
    // Nota: O token do Google Pay é passado no campo 'source' ou mapeado para um PaymentMethod.
    const charge = await stripe.charges.create({
      amount: amount,
      currency: "brl",
      source: paymentToken, // O token do Google Pay (ex: tok_12345) funciona como 'source' no Stripe
      description: `Assinatura do plano ${planId} para o usuário ${userId}`,
      metadata: {
        userId: userId,
        planId: planId,
      },
    });

    if (charge.status !== "succeeded") {
      throw new Error(`Falha no processamento do pagamento: Status ${charge.status}`);
    }

    // 3. Atualizar a assinatura na tabela 'professionals' do Supabase DB
    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: dbError } = await supabaseAdmin
      .from("professionals")
      .update({
        subscription_plan: planId,
        subscription_status: "active",
        subscription_ends_at: subscriptionEndsAt,
        updated_at: now.toISOString(),
      })
      .eq("id", userId);

    if (dbError) {
      throw new Error(`Erro ao atualizar banco de dados: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Pagamento processado e assinatura atualizada com sucesso!",
        chargeId: charge.id,
        endsAt: subscriptionEndsAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
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
