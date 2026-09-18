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

`npm test`, regressão runtime do dashboard, teste do handler de seats, `npm run lint`, `npm run build` com variáveis VITE de staging e `git diff --check`: PASS. Build mantém avisos históricos de chunks acima de 500 kB. Scan da alteração contra credenciais reais e padrões de secrets: PASS; arquivos temporários contendo credenciais e magic link permaneceram fora do Git. Seus conteúdos sigilosos foram substituídos por marcador redacted ao terminar; os arquivos vazios de segredos não são evidência de runtime reutilizável.

Plano de migrations: [READY para revisão](CLINIC_PRODUCTION_MIGRATION_PLAN.md), com classificação 01–30, dependências, guards staging e adaptações canônicas necessárias. Checklist e rollback: [READY para revisão](CLINIC_PRODUCTION_RELEASE_CHECKLIST.md). Nenhuma migration canônica de produção foi criada/aplicada. Rollback desliga gates e restaura deployment compatível preservando dados/audit/ledger; não apaga schema.

Piloto interno sintético de staging: PASS. Piloto com dados reais: BLOCKED_BY_LEGAL_GATE. Nenhuma declaração de conformidade jurídica foi inferida. Release de produção: BLOCKED. Esta entrega termina em commit/push de `feat/clinicas`, sem merge ou implantação em produção.

## Fase 6B — External gates closure

Execução de 18/09/2026 a partir de `82421e96f0000666f76944ba1643c31c882cfe9b`, exclusivamente `feat/clinicas`, staging web e Supabase já identificados. Esta seção atualiza os gates externos do relatório 6A acima; não houve repetição do E2E integrado completo. Build **v1.10.893**, um único incremento pela correção funcional abaixo. PLAY_STORE_VERSION **1.0.87**, nenhum AAB.

### Stripe interativo e correção focused

Owner de organização `pending_setup` não obtinha contexto pelo SELECT sujeito à RLS de workspace, impedindo contratação pela UI. Migration 31 adiciona RPC autenticada de metadados mínimos, filtrada por owner ativo, pending_setup e gate global AND flag da organização. Backend agrega esse contexto sem conceder clinical_access; seletor direciona pending à contratação. Sem alteração de RLS clínica, preço, seats, entitlement ou plano pessoal. Commit funcional: `76e47cad99bea38472ce2584cb3e4b1b3842e581`.

Regressão focused com JWT real da fixture: owner pending vê somente o contexto de contratação, dashboard de workspace negado; anon sem EXECUTE; flag org OFF e global OFF removem o contexto. Teste de handler verifica metadata-only e falha fechada se RPC falhar. Aplicação da migration somente em staging, com guard original preservado.

Uma fixture Auth owner e uma organização A criadas pelo runner, sem email enviado. Na UI de contratação de staging, botão “Abrir checkout seguro” criou o Hosted Checkout real; cartão oficial Test 4242 preenchido na UI do Sandbox. Antes do pagamento, API confirmou conta Test e `livemode=false`, BRL, modo subscription. Pagamento retornou automaticamente à rota de sucesso de staging. A UI mostrou “Assinatura confirmada. O acesso da clínica foi atualizado pelo servidor.” após consultar o estado persistido.

[stripe-interactive.json](clinic-f6-evidence/stripe-interactive.json): Session `cs_test_b1sVEeF9j4XngRFufgnfFXBb7yyj31gKIsOrjQs7Q9VW1ZXf1RmMcnFjDj` complete/paid; Subscription `sub_1UH31RPI1KSTkIQAC97ceA2N` active antes de cleanup, base quantity 1 e seat quantity 3. Webhook real `checkout.session.completed` processado uma vez; banco active, contracted_seats 3, entitlement full e exatamente um contrato. Não houve assinatura alternativa criada por API para contornar a interação. URLs Hosted efêmeras, JWT/magic link e credenciais não constam dos artefatos.

Observação P2 fora do escopo: os dois cards locais exibem rótulo “Anual”, apesar do plano mensal selecionado. Hosted/API confirmaram a cobrança Test mensal e valores do catálogo; nenhum preço/copy de plano foi alterado nesta rodada. A navegação observada até contratar usou a rota normal de staging; o redirecionamento do seletor atualizado não teve ensaio visual isolado após recarga de bundle.

### Brevo — somente preflight e provider read-only

[brevo-preflight.json](clinic-f6-evidence/brevo-preflight.json): TLS/autenticação SMTP **PASS**, remetente configurado **PASS**, remetente no provider **VERIFIED**, domínio autenticado. Leitura do provider em sessão já autenticada confirmou correspondência exata do FROM/login e sufixo mascarado da chave ativa dedicada de convites staging. Não foi revelada/copied key, acessado API key genérico ou alterada configuração. Evidência sanitizada registra os matches booleanos, sem endereço real ou sufixos.

