# Fase 1B1 — migrations clínicas controladas

Este diretório contém artefatos aditivos da fundação empresarial, separados do
histórico legado de migrations. Eles não devem ser aplicados com `supabase db
push` nem incluídos em um bootstrap automático.

| Artefato | Escopo | Projeto autorizado |
| --- | --- | --- |
| `20260915_01_organizations_memberships.sql` | organizações, memberships, helpers privados, RPCs de criação/transferência, grants, RLS e invariantes de owner | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_02_harden_owner_transfer.sql` | hardening da seleção do membership ativo na transferência de owner e reafirmação de grants | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_03_clinic_feature_gates.sql` | gate global privado, flags por organização, RLS empresarial e proteção dos RPCs existentes | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_04_organization_invitations.sql` | convites, token hash, emissão, revogação, aceite transacional, expiração lógica e grants | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_05_harden_runtime_environment.sql` | identidade privada singleton do ambiente, binding explícito do gate global e deny-by-default | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_06_membership_lifecycle_and_audit.sql` | lifecycle de memberships, eventos administrativos imutáveis e cleanup exclusivo de staging | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_07_operational_audit_and_rollout.sql` | lineage de flags, rollout administrativo e auditoria de organização/ownership | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_08_invitation_rate_limits.sql` | limites de convites e aceite/revogação autorizados | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260915_09_harden_membership_lifecycle_selection.sql` | seleção da membership corrente nas operações de lifecycle | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_10_organization_team_directory.sql` | diretório mínimo via RPC controlada; memberships active/suspended e perfis mínimos, sem ampliar RLS de `professionals` | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_11_organization_entitlements_and_seats.sql` | catálogo Plano Clínica, contratos empresariais, entitlement full/restricted/none, seats derivados, reserva/aceite, lifecycle clínico, invariant concorrente e resumo controlado | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_12_harden_entitlement_snapshots_and_invitation_expiry.sql` | snapshots contratuais independentes do catálogo atual, FK/intervalo estrutural, elegibilidade financeira de rollout e expiração/audit idempotentes | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_13_harden_reserved_seat_conversion_and_operational_restriction.sql` | conversão atômica de reserva em seat ativo sem segunda vaga, concorrência do token e dominância do estado operacional restrito | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_14_clinic_stripe_billing.sql` | catálogo Stripe Test, checkout attempts, ledger de eventos/transações e reconciliação server-side | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_15_clinic_stripe_billing_server_wrappers.sql` | wrappers service-role para catálogo, checkout, eventos, transações e status | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_16_clinic_stripe_checkout_lookup.sql` | lookup autenticado server-side de checkout attempt | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_17_clinic_stripe_cancellation_wrapper.sql` | preparação service-role de cancelamento ao fim do período | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_18_harden_clinic_billing_operations.sql` | lease de operações comerciais, idempotência de payload, serialização por organização e claim com lease de webhooks | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_19_harden_clinic_billing_recovery.sql` | recovery conclusivo de operações stale, expiração/reuso de checkout e aceitação de `past_due` dentro da grace | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_20_harden_clinic_billing_recovery_authorization.sql` | autorização do current active owner antes de recovery e lookup privado de checkout por organização após ownership transfer | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_21_secure_clinic_invitation_delivery.sql` | emissão/entrega privadas, revogação dos RPCs raw, handoff hash/45 min, aceite autenticado, rotação, rate limits e audit sem conteúdo sensível | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_22_restore_workspace_rls_execute.sql` | restaura somente `EXECUTE` para `authenticated` no helper privado usado diretamente pelas policies RLS de workspace | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_23_shared_clinic_patients.sql` | pacientes compartilhados por organização, atribuições Primary/Secondary/Consultor, RPCs autorizados, invariantes e isolamento dos pacientes pessoais | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_24_harden_shared_clinic_patient_read_authorization.sql` | exige acesso clínico também na listagem de profissionais atribuídos, preservando leitura administrativa owner/manager | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_25_restore_personal_patient_policy_helper_execute.sql` | restaura somente EXECUTE do helper privado usado diretamente pela policy RLS pessoal de `patients`, sem conceder acesso às tabelas empresariais | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260917_26_isolated_organization_evolutions.sql` | contexto clínico imutável, FK composta, RLS por autor, RPC de criação, assinatura e reports pessoais | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260917_27_enable_clinic_evolution_assignments.sql` | ativa Primary/Secondary/Consultor e capacidades clínicas derivadas | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260918_28_clinic_ecosystem_operations.sql` | dashboard operacional, auditoria protegida, arquivamento/reativação, reatribuição transacional de Primary e separação do ciclo de vida | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260918_29_remove_patient_lifecycle_parameter.sql` | remove a assinatura legada com `p_status`; atualização cadastral fica restrita a quatro argumentos | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260918_30_qualify_dashboard_assignment_status.sql` | corrige ambiguidade de status na agregação administrativa de assignments, reproduzida na Fase 6 | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260921_32_admin_clinic_directory.sql` | diretório administrativo server-side de clínicas, seats, owners e flags sem conteúdo clínico; seleção determinística do owner sem agregação `max(uuid)` | `hwkdwinfckmjoriqxbjk` (staging) |

Migration adicional Fase 6B: `20260918_31_pending_owner_checkout_context.sql` expõe somente o contexto cadastral de checkout pending_setup ao owner ativo sob gate global AND flag por organização, sem liberar workspace clínico. Exclusivamente staging `hwkdwinfckmjoriqxbjk`.

Fora do escopo desta série: envio externo de convites sem confirmação específica, integrações não autorizadas, Stripe Live e
produção.
| `20260921_33_clinic_plan_context_entitlement.sql` | ownership explícito do Plano Clínica, modos `personal`/`hybrid`/`clinic_only`, contexto autorizado com entitlement organizacional e source de licença, sem exposição financeira | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260921_35_consultant_read_only_assignment.sql` | availability pessoal por status global, backfill e derivação server-side das capabilities de Primary/Secondary/Consultor | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260921_36_admin_clinical_read_access.sql` | leitura institucional de evoluções organization-scoped por Owner/Manager, projeção segura de autor e auditoria sem conteúdo clínico | `hwkdwinfckmjoriqxbjk` (staging) |
