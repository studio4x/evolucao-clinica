# FASE 2B — Stripe Test Mode, Checkout Empresarial e Webhooks

## Estado

**FASE 2B AINDA BLOQUEADA**

Hardening 2B.3 implementado, publicado somente no staging e validado localmente.
Falta o smoke real de Checkout COMPLETE após ownership transfer: o pagamento
sintético final não foi enviado sem a confirmação solicitada no momento da ação.
Os demais cenários executados passaram; cleanup final zero e gates OFF.

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

## Hardening 2B.1

A migration `20260916_18_harden_clinic_billing_operations.sql` foi aplicada somente no staging. As migrations 14–17 não foram editadas.

- `private.clinic_billing_operations` mantém histórico de operações comerciais, payload, chave idempotente, assinatura vinculada, estado e lease de 5 minutos.
- Um índice parcial permite no máximo uma operação aberta por organização entre seat increase, seat decrease e cancelamento.
- A preparação usa advisory lock transacional por organização; seat versus cancel e duas alterações de seats competem pela mesma fronteira.
- O mesmo payload idempotente reutiliza a operação; alteração de seats, plano ou organização no mesmo checkout attempt retorna conflito controlado.
- A criação do Customer e da Checkout Session usa chaves Stripe derivadas do attempt; double-click não cria duas sessões.
- Retry após lease vencido pode reassumir a operação; o reconciliador marca a operação como concluída quando a quantidade/estado atual da Stripe confirma o objetivo.
- O claim de webhook usa `processing_started_at` e lease: duplicata processando retorna sem segundo worker; evento stale ou failed pode ser retomado.
- `invoice.payment_failed` grava `amount_due`; `invoice.paid` grava `amount_paid`.
- Reconciliação continua buscando a Subscription atual na Stripe, preservando segurança para eventos fora de ordem.

### Smoke funcional 2B.1

Executado com fixtures staging e objetos Stripe Test temporários, removidos ao final:

- double-click same attempt/same payload: PASS, uma Checkout Session;
- mesmo attempt com seats/plano/organização divergentes: PASS, `checkout_attempt_payload_mismatch`;
- attempts diferentes na mesma organização: PASS, uma tentativa aberta;
- seat 3→4 versus 3→5 concorrente: PASS, uma lease e um conflito;
- recovery de operação `processing` stale após mudança Stripe: PASS;
- seat change versus cancelamento concorrente: PASS, uma operação e um conflito;
- claim de webhook duplicado concorrente: PASS, segundo claim `in_progress`;
- claim stale de webhook: PASS, reclaim permitido;
- ledger `payment_failed` com `amount_paid=0` e `amount_due=13960`: PASS, valor esperado 13960;
- `livemode=false` em todos os objetos Test observados; catálogo Products/Prices e endpoint webhook existentes foram apenas reutilizados.

IDs Test do smoke 2B.1, não secretos: Checkout `cs_test_b1PZdtJZVra7JpO3WQ2Wuz7nz5cHpE1H6SE6ZcyF4qystv3HhghvXzzOlG`, Customer `cus_VGsNjuTyxM6oTa` e Subscription `sub_1UGKdDPI1KSTkIQASLKY9juU`. Foram removidos no cleanup.

### Advisors

Security Advisor e Performance Advisor foram consultados pela Management API oficial do staging. Não há descoberta nova P0/P1. Permanecem WARN/INFO preexistentes fora do hardening: extensão `vector` em `public`, funções organizacionais SECURITY DEFINER expostas para `authenticated` e avisos informativos de índices/FKs; nenhum deles foi reclassificado como falha nova desta fase.

## Hardening 2B.2

A migration `20260916_19_harden_clinic_billing_recovery.sql` foi aplicada somente no staging, sem editar as migrations 14–18. As três Edge Functions alteradas foram redeployadas no mesmo projeto por Management API/CLI `--use-api`.

- Operações comerciais abertas com lease vencida agora retornam `recovery_required` e seus metadados mínimos, em vez de bloquear indefinidamente uma nova idempotency key.
- O recovery consulta a Subscription Stripe atual, valida Sandbox/Test, reconcilia primeiro e somente libera a organização quando o alvo foi satisfeito ou quando não há mutação/pagamento pendente conclusivo.
- Operação stale aplicada na Stripe é concluída sem repetir a mutação; operação não aplicada é marcada `expired`; `pending_payment` renova a retenção e não é sobrescrito.
- Redução de seats stale só limpa `pending_contracted_seats` quando o valor ainda corresponde à operação encerrada.
- Checkout `session_created` com Session expirada é materializado como `expired`; Session aberta com payload igual é reutilizada mesmo após perda do attempt ID; payload diferente permanece em conflito.
- Attempts `started` stale podem ser normalizadas; attempts `completed` não são expiradas automaticamente e são reconciliadas server-side com a Session/Subscription atual.
- `past_due` dentro da janela de grace continua com entitlement `full` e pode preparar seat/cancel; `past_due` fora da grace fica `restricted`; estados Stripe `canceled`/`unpaid` são fail closed antes de mutação.

