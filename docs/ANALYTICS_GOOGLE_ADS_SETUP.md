# Analytics, GTM, GA4, Firebase e Google Ads

## Privacidade e carregamento

`src/services/analytics.ts` é a única interface de tracking do cliente. `public/brand-bootstrap.js` aplica exclusivamente marca e tema: ele não busca nem executa GTM, Meta Pixel ou scripts arbitrários.

Antes de qualquer script Google, o app executa sincronicamente `gtag('consent', 'default', ...)` com os quatro armazenamentos negados. O banner mantém escolhas independentes:

- `necessary`: sempre ativo;
- `analytics`: GA4, GTM de analytics e Firebase Analytics;
- `marketing`: Google Ads/remarketing e Meta Pixel.

Ao salvar ou revogar, é enviado um único `gtag('consent', 'update', ...)` por mudança efetiva. GTM é carregado se Analytics **ou** Marketing tiver sido aceito; GA4 direto exige Analytics e Meta exige Marketing. O Meta Pixel recebe `consent grant` antes de `init/PageView` e `consent revoke` imediatamente na revogação. Revogar Analytics também desativa Firebase e remove `userId` e propriedades nativas.

`VITE_GTM_ID` é canônico e tem precedência. Sem ele, o ID dinâmico `tracking_settings.gtm_id` pode ser usado pelo serviço central. `VITE_GA_MEASUREMENT_ID` identifica o destino GA4 usado por `gtag('get', ...)` para obter `client_id`, `session_id` e `session_number`, inclusive quando o carregamento ocorre pelo GTM. Essa leitura não habilita GA4 direto: esse caminho só existe se `VITE_ANALYTICS_DIRECT_GA4=true` e nenhum GTM estiver configurado.

O valor de `VITE_GA_MEASUREMENT_ID` deve ser exatamente o Measurement ID do mesmo stream web usado pela Google Tag dentro do GTM e pelo secret `GA4_MEASUREMENT_ID` das Edge Functions. O checkout limita cada leitura de atribuição a 2 segundos; timeout, ausência do GTM ou configuração incompleta nunca bloqueiam a cobrança nem criam `client_id` artificial.

Os campos legados `head_scripts`, `body_scripts` e `footer_scripts` não são executados. A configuração dinâmica aceita apenas IDs, e `fb_pixel_id` exige Marketing.

## Firebase Android

O `LauncherActivity` inicia Firebase Analytics com coleta desativada. A ponte `NativeAnalyticsBridge` rejeita eventos, `userId` e propriedades antes de Analytics consent. Apenas o UUID interno Supabase é aceito como `userId`; logout ou revogação o remove junto das propriedades permitidas.

## Eventos

| Evento | Fonte confirmada | Destino | Consentimento | Deduplicação |
| --- | --- | --- | --- | --- |
| `sign_up`, `login` | mudança confirmada do Supabase Auth | cliente | analytics | usuário/sessão |
| `onboarding_begin`, `onboarding_complete`, `professional_profile_complete` | gravação concluída | cliente | analytics | operação/usuário |
| `patient_created`, `evolution_*`, `audio_evolution_completed` | persistência concluída | cliente | analytics | operação |
| `begin_checkout` | clique real que abre Stripe Checkout | cliente | Analytics e/ou Marketing, conforme cada escolha | `checkout_attempt_id` por tentativa |
| `page_view` | mudança de rota | cliente | analytics | rota renderizada; sem query/fragment |
| `purchase` | cobrança confirmada por Stripe ou Google Play | stream web do GA4 via Measurement Protocol | analytics persistido | invoice Stripe ou `orderId` Google Play no banco |
| `purchase_stripe` | primeira cobrança positiva confirmada de uma assinatura Stripe | stream web do GA4 via Measurement Protocol; importação no Google Ads | analytics persistido | `stripe:purchase_stripe:<subscription_id>` no banco |
| `subscription_started`, `subscription_renewed`, `subscription_cancelled` | webhook Stripe ou verificação/RTDN Google Play | stream web do GA4 via Measurement Protocol | analytics persistido | chave estável de invoice/order/evento no banco |
| `Purchase` Meta | página de confirmação após localizar transação `paid` | Meta Pixel | marketing | invoice Stripe ou `orderId` Google Play persistido no navegador |
| `in_app_purchase` | invoice Stripe Android confirmada pelo webhook e consultada pelo cliente | Firebase Android nativo | analytics | invoice Stripe no armazenamento nativo e web |

