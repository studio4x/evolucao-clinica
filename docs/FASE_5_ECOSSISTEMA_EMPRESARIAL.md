# Fase 5 — Ecossistema Empresarial

## Escopo e staging

Esta fase foi implementada somente na branch `feat/clinicas` e aplicada ao
projeto Supabase staging `hwkdwinfckmjoriqxbjk`, pela migration
`20260918_28_clinic_ecosystem_operations.sql`. O gate global permanece
controlável e nenhum provider externo, cobrança real, dado clínico real ou
produção participa deste trabalho.

## Dashboard operacional

`get_organization_dashboard` expõe duas visões. Owner e Manager recebem apenas
indicadores operacionais: pacientes ativos/arquivados, equipe ativa/suspensa,
seats, convites, atribuições por papel, entitlement e resumo financeiro. O
Professional recebe somente seus pacientes atribuídos, separados em Primary,
Secondary e Consultor, além do próprio membership. A função não consulta nem
retorna evoluções, relatórios, PDI, embeddings, áudio, assinaturas clínicas ou
Google Docs.

## Auditoria

`private.organization_admin_events` continua sendo o ledger único e imutável.
A migration acrescenta apenas contexto operacional de paciente/assignment e
Primary, sem texto clínico. `list_organization_admin_events` exige Owner ou
Manager, pagina por `created_at + id`, aceita filtro de evento e retorna nomes
humanos para a UI. A rota não permite acesso direto à tabela e a tela não
renderiza IDs técnicos.

## Ciclo de vida e Primary

Arquivar e reativar são operações administrativas dedicadas. O PATCH cadastral
não aceita mais `status`; Primary pode editar dados demográficos, mas não pode
alterar o ciclo de vida. Arquivamento preserva atribuições e histórico e o
guard de evoluções da Fase 4 bloqueia novas evoluções; reativação não recria
registros.

`reassign_organization_patient_primary` usa locks transacionais, exige Owner ou
Manager com entitlement operacional completo, exige alvo ativo com acesso
clínico na mesma organização e promove uma atribuição Secondary/Consultor
existente quando houver. A opção de manter o Primary anterior como Secondary é
explícita. O banco mantém exatamente um Primary ativo e nenhum registro de
evolução é alterado. Cada operação produz evento operacional estruturado.

## Isolamento e futuro

As funções são `SECURITY DEFINER` com `search_path` fixo, ACL explícita e
workspace derivado do JWT. Profissionais não administradores recebem 403 na
auditoria e nas mutações administrativas; o isolamento cross-tenant é
preservado. Supervisor, Assistant, suporte com impersonação e recuperação por
backdoor não fazem parte desta fase. Um futuro modelo pode adicionar papéis e
capabilities específicos, sempre com contrato, RLS, auditoria e testes próprios.

## Validação

Os contratos estáticos da fase estão em `tests/clinic-dashboard.test.ts`,
`clinic-audit.test.ts`, `clinic-patient-management.test.ts`,
`clinic-primary-reassignment.test.ts` e `clinic-ecosystem-acl.test.ts`.
O smoke final de staging deve criar somente fixtures sintéticas, validar as
visões, auditoria, lifecycle, promoção/retensão de Secondary, autoria e
isolamento da Fase 4, e limpar integralmente os objetos ao terminar, deixando
o gate global OFF.

Na validação executada em 2026-09-18, o gate terminou `OFF`, as organizações e
pacientes sintéticos terminaram em zero, e a assinatura cadastrada de
`update_organization_patient` ficou sem `p_status`. Os Advisors não apontaram
P0/P1 novo: Security manteve os avisos conhecidos (2 INFO de RLS privada, 1
WARN do vector em `public`, 21 funções SECURITY DEFINER autenticadas e 1 WARN
de proteção de senha); Performance listou 14 FKs sem índice e 11 índices ainda
sem uso. Esses avisos não foram ampliados nesta fase além dos índices de
auditoria adicionados.
