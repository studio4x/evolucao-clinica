# Fase 1B5 — Gestão segura da equipe e lifecycle

**Status:** implementação concluída e validada exclusivamente em staging
**Branch:** `feat/clinicas`
**Staging:** Supabase `hwkdwinfckmjoriqxbjk`
**Produção:** Supabase `kvxboovgrrhhttaqinld` — não alterada
**Build web:** `v1.10.869`

## 1. Escopo entregue

A fase adiciona a gestão administrativa de memberships no contexto da clínica,
sem implementar billing, seats, Stripe, convites reais, pacientes/evoluções
compartilhados ou ativação de `clinical_access_enabled`.

O contexto continua sendo determinado por membership `active`; a capacidade
clínica é informação separada e não funciona como autorização de membership.

## 2. Cliente Supabase server-side

`server/supabase/createUserScopedClient.ts` cria o cliente por requisição com a
URL do ambiente, a chave pública `VITE_SUPABASE_ANON_KEY` do mesmo projeto e o
Bearer JWT do usuário. Usa `persistSession=false`, `autoRefreshToken=false` e
não recebe `service_role`.

`/api/clinic/contexts` foi migrado para esse helper. `loadServerEnvironment`
valida a chave pública e o vínculo com o project ref esperado; ausência ou
incompatibilidade falha de forma fechada. A chave pública de staging foi
resolvida pela API oficial apenas em memória para o smoke, sem ser persistida.

## 3. Diretório e API

A migration aditiva `supabase/clinic-migrations/20260916_10_organization_team_directory.sql`
cria `public.get_organization_team(uuid)`. A RPC exige usuário autenticado,
gate global/organizacional ativo, organização ativa e membership administrativa
ativa (`owner` ou `manager`). Profissional comum recebe `DENY`.

O retorno máximo é:

```text
membership_id, professional_id, full_name, professional_title,
membership_role, status, clinical_access_enabled, joined_at, suspended_at
```

Somente memberships `active` e `suspended` aparecem. Histórico `removed` não é
apagado nem reutilizado e não aparece no diretório principal. Não houve alteração
de RLS ampla em `professionals`.

`GET /api/clinic/team?organizationId=...` mantém `private, no-store` e `Vary:
Authorization`; o `organizationId` é apenas candidato e a RPC é a autoridade.

## 4. Lifecycle e autorização

`server/clinic/clinicTeamRoutes.ts` expõe fachadas server-side para as RPCs já
existentes:

- suspensão, reativação e remoção terminal;
- alteração `professional`/`manager`;
- transferência de owner.

O ator é sempre derivado do JWT. O cliente não envia `actor_professional_id`,
`created_by` ou `current_owner_id`. O backend valida formato e delega a decisão
final ao banco.

Owner administra manager/professional, altera papéis permitidos e transfere
ownership. O owner anterior permanece manager. Manager administra somente
professional. Professional não acessa o diretório. Autoadministração e
alteração genérica de owner permanecem negadas.

Após cada mutação, a equipe é recarregada e o contexto é revalidado. Revogação
durante a tela aberta remove o contexto empresarial e retorna ao contexto
pessoal sem logout.

## 5. UI

`/painel/clinica/equipe` apresenta owner, managers e professionals em tabela
desktop e cards mobile. Os controles são botões reais, touch-friendly,
rotulados e com estados de busy/disabled. Suspensão, remoção e transferência
usam os modais existentes; remoção usa a linguagem “Remover da clínica”.

Owner vê as ações administrativas permitidas. Manager vê o diretório e ações
somente sobre professionals. Professional é redirecionado para
`/painel/clinica` mesmo se digitar a rota. Não há botão de convite, toggle de
capacidade clínica, controle de seats ou billing.

O item “Equipe” aparece apenas em contexto organizacional para owner/manager.
Em contexto pessoal ou com a feature pública desligada, o menu empresarial não
é exibido.

## 6. Smoke staging

Foi usado somente staging, com quatro usuários e duas organizações sintéticas,
criadas e removidas no mesmo smoke. As sessões de owner, manager, professional
e outsider foram sessões Auth normais; a chave administrativa ficou restrita a
setup/cleanup.

Passaram: diretório mínimo, owner/manager, professional negado, actor suspenso
ou removido, cross-tenant, duas clínicas, capacidade clínica `false` sem perda
de acesso administrativo, suspensão, reativação, remoção, alteração de papel,
autoadministração negada, owner protegido, transferência concorrente com
exatamente um owner ativo, histórico `removed + active`, revogação pelo mesmo
token e revalidação de contexto.

Também foi confirmado que a chamada sem autenticação e a execução direta por
`anon` são negadas. Nenhuma tabela de pacientes ou evoluções foi consultada.

## 7. Advisors e cleanup

Após a aplicação, os Advisors oficiais retornaram HTTP 200:

- Security: 10 WARN intencionais (extensão `vector` histórica e funções
  `SECURITY DEFINER` expostas somente a `authenticated`, incluindo a RPC de
  diretório); nenhum P0/P1 novo.
- Performance: 9 INFO históricos/informativos de FKs sem índice e índices sem
  uso observado; nenhum P0/P1 novo.

O cleanup final confirmou:

```text
Auth users: 0
professionals: 0
organizations: 0
memberships: 0
feature flags: 0
audit events: 0
patients: 0
evolutions: 0
global gate: false
runtime: staging
allowed_environment: staging
```

## 8. Regressão e testes

Passaram os testes estruturais de contexto/equipe, a regressão de environment
isolation, a suíte completa, TypeScript/lint, build e `git diff --check`. O
fluxo individual continua sob o `ProtectedRoute` existente quando as flags
permanecem OFF.

## 9. Blockers restantes

- convite real e entrega server-side de raw token ainda não existem;
- convite clínico ainda não reserva seat;
- `clinical_access_enabled` não pode ser ativado operacionalmente sem a Fase 2;
- billing, seats e Stripe continuam fora de escopo;
- pacientes e evoluções compartilhados não existem;
- produção permanece OFF e não foi alterada;
- os WARN/INFO dos Advisors permanecem para revisão posterior, sem correção
  destrutiva nesta fase.

Esta aprovação não declara o Plano Clínica pronto e não inicia a Fase 1B6.

## 10. Resultado

**FASE 1B5 APROVADA PARA REVISÃO**