Eventos descartados sem consentimento não são enfileirados para envio posterior. No checkout web, após consentimento Analytics, o cliente lê `client_id`, `session_id` e `session_number` reais do Google tag e a sessão Stripe preserva esses metadados. O webhook só envia Measurement Protocol se houver esse identificador real e o consentimento persistido ainda for válido — nunca cria identificadores aleatórios.

No Android, compras da Google Play continuam automáticas no Firebase e nunca recebem um evento manual, pois o SDK não deduplica os dois caminhos. Para faturamento alternativo Stripe, o cliente aguarda a confirmação do webhook, consulta a invoice `paid` protegida por RLS e só então solicita à ponte nativa um `in_app_purchase` com `transaction_id`, valor, BRL, plano e `payment_provider=stripe`. A deduplicação persistente usa a invoice Stripe; retorno do Payment Sheet, pagamento pendente, falha e restauração não registram compra. Esse caminho usa o SDK Firebase no dispositivo e não exige expor `app_instance_id` nem API secret.

`subscription_started` e `subscription_renewed` enviados pelo Measurement Protocol usam `client_id` do stream **web** e, portanto, aparecem somente nesse stream/propriedade. Eles não são encaminhados automaticamente ao stream Firebase Android. Não envie esses eventos ao fluxo do app usando `client_id` web, não invente `app_instance_id` e não simule eventos Firebase.

O `dataLayer` contém as emissões de navegação, produto e `begin_checkout`, com os booleanos `analytics_destination` e `marketing_destination`. No GTM, configure tags web apenas para o destino consentido. A página de confirmação não envia mais `purchase` ao Google Ads pelo `dataLayer`: a aquisição Stripe deve vir exclusivamente do `purchase_stripe` server-side importado do GA4. O Meta Pixel continua recebendo `Purchase` com `eventID` derivado da invoice/order confirmado e somente com Marketing aceito. Não use a mera existência de um evento no `dataLayer` como autorização e não crie gatilhos sobrepostos para `begin_checkout`.

## Matriz de conversões

| Origem | Evento | Papel no Google Ads/GA4 | Classificação recomendada |
| --- | --- | --- | --- |
| Google Play / app Android | `app_store_subscription_convert` ou conversão de compra Google Play disponível na conta vinculada | aquisição do aplicativo | **principal** para campanhas de app |
| Google Play / app Android | `in_app_purchase` | compra automática Google Play/Firebase; usar conforme a configuração da conta, sem emissão manual | principal ou observação, sem duplicar `app_store_subscription_convert` |
| Stripe / site | `purchase_stripe` | primeira ativação paga de cada assinatura Stripe | **principal** para campanhas do site |
| Stripe e Google Play | `purchase` | receita consolidada entre provedores no stream web | secundário; **não importar como conversão principal** |
| Google Play | `app_store_subscription_renew` | renovação automática do app | secundário, retenção/receita recorrente |
| Stripe e Google Play | `subscription_renewed` | renovação no relatório web consolidado | secundário, retenção/receita recorrente |
| Site/app | `begin_checkout` | intenção de iniciar checkout | secundário |

`purchase_stripe` nasce apenas de `invoice.paid`, exige valor positivo, moeda, invoice real e consentimento de Analytics. A primeira cobrança paga é definida pela ausência de outra transação Stripe `paid` e positiva para o mesmo `subscriptionId`. Assim, o primeiro pagamento depois de um trial também é aquisição, enquanto renovação e mudança de plano de uma assinatura já paga não são. Uma nova assinatura criada após cancelamento tem novo `subscriptionId` e é tratada como reativação/nova aquisição; retomar a mesma assinatura não gera outra aquisição.

## Configuração manual no GA4 e Google Ads

