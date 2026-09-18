# Fase 6A — Homologação técnica pré-produção

Execução em 18/09/2026, exclusivamente em `feat/clinicas`, Supabase `hwkdwinfckmjoriqxbjk` e `https://staging.evolucaoclinica.app.br`. Baseline solicitado: `c2cf369c869ee5c87b358b8547837452e7d90c7e`. Build final `v1.10.892`; `PLAY_STORE_VERSION = 1.0.87`, sem novo AAB. Produção, `main`, Stripe Live e Google produção não foram alterados.

A jornada técnica integrada passou. Release de produção continua **BLOCKED**: legal **PENDING**, piloto com dados reais **BLOCKED_BY_LEGAL_GATE**, entrega real Brevo **PENDING_EXPLICIT_AUTHORIZATION** e Checkout interativo Test **MANUAL_GATE**. Estes gates não foram convertidos em aprovação automática.

## Evidências e alcance

Resultado sanitizado da execução final `caba1432-bf7a-4c58-be99-5d2a8cd2fe8a`: [integrated-e2e.json](clinic-f6-evidence/integrated-e2e.json). Inventário de RLS, grants, funções, ACL/search_path, migrations e catálogo: [inventory.json](clinic-f6-evidence/inventory.json). Preflight SMTP: [brevo-preflight.json](clinic-f6-evidence/brevo-preflight.json). Advisors posteriores ao cleanup: [advisors.json](clinic-f6-evidence/advisors.json). Estado final de staging: [final-preflight.json](clinic-f6-evidence/final-preflight.json).

O runner usa Auth real e JWT de cada ator contra o banco de staging. As APIs operacionais são os handlers reais registrados em um servidor local restrito a `127.0.0.1`; os testes não equivalem a tráfego HTTP de todas essas rotas no deployment Vercel. As seis telas foram verificadas no deployment real. Billing usa as Edge Functions efetivamente publicadas, Stripe Sandbox real e confirmação persistida pelo webhook real. O transporte dos convites foi mockado: geração, handoff, aceite, identidade, validade, replay e registros são reais; entrega por email não foi realizada.

Foram criados somente atores e registros sintéticos: duas organizações, Owner/Manager/Primary/Secondary/Consultant/Unassigned da A e Owner/Primary da B. O cleanup removeu os IDs exatos dessa execução; os três profissionais e três usuários Auth pré-existentes foram preservados por comparação de IDs.

| Cenário técnico | Resultado | Evidência/limite |
| --- | --- | --- |
| Contexto pessoal e empresarial | PASS | Contextos, histórico pessoal, cadastro/evolução pessoal, backup e exclusão de registros empresariais das consultas pessoais |
| Isolamento cross-tenant | PASS | Troca de organization/patient/member IDs nas APIs e operações clínicas/comerciais negada |
| Isolamento cross-author | PASS | Autor mantém acesso à própria evolução; demais profissionais não obtêm conteúdo/contagem indevida |
| Owner/Manager sem conteúdo clínico | PASS | Dashboard/cadastro/atribuições permitidos; leitura e mutação de evoluções negadas |
| Autoria e assinatura | PASS | Assinatura/hash mantidos após reatribuição e ownership; campos imutáveis rejeitados |
| Ciclo de paciente | PASS | Arquivar/reativar, histórico mantido e profissional sem autorização administrativa negado |
| Reatribuir Primary | PASS | Exatamente um Primary, com e sem manter anterior como Secondary; autoria preservada |
| Ciclo de membros | PASS | Suspender, reativar, remover e impedir acesso após suspensão/remoção; histórico mantido |
| Ownership | PASS | Transferir e devolver owner; último owner protegido |
| Seats | PASS | Reservas/aceite, liberação de seat, mínimo 3, overflow e mudanças comerciais confirmadas |
| Convites técnicos | PASS | Identidade incorreta, expirado, revogado e token reutilizado negados; transporte mockado |
| Auditoria | PASS | Paginação/cursor e filtro; eventos de lifecycle/reatribuição; sem conteúdo clínico |
| Probes de segurança/cache | PASS | Sem JWT/JWT inválido negados; acesso clínico OFF; respostas privadas com no-store e Vary Authorization |
| Regressão pessoal de providers | PASS | Guards empresariais negam relatório/indexação/busca/email antes de qualquer chamada ao provider |
| Falha e recuperação Stripe Test | PASS | invoice.payment_failed real sem entitlement adicional; invoice paga recupera contrato via webhook |
| Idempotência de webhook | PASS | Stripe CLI reenviou evento real ao endpoint de staging; sem nova assinatura/transação |
| Cancelamento ao fim do período | PASS | Stripe Test confirma cancel_at_period_end; contrato/histórico preservados até cleanup |
| past_due grace / restricted | PASS | Estados financeiros e datas de grace inseridos explicitamente como fixtures de banco; não ensaio acelerado de relógio/dunning do provider |
| Perda de dados | PASS | Hash, autoria e histórico preservados durante jornada; exclusão somente no cleanup sintético autorizado |
| Logs e cleanup | PASS | Nenhum token/credencial/conteúdo clínico nas mensagens capturadas; todas as contagens da execução zeradas |

