# FASE 2B — Stripe Test Mode, Checkout Empresarial e Webhooks

## Estado

**FASE 2B APROVADA PARA REVISÃO**

Execução concluída exclusivamente no Supabase staging `hwkdwinfckmjoriqxbjk`, na conta Stripe Test `Sandbox Evolução Clínica` (`acct_1TmBy9PI1KSTkIQA`). Nenhum objeto Live, projeto de produção, DNS, Supabase produção ou cobrança real foi utilizado.

O pagamento foi submetido no Checkout hospedado da Stripe com dados sintéticos e o cartão oficial de teste `4242`; não houve ativação manual nem alteração direta de estado de billing para forçar sucesso.

## Catálogo Test

| Item | Produto | Preço | Lookup key |
|---|---|---|---|
| Clínica Base mensal | `prod_VGrCfmAPz3lBQp` | `price_1UGJTnPI1KSTkIQAuk7DIIIo` | `ec_clinic_base_monthly_staging` |
| Seat Clínica mensal | `prod_VGrCpXXr2XPm1u` | `price_1UGJTnPI1KSTkIQAxsHEU1my` | `ec_clinic_seat_monthly_staging` |
| Clínica Base anual | `prod_VGrCfmAPz3lBQp` | `price_1UGJToPI1KSTkIQArAZ41D5T` | `ec_clinic_base_yearly_staging` |
| Seat Clínica anual | `prod_VGrCpXXr2XPm1u` | `price_1UGJToPI1KSTkIQAgERhnW8u` | `ec_clinic_seat_yearly_staging` |

O cenário exercitado foi `clinic_monthly`, com base 1 + seats 3, total de R$ 139,60/mês.

## Checkout e reconciliação

IDs Test não secretos para revisão:

- Checkout Session: `cs_test_b1wPGliVEDpv0q55A00kOkHV3OzZ0BEIjLC7L0paYUMtUmOFvpoRvmmYiU`
- Customer: `cus_VGriVVMdqXa5Of`
- Subscription: `sub_1UGJzYPI1KSTkIQA3lqSCpCr`
- Invoice inicial: `in_1UGJzWPI1KSTkIQA1yHNsnx5`
- Webhook `checkout.session.completed`: `evt_1UGJzZPI1KSTkIQA93wA33DO`
- Webhook `customer.subscription.created`: `evt_1UGJzZPI1KSTkIQA3WUCl1zg`
- Webhook `invoice.paid`: `evt_1UGJzZPI1KSTkIQAyNuTqDR2`
- Webhook endpoint: `we_1UGJaIPI1KSTkIQAS4lj7XUM`

Validações observadas antes do cleanup:

- `livemode = false` no Checkout, Subscription, Invoice e webhooks.
- Checkout `complete`, `payment_status = paid`, `mode = subscription`.
- Invoice `paid`, BRL, `amount_paid = 13960`.
- Subscription `active`.
- Itens da Subscription: base `quantity = 1`; seat `quantity = 3`.
- Metadados incluíram `billingScope = clinic`, `environment = staging`, plano mensal, organização e tentativa sintéticas.
- Eventos foram recebidos e processados pelo ledger server-side.
- `organization_checkout_attempts.status = activated`.
- `private.organization_subscriptions.financial_status = active`, `contracted_seats = 3`, `billing_provider = stripe`.
- `organization_feature_flags.feature_key = clinic` foi habilitada pelo reconciliador, com motivo `stripe clinic subscription reconciled`.

## Seats e cancelamento

Com sessão autenticada normal do owner sintético:

- 3 → 4: confirmado e reconciliado; seats contratados passaram a 4.
- 4 → 3: confirmado como redução pendente; `pending_contracted_seats = 3` e vigência no próximo ciclo.
- Cancelamento: confirmado com `cancel_at_period_end = true`; não houve cancelamento imediato.

Nenhuma dessas validações usou a secret key para simular uma sessão de usuário. A chave administrativa foi usada apenas pela infraestrutura de preparação/reconciliação/cleanup; as operações do owner passaram por login e bearer token de usuário sintético.

## Cleanup e isolamento

Após os gates, a assinatura Test e o customer Test foram removidos. A limpeza local foi concluída em transação administrativa usando a rotina de purge prevista para auditoria imutável.

Confirmação final no staging:

- usuários sintéticos: `0`;
- organizações sintéticas: `0`;
- subscriptions sintéticas: `0`;
- resíduos de checkout/eventos/transações/flags: `0`;
- gate DB global: `false`;
- `CLINIC_BILLING_ENABLED`: `false`.

As secrets de integração permanecem apenas no ambiente staging pelos nomes necessários às Functions; seus valores não são documentados. Não houve alteração da chave `default` nem uso de qualquer chave Live.

## Implementação entregue

- migrations `20260916_14` a `20260916_17` aplicadas somente no staging;
- wrappers server-side para catálogo, checkout, lookup, reconciliação, seats e cancelamento;
- Edge Functions de catálogo, checkout, seats, status, cancelamento e webhook Stripe;
- proteção explícita de ambiente staging/Test Mode e validação da conta Sandbox;
- ledger idempotente de eventos e transações;
- gate global e rollout por organização preservados;
- teste estático `tests/clinic-billing.test.ts`.

## Gates finais

| Gate | Resultado |
|---|---|
| Stripe Test / Sandbox correto | PASS |
| Live Mode detectado | PASS — nenhum objeto Live usado |
| Checkout e pagamento sintético | PASS |
| Webhook server-side e reconciliação | PASS |
| Subscription base=1 / seats=3 | PASS |
| Seats increase/decrease/cancel | PASS |
| Isolamento staging | PASS |
| Cleanup sintético | PASS |
| Produção / Live / cobrança real | NÃO EXECUTADO |
| Fase 2C / convites reais / e-mail | NÃO EXECUTADO |

## Pendências e limites

Esta fase não autoriza Stripe Live, checkout de produção, cobrança real, convites reais, e-mail, WhatsApp, upgrade de plano ou a Fase 2C. O acesso visual à rota de sucesso da Vercel continua condicionado à Deployment Protection; a confirmação de billing foi feita pela API Stripe Test e pelo estado server-side do Supabase, que são as evidências de autoridade para esta fase.
