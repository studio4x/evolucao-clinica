# Proveniência das migrations Clínica — Fase 6B

Reconciliação somente leitura do staging `hwkdwinfckmjoriqxbjk`. Checksums SHA-256 dos arquivos atuais; nenhuma reaplicação ou inserção retroativa no ledger. Produção e main intocados.
O campo sha256 usa o conteúdo versionado UTF-8 com LF, estável entre Windows e Linux. checkout_sha256 no JSON preserva também o hash dos bytes locais desta execução; 01–22 tinham CRLF no checkout. Nenhum arquivo SQL original foi renormalizado nesta rodada.

01–22: **RECONCILED_WITH_LIMITATIONS**, histórico formal **NOT_PRESENT**. Não é possível reconstruir data/executor pelo catálogo atual. 23–30: histórico formal **RECONCILED**. 31: correção adicional de contexto pending do owner aplicada exclusivamente em staging nesta rodada.

| number | filename | sha256 | formal_staging_history | runtime_objects_present | superseded_by | status | production_action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20260915_01_organizations_memberships.sql | a05129477d778828610492c2cdc8bf256efaa62dab9a910155e6e301afc31721 | NOT_PRESENT | 127/127 final declarations | 3, 7, 11 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 2 | 20260915_02_harden_owner_transfer.sql | b28a06e45c847161547d3beefbf97651f2f5e7e68684a10975cc600ce58d0ef9 | NOT_PRESENT | 0/0 final declarations | 7, 11 | SUPERSEDED_BY_LATER_MIGRATION | PRODUCTION_EQUIVALENT_REQUIRED |
| 3 | 20260915_03_clinic_feature_gates.sql | e78c99bbe81faaa96858a8f309435496aa7481d2fc0034e5c8eee3fe6a628f5a | NOT_PRESENT | 89/89 final declarations | 5, 7, 11 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 4 | 20260915_04_organization_invitations.sql | 52a781b2a90c2d1aa3b10bf6901c8c25767296149b82bba399965e6e94f5398d | NOT_PRESENT | 79/79 final declarations | 5, 12, 13, 21 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 5 | 20260915_05_harden_runtime_environment.sql | f2bcd4c5ffc03d082c4046a90e81b7b198d9c0ad26c3a493474ced2343be6cd5 | NOT_PRESENT | 42/42 final declarations | — | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 6 | 20260915_06_membership_lifecycle_and_audit.sql | 7137c4668e7ed3c7cda5b22e4a7c66afc02c649f387ff513463af3071a279a1f | NOT_PRESENT | 87/87 final declarations | 9, 11, 28 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 7 | 20260915_07_operational_audit_and_rollout.sql | d642915792a629a9dbbaf920856247df4156f20c6309b02dd0634cf2cf2b674a | NOT_PRESENT | 21/21 final declarations | 11, 12 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 8 | 20260915_08_invitation_rate_limits.sql | 3b9ba99546240c8402d6451a2cc8e34b48a3bceda882a7e51c19cb2aa80aa117 | NOT_PRESENT | 49/49 final declarations | 12, 13, 21 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 9 | 20260915_09_harden_membership_lifecycle_selection.sql | d31f69afb66e644086f3b4a5786d7d2c16c849336c0642784fc210aaa364f818 | NOT_PRESENT | 4/4 final declarations | 11 | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 10 | 20260916_10_organization_team_directory.sql | 0073f448801d6c1fae40bc8712541869444bab0152fa15cc18a0838075c5a4ef | NOT_PRESENT | 4/4 final declarations | 11 | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 11 | 20260916_11_organization_entitlements_and_seats.sql | 314cd7ba6186f80bb5a5775c2af233866b1eedf1e3abfbccb1ffbfea401d1dc0 | NOT_PRESENT | 165/165 final declarations | 12, 13, 22, 28 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 12 | 20260916_12_harden_entitlement_snapshots_and_invitation_expiry.sql | 0aab9c522bd11eb69cac7b691e5a807a16750e35b41bb1fab9f0de14e9bff883 | NOT_PRESENT | 22/22 final declarations | 13, 21 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 13 | 20260916_13_harden_reserved_seat_conversion_and_operational_restriction.sql | 16e4220680ff002bb3c98d1f907ec2239e4158527927b8b0114aec243b6c1935 | NOT_PRESENT | 6/6 final declarations | 21 | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 14 | 20260916_14_clinic_stripe_billing.sql | 363fdde0d656f1ea4b7d2695c45eee49168242bddaa5da11bc65d23515aed2eb | NOT_PRESENT | 259/259 final declarations | 19 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 15 | 20260916_15_clinic_stripe_billing_server_wrappers.sql | 6e330d57d839aa75fd30160eaf8e2ce6baa4a75b5b813b07668167c37be33ff6 | NOT_PRESENT | 20/20 final declarations | 18 | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 16 | 20260916_16_clinic_stripe_checkout_lookup.sql | 4a921f70f73f374e3c8c4e1941380c2965054f9477b1e2262bbac787049e9aea | NOT_PRESENT | 5/5 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 17 | 20260916_17_clinic_stripe_cancellation_wrapper.sql | f30c9f50c80635167aa0b4d660c37afe6f2413134595815c83f51c39d5d6cbfc | NOT_PRESENT | 5/5 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 18 | 20260916_18_harden_clinic_billing_operations.sql | ed3e41a0805aa128cb1c4323a3bab84c6a88645923f06d8d4aca3949d45f29cb | NOT_PRESENT | 82/82 final declarations | 19 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 19 | 20260916_19_harden_clinic_billing_recovery.sql | 5ef735aee019fc7e8b4b3f7026b8b6d2589a2e1816ddf1da8b0678845f3dbede | NOT_PRESENT | 40/40 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 20 | 20260916_20_harden_clinic_billing_recovery_authorization.sql | 590e424cb25a571f62480dfabd71ebd9f8fa408039b600582bd164336510601e | NOT_PRESENT | 10/10 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 21 | 20260916_21_secure_clinic_invitation_delivery.sql | 66e117799c44bb7b4265c133bd5b2f8e0032103a60b67d4e7f8a1e603301e414 | NOT_PRESENT | 180/180 final declarations | 28 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 22 | 20260916_22_restore_workspace_rls_execute.sql | 60c4d5eeabef7069ac4993164d92fb98592673a83a86a69eafe9cb5417a1d895 | NOT_PRESENT | 5/5 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 23 | 20260916_23_shared_clinic_patients.sql | c795a6f6ed6d3b596c4873eaeb063988b73858f4e01d3f926a5deff0cfe7220a | RECONCILED | 134/134 final declarations | 24, 25, 26, 27, 28, 29 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 24 | 20260916_24_harden_shared_clinic_patient_read_authorization.sql | 0d52f5a3f56a7e7c0a2e0d30d44eec2eb8645c2652539e078128d42a3e16f307 | RECONCILED | 5/5 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 25 | 20260916_25_restore_personal_patient_policy_helper_execute.sql | 17d0660fae4e4e1ce6e90f2f933e18c42c89475edf5df5eb784528df66c7a294 | RECONCILED | 5/5 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 26 | 20260917_26_isolated_organization_evolutions.sql | 3aa35e210da2a98b889a9967e03ea4defad60ff1a3022b39df74504ef290ae60 | RECONCILED | 60/60 final declarations | — | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 27 | 20260917_27_enable_clinic_evolution_assignments.sql | 40721163ac17f3ffa6a37fa7a00ac47d84b12f8525691079829d10a8773c13ee | RECONCILED | 2/2 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 28 | 20260918_28_clinic_ecosystem_operations.sql | 6197bce58522fd2e1db1198780a120eba4dc60e47945918c638f97ca75c190b9 | RECONCILED | 34/34 final declarations | 29, 30 | PARTIAL_MATCH | PRODUCTION_EQUIVALENT_REQUIRED |
| 29 | 20260918_29_remove_patient_lifecycle_parameter.sql | 3ba64683207929330b2cf02d701e2db1ea3794d414f47cdcbce6cc22e6e2a382 | RECONCILED | 7/7 final declarations | — | MATCHES_RUNTIME | CANONICAL_FINAL_STATE_REVIEW_REQUIRED |
| 30 | 20260918_30_qualify_dashboard_assignment_status.sql | 3dec77f28428b13457a408edb73f2f3bad386fd41edd30054331ba4f3f501bc3 | RECONCILED | 6/6 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |
| 31 | 20260918_31_pending_owner_checkout_context.sql | 81c579221825aeba9918082b22eae35a0eecb7d2a9d887e42b5c673b004a2c02 | RECONCILED | 6/6 final declarations | — | MATCHES_RUNTIME | PRODUCTION_EQUIVALENT_REQUIRED |

