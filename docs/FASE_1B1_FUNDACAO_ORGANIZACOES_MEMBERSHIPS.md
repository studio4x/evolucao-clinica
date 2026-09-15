# Fase 1B1 — Fundação de organizações e memberships

**Status:** revisada e endurecida exclusivamente em staging; apta para Fase 1B2
**Branch:** `feat/clinicas`
**Staging:** Supabase `hwkdwinfckmjoriqxbjk`
**Produção:** Supabase `kvxboovgrrhhttaqinld` — não alterada
**Pré-requisito:** Fase 1B0 aprovada para revisão

## 1. Escopo executado

Foi aplicado somente o artefato versionado
[`20260915_01_organizations_memberships.sql`](../supabase/clinic-migrations/20260915_01_organizations_memberships.sql), com:

- `organizations`: identidade, dados institucionais, estado operacional, locale, timezone, criador e timestamps;
- `organization_memberships`: associação a `professionals`, papéis `owner`/`manager`/`professional`, estados, capacidade clínica e histórico sem hard delete;
- FKs sem `ON DELETE CASCADE`, índices das FKs e índices únicos parciais para associação não removida e owner ativo;
- helpers privados `is_organization_member`, `has_organization_role` e `has_clinical_access`;
- RPCs transacionais de criação de organização com primeiro owner e transferência de owner;
- invariantes deferred que impedem organização sem exatamente um owner ativo, inclusive em alterações privilegiadas;
- grants mínimos e RLS desde a criação.

Na transferência, o owner anterior permanece ativo como `manager`, política escolhida para fechar a decisão não explicitada na Fase 1A. A transferência para o owner atual é idempotente e as transferências concorrentes serializam no lock da organização.

## 2. Guardas de ambiente

Antes da aplicação, a API oficial confirmou o projeto staging ativo, o projeto Vercel `evolucao-clinica-staging` no team TARGET, branch `feat/clinicas`, 29 env vars, `APP_ENV=staging`, `VITE_APP_ENV=staging`, URL pública de staging, Supabase ref `hwkdwinfckmjoriqxbjk` e kill switches de clínica/integrações desligados. A ref de produção não foi usada como destino de escrita.

O projeto staging permaneceu sem objetos de convites, flags por organização, subscriptions, pacientes empresariais, cron ou dados persistentes de teste. As tabelas individuais e suas políticas não foram alteradas.

## 3. Smoke Auth/RLS multi-tenant

Foi usada uma matriz sintética A/B/C/D:

| Identidade | Contexto |
| --- | --- |
| A | owner da Clínica 1 |
| B | professional da Clínica 1 |
| C | owner da Clínica 2 |
| D | sem membership |

Todos os UUIDs necessários foram retornados por representação e validados antes da etapa seguinte: quatro usuários/professionals, duas organizações e um membership de fixture. As sessões de leitura e autorização usaram tokens normais dos usuários; a chave `service_role` do staging foi usada somente para administração do fixture/cleanup.

Resultado:

- trigger Auth → `professionals`: PASS;
- login A/B/C/D: PASS;
- A/B acessam somente a organização autorizada: PASS;
- C não acessa a Clínica 1 e A/B não acessam a Clínica 2: PASS;
- D e anon negados: PASS;
- acesso direto por UUID sem membership: DENY;
- membership de uma organização não autoriza outra: PASS;
- INSERT/UPDATE/DELETE direto por sessão autenticada: DENY;
- alteração direta de `clinical_access_enabled`: DENY;
- A → B e B → A: transferência PASS;
- transferência para owner atual: idempotente PASS;
- alvo de outra organização ou sem membership: DENY;
- segundo owner ativo: DENY;
- helper de capacidade clínica false/true: PASS;
- cleanup completo: zero usuários, professionals, organizações e memberships sintéticos;
- baseline individual após cleanup: seis tabelas preservadas.

## Revisão pós-implementação / hardening

A revisão identificou uma ambiguidade na seleção do alvo de `transfer_organization_owner`: a consulta original filtrava apenas por organização e profissional. Assim, um membership histórico `removed` podia ser selecionado quando coexistia com um novo membership `active` para a mesma pessoa. A reprodução sintética pré-correção, com `removed` + `active`, retornou `403` sem alterar o owner; o resultado dependia da linha escolhida pela consulta, portanto não era uma garantia de segurança.

