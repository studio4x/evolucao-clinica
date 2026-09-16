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
| `20260916_10_organization_team_directory.sql` | diretório mínimo via RPC controlada; memberships active/suspended e perfis mínimos, sem ampliar RLS de `professionals` | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_11_organization_entitlements_and_seats.sql` | catálogo Plano Clínica, contratos empresariais, entitlement full/restricted/none, seats derivados, reserva/aceite, lifecycle clínico, invariant concorrente e resumo controlado | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_12_harden_entitlement_snapshots_and_invitation_expiry.sql` | snapshots contratuais independentes do catálogo atual, FK/intervalo estrutural, elegibilidade financeira de rollout e expiração/audit idempotentes | `hwkdwinfckmjoriqxbjk` (staging) |
| `20260916_13_harden_reserved_seat_conversion_and_operational_restriction.sql` | conversão atômica de reserva em seat ativo sem segunda vaga, concorrência do token e dominância do estado operacional restrito | `hwkdwinfckmjoriqxbjk` (staging) |

Fora do escopo desta série: billing/licenças, pacientes compartilhados,
`org_id` em tabelas individuais, UI, integrações e produção.