### Smoke funcional 2B.2

O teste contratual e o smoke controlado cobrem: lost idempotency key, Stripe aplicada/não aplicada, pending payment, seat decrease stale, checkout expirado, reload com Session aberta, payload divergente, started stale, completed checkout, grace period, concorrência de billing e regressão do claim de webhook. O smoke real retornou `pass` para checkout double-click/reload/expiração, recovery com chave nova nos dois estados Stripe e `past_due` dentro/fora da grace. Todos os fixtures e objetos Test temporários foram removidos no cleanup; nenhum convite, e-mail, paciente compartilhado, produção ou Stripe Live foi usado.

## Implementação entregue

- migrations `20260916_14` a `20260916_18` aplicadas somente no staging;
- migration `20260916_19` aplicada somente no staging;
- wrappers server-side para catálogo, checkout, lookup, reconciliação, seats e cancelamento;
- Edge Functions de catálogo, checkout, seats, status, cancelamento e webhook Stripe;
- proteção explícita de ambiente staging/Test Mode e validação da conta Sandbox;
- ledger idempotente de eventos e transações;
- gate global e rollout por organização preservados;
- teste contratual funcional `tests/clinic-billing.test.ts` com modelo de lease, idempotência, claim e ledger.

## Gates finais

| Gate | Resultado |
|---|---|
| Stripe Test / Sandbox correto | PASS |
| Live Mode detectado | PASS — nenhum objeto Live usado |
| Checkout e pagamento sintético | PASS |
| Webhook server-side e reconciliação | PASS |
| Subscription base=1 / seats=3 | PASS |
| Seats increase/decrease/cancel | PASS |
| Checkout payload imutável | PASS |
| Double-click / uma Checkout Session | PASS |
| Uma operação aberta por organização | PASS |
| Seat operations serializadas | PASS |
| Seat versus cancel serializado | PASS |
| Lease stale recuperável | PASS |
| Migration 19 aplicada no staging | PASS |
| Functions 2B.2 redeployadas no staging | PASS |
| Recovery stale com idempotency key nova | PASS |
| Stripe aplicada reconciliada sem segunda mutação | PASS |
| Stripe não aplicada liberada com segurança | PASS |
| Pending payment stale não sobrescrito | PASS |
| Checkout Session expirada materializada | PASS |
| Attempt expirada não bloqueia nova tentativa | PASS |
| Session aberta reutilizada após perda de attempt ID | PASS |
| Session aberta com payload diferente negada | PASS |
| Attempt `started` stale recuperável | PASS |
| Checkout `completed` reconciliado | PASS |
| `past_due` dentro da grace = entitlement FULL | PASS |
| `past_due` dentro da grace permite billing RPC | PASS |
| `past_due` fora da grace bloqueia expansão | PASS |
| Pending payment idempotente | PASS — contrato preservado; fluxo Test não exigiu ação adicional |
| Webhook duplicate/stale claim | PASS |
| Out-of-order por Subscription atual | PASS — reconciliador preservado |
| `payment_failed` usa `amount_due` | PASS |
| `invoice.paid` usa `amount_paid` | PASS |
| Isolamento staging | PASS |
| Cleanup sintético | PASS |
| Security Advisor — P0/P1 novos | PASS — zero |
| Performance Advisor revisado | PASS — apenas INFO preexistentes |
| `npm test` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — aviso de tamanho de chunk existente, sem erro |
| `git diff --check` | PASS |
| Produção / Live / cobrança real | NÃO EXECUTADO |
| Fase 2C / convites reais / e-mail | NÃO EXECUTADO |

## Hardening 2B.3 — autorização antes de recovery

Execução de 16/09/2026, exclusivamente em `feat/clinicas`, Supabase staging
`hwkdwinfckmjoriqxbjk` e Stripe Test `acct_1TmBy9PI1KSTkIQA` (Sandbox Evolução
Clínica). Build `v1.10.874`; versão móvel mantida, sem `.aab`.

### Autorização e isolamento

Seats, cancel e checkout agora seguem JWT validado → organização do request →
current active owner → configuração/Sandbox → recovery. O ator vem apenas de
`user.id`; campos de actor, owner ou role enviados pelo browser não conferem
autoridade. A migration 20 adiciona `assert_clinic_billing_owner_authorized`,
validando organização não archived, professional existente e membership active
owner da mesma organização. Os erros são neutros (`403/not_authorized`), inclusive
para UUID de organização inexistente.