O hardening foi aplicado somente no staging pelo artefato versionado [`20260915_02_harden_owner_transfer.sql`](../supabase/clinic-migrations/20260915_02_harden_owner_transfer.sql). A seleção agora inclui explicitamente `status = 'active'`, sem `LIMIT 1`; o histórico `removed` é preservado e a unicidade parcial de memberships não removidos permanece inalterada. A definição efetiva foi conferida pela Management API: `SECURITY DEFINER`, `search_path` fixo, `auth.uid()` validado, `EXECUTE` negado a `PUBLIC`/`anon` e concedido somente a `authenticated`.

Resultado da matriz pós-correção:

- A owner → B active: PASS;
- exatamente um owner ativo após a transferência: PASS;
- A permanece manager ativo e preserva `clinical_access_enabled`: PASS;
- coexistência de membership histórico `removed` + membership atual `active`, com transferência para o ativo: PASS;
- somente `removed`, `suspended`, inexistente e outra organização: DENY;
- caller manager e caller professional: DENY;
- transferência para o próprio owner: idempotente PASS;
- duas transferências concorrentes: nunca zero nem dois owners ativos, PASS;
- cleanup: zero usuários Auth, professionals, organizações e memberships sintéticos; baseline individual preservado.

Gates locais desta revisão: `npm run test:environment-isolation`, `npm test`, `npm run lint`, `npm run build` e `git diff --check`: PASS. O build emitiu somente o aviso não bloqueante já conhecido sobre chunks grandes.

A regra de owner → manager foi formalizada também na Fase 1A. Membership administrativo não liga capacidade clínica por si só; o valor existente de `clinical_access_enabled` é apenas preservado durante a troca.

### Gate de feature flag antes de produção

A exposição autenticada dos RPCs públicos de criação e transferência permanece intencional e protegida por validação de identidade, grants mínimos, RLS e invariantes transacionais. Entretanto, a aplicação da feature empresarial ainda não existe no banco/backend: antes de qualquer produção, deve haver enforcement server-side cumulativo `ambiente permitido AND global ON AND organization ON AND membership/permissão válida`. Global OFF deve negar mesmo com flag da organização ON; membership sozinho nunca pode habilitar Plano Clínica. A estratégia proposta para a Fase 1B2 é implementar uma resolução de gate no backend/RLS/RPC, com kill switch global e flag persistida por organização, sem depender de UI ou `VITE_`; essa tabela e essa mudança não foram criadas nesta revisão. O gap é blocker de produção, mas não impede a revisão de 1B1 para a Fase 1B2.

## 4. Advisors pós-hardening

Os Advisors foram consultados pela Management API oficial após a aplicação:

- **Security:** 1 WARN histórico de `extension_in_public` para `vector`, classificado como P2/intencional do baseline; 2 WARN dos RPCs `SECURITY DEFINER` expostos a `authenticated`, necessários para operações atômicas e mitigados por `auth.uid()`, `search_path` fixo, schema privado para helpers e grants explícitos sem anon/public;
- **Performance:** 3 INFO históricos de FKs sem índice cobrindo `evolution_templates`, `evolutions` e `patients`; as FKs novas da Fase 1B1 possuem índices;
- nenhum P0 ou P1 novo identificado.

Referências: [Security Advisor](https://supabase.com/docs/guides/database/database-linter) e [Management API — advisors](https://supabase.com/docs/reference/api/v1-get-security-advisors).

## 5. Fora do escopo

Não foram criados convites, aceite/envio de convite, feature flags por organização, billing, Stripe, seats, pacientes compartilhados, `org_id` em tabelas individuais, UI, onboarding, dashboard empresarial, auditoria empresarial completa, Google/OAuth, integrações, Storage, cron ou produção. A Fase 1B2 e a Fase 1B1 de convites não foram iniciadas.

## 6. Decisão

**FASE 1B1 REVISADA E ENDURECIDA — APTO PARA FASE 1B2**

Esta decisão não inicia a Fase 1B2 nem autoriza convites, billing, pacientes compartilhados, UI empresarial ou qualquer alteração de produção. O enforcement server-side de feature flag permanece obrigatório antes de produção.
