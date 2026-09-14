# Inventário somente leitura do Supabase de produção — Pré-Clínicas

**Data da coleta:** 14/09/2026  
**Objetivo:** registrar o estado real antes da Fase 1 do Plano Clínica.  
**Escopo:** metadados de banco, autorização, Storage, Edge Functions, extensões, jobs e migrations.  
**Alterações executadas:** nenhuma. Não houve DDL, DML, migration, alteração de Auth, Storage, Vault, Edge Function ou cron.

## Conclusão

O ambiente de homologação foi validado contra o projeto Supabase staging `hwkdwinfckmjoriqxbjk`, separado do projeto de produção `kvxboovgrrhhttaqinld`. A aplicação staging carregou com banner de homologação, `/api/health` retornou `status: ok`, o service role não apareceu no DOM e o feature flag do Plano Clínica permaneceu desligado.

Os cinco cenários fail-fast foram executados com valores sintéticos e produziram o comportamento esperado. As integrações externas ficaram bloqueadas por ambiente. O inventário de produção foi obtido por consultas administrativas `read_only=true`, sem leitura de linhas clínicas ou dados pessoais. Não foi identificado P0 nesta coleta; há riscos P1/P2 que devem ser tratados no desenho da Fase 1.

## A. Identidade e método

- Produção: projeto `Evolução Clínica`, ref `kvxboovgrrhhttaqinld`, estado observado `ACTIVE_HEALTHY`.
- Staging: projeto `Evolução Clínica Staging`, ref `hwkdwinfckmjoriqxbjk`, estado observado `ACTIVE_HEALTHY`.
- Banco de produção consultado como usuário somente leitura por `POST /v1/projects/{ref}/database/query` com `read_only=true`.
- Consultas limitaram-se a catálogos (`pg_catalog`, `information_schema`, `pg_policies`, `pg_trigger`, ACLs, Storage e pg_cron). Nenhuma tabela de negócio foi consultada para retornar linhas.
- A API de Management do Supabase documenta o parâmetro de consulta somente leitura em [Run a query](https://supabase.com/docs/reference/api/v1-run-a-query).

## B. Resultado do deployment staging

| Controle | Resultado |
|---|---|
| Deployment | `Ready`, originado da revisão `ba2c2b7` |
| Aplicação autenticada | Renderizada normalmente |
| Banner | `AMBIENTE DE HOMOLOGAÇÃO` presente |
| `/api/health` | `{"status":"ok"}` |
| `APP_ENV` / `VITE_APP_ENV` | `staging` e coerentes |
| Ref efetivo | `hwkdwinfckmjoriqxbjk` |
| Ref de produção no runtime | Não utilizado como destino |
| Service role no DOM/bundle | Não encontrado |
| Plano Clínica | Desligado (`false`) |

O domínio personalizado de staging continua dependente de configuração DNS externa; a URL protegida do deployment foi usada para a validação autenticada. O projeto Vercel de produção não foi alterado.

## C. Cenários fail-fast

Executados por `npm run test:environment-isolation` e por um harness independente com refs sintéticos:

| Cenário | Resultado esperado | Resultado observado |
|---|---|---|
| staging + ref de produção | rejeitar antes de inicializar | **FAIL-FAST** |
| staging + URL de produção | rejeitar por ref divergente | **FAIL-FAST** |
| staging + Supabase ausente | rejeitar configuração obrigatória | **FAIL-FAST** |
| staging correto | inicializar | **PASS** |
| production correto | inicializar | **PASS** |

O teste também confirmou que uma service role com ref incompatível e uma origem pública de produção em staging são rejeitadas.

## D. Integrações externas em staging

Com as flags do ambiente de homologação em `false`, o guard de servidor bloqueou todos os 12 grupos previstos:

`email`, `whatsapp`, `push`, `n8n`, `batchDispatch`, `gemini`, `analytics`, `meta`, `cron`, `billing`, `google` e `lifecycle`.

Não foram executados envios, cobranças, webhooks, jobs, chamadas a provedores ou uso de dados reais. A validação foi sintética e de configuração; integrações permanecem deny-by-default.

## E. Inventário quantitativo de produção

| Objeto | Quantidade |
|---|---:|
| Schemas | 44 |
| Tabelas (incluindo não públicas) | 101 |
| Colunas catalogadas | 799 |
| Constraints | 384 |
| Índices | 289 |
| Tabelas com RLS catalogadas | 97 |
| Políticas RLS | 89 |
| Triggers não internos | 44 |
| Funções (`prokind = f`) | 286 |
| Views | 3 |
| Materialized views | 0 |
| ACLs de relação/tabela | 100 |
| ACLs de função | 286 |
| ACLs de schema | 44 |
| Extensões | 8 |
| Buckets Storage | 4 |
| Políticas Storage | 13 |
| Jobs pg_cron ativos | 10 |
| Registros de execução cron amostrados | 100 |

Todas as 51 tabelas do schema `public` estão com RLS habilitada; nenhuma delas está com RLS forçada. O catálogo inclui tabelas de Auth, Storage e extensões, por isso os totais gerais não equivalem apenas ao schema `public`.

## F. Modelo atual relevante para clínicas

### `professionals`

É o perfil ligado ao usuário autenticado e ainda concentra os papéis globais atuais (`admin`/`therapist`). A autorização empresarial deverá ser aditiva, por associação, sem criar um papel global `empresarial`.

### `patients`

Colunas principais: `id`, `professional_id` obrigatório, dados cadastrais, notas, status, campos Google, lembretes, template e timestamps. Possui PK em `id`, FK para `professionals(id)` com `ON DELETE CASCADE` e FK opcional para `evolution_templates(id)` com `ON DELETE SET NULL`. Há check de status `active`/`inactive`, sem unicidade de identidade e sem índice específico observado para `professional_id`.

RLS: habilitada, não forçada. Política principal `patients_owner_policy` concede `ALL` quando `auth.uid() = professional_id`; não há contexto organizacional.

### `evolutions`

Mantém `professional_id` e `patient_id` obrigatórios, estado de transcrição/documento, assinatura, hash, embedding e timestamps. Possui PK em `id`, FKs para paciente e profissional com `ON DELETE CASCADE` e FK opcional para template com `ON DELETE SET NULL`. Índices observados: PK, status e HNSW do embedding; não foi observado índice composto específico de paciente/profissional.

RLS: habilitada, não forçada. Política principal `evolutions_owner_policy` concede `ALL` quando `auth.uid() = professional_id`. Isso preserva privacidade individual, mas não fornece ainda `organization_id`/paciente organizacional.

### Outras entidades que usam o vínculo individual

Devem ser revistas antes da Fase 3/4: `patient_reports`, rascunhos e notas de evolução, lembretes, documentos Google, embeddings/busca, exportações, logs, notificações e tabelas de cobrança/uso. A migração não pode substituir `professional_id` por organização nem abrir leitura clínica para todos os membros.

## G. RLS, grants e funções privilegiadas

- Foram catalogadas 89 políticas. A maioria usa `auth.uid()` e ownership direto; não foram observadas referências a `user_metadata` ou `app_metadata` nas expressões coletadas.
- Existem políticas intencionalmente públicas para planos, jornadas publicadas, feedback e leads; cada uma deve ser revalidada quando novas tabelas forem adicionadas.
- As tabelas públicas relevantes possuem ACL ampla para `anon`/`authenticated` (inclusive `arwd...`), ficando a RLS como barreira efetiva. Isso não foi explorado durante a auditoria, mas é risco P1 de desenho: uma política futura incorreta teria superfície de escrita ampla.
- Foram encontradas 34 funções `SECURITY DEFINER` no schema `public`. A coleta direta de ACL mostrou `EXECUTE` somente para `postgres` e `service_role` nessas funções; não foi concedido `EXECUTE` a `anon`/`authenticated`.
- Triggers de assinatura e proteção de exclusão existem para evoluções e relatórios. Triggers de lifecycle também reagem a pacientes, profissionais, evoluções e solicitações de migração.
- Novas RLS devem usar associação ativa, organização alvo validada no banco, `USING` e `WITH CHECK`, grants mínimos e índices compatíveis. Nenhum `organization_id` recebido do navegador pode ser fonte de autorização.

## H. Storage

| Bucket | Público | Limite observado | Observação |
|---|---:|---:|---|
| `brand` | sim | 10 MB | tipos de imagem |
| `notifications` | sim | 10 MB | tipos de imagem |
| `support_attachments` | não | 10 MB | políticas por pasta/usuário ou admin; sem allowlist MIME observada |
| `temp-audio` | não | 100 MB | tipos de áudio |

Há 13 políticas Storage. As políticas de suporte e áudio restringem pastas por usuário; `brand` e `notifications` possuem acesso público de leitura. O staging não reutiliza esses buckets nem seus dados.

## I. Edge Functions e cron

Edge Functions ativas catalogadas: `stripe-webhook`, `process-refund`, `create-stripe-checkout-session`, `create-stripe-mobile-subscription`, `create-stripe-customer-portal-session`, `verify-google-play-subscription`, `google-play-rtdn`, `process-analytics-deliveries` e `resolve-google-play-offer`. A configuração observada reporta `verify_jwt=false`; qualquer chamada deve manter autenticação própria, assinatura e validação de origem no código.

Os 10 jobs ativos incluem lembretes, avisos de trial, publicação de jornadas, push diário, processamento/agendamento/recalculo de lifecycle, dispatch WhatsApp via n8n, retry de analytics e retenção de telemetria. Os comandos usam `net.http_get`/`net.http_post`, URLs e segredos recuperados do Vault, ou DELETE de retenção. Esses jobs são efeitos de produção e não devem ser reproduzidos em staging sem neutralização explícita.

## J. Extensões, views e migrations

Extensões catalogadas: 8. As views observadas são as de `pg_stat_statements` e `vault.decrypted_secrets`; não há materialized view.

O repositório contém 148 migrations. Classificação estática (sem execução):

| Classe | Arquivos que contêm o padrão |
|---|---:|
| Estrutura/alteração de tabela | 80 |
| RLS, policies ou índices | 51 |
| Funções ou triggers | 20 |
| Cron/HTTP | 8 |
| Vault/secrets | 6 |
| Referências de integrações externas | 62 |

Os grupos se sobrepõem. Migrations de cron, Vault, HTTP, lifecycle, WhatsApp, analytics, Meta, Stripe, Google e n8n exigem classificação manual e sanitização antes de qualquer aplicação no staging. Nenhuma migration foi aplicada nesta Fase 0.5.

## K. Riscos e gates para a Fase 1

Nenhum P0 foi identificado na coleta atual. Permanecem:

- **P1 — isolamento por RLS:** `patients`/`evolutions` são somente de ownership profissional; a futura camada de organização precisa preservar autoria e impedir leitura cruzada.
- **P1 — grants amplos:** `anon`/`authenticated` possuem privilégios de tabela amplos; novas políticas precisam ser restritivas e testadas contra IDs alterados no cliente.
- **P1 — integridade histórica:** FKs com `ON DELETE CASCADE` para profissional/paciente exigem estratégia aditiva para não apagar histórico ao suspender/remover membros.
- **P1 — efeitos operacionais:** cron, Vault, Edge Functions, Storage e triggers de produção não podem ser copiados para staging.
- **P2 — desempenho e unicidade:** não há ainda índice/constraint para organização, atribuição, unicidade de paciente no espaço clínico ou contagem transacional de licenças.
- **P2 — políticas públicas:** políticas `roles={public}` existentes devem ser explicitamente separadas das novas políticas empresariais.

Pré-requisitos não executados e obrigatórios antes de migrations empresariais: revisão do inventário por pares, matriz automatizada de autorização com duas clínicas, dados sintéticos, textos jurídicos aprovados, produtos/webhooks Stripe Test Mode e revisão das integrações por ambiente.

## L. Declaração de encerramento

- Inventário concluído em modo somente leitura.
- Fail-fast e isolamento staging/produção validados.
- Integrações externas em staging permaneceram bloqueadas.
- Nenhuma correção, migration, alteração de schema, Auth, Storage, Vault, Edge Function, cron ou dado de produção foi realizada.
- Branch `feat/clinicas` foi criada a partir de `d174cec` e enviada ao GitHub; o ambiente Production do projeto Vercel `evolucao-clinica-staging` foi configurado para acompanhar essa branch. A branch contém somente a base documental/hardening; nenhuma funcionalidade Clínica foi iniciada.

Este documento é pré-requisito de revisão para a Fase 1 e não autoriza sua execução automaticamente.
