# Fase 4 — Evoluções isoladas

Estado: **VALIDADA NO STAGING**. Branch `feat/clinicas`, baseline funcional
`a637df76b5ee8db43a8688d3fa7420e20edf049d`, build web `v1.10.890`.
Projeto autorizado: `hwkdwinfckmjoriqxbjk`. Produção e `main` não foram
alteradas. Fase 5 não iniciada. Não houve mudança de Stripe, cobrança,
política comercial, limites de áudio ou regras jurídicas.

## Inventário real anterior à implementação

O catálogo do staging foi consultado diretamente: columns, constraints,
policies, grants, triggers, indexes e funções/RPCs. O código dos fluxos pessoais
e clínicos também foi lido; as decisões abaixo não dependem de documentação antiga.

| Objeto | Estado anterior confirmado |
| --- | --- |
| `evolutions` | `professional_id` e `patient_id` UUID obrigatórios; `session_date` é **text obrigatório**, não date; transcrição original/estruturada, template, áudio, status, assinatura, hash, embedding e timestamps; nenhum contexto organizacional |
| `patient_reports` | paciente, profissional, tipo, período e conteúdo obrigatórios; nenhum contexto organizacional |
| `organization_patients` | organização/paciente/created_by obrigatórios, status active/archived; UNIQUE organização/paciente; FKs de organização/paciente sem CASCADE |
| `patient_professional_assignments` | papéis primary/secondary/consultant, status active/revoked; índices únicos para profissional ativo e Primary ativo; constraint temporária exigindo `can_create_evolution=false` |
| RLS `evolutions`/`patient_reports` | uma policy ALL por tabela, `professional_id=auth.uid()` |
| RLS empresarial | tabelas de pacientes/assignments sem acesso cliente; RPCs controlados; RLS pessoal de patients excluindo paciente organizacional |
| Grants | authenticated tinha CRUD das tabelas individuais; tabelas empresariais reservadas a service role; helper `is_organization_patient` já corrigido pela migration 25 |
| Triggers | Primary obrigatório, diferido, em organization_patients e assignments; **nenhum trigger de assinatura em evolutions no baseline do staging** |
| Índices | evolutions por paciente/profissional/status; reports por paciente/profissional; diretório e atribuições com índices próprios |
| Funções | helpers de pacientes e workspace, RPCs Fase 3; `match_evolutions` e RPCs legados de reserva de áudio não estavam presentes no baseline do staging |
| Storage staging | catálogo sem buckets e sem policies de Storage; nenhuma criação/alteração de bucket ou policy nesta fase |

Fluxos examinados: NewEvolution, PatientDetail, History, Patients, Dashboard,
Onboarding, ShareTarget, backupService, OfflineQueueMonitor, server.ts e
recuperação/notificações de lifecycle. A gravação e transcrição existentes
continuam usando prefixo do usuário autenticado, policy de áudio resolvida no
servidor e as mesmas quotas/limites/transportes existentes na branch.

## Schema e migrations

Migrations controladas em `supabase/clinic-migrations`, MANIFEST atualizado:

| Artefato | Histórico real aplicado no staging |
| --- | --- |
| `20260917_26_isolated_organization_evolutions.sql` | `20260917235946` / `clinic_26_isolated_organization_evolutions` |
| `20260917_27_enable_clinic_evolution_assignments.sql` | `20260917235953` / `clinic_27_enable_clinic_evolution_assignments` |

Aplicação via Supabase MCP, exclusivamente no projeto autorizado. A 26 também
verifica `private.runtime_environment=staging` dentro da transação. Nenhum dado
clínico foi apagado ou migrado pelas migrations; policies e a constraint
temporária da Fase 3 foram substituídas de forma controlada.

`evolutions.organization_id` e `organization_patient_id` são nullable, com FKs
`ON DELETE NO ACTION`. O CHECK permite somente contexto pessoal completo
(ambas NULL) ou clínico completo (ambas preenchidas). Uma UNIQUE compatível em
`organization_patients(id,organization_id,patient_id)` sustenta a FK composta
equivalente em evolutions. Um paciente/organização incompatível falha no banco,
inclusive em inserts privilegiados de fixture.

Nenhuma evolução pessoal anterior foi vinculada a clínica. Contexto, paciente
e autoria clínicos são imutáveis em UPDATE, e uma evolução pessoal não pode
ser convertida retrospectivamente. As FKs pessoais legadas foram preservadas.

