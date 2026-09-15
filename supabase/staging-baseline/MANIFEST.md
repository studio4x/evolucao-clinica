# Baseline sanitizado — Fase 1B0

**Versão:** `20260914-individual-core-v1`  
**Alvo:** Supabase staging `hwkdwinfckmjoriqxbjk`  
**Origem estrutural:** inventário read-only de produção (`kvxboovgrrhhttaqinld`) e contratos de uso no código; nenhum dado de produção foi exportado.

## Incluído

- Extensões `pgcrypto` e `vector`, somente para defaults UUID e a coluna opcional de embedding.
- Tabelas individuais `professionals`, `evolution_templates`, `patients`, `evolutions`, `patient_reports` e `plans`.
- Chaves primárias, FKs, checks, índices mínimos e RLS restritiva para o fluxo autenticado.
- Trigger sanitizado `auth.users -> professionals`, idempotente e sem eventos de integração.
- Grants mínimos para `authenticated` e leitura pública somente de `plans`.

## Omitido deliberadamente

- Todas as tabelas empresariais e qualquer RLS/onboarding de clínicas.
- Dados, usuários Auth, Storage e objetos de produção.
- `settings` e qualquer linha que pudesse carregar API key ou configuração real.
- Vault, secrets, cron/pg_cron, `pg_net`, Edge Functions, URLs, webhooks e chamadas HTTP.
- Stripe, Google/Google Play, WhatsApp, n8n, Meta, analytics, lifecycle, push e mensageria.
- Funções e triggers de lifecycle, cobrança, auditoria externa, retenção ou migração.

## Classificação de objetos

| Classe | Baseline |
|---|---|
| necessário | tabelas individuais, FKs, checks, RLS e índices acima |
| seguro | `handle_new_user()` com `SECURITY DEFINER`, `search_path` fixo, `ON CONFLICT DO NOTHING` e `EXECUTE` revogado |
| sanitizado | defaults, grants e policies somente para fluxo individual; catálogo `plans` sem seed |
| omitido | qualquer efeito externo, segredo, dado, cron, Vault, Storage, função privilegiada não essencial ou objeto empresarial |

## Procedimento reproduzível

1. Conferir `APP_ENV=staging`, `VITE_APP_ENV=staging`, ref esperado `hwkdwinfckmjoriqxbjk` e todas as integrações desligadas.
2. Revisar este SQL por padrões destrutivos, URLs, secrets, cron, Vault, HTTP e nomes empresariais.
3. Aplicar o arquivo inteiro em uma transação somente no projeto staging.
4. Confirmar a versão e executar advisors/testes sem inserir dados reais.

O arquivo não é uma cópia das 148 migrations históricas e não deve ser aplicado na produção.

## Extensão empresarial posterior

Os artefatos empresariais da Fase 1B1/1B2/1B3 ficam fora deste baseline sanitizado e foram aplicados somente no staging autorizado. A correção de hardening da Fase 1B3.1 é:

- `supabase/clinic-migrations/20260915_09_harden_membership_lifecycle_selection.sql` — redefine somente `suspend_organization_member` para selecionar explicitamente a membership `active` corrente, preservando memberships `removed` históricas.

O artefato 09 não deve ser reaplicado em produção nem usado para reconstruir o baseline individual.
