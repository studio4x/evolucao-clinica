# Analytics, GTM, GA4, Firebase e Google Ads

## Privacidade e carregamento

`src/services/analytics.ts` é a única interface de tracking do cliente. `public/brand-bootstrap.js` aplica exclusivamente marca e tema: ele não busca nem executa GTM, Meta Pixel ou scripts arbitrários.

Antes de qualquer script Google, o app executa sincronicamente `gtag('consent', 'default', ...)` com os quatro armazenamentos negados. O banner mantém escolhas independentes:

- `necessary`: sempre ativo;
- `analytics`: GA4, GTM de analytics e Firebase Analytics;
- `marketing`: Google Ads/remarketing e Meta Pixel.

Ao salvar ou revogar, é enviado um único `gtag('consent', 'update', ...)` por mudança efetiva. GTM é carregado se Analytics **ou** Marketing tiver sido aceito; GA4 direto exige Analytics e Meta exige Marketing. O Meta Pixel recebe `consent grant` antes de `init/PageView` e `consent revoke` imediatamente na revogação. Revogar Analytics também desativa Firebase e remove `userId` e propriedades nativas.

`VITE_GTM_ID` é canônico e tem precedência. Sem ele, o ID dinâmico `tracking_settings.gtm_id` pode ser usado pelo serviço central. GA4 direto só é usado se `VITE_ANALYTICS_DIRECT_GA4=true` e nenhum GTM estiver configurado. Nunca configure uma tag GA4 direta dentro de um container GTM além da configuração acima.

Os campos legados `head_scripts`, `body_scripts` e `footer_scripts` não são executados. A configuração dinâmica aceita apenas IDs, e `fb_pixel_id` exige Marketing.

## Firebase Android

O `LauncherActivity` inicia Firebase Analytics com coleta desativada. A ponte `NativeAnalyticsBridge` rejeita eventos, `userId` e propriedades antes de Analytics consent. Apenas o UUID interno Supabase é aceito como `userId`; logout ou revogação o remove junto das propriedades permitidas.

## Eventos

| Evento | Fonte confirmada | Destino | Consentimento | Deduplicação |
| --- | --- | --- | --- | --- |
| `sign_up`, `login` | mudança confirmada do Supabase Auth | cliente | analytics | usuário/sessão |
| `onboarding_begin`, `onboarding_complete`, `professional_profile_complete` | gravação concluída | cliente | analytics | operação/usuário |
| `patient_created`, `evolution_*`, `audio_evolution_completed` | persistência concluída | cliente | analytics | operação |
| `begin_checkout` | clique real que abre Stripe Checkout | cliente | analytics; Meta também marketing | `checkout_attempt_id` por tentativa |
| `page_view` | mudança de rota | cliente | analytics | rota renderizada; sem query/fragment |
| `purchase`, `subscription_started`, `subscription_renewed`, `subscription_cancelled` | webhook Stripe confirmado | GA4 Measurement Protocol | analytics persistido | chave estável de invoice/evento no banco |

Eventos descartados sem consentimento não são enfileirados para envio posterior. No checkout web, após consentimento Analytics, o cliente lê `client_id`, `session_id` e `session_number` reais do Google tag e a sessão Stripe preserva esses metadados. O webhook só envia Measurement Protocol se houver esse identificador real e o consentimento persistido ainda for válido — nunca cria identificadores aleatórios. `purchase` personalizado não é emitido para Google Play; `in_app_purchase`, `first_open` e `session_start` continuam automáticos do Firebase. Não há `app_instance_id`/RTDN disponível para atribuir conversões Android no servidor, portanto elas não são inventadas nem misturadas ao stream web.

## Entrega server-side e recuperação

O webhook Stripe usa `analytics_event_deliveries` e `claim_analytics_event_delivery` para registrar/retomar eventos com chave idempotente. O lock expira após 15 minutos; falhas transitórias têm até seis tentativas com backoff exponencial de 1 minuto a 6 horas. Eventos enviados ficam imutáveis. Falta de atribuição real ou falha de validação é permanente e não vira uma conversão atribuída.

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
VITE_GA_MEASUREMENT_ID=G-XXXXXXXX # somente para GA4 direto
VITE_ANALYTICS_DIRECT_GA4=false   # true somente sem GTM
GA4_MEASUREMENT_ID=G-XXXXXXXX     # Supabase Edge Function secret
GA4_API_SECRET=...                # Supabase Edge Function secret, nunca VITE_
ANALYTICS_MEASUREMENT_ENV=production # development/test/staging habilita somente validação extra
```

Defina os segredos server-side em Supabase Secrets para `stripe-webhook` e `process-analytics-deliveries`. Em `development`, `test` ou `staging`, o worker envia primeiro ao endpoint debug do Measurement Protocol com validação estrita e registra somente códigos de erro, sem payload/PII. Em produção usa o endpoint normal. Não publique `google-services.json`, secrets, tokens, IDs de pacientes, evoluções, conteúdo clínico, documentos, URLs Drive, e-mail ou telefone.

## Validação operacional

Use GTM Preview para confirmar um único `gtm.js`, Firebase DebugView para o Android, GA4 Realtime/DebugView para eventos e o Google Play Console para RTDN quando essa infraestrutura for adicionada. A compilação não substitui essas verificações com contas reais.
