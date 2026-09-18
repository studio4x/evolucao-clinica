# Plano de migrations de produção — Clínica

Este documento é um plano para revisão humana, não uma autorização de aplicação.
Produção e `main` permanecem intocados. Não existe migration de produção criada nesta rodada.
Origens: `supabase/clinic-migrations/MANIFEST.md`, migrations 01–30 e inventário runtime do staging `hwkdwinfckmjoriqxbjk`.

## Proveniência e ordem

O diretório contém efetivamente 01–29, incluindo 06–09, que estavam ausentes do manifesto e foram incluídas na Fase 6. A migration 30 corrige a falha 42702 do dashboard reproduzida no E2E.
O histórico formal do staging contém 23–29 e agora 30. As alterações 01–22 têm objetos e contratos operacionais presentes, mas não têm entradas nesse histórico. Não foram reaplicadas nem tiveram registros retroativos inventados.
Isso é uma lacuna de proveniência: antes de produção, reconciliar os registros de aplicação anteriores e revisar o estado canônico final. A comparação automatizada dos corpos finais das funções com as origens não encontrou diferença; isso confirma o estado atual, mas não recupera data/executor/proveniência das aplicações 01–22. Nenhuma diferença foi apagada por reaplicação cega.

Aplicação futura: ordem numérica 01 → 30, em artefatos canônicos revisados e explicitamente vinculados ao projeto de produção. Cada linha depende do estado final anterior; as dependências adicionais estão abaixo.

| Ordem / origem SQL | Categorias | Mudança lógica / dependência principal | Adaptação de produção e validação pós-apply |
| --- | --- | --- | --- |
| 01 organizations_memberships | schema additive; RLS; RPC/helper; ACL/hardening | Organizações, memberships, ownership e helpers | Preservar invariantes e grants; testar criação sintética e um owner ativo |
| 02 harden_owner_transfer | RPC/helper; ACL/hardening | Transferência usa membership ativa; depende de 01 | Preservar seleção e unicidade; testar transferência/último owner |
| 03 clinic_feature_gates | schema additive; data/config; RLS; RPC/helper | Gate privado e flags por organização; depende de 01–02 | Configurar `allowed_environment=production`, enabled=false; sem allowlist implícita |
| 04 organization_invitations | schema additive; RLS; RPC/helper; ACL/hardening | Convites hash, aceite e revogação; depende de 03 | Nunca disponibilizar RPCs raw durante deploy transitório; verificar revogações finais de 21 |
| 05 harden_runtime_environment | schema additive; data/config; RLS; RPC/helper; ACL/hardening | Identidade singleton e binding do gate | Não executar INSERT staging literalmente; produção deve ter identidade imutável `production` e gate false |
| 06 membership_lifecycle_and_audit | schema additive; RLS; RPC/helper; ACL/hardening | Lifecycle e audit append-only; depende de 01–05 | Excluir helper de purge de staging e exceção de cleanup das versões canônicas de produção; verificar audit imutável |
| 07 operational_audit_and_rollout | schema additive; data/config; RPC/helper; ACL/hardening | Lineage de flag, rollout e audit de ownership; depende de 06 | Preservar ator service-role e reason; ativação por organização aprovada; testar lineage |
| 08 invitation_rate_limits | schema additive; data/config; RPC/helper; ACL/hardening | Limites de emissão/aceite; depende de 04,06 | Preservar limites, sem tokens raw acessíveis ao cliente; verificar ACL final de 21 |
| 09 harden_membership_lifecycle_selection | RPC/helper; ACL/hardening | Membership corrente; depende de 06 | Preservar histórico; suspender/reativar/remover sem alterar autoria |
| 10 organization_team_directory | RPC/helper; ACL/hardening | Diretório mínimo; depende de 01–09 | Sem ampliar leitura geral de professionals; verificar owner/manager/professional |
| 11 organization_entitlements_and_seats | schema additive; data/config; RLS; RPC/helper; ACL/hardening | Catálogo, snapshots, entitlement e capacidade; depende de 01–10 | Catálogo revisado separado de credenciais/provider; testar mínimo 3, reservas e overflow |
| 12 harden_entitlement_snapshots_and_invitation_expiry | schema additive; RPC/helper; ACL/hardening | Snapshot/FK, expiração e audit idempotentes; depende de 11 | Não migrar fixtures/catálogo Test como contratos reais; verificar expiração uma vez |
| 13 harden_reserved_seat_conversion_and_operational_restriction | RPC/helper; ACL/hardening | Conversão reserva→ativo e restricted; depende de 11–12 | Testar aceite sem seat extra e restrição dominante |
| 14 clinic_stripe_billing | schema additive; data/config; RLS; RPC/helper; ACL/hardening | Catálogo Test, checkout e ledgers; depende de 11–13 | Não importar price/account IDs Test. Catálogo Live só após revisão/autorização separada; validar base/seat e snapshots |
| 15 clinic_stripe_billing_server_wrappers | RPC/helper; ACL/hardening | Wrappers service-role de billing; depende de 14 | Identidade do owner derivada de JWT verificado; anon/authenticated sem EXECUTE nesses wrappers |
| 16 clinic_stripe_checkout_lookup | RPC/helper; ACL/hardening | Lookup privado de tentativa; depende de 14–15 | Testar ator/org, sem lookup arbitrário de checkout |
| 17 clinic_stripe_cancellation_wrapper | RPC/helper; ACL/hardening | Preparação de cancelamento; depende de 14–16 | Preservar cancel_at_period_end e dados; autorização current owner |
| 18 harden_clinic_billing_operations | schema additive; RLS; RPC/helper; ACL/hardening | Lease, idempotência, concorrência e claim de webhook | Testar duas operações concorrentes, payload mismatch e evento duplicado |
| 19 harden_clinic_billing_recovery | RPC/helper; ACL/hardening | Recovery, checkout expirado, grace; depende de 18 | Recovery conclusivo; inconclusivo deve bloquear; pending não concede seats |
| 20 harden_clinic_billing_recovery_authorization | RPC/helper; ACL/hardening | Current owner antes de recovery; depende de 19 | Troca de ownership não autoriza owner anterior a mutações comerciais |
| 21 secure_clinic_invitation_delivery | schema additive; RLS; RPC/helper; ACL/hardening | Delivery privado, handoff hash 45 min, revoke raw; depende de 04,08,11–13 | `invitation_feature_enabled` exige staging no corpo: criar equivalente production com binding de ambiente + allowlist + entitlement; não remover guard isoladamente |
| 22 restore_workspace_rls_execute | ACL/hardening | EXECUTE do helper usado na RLS; depende de 21 | Só authenticated no helper específico; testar policies com JWT real |
| 23 shared_clinic_patients | schema additive; RLS; RPC/helper; ACL/hardening | Pacientes compartilhados, assignments e isolamento pessoal | Preservar schema/RLS pessoais existentes; testar pessoal vs dois tenants |
| 24 harden_shared_clinic_patient_read_authorization | RPC/helper; ACL/hardening | Clinical_access obrigatório para profissional | Testar assigned com clinical false e leitura administrativa sem conteúdo |
| 25 restore_personal_patient_policy_helper_execute | ACL/hardening | Helper da policy pessoal; depende de 23–24 | Não conceder tabelas empresariais; regressão pessoal com JWT real |
| 26 isolated_organization_evolutions | schema additive; RLS; RPC/helper; ACL/hardening | Contexto imutável, FK composta, assinatura, reports pessoais | Guard inicial exige runtime staging: equivalente deve verificar projeto/identidade production sob aprovação, gates false e baseline do schema pessoal; preservar negação por autor |
| 27 enable_clinic_evolution_assignments | RPC/helper; ACL/hardening | Capacidades derivadas de assignments; depende de 26 | Não ampliar acesso administrativo a conteúdo; testar Primary/Secondary/Consultant |
| 28 clinic_ecosystem_operations | schema additive; RPC/helper; ACL/hardening | Dashboard, audit, archive/reactivate e reassign | Guard inicial exige staging: equivalente production revisado com pré-condições explícitas; aplicar lógica corrigida de 30; validar agregações sem metadados clínicos |
| 29 remove_patient_lifecycle_parameter | RPC/helper; ACL/hardening | Remove overload legado com p_status; depende de 28 | Garantir apenas assinatura cadastral de quatro argumentos e ACL final |
| 30 qualify_dashboard_assignment_status | RPC/helper; ACL/hardening | Qualifica a.status no join do dashboard; depende de 28–29 | Guard staging precisa equivalente revisado; executar agregação com assignments reais e validar contagens |

