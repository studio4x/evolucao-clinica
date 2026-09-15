# FASE 1B3 — Membership Lifecycle e Controles Operacionais

## 1. Escopo e ambiente

A Fase 1B3 foi executada exclusivamente no Supabase staging `hwkdwinfckmjoriqxbjk`, na branch `feat/clinicas`. O projeto de produção `kvxboovgrrhhttaqinld`, Vercel produção, DNS, Stripe e dados reais permaneceram intocados.

Esta fase não iniciou UI, envio real de convites, billing, seats, Stripe, pacientes compartilhados, Fase 1B4 ou qualquer fase posterior.

## 2. Implementação entregue

Os artefatos versionados e aplicados no staging foram:

- `20260915_06_membership_lifecycle_and_audit.sql`;
- `20260915_07_operational_audit_and_rollout.sql`;
- `20260915_08_invitation_rate_limits.sql`.

Na retomada, os artefatos 06–08 já estavam presentes e **não foram reaplicados**. A verificação foi feita por inspeção read-only dos objetos, funções, grants, RLS e configurações efetivas.

### Lifecycle de memberships

Foram validados os RPCs transacionais:

- `suspend_organization_member`;
- `reactivate_organization_member`;
- `remove_organization_member`;
- `change_organization_member_role`.

As regras confirmadas foram: owner administra manager/professional; manager administra somente professional; professional não administra; owner não é alterado por lifecycle genérico; não há autoadministração; remoção é terminal; reativação clínica é negada quando `clinical_access_enabled = true`; mudança de papel fica limitada a manager/professional.

### Rollout, lineage e auditoria

`set_organization_clinic_rollout_state` é executável somente por `service_role`, exige gate global, organização elegível e exatamente um owner ativo, e registra enable/disable de forma idempotente. Flags criadas administrativamente preservam `created_by_type = service_role` e não simulam autoria de profissional.

A tabela privada `private.organization_admin_events` permanece instalada, com RLS sem acesso de cliente, imutabilidade para UPDATE/DELETE e eventos para criação, rollout, transferência de owner, lifecycle de membros e ciclo de convites. O cleanup do staging usa helper privado e IDs concretos, sem alterar a imutabilidade operacional normal. Auditoria não possui campos de token, `token_hash`, JWT, secrets ou dados clínicos.

### Rate limiting de convites

O limite é DB-side e concorrente, com locks transacionais por organização, ator e destinatário. Os defaults finais foram restaurados para:

| Dimensão | Limite | Janela |
|---|---:|---:|
| Ator | 20 | 3600 s |
| Organização | 100 | 86400 s |
| Destinatário | 3 | 86400 s |

O smoke reduziu temporariamente a configuração para testar o bloqueio e a restaurou antes do encerramento.

## 3. Interrupção e retomada

A execução original foi interrompida pela manutenção programada da Management API do Supabase, que retornou HTTP 503 com previsão de conclusão em 15/09/2026 às 21:45 GMT. Foram observadas 3 consultas HTTP 503 antes da recuperação documentada; na retomada desta execução, 1 nova consulta controlada retornou HTTP 201. Durante a manutenção não houve mutação, uso de credencial alternativa, uso de produção, `supabase db push`, reaplicação de migration ou bypass pelo SQL Editor.

Na retomada controlada, a primeira consulta posterior retornou HTTP 201. O inventário read-only encontrou os resíduos do smoke anterior: 4 usuários Auth/profissionais, 7 organizações, 11 memberships, 7 flags, 12 convites e 46 eventos de auditoria. O kill switch foi desligado antes de qualquer cleanup, e o `actor_window_seconds` divergente foi restaurado para 3600.

## 4. Validação focal e cleanup

Com o gate global OFF, foi executado um smoke focal mínimo com usuários sintéticos e sessões normais:

- suspensão e negação imediata de organizações, memberships e RPC pelo mesmo token;
- reativação com recuperação da mesma sessão;
- negação de reativação clínica;
- remoção terminal e negação de reativação;
- proteção do owner;
- limites owner/manager/professional;
- rollout negado para authenticated e aceito somente por service role;
- disable do rollout com negação imediata de acesso empresarial;
- rate limit de convites com terceira emissão negada;
- auditoria atômica, sem evento de sucesso para ação negada;
- regressão individual: Auth, professional, patient e evolution próprios;
- isolamento bidirecional A/B por leitura direta de IDs.

