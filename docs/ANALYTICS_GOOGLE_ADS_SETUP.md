# Analytics, GA4, Google Ads e GTM

## Arquitetura

`src/services/analytics.ts` é a única interface de rastreamento do front-end.

- Web: envia eventos ao `dataLayer` do GTM. O envio direto ao GA4 só é usado quando `VITE_ANALYTICS_DIRECT_GA4=true` e não existe `VITE_GTM_ID`.
- Android/WebView: encaminha eventos ao `NativeAnalyticsBridge`, que valida novamente os dados antes de chamar Firebase Analytics.
- Sem consentimento, os scripts de Analytics/GTM não são carregados e os eventos são descartados.
- Firebase Analytics começa com coleta desativada no Android e só é habilitado após o consentimento web.
- Page views usam somente o caminho da rota, sem query string ou fragmento.

Configuração web:

```env
VITE_GTM_ID=GTM-XXXXXXXX
# Alternativa sem GTM; não habilitar junto com GTM.
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_ANALYTICS_DIRECT_GA4=false
```

Não coloque credenciais, `google-services.json`, chaves privadas ou tokens neste repositório.

## Eventos do funil

| Evento | Origem | Parâmetros permitidos |
| --- | --- | --- |
| `sign_up` | autenticação Supabase concluída para conta recém-criada | `method` |
| `login` | autenticação Supabase concluída | `method` |
| `onboarding_begin` | início confirmado do assistente | nenhum |
| `onboarding_complete` | `professionals.onboarding_completed` salvo | nenhum |
| `professional_profile_complete` | profissão/contexto salvos | `professional_segment`, `work_context` |
| `patient_created` | insert de paciente concluído | nenhum |
| `evolution_started` | evolução criada e processamento iniciado | `input_mode`, `is_first_activation` |
| `evolution_completed` | evolução e Google Docs finalizados | `input_mode`, `is_first_activation` |
| `audio_evolution_completed` | evolução concluída com áudio | `input_mode`, `is_first_activation` |
| `begin_checkout` | checkout aberto com plano selecionado | `plan_id`, `plan_name`, `value`, `currency` |
| `purchase` | pagamento Stripe confirmado pelo webhook | `transaction_id`, `plan_id`, `plan_name`, `value`, `currency`, `payment_provider` |
| `subscription_started` | assinatura confirmada no banco | `plan_id`, `plan_name`, `payment_provider` |
| `subscription_renewed` | lifecycle/backend confirmado | `plan_id`, `payment_provider` |
| `subscription_cancelled` | lifecycle/backend confirmado | `plan_id`, `payment_provider` |

`first_open`, `session_start` e `in_app_purchase` permanecem sob a coleta automática do Firebase. Não os replique no front-end. Para Google Play, o evento customizado `purchase` não é emitido; use `in_app_purchase` e `subscription_started`.

Os eventos não recebem `patient_id`, `evolution_id`, nomes, textos, transcrições, diagnósticos, documentos, URLs/IDs de Drive, tokens, e-mail ou telefone. A allow-list é aplicada no TypeScript e novamente na ponte Java.

## Lifecycle e idempotência

As triggers de `lifecycle_events` continuam sendo a fonte de verdade operacional para eventos confirmados pelo backend. O front-end emite apenas a confirmação necessária para mensuração, sem copiar payload clínico.

`purchase`, `subscription_started`, onboarding, paciente e evolução usam chaves de deduplicação. Compras usam `transaction_id` estável e marca persistida no `localStorage`; a página de sucesso pode ser reaberta sem gerar uma nova compra.

Renovações e cancelamentos devem ser conectados ao fluxo de backend/webhook que já confirma o estado da assinatura. Quando esse estado for disponibilizado ao front-end, use `trackEvent` com uma chave persistente baseada no evento confirmado e no período da assinatura.

## Firebase, GA4, Google Play e Google Ads

1. No Firebase Console, confirme o app Android do projeto associado ao `google-services.json` e habilite Google Analytics para o projeto.
2. Em Firebase > Project settings > Integrations, vincule a propriedade GA4 correta.
3. Em GA4, confirme a coleta de `page_view`, os eventos do funil e marque como conversões pelo menos `sign_up`, `purchase`, `subscription_started` e `evolution_completed` conforme o objetivo da campanha.
4. Vincule GA4 ao Google Ads e importe somente as conversões aprovadas para publicidade.
5. No Google Play Console, mantenha o mesmo app/projeto Firebase. O Firebase coleta automaticamente `in_app_purchase` para compras Play Billing; não crie um segundo evento nativo.
6. Teste primeiro em uma propriedade de homologação ou público interno antes de ativar campanhas.

## GTM web

Crie uma tag GA4 Configuration ou Google tag com o Measurement ID, acionada pelo consentimento de Analytics. Crie uma tag GA4 Event para cada evento necessário usando o nome do evento no campo `event` do dataLayer e mapeie somente os parâmetros da tabela.

Ative Consent Initialization/Consent Mode com estado padrão negado. O código atual envia `consent_default` negado e `consent_update` após a escolha. Não instale uma segunda tag GA4 diretamente no HTML.

Para Google Ads, use as conversões importadas do GA4 ou tags específicas no GTM, nunca as duas para o mesmo evento sem uma regra explícita de deduplicação.

## Consentimento

O estado é persistido em `cookie-consent`. A escolha pode ser revogada pelo botão **Privacidade** exibido no site/app. A autenticação, o Supabase, o billing e os recursos essenciais não dependem da coleta.

A configuração final de consentimento, retenção, anúncios e compartilhamento deve ser validada pelo responsável pela privacidade quanto à LGPD. Este documento não é uma afirmação jurídica.

## Testes e debug

- `npm run test`: testes unitários do projeto, incluindo consentimento, sanitização, deduplicação, ponte Android simulada e ausência da ponte no navegador.
- `npm run build`: valida o bundle web.
- Firebase DebugView: use um build/devices de teste e valide a mudança de coleta após conceder consentimento.
- GA4 Realtime: valide `page_view`, `begin_checkout` e `purchase` com uma transação de teste.
- GTM Preview: confirme que o evento chega uma única vez e que nenhum campo clínico aparece no preview.
- Android: inspecione o Logcat por `FirebaseAnalytics` e teste concessão, recusa e revogação em instalações limpas.

O modo de debug do serviço usa apenas `console.debug` em desenvolvimento e registra somente o nome do evento e os parâmetros já sanitizados.

## Checklist de publicação

- [ ] IDs de GTM/GA4 configurados no ambiente correto.
- [ ] Firebase vinculado ao app Android correto.
- [ ] `google-services.json` fornecido apenas no ambiente de build e fora do Git.
- [ ] Consent Mode e tags testados no GTM Preview.
- [ ] Eventos e conversões validados no GA4 Realtime/Firebase DebugView.
- [ ] Compra Stripe testada com webhook e `transaction_id` estável.
- [ ] Compra Google Play validada pela coleta automática `in_app_purchase`.
- [ ] Nenhum dado clínico aparece no dataLayer, Firebase ou GA4.
- [ ] Configuração final revisada para LGPD, retenção e políticas de anúncios.