O helper de stale recovery recebe o actor e repete a autorização internamente,
antes de consultar a operação ou Stripe; confirma ainda que a assinatura resolvida
pertence à organização autorizada. A autorização é independente de entitlement
FULL: contratos `past_due`, `unpaid` ou `canceled` podem precisar de recovery.
A elegibilidade de **nova** alteração comercial continua separada, no prepare e
na validação de estado Stripe. Autorização é revalidada antes dos principais
side effects de recovery/Stripe.

Manager permanece read-only no status. Manager, professional, usuário sem
membership, ex-owner e owner de outro tenant não provocam recovery de billing.
Webhook assinado e reconciliação administrativa service-role continuam sem
dependência de JWT owner; nenhum guard de usuário foi inserido no webhook.

As duas RPCs novas têm `SECURITY DEFINER`, search path vazio e nomes qualificados;
EXECUTE foi negado a PUBLIC/anon/authenticated e concedido apenas a service_role.
Os grants privados de get/hold/expire das migrations anteriores foram conferidos
e preservados. Migrations 14–19 não foram alteradas; a migration 20 e o MANIFEST
foram aplicados somente no staging pela Management API, sem `db push`.

### Checkout durante ownership transfer

`ownerProfessionalId` no Stripe é o **iniciador histórico**, não a autorização
atual. O lookup administrativo por organização requer current owner também no
banco e encontra tentativas do owner anterior. Inclui o contrato já `activated`,
pois o webhook pode concluir a tentativa antes do retorno do novo owner.

- Session OPEN do antigo owner: expiração oficial no Stripe, nova consulta do
  estado autoritativo e materialização local expired antes de iniciar a tentativa
  do owner atual; a URL antiga não é reutilizada em nome do novo owner.
- Session EXPIRED: materialização local e nova tentativa permitida.
- Session COMPLETE: nunca expirar; validar Session/itens/organização e
  Subscription/customer antes de reconciliar o contrato, sem segundo checkout.
  COMPLETE tem precedência sobre um `expires_at` passado.
- Se pagamento vencer a corrida de expiração, reconciliar COMPLETE; se a
  expiração falhar e a Session permanecer aberta, bloquear nova contratação.
- Tentativa started sem Session permanece protegida pela lease; stale pode ser
  materializada como expired. Metadata histórica não é reescrita.