Assignments ativos existentes passam a `can_create_evolution=true`; novos
Primary, Secondary e Consultor também recebem true. A constraint de resumo
compartilhado mantém `can_view_shared_summary=false`. Isso é capacidade
estrutural, não autorização suficiente por si só.

## Autorização, RLS e ACL

`private.can_read_organization_evolution` exige usuário autenticado,
assignment ativo, membership ativa e clínica, mesma organização e acesso
válido ao workspace. Não concede capacidade por papel owner/manager.
Paciente arquivado e workspace restricted preservam leitura do autor enquanto
seu vínculo clínico continuar válido.

`private.can_create_organization_evolution` acrescenta paciente active,
`can_create_evolution=true` e escrita clínica. O helper específico
`private.can_write_organization_clinical` exige entitlement **full**, reutilizando
o cálculo financeiro/operacional existente, inclusive grace de past_due.
Ele não redefine seat expansion nem altera política comercial. Restricted
nega criação, edição, assinatura e exclusão clínica.

Há uma policy por operação, com ramos pessoal e clínico explícitos, evitando
múltiplas policies permissivas para o mesmo comando:

| Operação | Pessoal | Clínica |
| --- | --- | --- |
| SELECT | autor e ambas chaves organizacionais NULL | autor, contexto completo e acesso clínico válido |
| INSERT direto | autor, contexto NULL e paciente não organizacional | negado; somente criação protegida |
| UPDATE | regra de autor existente e paciente pessoal | autor + escrita clínica, trigger de contexto/assinatura |
| DELETE | regra existente do autor pessoal | autor + escrita clínica + registro não assinado |

RLS de patient_reports continua autoral e acrescenta exclusão de pacientes
organizacionais em USING e WITH CHECK. Não foram habilitados reports/PDI
clínicos nem acesso administrativo a reports.

ACL efetiva verificada no catálogo e no smoke, incluindo herança por PUBLIC:

| Funções usadas em policy ou wrapper | authenticated | anon | service_role | PUBLIC |
| --- | --- | --- | --- | --- |
| can_read_organization_evolution / can_create_organization_evolution | EXECUTE | negado | negado | negado |
| can_write_organization_clinical / is_organization_patient | EXECUTE | negado | negado | negado |
| create_organization_evolution (private e public) | EXECUTE | negado | negado | negado |
| get_organization_evolution_access | EXECUTE | negado | negado | negado |

O trigger privado não recebe EXECUTE dos roles cliente. Nenhum helper usa
user_metadata para autorização. Não ocorreu 42501 por ACL de helper durante
avaliação das policies no smoke.

## Backend e workflow

O RPC público de criação é SECURITY INVOKER, chamando a implementação privada
SECURITY DEFINER necessária para inserir quando a RLS proíbe INSERT clínico
direto. Recebe somente alvo organizacional, data, hora, template e UUID técnico
opcional de evolução para repetição idempotente. Deriva `professional_id` de
auth.uid() e os demais IDs do organization_patient validado. Colisões de UUID
com outro autor/contexto são recusadas; a repetição não reatribui nem sobrescreve
registros existentes.

Rotas em `server/clinic/clinicEvolutionRoutes.ts`:

- GET/POST `/api/clinic/patients/:organizationPatientId/evolutions`;
- GET/PATCH/DELETE `/api/clinic/patients/:organizationPatientId/evolutions/:evolutionId`.

Todas passam por requireAuth, usam chave pública do ambiente e JWT do usuário,
validam UUID e allowlist, enviam Cache-Control private/no-store e Vary
Authorization. Identificadores de contexto/autoria e campos de assinatura não
são aceitos nos payloads. Listagem/detalhe não devolvem count, data, trecho,
status, transcrição, hash ou documentos de outros autores.

Antes de processamento de áudio, o backend resolve a evolução pelo JWT do
autor e verifica escrita clínica quando aplicável. Nenhum caminho novo usa
service role para decidir autorização do usuário. Os usos privilegiados
legados de Storage e consumo permanecem após essa checagem.

## UI, drafts e recuperação

O detalhe dedicado `/painel/clinica/pacientes/:organizationPatientId` apresenta
**Minhas evoluções** somente com capacidade clínica autorizada pelo servidor.
Mostra apenas data/hora, status e conteúdo próprios, com edição, assinatura,
exclusão de registros não assinados e exportação PDF própria revalidada.
O CTA **Nova evolução** depende da capacidade atual de escrita.
Ao trocar organização/paciente/usuário, o detalhe limpa o resultado anterior
e ignora respostas pendentes do contexto antigo.

