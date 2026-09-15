# Fase 1B2 — Feature gates e convites

**Status:** implementada exclusivamente em staging; aguardando revisão formal
**Branch:** `feat/clinicas`
**Staging autorizado:** Supabase `hwkdwinfckmjoriqxbjk`
**Produção:** Supabase `kvxboovgrrhhttaqinld` — não alterada
**Pré-requisito:** Fase 1B1 revisada e endurecida (`58fba47`)

## 1. Escopo aplicado

Foram aplicados somente os artefatos versionados abaixo, pela Management API oficial, no staging:

- [`20260915_03_clinic_feature_gates.sql`](../supabase/clinic-migrations/20260915_03_clinic_feature_gates.sql): configuração global privada, flags por organização, RLS empresarial e proteção dos RPCs existentes;
- [`20260915_04_organization_invitations.sql`](../supabase/clinic-migrations/20260915_04_organization_invitations.sql): convites, hash de token, emissão, revogação, aceite transacional e expiração lógica.

Não foram executadas migrations históricas, `supabase db push`, SQL em produção, alterações Vercel, UI, e-mail, WhatsApp, push, n8n, billing, seats, Stripe, cron ou pacientes compartilhados.

## 2. Gate global e relação com Vercel

`private.clinic_runtime_config` é uma configuração mínima, privada, com uma única linha, `enabled=false` por padrão e `allowed_environment='staging'`. A ausência de linha também retorna OFF. A tabela tem RLS e policy explícita `USING/WITH CHECK false` para `anon` e `authenticated`; esses papéis não possuem grants de alteração. O acesso operacional fica fora do caminho público da aplicação.

`private.is_clinic_global_enabled()` e `private.is_clinic_feature_enabled(organization_id)` usam `SECURITY DEFINER` com `search_path` fixo. O segundo só retorna true quando o gate global está ON e existe a flag `clinic` da organização com `enabled=true`; membership não está embutido nesse helper.

O backend/Vercel continua obrigado a exigir `CLINIC_FEATURE_ENABLED=true` somente em ambiente permitido. `VITE_CLINIC_FEATURE_ENABLED` é apenas espelho de UX. As duas barreiras são complementares: o backend impede inicialização/uso fora do ambiente autorizado e o gate DB-side impede acesso direto via PostgREST/RPC quando a configuração global está OFF. O staging foi devolvido a OFF ao final do smoke.

## 3. `organization_feature_flags`

A tabela pública possui `organization_id`, `feature_key='clinic'`, `enabled`, `created_by`, `reason` e timestamps, com unicidade `(organization_id, feature_key)` e FK sem cascade destrutivo. Ausência da linha equivale a OFF.

Não existe toggle público. `owner`, `manager` e `professional` não possuem INSERT/UPDATE/DELETE direto nem RPC genérica de toggle; flags de fixture foram controladas somente por credencial administrativa de staging. A leitura autenticada é limitada a owner/manager da própria organização e exige gate global + flag da organização ON.

Uma organização criada por `create_organization_with_owner` nasce com `operational_status='pending_setup'` e sem flag, portanto OFF. A criação só ocorre com o gate global ON; a habilitação posterior é operação controlada de rollout. `pending_setup`, `restricted` e `archived` não aceitam convites nesta fase; somente `active` opera emissão/aceite.

## 4. Convites

`organization_invitations` possui:

- identidade da organização e e-mail conservadoramente normalizado por `lower(trim(email))`;
- `intended_role` limitado a `manager` ou `professional`;
- `intended_clinical_access` como intenção, sem ativar capacidade;
- `token_hash bytea` de 32 bytes, nunca token puro;
- estados `pending`, `accepted`, `expired` e `revoked`;
- expiração, emissor, aceite, revogação e timestamps;
- FKs sem cascade destrutivo, índice do hash, índices de FK e proteção de duplicidade.

O token é gerado com `extensions.gen_random_bytes(32)`, convertido para hexadecimal e hasheado com `extensions.digest(..., 'sha256')`. O token puro só é retornado uma vez pela RPC de emissão para o smoke controlado; não é persistido, logado ou incluído em documentação. A confirmação de e-mail do Auth é obrigatória no aceite, usando `auth.users.email` e `email_confirmed_at`, nunca `user_metadata`.

A validade escolhida provisoriamente é de 72 horas. A expiração é lógica: operações de emissão, revogação e aceite normalizam convites vencidos; a leitura autenticada não trata um `pending` vencido como convite utilizável. Não há cron.

Há no máximo um `pending` por organização e e-mail normalizado. Uma emissão nova marca um `pending` vencido como `expired`; um `pending` ainda válido é rejeitado. Um advisory lock transacional por organização/e-mail serializa duas emissões concorrentes.

## 5. Emissão e revogação

As RPCs públicas são:

- `create_organization_invitation(organization_id, email, intended_role, intended_clinical_access)`;
- `revoke_organization_invitation(invitation_id)`.