## Stripe Test e gates externos

Conta Sandbox confirmada por API: `acct_1TmBy9PI1KSTkIQA`. Catálogo mensal/anual validado por API, com preços base/seat Test. Nenhum recurso retornou `livemode=true`; o helper bloqueia chamadas posteriores caso isso ocorra.

Checkout `cs_test_b1Ro835GLkI8k32usPUOGSdCM0YUVhltlziHrVP9B6DGHxFJfkDdpdLvmL` foi criado por integração real, mas não concluído interativamente: **MANUAL_GATE**. Foi expirado no cleanup. Como caminho técnico separado, assinatura Test real `sub_1UH2PTPI1KSTkIQA4WZd1sqz` foi criada por API com cartão Test e confirmada pelo webhook/banco, incluindo falha posterior e recuperação de pagamento. Isso valida a reconciliação técnica e não prova conclusão do Checkout interativo. Cliente Test removido e assinatura cancelada ao final; histórico financeiro imutável do provider não é apagável e permanece Test.

Evento real `evt_1UH2PVPI1KSTkIQA237ZJojp` reenviado pela Stripe CLI ao endpoint `we_1UGJaIPI1KSTkIQAS4lj7XUM`, exclusivamente de staging. Sem fixture de evento inventada ou efeito em endpoint Live.

Brevo preflight: **FAIL**. TLS/autenticação SMTP e remetente configurado passaram; declaração de tracking OFF estava false, verificação do remetente no provider e ausência de tracking/rewriting continuam pendentes. Template usa URL direta de staging com fragmento `#invite`; não foi realizado SEND, não houve destinatário inferido e nenhuma configuração global do provider foi alterada. Entrega real permanece pendente de autorização explícita e um destinatário controlado.

Google OAuth **NOT_REPEATED**, Drive empresarial **DISABLED**, Gemini **NOT_REQUIRED**. Nenhuma integração clínica Google foi habilitada.

## Regressões encontradas e correções

1. Dashboard administrativo retornava 503 por SQL `42702`: agregação de assignments usava `status` sem qualificar o alias em JOIN. Migration `20260918_30_qualify_dashboard_assignment_status.sql` qualifica somente esses campos e preserva contrato/RLS/ACL. Aplicada somente em staging; teste de regressão com JWT real, paciente/Primary sintéticos e cleanup passou.
2. Seats abaixo do mínimo retornavam 500 por falha SQL de validação. `clinic-billing-seats` agora valida `contractedSeats` com `requireSeats` antes de recuperação ou mutação comercial, retornando 400 para entradas inválidas. Teste executa o handler real transpileado, com infraestrutura substituída, e verifica sete entradas inválidas e limites válidos.
3. Respostas financeiras tinham apenas `Cache-Control: no-store`. Helper compartilhado agora define `private, no-store` e `Vary: Authorization`, verificados em teste e chamadas reais. Seis Edge Functions de billing foram republicadas exclusivamente em staging.

As tentativas de depuração anteriores tiveram cleanup; a evidência principal é a execução integrada final acima. Não se trata de ausência de defeitos na baseline: o PASS descreve o estado final após correção e regressão.

## Inventário SQL e segurança

