# Migração para Stripe com conformidade no Google Play

## Arquitetura implantada

- Web e desktop: Stripe Checkout hospedado.
- Android distribuído pela Play Store: tela oficial de escolha da Google entre Play Billing e Stripe PaymentSheet nativo.
- Webhooks são a fonte de verdade. O redirecionamento de sucesso e o retorno do PaymentSheet nunca ativam o plano diretamente.
- `billing_subscriptions` guarda o estado unificado; os campos `professionals.subscription_*` permanecem como projeção compatível.
- `transactions` identifica o provedor e mantém as colunas Stripe legadas durante a migração.
- Pix, boleto e Link não fazem parte deste fluxo.

O Android passa a exigir Android 6.0/API 23 por requisito da Play Billing Library 9.1.0.

## Supabase Secrets

Configure os valores sem adicioná-los ao Git ou à tabela `settings`:

```text
PAYMENT_ENVIRONMENT=TEST ou PRODUCTION
APP_ORIGIN=https://www.evolucaoclinica.app.br
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_SECRET_KEY_PROD=sk_live_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_PUBLISHABLE_KEY_PROD=pk_live_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
STRIPE_WEBHOOK_SECRET_PROD=whsec_...
STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_TEST=pmc_...
STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_PROD=pmc_...
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={...JSON completo...}
GOOGLE_PLAY_PACKAGE_NAME=com.evolucaoclinica.app
GOOGLE_PLAY_RTDN_AUDIENCE=https://<projeto>.supabase.co/functions/v1/google-play-rtdn
GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL=<conta usada pelo push autenticado do Pub/Sub>
```

A configuração de métodos `pmc_...` deve ser exclusiva para assinaturas e manter apenas cartão habilitado. Google Pay e Apple Pay são apresentados pela Stripe como carteiras de cartão quando elegíveis. Desabilite Link, Pix, boleto e todos os demais métodos no Stripe Dashboard.

Depois de configurar o novo fluxo e validar produção, remova da tabela `settings.payment_settings` e rotacione quaisquer chaves secretas Stripe antigas.

## Edge Functions

Implante as funções autenticadas normalmente:

```text
create-stripe-checkout-session
create-stripe-mobile-subscription
create-stripe-customer-portal-session
verify-google-play-subscription
process-refund
```

Implante os receptores de webhook sem validação JWT do Supabase; eles fazem sua própria validação criptográfica/OIDC:

```text
stripe-webhook
google-play-rtdn
```

Exemplo com a CLI:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy google-play-rtdn --no-verify-jwt
```

O endpoint Stripe deve usar a versão de API `2025-04-30.basil` ou superior e assinar estes eventos:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Play Console e Google Cloud

Antes do teste interno:

1. Concluir o perfil de comerciante.
2. Inscrever o app no programa de escolha/faturamento alternativo para o Brasil.
3. Criar `evolucao_monthly` com plano base `monthly-auto`.
4. Criar `evolucao_yearly` com plano base `yearly-auto`.
5. Ativar a Google Play Developer API e conceder à conta de serviço acesso ao app e a pedidos/assinaturas.
6. Criar o tópico RTDN, conceder publicação à Google Play e configurar uma assinatura push autenticada para `google-play-rtdn`.
7. Cadastrar os testadores e publicar a versão 57 primeiro no canal interno.

Compras Stripe iniciadas pela escolha da Play são reportadas pela Google Play Developer API. A primeira cobrança usa `externalTransactionToken`; renovações usam `initialExternalTransactionId`. Falhas de reporte ficam registradas em `billing_subscriptions.external_reporting_status/error` e impedem a confirmação do acesso no cliente.

Nas assinaturas Play, o `purchaseToken` identifica a série da assinatura e cada `orderId` identifica uma cobrança. O histórico em `transactions` preserva cada renovação sem sobrescrever a compra inicial.

## Ordem de publicação

1. Aplicar a migration `20260721150000_unify_billing_providers.sql`.
2. Configurar os Secrets.
3. Implantar todas as Edge Functions.
4. Configurar e testar os webhooks Stripe.
5. Concluir Stripe Dashboard, Play Console e Pub/Sub.
6. Publicar o build web.
7. Enviar `app-release-bundle.aab` versão 57 ao teste interno.
8. Validar cartão aprovado/recusado/3DS, carteiras compatíveis, abandono, duplicidade, atraso de webhook, compra/restauração/cancelamento/reembolso Play e Stripe.
9. Promover para teste fechado somente após a matriz passar sem checkout dentro do WebView.