Ambas exigem identidade autenticada, gate global + organização ON, organização `active` e membership ativo. Owner pode emitir `manager` ou `professional`; manager pode emitir somente `professional`. `owner` nunca é papel convidável, e o convite não transfere ownership. Revogação segue o mesmo escopo: manager só revoga convite de professional; convite aceito, revogado ou vencido não é revogado novamente.

As mensagens de falha são neutras quanto à existência global da conta. A emissão não cria Auth user e não envia comunicação externa.

## 6. Aceite

`accept_organization_invitation(raw_token)` é transacional e:

1. exige `auth.uid()` e token com formato esperado;
2. carrega e-mail Auth autoritativo e confirmação de e-mail;
3. localiza e bloqueia o convite pelo hash;
4. valida estado, expiração, organização `active`, gate global e flag da organização;
5. compara e-mail normalizado;
6. rejeita membership `active` ou `suspended` existente;
7. cria somente membership `active` com o papel do convite;
8. força `clinical_access_enabled=false` e usa emissor derivado do convite;
9. marca o convite como `accepted` com `accepted_by`/`accepted_at`.

Convite expirado retorna estado controlado `expired` e não cria membership. Token inválido, revogado, já aceito, e-mail divergente, organização incompatível ou usuário não confirmado são negados sem revelar detalhes desnecessários. O lock do convite garante que duas aceitações simultâneas produzam no máximo uma membership e um aceite.

Membership `removed` não é sobrescrita: um novo aceite cria nova linha `active`, preservando o histórico 1B1. Membership `suspended` não pode ser contornada por convite.

## 7. RLS e grants

As cinco RPCs empresariais públicas (`create_organization_with_owner`, `transfer_organization_owner`, emissão, revogação e aceite) são `SECURITY DEFINER`, usam `search_path = pg_catalog, private, public`, validam identidade/escopo e têm `EXECUTE` revogado de `PUBLIC`/`anon`, concedido somente a `authenticated`.

As policies de `organizations` e `organization_memberships` agora exigem gate da organização e membership ativo. A policy de flags exige gate e papel owner/manager. A policy de convites exige gate, papel owner/manager e não expõe pending vencido como utilizável. Tabelas novas têm RLS desde a criação; `authenticated` não possui mutações diretas. `token_hash` não possui privilégio de SELECT para `authenticated`.

As colunas de RLS/FK novas foram indexadas. Os helpers privados necessários às policies possuem somente os grants mínimos de execução e o schema `private` não é exposto como API PostgREST.

## 8. Smoke e regressão

O smoke foi executado apenas com usuários, organizações, memberships e convites sintéticos. Todos os UUIDs de criação foram capturados e validados antes do passo seguinte.

- global OFF / organização ON: DENY;
- global ON / organização OFF: DENY;
- global ON / organização ON / sem membership: DENY;
- membership `active`: PASS conforme papel;
- membership `suspended` e `removed`: DENY;
- owner → professional/manager: PASS; owner → owner: DENY;
- manager → professional: PASS; manager → manager/owner: DENY;
- e-mail inválido, mismatch, token inválido, expirado, revogado e reutilizado: DENY;
- usuário existente e usuário criado após a emissão: PASS;
- aceite idempotente e concorrente: uma membership;
- reingresso após `removed`: histórico preservado + nova membership `active`;
- duplicidade de emissão concorrente: no máximo um pending válido;
- intenção clínica verdadeira não habilita acesso nem assento;
- RLS, anon e mutações diretas: DENY conforme esperado;
- fluxo individual, baseline de seis tabelas, zero cron, zero secrets Vault e zero Storage: preservados;
- cleanup: zero flags, convites, organizações, memberships, Auth users e professionals sintéticos;
- gate DB global final: OFF.

## 9. Advisors e riscos

Após aplicação e cleanup, a Management API retornou:

- Security: 6 WARN — 5 RPCs `SECURITY DEFINER` autenticados, necessários às transações controladas, mitigados por `auth.uid()`, `search_path` fixo e grants mínimos; 1 WARN histórico da extensão `vector` em `public`;
- Performance: 7 INFO — 3 FKs históricas sem índice e 4 índices de convites sem carga de produção suficiente para serem considerados usados;
- nenhum P0/P1 novo.

O schema `vault` existe como infraestrutura do Supabase, mas `vault.secrets=0`; Storage possui zero buckets e zero objetos; cron não possui relação ativa. Nenhuma integração externa foi executada.

## 10. Gates restantes

Antes de produção permanecem obrigatórios: enforcement real de `CLINIC_FEATURE_ENABLED` no backend/deployment, operação administrativa auditada para ativação de flag por organização, rate limiting/auditoria operacional de convites, aprovação jurídica e todas as fases de billing/licenças/pacientes compartilhados. Esta entrega não inicia UI, onboarding, lifecycle adicional, Fase 2 ou produção.

## 11. Resultado

**FASE 1B2 APROVADA PARA REVISÃO**

Isso não autoriza ativação em produção nem a próxima fase automaticamente.
