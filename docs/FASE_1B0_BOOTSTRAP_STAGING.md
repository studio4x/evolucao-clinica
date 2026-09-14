# Fase 1B0 — Bootstrap sanitizado do staging

**Status:** baseline aplicado; aguardando revisão formal  
**Branch:** `feat/clinicas`  
**Staging:** Supabase `hwkdwinfckmjoriqxbjk`  
**Produção:** `kvxboovgrrhhttaqinld` (não alterada)  
**Baseline:** `20260914-individual-core-v1`

Este documento encerra somente o bootstrap estrutural individual. Nenhuma tabela, migration, RLS, tela, endpoint ou feature flag empresarial foi criada.

## 1. Objetivo e limites

Foi preparado um banco staging vazio e reproduzível para validar o fluxo individual antes da Fase 1B1. O baseline não é cópia integral das 148 migrations e não contém dados, usuários, secrets, integrações ou efeitos de produção.

## 2. Controles de ambiente

- alvo aplicado: `hwkdwinfckmjoriqxbjk`;
- ref de produção `kvxboovgrrhhttaqinld` não aparece no SQL nem foi usado como destino de escrita;
- aplicação local revisada com `APP_ENV=staging`, `VITE_APP_ENV=staging` e integrações deny-by-default;
- `CLINIC_FEATURE_ENABLED` permaneceu desligado;
- nenhuma credencial foi gravada no repositório, SQL, logs ou relatório.

## 3. Fonte e método

O schema estrutural foi derivado de inventário read-only de produção e dos contratos de uso no código. A tentativa de usar `pg_dump` foi impedida pela ausência de Docker/Podman no host; por isso, não foi executada reprodução cega das migrations. O SQL versionado foi escrito apenas para as entidades individuais necessárias e revisado antes da aplicação.

## 4. Artefato versionado

- `supabase/staging-baseline/20260914_individual_core.sql`;
- `supabase/staging-baseline/MANIFEST.md`;
- versão registrada: `20260914-individual-core-v1`.

O arquivo é idempotente para tabelas, índices, policies e trigger; não contém `DROP TABLE`, `TRUNCATE`, `DELETE FROM`, seed de dados ou nomes de objetos empresariais.

## 5. Escopo incluído

Foram incluídos somente `professionals`, `evolution_templates`, `patients`, `evolutions`, `patient_reports` e `plans`, com colunas estruturais necessárias, PKs, FKs, checks, índices mínimos, RLS e grants restritos. O vínculo `auth.users(id) -> professionals(id)` foi mantido.

## 6. Funções e triggers

O único trigger não interno criado é `auth.users -> professionals`, usando `handle_new_user()` com `SECURITY DEFINER`, `search_path` fixo, `ON CONFLICT DO NOTHING` e execução revogada para `anon`/`authenticated`. Funções e triggers de lifecycle, billing, integração, auditoria externa, retenção e migração foram omitidos.

## 7. Itens omitidos e sanitizações

Não foram copiados dados ou usuários Auth; Storage permaneceu sem buckets; `settings` foi omitida para não transportar `api_key`; Vault ficou sem registros; cron/pg_cron, `pg_net`, Edge Functions, webhooks, URLs, Stripe, Google/Google Play, WhatsApp, n8n, Meta, analytics, lifecycle, push e mensageria ficaram fora. Não há migrations empresariais no baseline.

## 8. Revisão estática pré-aplicação

Foram verificados padrões destrutivos de dados, cron, HTTP, Vault, URLs, secrets, refs de produção, service role e `INSERT` de seed. O único `INSERT` é o bootstrap idempotente do perfil disparado por novo usuário Auth. Referências a Google/Stripe existentes são apenas nomes de colunas históricas; nenhuma integração é configurada ou chamada.

## 9. Aplicação no staging

O baseline foi aplicado em uma transação exclusivamente no projeto `hwkdwinfckmjoriqxbjk`. Resultado estrutural após a aplicação:

| Verificação | Resultado |
|---|---:|
| tabelas públicas do baseline | 6 |
| tabelas empresariais | 0 |
| usuários Auth | 0 após limpeza dos testes |
| profissionais/pacientes/evoluções | 0 após limpeza dos testes |
| buckets Storage | 0 |
| cron jobs | inexistente no staging |
| segredos Vault | 0 |

## 10. Validação Auth, CRUD e isolamento

Dois usuários sintéticos (`example.invalid`) foram criados temporariamente, autenticados e removidos ao final. O trigger criou os dois perfis corretamente. O usuário A criou um paciente e uma evolução; A leu seus registros e B recebeu conjunto vazio ao consultar paciente/evolução de A. Os registros e usuários sintéticos foram excluídos, deixando o banco sem linhas de negócio.

## 11. Advisors e classificação

Após a aplicação, os endpoints oficiais de advisors retornaram:

- segurança: 1 `WARN` `extension_in_public`, referente ao `vector` no schema `public` necessário para preservar a coluna estrutural de embedding; classificado como **P2/intencional para staging**, sem impacto de dados e sem correção destrutiva nesta fase;
- performance: 3 recomendações `unindexed_foreign_keys` e 6 `unused_index`, todas `INFO`; classificado como **informativo**, para reavaliar com carga real antes de qualquer ajuste;
- nenhum P0/P1 foi identificado.

Referência do advisor: [Supabase Security Advisor — extension in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

## 12. Regressão do repositório

| Comando | Resultado |
|---|---|
| `npm run test:environment-isolation` | PASS |
| `npm test` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS; avisos de chunks grandes preexistentes |
| `git diff --check` | PASS |

Não houve falha nova atribuível ao baseline. Nenhuma alteração de código de aplicação exigiu incremento de `AppVersion.tsx`.

## 13. Relatório final A–L e gate

### A — alvo

Aplicação exclusiva no Supabase staging `hwkdwinfckmjoriqxbjk`; produção `kvxboovgrrhhttaqinld` não tocada.

### B — branch

Todo o trabalho documental e o artefato estão em `feat/clinicas`; não houve merge para `main`.

### C — baseline

Versão `20260914-individual-core-v1`, reproduzível pelo SQL e manifest versionados.

### D — dados

Sem dados reais, Auth, pacientes, evoluções, Storage ou linhas de `settings`; testes sintéticos removidos.

### E — efeitos externos

Cron, Vault, HTTP, Edge Functions, Stripe, Google, WhatsApp, n8n, Meta, analytics, lifecycle, push e mensageria não foram habilitados.

### F — fundação empresarial

Nenhum objeto `organizations`, membership, invitation, subscription, patient-sharing ou feature flag empresarial foi criado.

### G — guardas

Refs, ambiente, feature flag e integrações foram verificados antes da aplicação; nenhum secret foi exposto.

### H — Auth e RLS

Trigger `auth.users -> professionals` validado; CRUD individual e isolamento entre usuários passaram em staging.

### I — Storage e jobs

Zero buckets e ausência de `cron.job`/jobs ativos no staging foram confirmadas.

### J — advisors

Um aviso P2 intencional de extensão pública e recomendações INFO de índice; nenhum P0/P1.

### K — regressão

Suíte, isolamento de ambiente, lint, build e diff-check passaram.

### L — decisão

**FASE 1B0 APROVADA PARA REVISÃO**

Esta declaração não autoriza a Fase 1B1. A próxima fase permanece bloqueada até revisão deste relatório, confirmação dos gates e autorização explícita para criar a fundação empresarial.