Manifesto completo com 30 SQLs/checksums; 21 tabelas inventariadas com RLS e 94 funções empresariais com ACL. PUBLIC/anon sem EXECUTE; funções SECURITY DEFINER com search_path fixo; clientes sem acesso direto às tabelas privadas. Comparação dos corpos das funções finais com as últimas definições versionadas coerente.

O histórico formal de migrations contém somente 23–30. A proveniência histórica de execução de 01–22 não está nesse ledger; o inventário atual prova estado final e não reconstrói histórico ausente. Não foram criados registros fictícios no ledger. A revisão/reconciliação dessa proveniência é gate futuro do plano canônico de produção.

Advisors de segurança: 2 INFO de RLS sem policy nas tabelas privadas de handoff/delivery sem grants ao cliente; 1 WARN vector em public; 21 WARN de wrappers SECURITY DEFINER executáveis por authenticated; 1 WARN de proteção de senha vazada desabilitada. Achados existentes, sem novo P0/P1 identificado nesta rodada. Os wrappers são intencionais e exigem autorização interna/ACL, não foram classificados como seguros apenas pelo lint. Referências: [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extension](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteção de senha](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance: 14 INFO de FKs sem índice e 8 INFO de índices ainda sem uso; não houve novo índice/schema para resolver esses achados. Fase 5 tinha 11 índices sem uso; uso nos testes explica a redução, sem remoção. Referências: [foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [índices sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Verificação visual e operacional

Browser real de staging com login Auth sintético: dashboard, equipe, lista de pacientes, detalhe, auditoria e contratação. Dados renderizados coerentes com seats/assignments/contrato; detalhe administrativo sem evoluções. Checagem móvel básica em viewport 390×844: detalhe e equipe legíveis, sem overflow da página; navegação inferior presente. Não substitui teste em aparelho Android/WebView. Logs do browser: 11 entradas inspecionadas, sem JWT/key ou conteúdo clínico sintético.

Observações P2: banner de trial pessoal ainda aparece no contexto empresarial; alguns eventos administrativos de ownership/acesso usam descrição genérica na auditoria. Sem novo P0/P1 visual identificado; não foram ampliadas alterações de UI nesta rodada.

Cleanup confirmou zero registros dessa execução em organizações, equipe, convites, handoffs/deliveries, pacientes/assignments/evoluções/reports, audit, subscriptions/checkouts/operations/events/transactions e Auth. Gates de aplicação/delivery/billing/Google de Vercel staging OFF, gate SQL OFF e secret Edge billing false. Health real 200 JSON e deployment READY verificados após desligamento.

Quatro flags server-side de Vercel são do tipo sensitive: a API não devolve seus valores. O preflight registra SENSITIVE_UNREADABLE, não UNSET nem valor inferido. A evidência de desligamento dessas flags é a gravação explícita de false aceita pela API, registrada em [gate-shutdown.json](clinic-f6-evidence/gate-shutdown.json), seguida de redeploy do projeto autorizado. As duas flags VITE foram também lidas como false; SQL e digest do secret Edge foram verificados separadamente. Nenhuma flag teve sua proteção removida. [Contrato de variáveis sensitive da Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Validação e próximos gates

`npm test`, regressão runtime do dashboard, teste do handler de seats, `npm run lint`, `npm run build` com variáveis VITE de staging e `git diff --check`: PASS. Build mantém avisos históricos de chunks acima de 500 kB. Scan da alteração contra credenciais reais e padrões de secrets: PASS; arquivos temporários contendo credenciais e magic link permanecem fora do Git e são removidos ao terminar.

Plano de migrations: [READY para revisão](CLINIC_PRODUCTION_MIGRATION_PLAN.md), com classificação 01–30, dependências, guards staging e adaptações canônicas necessárias. Checklist e rollback: [READY para revisão](CLINIC_PRODUCTION_RELEASE_CHECKLIST.md). Nenhuma migration canônica de produção foi criada/aplicada. Rollback desliga gates e restaura deployment compatível preservando dados/audit/ledger; não apaga schema.

Piloto interno sintético de staging: PASS. Piloto com dados reais: BLOCKED_BY_LEGAL_GATE. Nenhuma declaração de conformidade jurídica foi inferida. Release de produção: BLOCKED. Esta entrega termina em commit/push de `feat/clinicas`, sem merge ou implantação em produção.
