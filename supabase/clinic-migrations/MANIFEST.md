# Fase 1B1 — migrations clínicas controladas

Este diretório contém artefatos aditivos da fundação empresarial, separados do
histórico legado de migrations. Eles não devem ser aplicados com `supabase db
push` nem incluídos em um bootstrap automático.

| Artefato | Escopo | Projeto autorizado |
| --- | --- | --- |
| `20260915_01_organizations_memberships.sql` | organizações, memberships, helpers privados, RPCs de criação/transferência, grants, RLS e invariantes de owner | `hwkdwinfckmjoriqxbjk` (staging) |

Fora do escopo: convites, feature flags por organização, billing/licenças,
pacientes compartilhados, `org_id` em tabelas individuais, UI, integrações e
produção.
