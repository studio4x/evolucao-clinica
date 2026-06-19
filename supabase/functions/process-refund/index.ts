// supabase/functions/process-refund/index.ts
// Supabase Edge Function (Deno) para processar reembolso e cancelamento de assinaturas na Stripe

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

    const { transactionId, refundReason } = await req.json();

    if (!transactionId) {
      throw new Error("Parâmetro obrigatório ausente: transactionId.");
    }

    // 2. Buscar a transação no banco
    const { data: tx, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      throw new Error(`Transação com ID ${transactionId} não encontrada.`);
    }

    // Verificar se o usuário é dono da transação ou um administrador
    const { data: prof, error: profError } = await supabaseAdmin
      .from("professionals")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profError || !prof) {
      throw new Error("Não foi possível carregar as permissões do usuário.");
    }

    const isAdmin = prof.role === "admin";
    if (tx.professional_id !== user.id && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Permissão negada. Esta transação não pertence a você." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar prazo de reembolso (7 dias conforme Art. 49 do CDC), exceto para admins
    const createdAt = new Date(tx.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    if (diffDays > 7 && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "O prazo de 7 dias para arrependimento e reembolso garantido pelo CDC já expirou para esta transação." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se já estiver reembolsada, não faz nada
    if (tx.status === "refunded") {
      return new Response(
        JSON.stringify({ success: true, message: "Esta transação já foi reembolsada anteriormente." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Processar reembolso na Stripe se for uma transação real (com stripe_invoice_id)
    if (tx.stripe_invoice_id) {
      // Carregar configurações globais de pagamento
      const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from("settings")
        .select("api_key")
        .eq("id", "payment_settings")
        .single();

      if (settingsError || !settingsData || !settingsData.api_key) {
        throw new Error("Configurações de pagamento (Google Pay/Stripe) não encontradas.");
      }

      const settings = JSON.parse(settingsData.api_key);
      const isProduction = settings.environment === "PRODUCTION";
      const stripeSecretKey = isProduction ? settings.stripeProdSecretKey : settings.stripeSandboxSecretKey;

      if (!stripeSecretKey) {
        throw new Error("Chave Secreta da Stripe não configurada.");
      }

      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: "2023-10-16",
        httpClient: Stripe.createFetchHttpClient(),
      });

      // Recuperar a fatura na Stripe para achar o Payment Intent e a Assinatura
      console.log(`Buscando fatura ${tx.stripe_invoice_id} no Stripe...`);
      const invoice = await stripe.invoices.retrieve(tx.stripe_invoice_id);

      // Efetuar reembolso no Stripe
      if (invoice.payment_intent) {
        console.log(`Reembolsando Payment Intent ${invoice.payment_intent} no Stripe...`);
        await stripe.refunds.create({
          payment_intent: invoice.payment_intent as string,
          reason: "requested_by_customer",
        });
      } else {
        console.warn("Fatura do Stripe não possui payment_intent vinculado.");
      }

      // Cancelar a assinatura no Stripe
      if (invoice.subscription) {
        console.log(`Cancelando assinatura ${invoice.subscription} no Stripe...`);
        // Cancelar imediatamente
        await stripe.subscriptions.cancel(invoice.subscription as string);
      }
    } else {
      console.log(`Transação ${transactionId} é simulada. Pulando integração Stripe.`);
    }

    // 4. Atualizar o status da transação para 'refunded'
    const { error: txUpdateError } = await supabaseAdmin
      .from("transactions")
      .update({
        status: "refunded",
        refund_reason: refundReason || "Cancelamento solicitado pelo cliente",
      })
      .eq("id", transactionId);

    if (txUpdateError) {
      throw new Error(`Erro ao atualizar transação: ${txUpdateError.message}`);
    }

    // 5. Atualizar o profissional para plano 'trial' e status 'canceled'
    const { error: profUpdateError } = await supabaseAdmin
      .from("professionals")
      .update({
        subscription_plan: "trial",
        subscription_status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tx.professional_id);

    if (profUpdateError) {
      throw new Error(`Erro ao atualizar o profissional: ${profUpdateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Assinatura cancelada e reembolso processado com sucesso!",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Erro no processamento do reembolso:", error.message);
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