## Alcance verificável e limites

O JSON registra inventário de tabelas/colunas/constraints/policies/índices/triggers/funções e permissões efetivas, incluindo grants por coluna. Funções finais: assinatura, corpo com literais preservados, SECURITY DEFINER e search_path fixo comparados. Colunas: tipo/nullability; constraints: tipo, relação referenciada e deferrabilidade; policies: comando/roles; índices: unicidade; triggers: função/deferrabilidade; ACL: privilégio efetivo. Drops e substituições posteriores são considerados.

PARTIAL_MATCH declara explicitamente revisão pendente de expressões de default, CHECK/FK/índice, USING/WITH CHECK e detalhes semânticos de triggers. O parser não executa SQL; blocos DO e DML não são tratados como prova histórica. O catálogo completo permite revisão manual dos objetos não extraídos ou alterações condicionais. Presença estrutural não é equivalência semântica completa. Não foi identificado DRIFT nas declarações finais comparáveis.

SUPERSEDED_BY_LATER_MIGRATION indica a última definição por objeto, sem dizer que tabelas ou histórico remanescentes desapareceram. Migration 30 contém diretamente o dashboard final corrigido; 29 remove o overload legado de paciente e seus grants. 31 expõe só metadados pending ao owner ativo, com gate global AND flag da organização; não concede workspace clínico.

## Produção

**DESIGN_READY_FOR_HUMAN_REVIEW**: ver [plano canônico](CLINIC_PRODUCTION_MIGRATION_PLAN.md). Todos os originais permanecem staging-only. Guards/bindings exigem PRODUCTION_EQUIVALENT_REQUIRED; nenhuma remoção automática, bundle SQL de produção ou aplicação foi realizada. Históricos 01–22 não serão falsificados.

Evidência detalhada: [migration-provenance.json](clinic-f6-evidence/migration-provenance.json).