Conta **SHARED**: a mesma conta exibe a chave dedicada de staging e uma chave do app legado. Isso não equivale a conta/subconta isolada. Na tela de tracking, “Rastreamento de e-mail anônimo?” estava Não; o controle trata associação ao contato, não desligamento estrito. A [documentação oficial de anonimização](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails) mantém contabilização de opens/clicks. Não foi comprovado override SMTP seguro por mensagem nem inspecionada mensagem entregue. Open tracking, click tracking e link rewriting: **UNKNOWN**. Não transformar anonimização, domínio autenticado ou SMTP AUTH em prova de tracking OFF.

Preflight **MANUAL_PROVIDER_GATE**. Declaração local de tracking permanece false; delivery OFF por gravação aceita + redeploy. Valor sensitive server-side não é legível pela API e aparece SENSITIVE_UNREADABLE separadamente. Não houve alteração de tracking global/anonymous settings, sender/DNS/domínio/SMTP/API, criação de convite real, destinatário inferido ou qualquer SEND. Template com fragmento dummy confirma URL direta `#invite`: **PASS**, sem afirmar recebimento preservado. Entrega real: **PENDING_EXPLICIT_RECIPIENT_AUTHORIZATION**. Próxima rodada precisa resolver escopo e comprovar tracking estrito suportado, depois obter autorização explícita de um destinatário controlado; até lá nenhum envio.

### Proveniência e desenho de produção

[CLINIC_MIGRATION_PROVENANCE.md](CLINIC_MIGRATION_PROVENANCE.md) contém número, filename, SHA-256, histórico formal, objetos atuais, superseded_by, classificação e ação de produção para cada SQL 01–31. [migration-provenance.json](clinic-f6-evidence/migration-provenance.json) inclui catálogo e comparações por objeto, ACL efetiva inclusive por coluna, assinaturas/corpos/search_path, tabelas/colunas/RLS, constraints, policies, triggers e índices.

01–22: **RECONCILED_WITH_LIMITATIONS**, histórico formal **NOT_PRESENT**. Nenhuma data/executor/aplicação retroativa inventada. Classificações distinguem MATCHES_RUNTIME, SUPERSEDED_BY_LATER_MIGRATION e PARTIAL_MATCH; sem DRIFT nas declarações finais comparáveis. PARTIAL_MATCH mantém revisão semântica explícita de defaults/expressões/policies/índices/triggers e SQL condicional/DML. 23–30: histórico formal **RECONCILED**; objetos finais comparados, com limitações semânticas igualmente visíveis. 31: novo registro formal real desta rodada.

[Plano de produção](CLINIC_PRODUCTION_MIGRATION_PLAN.md): **DESIGN_READY_FOR_HUMAN_REVIEW**. Preferência documentada por nova série canônica de estado final; dashboard nasce já corrigido de 30, paciente sem overload legado de 29, convites sem exposição transitória de RPC raw de 04/08. Helpers de cleanup excluídos; gates OFF, binding de produção explícito e preservação do schema/RLS pessoal. Guards originais intactos; **PRODUCTION_EQUIVALENT_REQUIRED**, não remoção simples. Nenhum bundle SQL de produção implementado/aplicado nem autorização de release inferida.

### Gate do piloto, cleanup e verificação

[pilot-gate-matrix.json](clinic-f6-evidence/pilot-gate-matrix.json): organização A pós-pagamento active/full e B com contrato ativo **SYNTHETIC_DB_ONLY**, ambas do owner sintético. JWT real no SELECT com RLS e RPC de dashboard provou global ON/A flag ON/B flag OFF → somente A permitida; global OFF → ambas negadas. **PASS**, sem confundir financial_status com negação do gate. Opção A (kill switch global AND allowlist) versus opção B (redesenho para admissão com global OFF) documentadas; decisão humana de produção pendente, nenhuma escolhida silenciosamente.

Cleanup **PASS**: assinatura Test cancelada, customer Test removido, Session completa mantida como histórico Test imutável. Removidos IDs exatos de organizações/memberships/flags/audit/billing/owner Auth; nenhum paciente/evolução/convite criado nesta rodada. Os três profissionais e usuários Auth pré-existentes foram preservados por comparação de IDs. [final-preflight.json](clinic-f6-evidence/final-preflight.json) confirma contagens zero e estado final. SQL global OFF, Edge billing false por digest confirmado, seis flags Vercel false por gravação explícita aceita e deployment READY + health 200 JSON. Quatro valores sensitive não são inferidos; duas flags VITE false no build e gravação. [gate-shutdown.json](clinic-f6-evidence/gate-shutdown.json) mantém receipt do projeto autorizado.