## Bloqueios de compatibilidade além do SQL

Todas as origens estão autorizadas apenas para staging. Mesmo arquivos sem guard SQL não estão autorizados para execução literal em produção.
Além dos INSERTs de 03/05/14 e do guard runtime de 21/26/28/30, o backend de convites e o template de e-mail fixam o host staging. `getClinicConfig` e a validação da conta Stripe fixam staging/Sandbox/Test. Esses contratos precisam de equivalentes explícitos, revisados em outra rodada; copiar SQL ou simplesmente retirar guards não torna o produto compatível com produção.
Tokens raw legados de 04/08 devem permanecer inacessíveis ao cliente durante toda a transição. Aplicar sob janela com todos os gates OFF e revogar ACL antes de disponibilizar novo deployment.

## Pré-condições e pós-apply

Antes de aplicar: revisão humana dos equivalentes, projeto/ref confirmado, backup recuperável e restauração ensaiada, snapshot de RLS/grants/ACL, inventário de constraints/triggers e migrations legadas, contrato legal e providers aprovados. Criar ledger verificável com nome, checksum, ordem, executor e resultado; não usar `supabase db push` para esta série separada.
Após cada transação: confirmar objetos esperados e ausência de grants indevidos, search_path fixo e nenhuma execução PUBLIC/anon. Ao final: migrations/ledger reconciliados, gates OFF, health 200 JSON, regressão pessoal sintética, isolamento entre tenants/autores, seat arithmetic e idempotência de webhook. Advisors devem ser comparados ao baseline, sem corrigir indiscriminadamente avisos históricos.

## Rollback operacional

Não desfazer schema por DROP nem apagar dados para rollback. Desabilitar flag da organização piloto e gate da Clínica; desligar delivery/billing; retornar ao deployment compatível aprovado; manter webhook de reconciliação conforme runbook para preservar a verdade financeira sem aceitar novas compras.
Preservar organizações, memberships históricas, pacientes, assignments, evoluções, assinaturas, auditoria e ledgers. A restauração de backup só pode ocorrer com decisão humana e estratégia de reconciliação de writes posteriores.
Triggers objetivos: qualquer leak entre tenants/autores, convite aceito por e-mail incorreto, perda de histórico/autoria, divergência comercial persistente ou denials inesperados generalizados.

Status: **plano documentado para revisão**. Aplicação/release continuam **BLOCKED**; este documento não é um script pronto para execução.
