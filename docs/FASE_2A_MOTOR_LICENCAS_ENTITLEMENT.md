# Fase 2A — Motor de licenças, entitlement e capacidade clínica

**Escopo:** staging `hwkdwinfckmjoriqxbjk`, branch `feat/clinicas`.
Produção `kvxboovgrrhhttaqinld` não foi alterada.

## Decisão de domínio

O entitlement individual continua autorizando somente recursos de “Minha
conta”. O contrato empresarial autoriza o workspace da clínica. Membership e
`clinical_access_enabled` determinam a capacidade do usuário na clínica; um
entitlement não migra, cancela ou altera o outro e nunca modifica
`professionals.subscription_plan`.

Owner e manager administrativos podem operar o workspace sem consumir licença.
Uma membership suspensa ou removida não consome licença. Um manager ou
professional com `clinical_access_enabled=false` também não consome licença.

## Catálogo e contrato

`private.clinic_plan_catalog` é o catálogo interno em centavos, sem IDs ou
objetos externos:

| Código | Intervalo | Base | Seat | Mínimo |
| --- | --- | ---: | ---: | ---: |
| `clinic_monthly` | mensal | 4990 | 2990 | 3 |
| `clinic_yearly` | anual | 49900 | 29900 | 3 |

`private.organization_subscriptions` é a fonte de verdade do contrato atual,
com uma linha por organização e snapshots monetários. O contrato aceita
`active`, `past_due`, `canceled` e `unpaid`; não há trial automático. O mínimo
é três seats e nenhuma tabela empresarial fica acessível diretamente ao
cliente. O catálogo representa a oferta comercial atual; a subscription é o
snapshot histórico do contrato. Portanto, `enabled=false` impede novas vendas
administrativas futuras, mas não cancela contratos existentes.

## Entitlement e capacidade

O helper privado `organization_entitlement_mode` resolve `full`, `restricted`
ou `none` de forma fail-closed. `active` e `past_due` dentro da tolerância
produzem `full`; a tolerância de `past_due` é de sete dias. `unpaid`,
`canceled` após o período efetivo, período vencido com cancelamento e
organização restrita produzem `restricted` quando o workspace continua
identificável. Organização arquivada, pending sem contrato ou contrato
ausente/inválido produzem `none`.

`active_seats`, `reserved_seats` e `available_seats` são derivados:

```text
active    = membership active + clinical_access_enabled=true
reserved  = invitation pending + intended_clinical_access=true + expires_at>agora
available = contracted - active - reserved
```

Não existe contador editável pelo navegador. Um constraint trigger diferível
revalida o invariante no commit em memberships, convites e contratos, tolerando
a conversão atômica de reserva em seat ativo. O contrato não pode ficar abaixo
de `max(3, active + reserved)`.

Operações que consomem capacidade bloqueiam a linha da assinatura da
organização: convite clínico, aceite clínico, habilitação e reativação clínica.
Emissão, aceite e lifecycle usam a mesma fronteira antes das decisões de
capacidade; o rate limit existente permanece ativo.

## Hardening 2A.1

A migration corretiva `20260916_12_harden_entitlement_snapshots_and_invitation_expiry.sql`
foi aplicada somente no staging, sem editar ou reaplicar o SQL 11. A
`organization_subscriptions.plan_code` agora possui FK `ON DELETE RESTRICT` e
há constraint de coerência `clinic_monthly -> monthly` e
`clinic_yearly -> annual`. O helper estrutural valida somente invariantes do
contrato, incluindo capacidade e datas; ele não compara snapshots monetários
com o catálogo atual.

`organization_subscription_access_mode` é independente do status operacional e
da flag da organização. O rollout exige runtime/global gate válidos, exatamente
um owner ativo, contrato estruturalmente válido e modo financeiro `full`; a
transição de `pending_setup` para `active` e a flag são confirmadas na mesma
transação. `active` com cancelamento no fim do período só é FULL enquanto o
período ainda não encerrou; `past_due` só é FULL dentro da grace. `unpaid`,
`canceled` e estados financeiros vencidos não são FULL.

O preço e o estado `enabled` do catálogo foram alterados temporariamente no
smoke e restaurados. O contrato histórico permaneceu FULL, com contexto,
summary e lifecycle disponíveis; plano desabilitado não revogou entitlement.
O helper `is_clinic_plan_sellable` deixa explícita a regra para provisionamento
administrativo futuro: plano desabilitado não inicia novo contrato. Stripe e
checkout continuam na Fase 2B.

A expiração lógica foi restaurada nas três rotas: emissão de novo convite,
revogação e aceite. A transição `pending -> expired` agora grava
`invitation_expired` e o aceite vencido retorna `{status: "expired",
accepted: false}` sem criar membership ou seat. A transição é idempotente e
não duplica auditoria.

## Hardening 2A.2

A migration corretiva `20260916_13_harden_reserved_seat_conversion_and_operational_restriction.sql`
foi aplicada somente no staging. O convite clínico pending é o proprietário da
reserva: o aceite bloqueia a assinatura, valida a reserva ainda existente e
converte atomicamente `reserved -> active`, sem exigir uma segunda vaga. A
última vaga, duas aceitações concorrentes do mesmo token e a expiração seguida
de novo convite passaram; o token concorrente materializou no máximo uma
membership ativa e um seat clínico.