1. No GA4 do stream web, crie a dimensão personalizada de evento `payment_provider` e, se necessário para exploração, `is_first_activation`.
2. Marque `purchase_stripe` como evento principal/key event no GA4. Mantenha `purchase`, `subscription_renewed`, `app_store_subscription_renew` e `begin_checkout` como secundários.
3. Vincule a propriedade GA4 à conta correta do Google Ads e importe **somente `purchase_stripe`** como ação principal de aquisição do site. Defina `purchase` como secundária ou não a importe.
4. Remova/desative qualquer tag Google Ads do GTM que dispare conversão de compra a partir do evento genérico `purchase` do cliente.
5. Vincule Google Play e Firebase ao Google Ads. Para campanhas de app, selecione `app_store_subscription_convert` ou a conversão Google Play equivalente como principal e decida se `in_app_purchase` ficará principal ou somente observação para não duplicar a mesma compra.
6. Mantenha `app_store_subscription_renew` e `subscription_renewed` como ações secundárias de retenção/receita recorrente.
7. Valide com GA4 DebugView/Realtime, Firebase DebugView e diagnóstico de conversões do Google Ads usando compras de teste autorizadas; nunca reenvie webhooks reais apenas para testar tags.

## Entrega server-side e recuperação

O webhook Stripe usa `analytics_event_deliveries` e `claim_analytics_event_delivery` para registrar/retomar eventos com chave idempotente. Para `purchase_stripe`, a chave é `stripe:purchase_stripe:<subscription_id>` e o `transaction_id` do payload é a invoice confirmada; isso impede duplicidade por replay de webhook ou outro identificador correlato da mesma assinatura. O lock expira após 15 minutos; falhas transitórias têm até seis tentativas com backoff exponencial de 1 minuto a 6 horas. Na ausência temporária de configuração GA4, a fila tenta novamente antes do limite e muda atomicamente para `failed`, sem `next_attempt_at` e sem lock, na sexta tentativa. Eventos enviados ficam imutáveis. Falta de atribuição real ou falha de validação é permanente e não vira uma conversão atribuída.

O worker `process-analytics-deliveries` é chamado a cada cinco minutos somente quando os dois segredos Vault abaixo existem. Configure também o mesmo token como segredo da Edge Function, sem registrá-lo em arquivos, terminal compartilhado ou frontend:

```sql
select vault.create_secret('<token-gerado-fora-do-repositorio>', 'analytics_delivery_cron_token');
select vault.create_secret('https://SEU-PROJETO.supabase.co/functions/v1/process-analytics-deliveries', 'analytics_delivery_retry_url');
select public.configure_analytics_delivery_retry_job();
```

```sh
supabase secrets set ANALYTICS_DELIVERY_CRON_TOKEN='<mesmo-token>'
```

Sem esses valores o cron fica intencionalmente desativado, em vez de expor uma rota de recuperação. O deploy da função continua seguro porque ela rejeita chamadas sem o token.

## Variáveis

```env
VITE_GTM_ID=GTM-XXXXXXXX          # opcional; preferencial quando houver GTM
VITE_GA_MEASUREMENT_ID=G-XXXXXXXX # destino GA4 para atribuição; mesmo stream da Google Tag/GTM e da Edge Function
VITE_ANALYTICS_DIRECT_GA4=false   # true somente sem GTM
GA4_MEASUREMENT_ID=G-XXXXXXXX     # Supabase Edge Function secret
GA4_API_SECRET=...                # Supabase Edge Function secret, nunca VITE_
ANALYTICS_MEASUREMENT_ENV=production # development/test/staging habilita somente validação extra
```

Defina os segredos server-side em Supabase Secrets para `stripe-webhook` e `process-analytics-deliveries`. Em `development`, `test` ou `staging`, o worker envia primeiro ao endpoint debug do Measurement Protocol com validação estrita e registra somente códigos de erro, sem payload/PII. Em produção usa o endpoint normal. Não publique `google-services.json`, secrets, tokens, IDs de pacientes, evoluções, conteúdo clínico, documentos, URLs Drive, e-mail ou telefone.

Meta `Purchase` é disparado no cliente somente após a página confirmar no banco uma transação `paid`, nunca pelo simples fecho/retorno do PaymentSheet ou Play Billing. Só habilite Conversions API no webhook quando houver Pixel/dataset confirmado, token server-side e regra persistida de consentimento de Marketing; reutilize o `event_id` `purchase-<transaction_id>` para deduplicar navegador e servidor.

## Validação operacional

Use GTM Preview para confirmar um único `gtm.js`, Firebase DebugView para o Android, GA4 Realtime/DebugView para eventos e o Google Play Console para RTDN quando essa infraestrutura for adicionada. A compilação não substitui essas verificações com contas reais.