O cleanup executado no `finally` removeu somente IDs concretos criados pelo smoke. A confirmação final foi:

| Resíduo sintético | Resultado |
|---|---:|
| Auth users | 0 |
| professionals | 0 |
| patients | 0 |
| evolutions | 0 |
| organizations | 0 |
| memberships | 0 |
| feature flags | 0 |
| invitations | 0 |
| audit events | 0 |

Estado estrutural final:

```text
runtime_environment.environment_name = staging
clinic_runtime_config.allowed_environment = staging
clinic_runtime_config.enabled = false
private.is_clinic_global_enabled() = false
```

As tabelas, RPCs, funções, índices, policies, grants e migrations 01–08 permaneceram instalados. Nenhum objeto de baseline individual foi removido.

## 5. Advisors

Os endpoints oficiais de Security e Performance Advisor retornaram HTTP 200 após o cleanup. Em comparação com o registro da Fase 1B2.1:

- Security: 10 WARN — 9 RPCs `SECURITY DEFINER` executáveis por `authenticated` (5 do baseline e 4 lifecycle adicionais) e o WARN histórico da extensão `vector` em `public`; o rollout é service-role-only e não amplia esse alerta;
- Performance: 9 INFO — recomendações de `unindexed_foreign_keys` e `unused_index`;
- nenhum P0/P1 novo identificado.

Os RPCs `SECURITY DEFINER` possuem `search_path = pg_catalog, private, public`, validação de ator/gate e grants explícitos. O rollout administrativo não é executável por `authenticated`, `anon` ou `PUBLIC`. Os WARN/INFO permanecem documentados como risco intencional/informativo para revisão posterior, sem correção destrutiva nesta fase.

## 6. Testes locais

Todos os gates locais passaram:

- `npm test`;
- `npm run test:environment-isolation`;
- `npm run lint`;
- `npm run build`;
- `git diff --check`.

## 7. Resultado

`FASE 1B3 APROVADA PARA REVISÃO`

Este resultado não autoriza automaticamente Fase 1B4, UI, convites reais, billing, seats, Stripe, pacientes compartilhados, Fase 2 ou produção.

## 8. Revisão pós-implementação / hardening

Foi identificado e corrigido um edge case na seleção de membership do `suspend_organization_member`: após remoção e novo aceite, uma mesma pessoa pode possuir uma linha histórica `removed` e uma associação corrente `active`. A ordenação anterior por uma expressão booleana, combinada com `LIMIT 1`, podia selecionar a linha histórica primeiro e impedir a suspensão da associação atual.

O artefato corretivo `20260915_09_harden_membership_lifecycle_selection.sql` foi criado separadamente, aplicado somente no staging e não reaplicou o SQL 06. A seleção agora exige `status = 'active'` e não usa `ORDER BY`/`LIMIT` para ocultar ambiguidade. O índice parcial existente garante no máximo uma membership não removida por organização/profissional.

O cenário obrigatório foi reproduzido com `B1 = removed`, seguido de novo convite/aceite `B2 = active`. A suspensão alterou somente B2 e o evento `member_suspended` referenciou B2; a reativação alterou somente B2 e o evento `member_reactivated` referenciou B2; a remoção seguinte preservou B1 e B2 como histórico. O cenário também confirmou que manager administra professional, mas não manager/owner, professional não administra e owner permanece protegido.

Foi validada a revogação imediata pelo mesmo token de B para organizações, memberships e RPC empresarial, seguida de recuperação após reativação. Auditoria, gates de ambiente, rollout, rate limiting, isolamento cruzado e cleanup permaneceram íntegros. Ao final, runtime/allowed permaneceram `staging`, o global ficou OFF e todos os resíduos sintéticos ficaram em zero.

Os Advisors foram executados novamente: Security retornou 10 WARN intencionais e Performance 9 INFO, sem P0/P1 novo em relação à Fase 1B3. Nenhum WARN histórico foi alterado fora do escopo.