A rota explícita
`/painel/clinica/pacientes/:organizationPatientId/evolucoes/nova` resolve o
paciente/capacidade no backend e passa um `EvolutionContext` explícito para
NewEvolution. Não duplica o workflow e não infere clínica por patient_id ou URL
anterior. Texto, gravação/upload, transcrição, template/IA e modal de edição
reutilizam o fluxo existente. A entrada clínica não depende de Google OAuth
nem de assinatura premium individual.

Drafts existentes são auxiliares em IndexedDB, não rows de evolutions.
Drafts clínicos guardam contextKind, organizationPatientId, professionalId e
chaves completas no estado auxiliar; texto/híbrido clínico também pode ser
recuperado. A restauração verifica autor, organização, organization_patient_id
e patient_id consistentes. O draft no banco nasce
clínico pelo RPC antes da transcrição, nunca por conversão de row pessoal.
Dashboard pessoal e sincronização offline pessoal não consomem drafts clínicos;
a recuperação clínica ocorre na própria rota. A fila automática empresarial
não foi habilitada.

## Assinatura e hash

A ausência do trigger individual no baseline staging foi constatada, não
presumida. O trigger clínico dedicado usa a mesma composição SHA-256 da lógica
individual existente em `20260814163806_qualify_signature_digest_schema.sql`:
ID, conteúdo, timestamp, IP, nome e registro do autor. O banco deriva nome,
registro, método app_key, data, IP e hash. Nenhuma regra individual de assinatura
foi reescrita e nenhum plano individual foi alterado.

Somente o autor com escrita válida assina conteúdo concluído. Campos de
assinatura forjados são negados. Após fechamento, conteúdo, contexto e
assinatura não mudam nem são excluídos; somente embedding/updated_at técnico
pode mudar sob a autorização normal. O smoke conferiu hash recomputado,
identidade do autor e rejeição de edição/exclusão após assinatura.

## Isolamento dos caminhos pessoais e integrações

History, PatientDetail, Patients, Dashboard e Onboarding filtram explicitamente
`organization_id IS NULL`, assim como as mutações pessoais correlatas. Share
Target permanece pessoal, com lista de patients protegida pela RLS da Fase 3
e INSERT protegido contra paciente organizacional.

O gerador de backup foi extraído para `buildPersonalBackupJson`, com cliente
user-scoped injetável no smoke e a mesma fachada pessoal existente. Filtra
evoluções pessoais e reports dos pacientes pessoais visíveis. Restore recusa
payload com contexto clínico. Não há backup empresarial.

Os endpoints pessoais de semantic-index/search, ai-report e send-report-email
executam `requirePersonalPatient` antes de leituras privilegiadas e chamadas
externas. A RLS de patients recusa o organization_patient mesmo se seu
professional_id legado for o criador. Queries de embeddings também têm filtro
pessoal e por profissional; o match_evolutions legado recebe o profissional
autenticado. Busca/indexação semântica empresarial não foi habilitada.

Google Docs empresarial está **DISABLED / fora do escopo atual**. O workflow
clínico não exige OAuth, não chama append/replace/Drive, não altera
patient.google_doc_id e usa append_status `not_applicable`. Reports/PDI,
prontuário agregado, exportação agregada/backup da clínica e resumos
compartilhados não foram habilitados. O endpoint público de reports pessoais
permanece compatível; a criação pessoal de reports para paciente clínico foi
negada em runtime.

Não são criados eventos administrativos com texto clínico ou metadados de
evoluções alheias. O fluxo clínico não emite notificações pessoais de evolução;
queries de recuperação/notificação de lifecycle filtram evoluções pessoais.
Logs novos de autorização/erro não contêm conteúdo, nome, prompt, áudio, hash
ou payload clínico completo.

## Validação e evidência

Smoke completo final **PASS**, run `8ffdab8e`, via
`scripts/clinic-evolutions-staging-smoke.ts --confirm-staging-only`.
Auth sintético com JWTs reais do staging; ações de leitura, criação, edição,
assinatura e exclusão usaram sessões normais e os handlers reais das rotas.
Service role/Management API foram usados somente para fixture, inspeção de
integridade/ACL e cleanup. O guard pessoal real foi montado com uma sentinela
de integração: o paciente clínico foi rejeitado antes da sentinela; chamadas
externas = **0**. Nenhum Gemini, Google Drive/OAuth, Brevo, Stripe, WhatsApp ou
Push foi chamado.

