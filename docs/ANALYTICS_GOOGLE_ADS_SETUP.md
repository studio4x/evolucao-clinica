# Analytics, GTM, GA4, Firebase e Google Ads

## Privacidade e carregamento

`src/services/analytics.ts` é a única interface de tracking do cliente. `public/brand-bootstrap.js` aplica exclusivamente marca e tema: ele não busca nem executa GTM, Meta Pixel ou scripts arbitrários.

Antes de qualquer script Google, o app executa sincronicamente `gtag('consent', 'default', ...)` com os quatro armazenamentos negados. O banner mantém escolhas independentes:

- `necessary`: sempre ativo;
- `analytics`: GA4, GTM de analytics e Firebase Analytics;
- `marketing`: Google Ads/remarketing e Meta Pixel.

Ao salvar ou revogar, é enviado `gtag('consent', 'update', ...)`. GTM/GA4/Meta não carregam sem a respectiva permissão. Revogar Analytics também desativa Firebase e remove `userId` e propriedades nativas.

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
| `begin_checkout` | nova tentativa de checkout | cliente | analytics; Meta também marketing | `checkout_attempt_id` em memória, não enviado |
| `page_view` | mudança de rota | cliente | analytics | rota renderizada; sem query/fragment |
| `purchase`, `subscription_started`, `subscription_renewed`, `subscription_cancelled` | webhook Stripe confirmado | GA4 Measurement Protocol | analytics persistido | chave estável de invoice/evento no banco |

Eventos descartados sem consentimento não são enfileirados para envio posterior. `purchase` personalizado não é emitido para Google Play; `in_app_purchase`, `first_open` e `session_start` continuam automáticos do Firebase. Não há confirmação RTDN/Google Play suficiente neste repositório para emitir renovação/cancelamento Play: esses eventos não são simulados no cliente.

## Variáveis

```env
VITE_GTM_ID=GTM-XXXXXXXX          # opcional; preferencial quando houver GTM
VITE_GA_MEASUREMENT_ID=G-XXXXXXXX # somente para GA4 direto
VITE_ANALYTICS_DIRECT_GA4=false   # true somente sem GTM
GA4_MEASUREMENT_ID=G-XXXXXXXX     # Supabase Edge Function secret
GA4_API_SECRET=...                # Supabase Edge Function secret, nunca VITE_
```

Defina as duas últimas apenas em Supabase Secrets para `stripe-webhook`. Não publique `google-services.json`, secrets, tokens, IDs de pacientes, evoluções, conteúdo clínico, documentos, URLs Drive, e-mail ou telefone.

## Validação operacional

Use GTM Preview para confirmar um único `gtm.js`, Firebase DebugView para o Android, GA4 Realtime/DebugView para eventos e o Google Play Console para RTDN quando essa infraestrutura for adicionada. A compilação não substitui essas verificações com contas reais.