Scripts focused adicionados: `test:clinic-external-gates`, `test:clinic-brevo-preflight`, `test:clinic-migration-provenance`, `test:clinic-pilot-gates`, incluídos em `npm test`. Runner interativo separado exige `--confirm-staging-only` e runtime externo; comparação de proveniência e finalize são somente leitura. Tests **PASS**, lint **PASS**, build **PASS** com gates VITE OFF (avisos históricos de chunks), secret scan **PASS**, `git diff --check` **PASS**. Segredos/magic link temporários ficam fora do Git e seus conteúdos são substituídos por marcador redacted ao fechar.

Legal **PENDING**; piloto real **BLOCKED_BY_LEGAL_GATE**; produção **BLOCKED / UNTOUCHED**; main **UNTOUCHED**. Google/Drive empresarial OFF; OAuth não repetido, Gemini não requerido, Stripe Live intocado. Entrega somente commit/push `feat/clinicas`; parar sem merge, produção, dados reais ou Brevo SEND.

## Fase 6C — Isolamento Brevo

A inspeção read-only da conta Brevo autenticada confirmou `accountType=standard` na UI da conta e plano **Free**. Não há superfície de Admin/suborganizações ou subcontas na conta atual; a documentação oficial da Brevo condiciona o gerenciamento de suborganizações/subcontas a clientes Enterprise. `subaccountsSupported=false` para o plano observado e `subaccountsAvailable=UNKNOWN`; não foi inventado um número de slots nem inferida uma entidade existente.

Resultado: **BREVO_PROVIDER_ISOLATION: PLAN_CAPABILITY_GATE**. O escopo atual permanece **SHARED** no account pai. A chave SMTP dedicada “Evolução Clínica — Staging Convites” existe, mas a UI SMTP mostra-a no mesmo account pai que “App Evolução Clínica”; portanto `smtpCredentialScope=SHARED`, `senderScope=SHARED` e `trackingConfigurationScope=SHARED`. Nenhuma suborganização foi criada e nenhum identificador de entidade isolada existe.

O plano Free não foi alterado. Não houve upgrade, cobrança, add-on, IP dedicado, trial, nova conta, redistribuição de créditos, DNS, sender, domínio, SMTP/API ou configuração de produção alterados. `providerConfigurationChanged=false`, `billingPlanChanged=NO`, `DNS changed=NO`, Vercel staging env **UNCHANGED** nesta fase. O delivery da aplicação continua OFF; a leitura de valores server-side sensíveis continua `SENSITIVE_UNREADABLE`, enquanto o receipt anterior de gravação mantém todos os seis gates em `false`.

Sender institucional e domínio permanecem **VERIFIED**/**authenticated** no account pai. `transport.verify()` continua **PASS** para SMTP/TLS. Isso prova autenticação, não delivery, autorização final do sender dentro de subconta inexistente, nem comportamento de links.

Na tela transacional de Rastreamento, a única opção apresentada foi “Rastreamento de e-mail anônimo?”, com **Não** selecionado. Não foram apresentados controles independentes de open tracking, click tracking ou link rewriting, nem per-contact consent/track unknown contacts. Assim: `anonymousTracking=OFF`, `perContactTrackingConsent=UNAVAILABLE`, `trackUnknownContacts=UNAVAILABLE`, strict open/click disable **UNPROVEN**, link rewriting **UNKNOWN**. Anonimização não foi tratada como tracking desligado. Não houve alteração nessa tela.

O template local permanece **PASS** com `#invite`, token sintético e `never-sent@example.invalid`; em staging identifica visualmente o ambiente no remetente, assunto, banner HTML, texto simples, CTA e headers técnicos, sem alterar o fragmento direto. A renderização explícita de produção remove esses marcadores, mas os guards de produção continuam fechados. Não há SEND, convite, resend, SMTP send, API POST, template test ou mensagem para endereço real. A entrega real permanece **PENDING_EXPLICIT_RECIPIENT_AUTHORIZATION** e exige futura autorização para um destinatário específico. A prova do provider está em [brevo-provider-readonly.json](clinic-f6-evidence/brevo-provider-readonly.json) e o preflight atualizado em [brevo-preflight.json](clinic-f6-evidence/brevo-preflight.json); nenhum segredo foi versionado.

Alternativas manuais futuras, sem decisão automática: (A) contratar/usar suborganização Enterprise; (B) criar conta Brevo separada dedicada ao staging; (C) avaliar provider transacional isolado. Nenhuma foi implementada ou contratada. Fase 6C termina com **PLAN_CAPABILITY_GATE**. A identificação funcional de staging incrementa `APP_VERSION` uma vez para `v1.10.894`; `PLAY_STORE_VERSION` permanece `1.0.87` e não há novo AAB.