| Verificação runtime | Resultado |
| --- | --- |
| Primary, Secondary e Consultor no mesmo paciente | PASS, três rows com autores distintos |
| Criação concorrente Primary/Secondary | PASS, mesmo contexto e IDs de evolução distintos |
| Leitura/PATCH/assinatura/DELETE de outro autor | negados |
| Manager administrativo, inclusive com assignment sintético | leitura/criação negadas |
| Owner sem assignment clínico, unassigned e outra organização | negados |
| Forja de IDs de autoridade no payload | HTTP 400 |
| INSERT clínico direto / pessoal para paciente clínico | 42501 por RLS |
| FK composta e contexto parcial, fixture privilegiada | 23503 / 23514 |
| Alteração das quatro chaves / conversão pessoal para clínica | negadas |
| Pessoal, histórico, diretório, report pessoal e backup real | PASS, sem evolução clínica no backup/histórico |
| Restricted | leitura própria mantida; escrita/assinatura negadas |
| Membership suspensa, capacidade clínica desligada, assignment revogado | acesso negado; rows preservadas |
| Paciente arquivado | leitura própria mantida; criação negada |
| Assinatura/hash e campos de assinatura forjados | PASS / negados |
| Documento Google do paciente | NULL preservado; nenhuma chamada externa |
| Exclusão de evolução não assinada pelo próprio autor | PASS |

Transparência de execução: antes do PASS completo, houve duas tentativas
interrompidas por problemas de fixture, não por falha funcional: falta de
session_date em INSERT de integridade e suspensão direta sem suspended_at.
As fixtures foram corrigidas e a suspensão passou a usar o RPC existente.
Ambas as tentativas tiveram cleanup PASS/gate OFF. Houve ainda pré-checagem
de credencial no worktree sem criar fixtures; o env autorizado do checkout
principal foi usado depois, somente para acessar o staging fixado no script.
Não se declara que houve apenas uma invocação do comando.

O finally do smoke desliga o gate independentemente da limpeza. Uma transação
Management-only usa session_replication_role=replica somente no DELETE limitado
aos profissionais sintéticos desta execução para remover as fixtures assinadas,
restaurando origin antes dos demais deletes. Não é um bypass disponível a
owner/manager/cliente, nem uma alteração de policy ou mecanismo de exclusão
clínica do produto.

Cleanup final confirmado, inclusive por consulta independente após o smoke:
evoluções, organization_patients, patients, assignments, organizations, flags,
subscriptions e Auth da fixture = **0**. Profissionais controlados preexistentes
foram preservados. Runtime staging e gate global **OFF**.

Testes dedicados clinic-evolutions, clinic-evolution-authorization,
clinic-evolution-context-integrity e clinic-evolution-acl: PASS. Regressões
clinic-patients, clinic-patient-authorization, clinic-patient-acl, clinic-context,
clinic-workspace-acl e environment-isolation: PASS. `npm test`,
`npm run lint`, `npm run build` e `git diff --check`: PASS.

Build de compilação passou com avisos existentes de placeholders de env no
worktree sem configuração Vite e chunks grandes. Isso não é evidência de
deploy/renderização. A UI foi verificada por testes estáticos, TypeScript e
build; não houve verificação visual em navegador ou uso de dados reais.

## Advisors e gates finais

Security Advisors após DDL e após smoke: **sem ERROR, sem novo WARN/INFO e sem
P0/P1 novo**. Permanecem ocorrências históricas/intencionais:

- 2 INFO RLS habilitada sem policy em tabelas privadas;
- 1 WARN [vector no schema public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public);
- 16 WARN [RPCs SECURITY DEFINER autenticadas existentes](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable);
- 1 WARN [proteção de senhas vazadas desligada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance Advisors finais: sem WARN/ERROR e sem P0/P1 novo; 12 INFO
[FKs históricas sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
e 8 INFO [índices históricos sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
iguais ao baseline. Os dois índices novos foram utilizados no smoke.

Gate global OFF, flags temporárias removidas/OFF. Flags de UX/backend,
entitlement, membership clínica e assignment continuam sendo gates separados.
Sem mudança nativa Android: PLAY_STORE_VERSION permanece `1.0.87`, sem novo AAB.

Limites de evidência: nenhuma integração externa de áudio/IA/Google foi
habilitada/testada em runtime. O staging não recebeu bootstrap de Storage ou
RPCs legados individuais ausentes. A compatibilidade desses caminhos foi
verificada em código/testes existentes, mantendo o transporte e as quotas.
Não há relatório/busca/Docs/backup empresarial, acesso excepcional,
supervisão, prontuário agregado ou implementação da Fase 5.