O comportamento segue a [expiração oficial de Checkout Session da Stripe](https://docs.stripe.com/api/checkout/sessions/expire)
e o hardening de [funções de banco do Supabase](https://supabase.com/docs/guides/database/functions).

### Evidência dos testes e smoke 2B.3

`tests/clinic-billing-authorization.test.ts` transpila e executa os handlers e
helpers **efetivamente publicados**, substituindo apenas transporte de banco,
Stripe e serve. As negativas comprovam somente a chamada de owner assertion,
zero construção/consulta/update Stripe e zero RPC de operação, assinatura,
pending reduction ou checkout. Cobertura adicional: defesa interna do helper,
recovery aplicado/não aplicado/decrease/cancel/pending, estado financeiro
past_due/unpaid/canceled, contrato cross-tenant, checkout OPEN/EXPIRED/COMPLETE,
contrato já activated, corrida de pagamento e expiração inconclusiva. Seats e
cancel executados contra Subscription mock realmente `past_due` permanecem PASS.

No smoke real, todos os endpoints usaram bearer de usuários sintéticos logados
normalmente. Foram observados PASS para:

- trigger Auth → professionals e login normal;
- owner A → operação stale B DENY, manager/professional/sem membership DENY,
  com snapshots de operações, subscription (incluindo pending reduction) e
  attempts inalterados e resposta sem metadata de outro tenant;
- UUID aleatório: erro neutro; manager: status read-only permitido;
- owner autorizado: stale untouched recuperada com chave nova e alteração Test;
- ex-owner: checkout DENY; current owner: Session OPEN antiga expirada e nova
  tentativa própria; Session EXPIRED antiga resolvida;
- grace `past_due` local futura: owner PASS, manager DENY; cancel owner PASS;
- contratos Test iniciais criados com cartão/token de teste e reconciliados pelo
  webhook Stripe assinado, independente de usuário owner.

Limite explícito dos fixtures: o RPC normal de transferir owner exige workspace
FULL e não permite a transferência em pending_setup. Para exercitar checkout
pré-contratação, apenas as memberships dos fixtures descartáveis foram trocadas
transacionalmente (owner antigo → manager, novo → owner), respeitando a invariante
de um owner ativo. Nenhum estado financeiro/ativação foi forçado. A grace local
é fixture de elegibilidade; o cenário de Stripe realmente past_due foi validado
separadamente pelos handlers reais com transporte mock.

As primeiras execuções do harness encontraram particularidades de transporte
(resposta vazia no cadastro de secret e encerramento de stdin) e o pré-requisito
FULL do RPC de owner transfer. Não foram falhas de autorização dos endpoints;
o harness foi ajustado. As execuções interrompidas anteriores ao último Checkout
tiveram cleanup zero e gates OFF confirmados. O último Checkout Test foi
inspecionado no navegador, confirmando Sandbox, base 1, seats 3 e R$ 139,60/mês
simulados. Não houve envio de pagamento. Como a confirmação no momento da ação
não chegou nesta execução, a Session
`cs_test_b1WOyDRxYwRn9mZbEnNIiJvTTdTruljm7UEjTeh9Cg8bc6sxnOmlqrEbmg`
foi expirada oficialmente e os fixtures foram removidos. Para retomar este gate,
será necessário preparar novo fixture descartável e confirmar um único pagamento
Test antes do envio, sem ativação manual nem alteração financeira para forçar
sucesso. A confirmação pelo redirect não substitui Stripe e estado server-side.

### Cleanup e Advisors pós-execução 2B.3

Confirmadas zero linhas dos UUIDs sintéticos em Auth, professionals,
organizations, memberships, subscriptions, checkout attempts, billing operations,
invitations, flags, audit, Stripe events/transactions locais, patients e evolutions.
Sessions Auth sintéticas foram removidas; Sessions Checkout abertas foram
expiradas, subscriptions Test canceladas e customers temporários removidos, sem
erros de cleanup. Catálogo estrutural Products/Prices e webhook endpoint mantidos.
Gate DB global `false` e `CLINIC_BILLING_ENABLED=false` restaurados.

Security Advisor: **14 WARN**, mesmos tipos preexistentes
(`extension_in_public`, `authenticated_security_definer_function_executable`);
nenhum novo P0/P1. Performance Advisor: **18 INFO**, tipos preexistentes
(`unindexed_foreign_keys`, `unused_index`). Não houve mudança das contagens nem
criação de tabelas/índices nesta migration; não foi feita otimização fora do escopo.

### Gates finais 2B.3

| Gate | Evidência atual |
| --- | --- |
| Owner antes de seat/cancel/checkout recovery | PASS — handlers reais e smoke staging |
| Manager/professional/sem membership/cross-tenant DENY | PASS — sem side effects ou metadata |
| Stripe de tenant não autorizado não consultado | PASS — transporte instrumentado dos handlers reais |
| Owner stale recovery / nova chave / past_due grace | PASS — smoke e regressões locais |
| Ex-owner DENY; current owner OPEN/EXPIRED | PASS — smoke Test |
| COMPLETE/activated após ownership transfer | PASS local; PENDENTE smoke real — pagamento Test não enviado |
| Webhook/individual/concurrency/idempotência | PASS — webhook real e suíte de regressão |
| Migration 20 / Functions staging / grants | PASS — estado final seats/cancel versão 62; checkout versão 64; JWT verificado (versões também avançam com atualização de secrets) |
| Cleanup final / gates OFF | PASS — zero fixtures; global false; CLINIC_BILLING_ENABLED=false |
| Advisors | PASS — Security 14 WARN; Performance 18 INFO, inalterados pós-cleanup |
| npm test, lint, build, diff check | PASS; build mantém apenas aviso preexistente de chunk |
| Produção, Stripe Live, catálogo, endpoint webhook, DNS, main | NÃO ALTERADOS |
| Fase 2C, convites reais, e-mail, dados clínicos compartilhados | NÃO EXECUTADOS |

## Resultado 2B.3

**FASE 2B AINDA BLOQUEADA**

Única pendência de aprovação desta etapa: confirmar e executar o smoke real de
pagamento Checkout COMPLETE após ownership transfer. Os testes dos helpers e
handlers reais para esse cenário passaram; não são apresentados como pagamento
hospedado efetivamente executado. Não iniciar Fase 2C enquanto o gate não fechar.

## Resultado 2B.2

**FASE 2B REVISADA E ENDURECIDA — APTO PARA FASE 2C**

Este resultado encerra a execução 2B.2 e não inicia a Fase 2C.

## Resultado 2B.1

**FASE 2B REVISADA E ENDURECIDA — APTO PARA FASE 2C**

Este resultado não inicia a Fase 2C.

## Pendências e limites

Esta fase não autoriza Stripe Live, checkout de produção, cobrança real, convites reais, e-mail, WhatsApp, upgrade de plano ou a Fase 2C. O acesso visual à rota de sucesso da Vercel continua condicionado à Deployment Protection; a confirmação de billing foi feita pela API Stripe Test e pelo estado server-side do Supabase, que são as evidências de autoridade para esta fase.