O estado operacional `restricted` agora domina o modo de entitlement do
workspace, mesmo quando o contrato financeiro ainda é `full`. Assim, leitura,
resumo e ações redutivas autorizadas continuam disponíveis, enquanto convite,
aceite, reativação e habilitação clínica permanecem negados; nenhuma alteração
financeira futura pode promover automaticamente um workspace operacionalmente
restrito. A matriz também confirmou cross-tenant deny e não introduziu Stripe,
Checkout ou efeitos de integração.

## Convites e lifecycle

Convite administrativo exige `full` e não reserva seat. Convite clínico exige
`full`, bloqueia a assinatura, verifica vaga e só então cria `pending`; sem
vaga não há convite. Expiração por tempo deixa de reservar sem depender de
cron, e revogação libera a reserva. Aceite administrativo cria membership
ativa com acesso clínico falso; aceite clínico converte a reserva em acesso
clínico ativo sem exigir uma segunda vaga. O mesmo token concorrente produz no
máximo um aceite.

Em `restricted`, leitura de contexto/equipe/resumo e ações redutivas seguem
disponíveis; convite, aceite, reativação e habilitação clínica são negados.
Suspensão libera seat por derivação e preserva o booleano histórico. Remoção é
terminal e não apaga a membership. Reativação administrativa e clínica exige
`full`; a clínica também exige seat disponível e permanece suspensa quando não
há vaga. Não há exclusão automática de contrato, organização, membership,
convite ou registro.

Somente owner ativo habilita/desabilita `clinical_access_enabled`. Manager
visualiza o resumo, mas não distribui capacidade. As novas transições são
auditadas como `member_clinical_access_enabled` e
`member_clinical_access_disabled`.

## RLS, RPCs e aplicação

`can_access_organization_workspace` exige gate global/organizacional,
membership ativa e entitlement `full` ou `restricted`. `can_expand_organization`
exige `full`. `has_clinical_access` exige gate, `full`, membership ativa e
capacidade clínica. As policies de organizações e memberships usam o helper
de workspace; sem contrato o contexto desaparece.

`get_organization_seat_summary` é uma RPC read-only para owner/manager. O
endpoint `GET /api/clinic/entitlement` usa chave pública + JWT do usuário e
RLS/RPC; o endpoint de clinical access também é user-scoped. Nenhum service
role chega ao frontend e não há endpoint de contratação.

As rotas de clínica não dependem da assinatura individual. As rotas pessoais
continuam sob o `ProtectedRoute` individual. Isso permite usuário clinic-only
com assinatura pessoal inativa operar a clínica autorizada, sem liberar seus
recursos pessoais premium. Troca de contexto revalida e não reutiliza resumo de
outra organização.

`/painel/clinica/equipe` mostra, para owner e manager, o resumo read-only de
licenças. Owner recebe os controles de habilitar/desabilitar acesso clínico;
manager não recebe esses controles. Em `restricted`, a UI mostra “Clínica em
modo restrito.” e mantém somente ações redutivas. Não há UI de convite, e-mail,
seat comercial ou Stripe.

## Validação staging

O migration foi aplicado exclusivamente no staging `hwkdwinfckmjoriqxbjk` pela
Management API oficial do Supabase, de forma idempotente. A produção
`kvxboovgrrhhttaqinld` não foi acessada nem alterada.

O smoke real provisionou dados sintéticos somente no staging por fluxo
administrativo, habilitou o gate global temporariamente, executou a matriz
base, concorrência, `restricted`, coexistência individual/organizacional,
cross-tenant e cleanup, e devolveu o gate a OFF. Resultado: **PASS**.

Foram comprovados: catálogo e valores em centavos BRL, mínimo de três seats,
contrato válido/inválido, matemática derivada e invariant transacional;
reserva, aceite idempotente, expiração, revogação, suspensão, remoção e
reativação; owner-only, manager read-only, capacidade sem assinatura pessoal,
`full`/`restricted`/`none`, concorrência da última vaga, cross-tenant e duas
clínicas independentes.

O cleanup confirmou `auth_users=0`, `professionals=0`, `organizations=0`,
`memberships=0`, `invitations=0`, `subscriptions=0`, `flags=0`,
`audit_events=0`, `patients=0` e `evolutions=0` para os fixtures sintéticos. A
verificação posterior confirmou catálogo restaurado, runtime `staging`,
`allowed_environment=staging`, gate global `false`, constraints validadas, RLS
nas tabelas relevantes e helpers privados `SECURITY DEFINER` com
`search_path` fixado, sem ACL de execução para `PUBLIC`, `anon` ou
`authenticated`.

Os advisors oficiais retornaram HTTP 200 com zero lints de segurança e zero
lints de performance. Os gates locais também passaram: `npm test`,
`npm run lint`, `npm run build` e `git diff --check`. A build exibida permanece
`v1.10.870`; nenhum artefato Android foi gerado.

## Limites preservados para a Fase 2B

Stripe, Checkout, webhooks, cobrança, proration, Customer Portal, alteração
comercial de quantidade, convite real/e-mail, raw token no frontend, pacientes
compartilhados, evoluções organizacionais e produção permanecem fora do
escopo. Nenhum preço é exibido como cobrança e nenhum ID externo é criado.

## Resultado

**FASE 2A REVISADA E ENDURECIDA — APTO PARA FASE 2B**

Não foram iniciados Stripe, Checkout, webhooks, cobrança, proration, Customer
Portal, alteração comercial de quantidade, convite real/e-mail, pacientes ou
evoluções compartilhados, produção ou a Fase 2B.
