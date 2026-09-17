# Fase 2C — convites reais, entrega transacional e aceite seguro

Data: 2026-09-16. Branch: `feat/clinicas`. Referência: `2c5de70`.
Build web: `v1.10.878`; Android/Play Store inalterado (`1.0.87`), sem AAB.

## Estado atual

**FASE 2C BLOQUEADA** para smoke externo. Implementação e smoke técnico
com transporte mock concluídos; nenhum e-mail externo enviado.

Bloqueios confirmados, não hipóteses:

1. O projeto Vercel `evolucao-clinica-staging` não possui credenciais staging
   de SMTP/Brevo. O baseline staging não contém a tabela genérica `settings`.
   O transporte dedicado recusa envio sem configuração e sem confirmação de
   tracking/reescrita desabilitados. Não foram copiadas credenciais de produção.
2. A Management API de Auth retorna `external_google_enabled=false` no staging.
   A UI existente possui login/cadastro Google, não cadastro por senha.
   O fluxo OAuth recebido por e-mail não pode ser declarado validado assim.
   `mailer_autoconfirm=false`; não foi alterada configuração de Auth/OAuth.
3. Destinatário controlado e autorização específica para o primeiro envio
   ainda precisam ser fornecidos no momento do smoke, após resolver 1–2.

Não solicitar confirmação de envio como se estes pré-requisitos estivessem
atendidos. Nenhum smoke externo, recebimento ou comportamento do provider
é declarado PASS. Não iniciar Fase 3/pacientes compartilhados.

## Isolamento e gates

Somente Supabase `hwkdwinfckmjoriqxbjk`, team Vercel `evolucao-clinica`, projeto
staging existente `prj_Hmm2uRREtw4qOqPf3Lhg78702hlM`, branch `feat/clinicas`.
API revalida `APP_ENV=staging`, URL Supabase exata e origem
`https://staging.evolucaoclinica.app.br`. Em produção/development falha fechada.

`CLINIC_INVITATION_DELIVERY_ENABLED=false` e `CLINIC_BILLING_ENABLED=false`
foram explicitados somente no projeto staging. O gate global DB terminou
`false`. O gate de entrega é separado de billing e do histórico genérico de
e-mail. Revogação/status não exigem habilitar transporte; todos exigem o
ambiente autorizado e os gates/políticas pertinentes no banco.

Nenhuma alteração em Supabase/Vercel produção, Stripe, DNS, branch `main`,
pacientes/evoluções, migrations já aplicadas ou subscriptions individuais.

## Migration e autorização

Migration nova: `20260916_21_secure_clinic_invitation_delivery.sql`.
Aplicada pela Management API somente no staging; sem `supabase db push`.
A primeira execução teve erro sintático e rollback integral; corrigida antes
da aplicação bem-sucedida. Nenhum SQL foi reaplicado sobre migration aplicada.

RPCs raw de emissão/aceite e revogação antiga perderam EXECUTE de PUBLIC,
anon, authenticated e service_role. Helpers privados não têm execução direta.
Somente wrappers service-role têm EXECUTE; JWT validado por `auth.getUser`
no servidor determina o ator. Ator/metadados enviados pelo navegador são ignorados.
O banco repete membership ativa, papel, organização, gates e entitlement.

Owner: manager/professional. Manager: somente professional. Nunca owner.
Emissão/reenvio requerem organização ativa e FULL. Revogação/listagem permitem
restricted, não none. O gate privado de handoff valida ambiente staging/global/
rollout sem depender de `auth.uid()` para um destinatário ainda não logado.

## Persistência, entrega e tracking

Convite persiste apenas SHA-256 do token aleatório de 32 bytes; o raw fica
transitoriamente no servidor para transporte. Lista e respostas usam DTOs
whitelist, sem raw/token_hash/cookie/body/provider credentials.

`private.organization_invitation_deliveries`: IDs, ator, tentativa, provider,
status, datas, código de erro fixo e message ID local opaco. Não há body,
assunto, link, HTML, token/hash duplicado, header de autorização ou erro bruto.
`private.organization_invitation_handoffs`: hash de outro segredo aleatório,
versão do convite, TTL e consumo; nenhum raw. Ambas têm RLS e nenhum grant
de tabela para clientes ou service-role; acesso exclusivamente pelos wrappers.

O sender sensível não chama `sendTransactionalEmail`, `recordEmailDelivery`,
`sendEmailViaBrevo` nem o fallback SMTP genérico. Estes caminhos existentes
persistem conteúdo e/ou erros brutos e não são apropriados ao convite.
Nenhum conteúdo foi inserido em `email_deliveries`.

Transporte dedicado: SMTP com Nodemailer, TLS obrigatório/certificado validado,
logs/debug/protocol trace OFF, sem fallback, templates remotos, pixels, UTM,
SDK analytics, attachments ou URL fetch. O message ID persistido é gerado
localmente, não aceito de resposta arbitrária do provider.
Falha de transporte mantém convite pending e reserva; registra tentativa failed.
Não existe retry automático nem alegação de atomicidade provider/banco.

Configuração staging requerida (nomes, nunca valores):
`CLINIC_INVITATION_SMTP_HOST`, `CLINIC_INVITATION_SMTP_PORT` (465/587),
`CLINIC_INVITATION_SMTP_USER`, `CLINIC_INVITATION_SMTP_PASS`,
`CLINIC_INVITATION_SMTP_FROM`, `CLINIC_INVITATION_SMTP_TRACKING_DISABLED`.
O último só deve ser true após confirmação no provider de open/click tracking
e link rewriting OFF. Não comprova por si só o link efetivamente recebido.
Campos documentados em `.env.example`; nenhum secret criado/versionado.

E-mail mock: marca azul `#105576`, nome da organização, papel amigável, acesso
clínico/administrativo, expiração e um CTA Aceitar convite. Copy idêntica para
conta existente/nova; não informa existência da conta nem dados clínicos/financeiros.
Link direto para `/convite-clinica`, segredo somente no fragment; nenhum
token completo/link sensível é registrado neste relatório.

## Landing, cookie e Auth

`/convite-clinica` serve HTML isolado, não importa App/index/analytics/Meta/
lifecycle. Headers no-store, no-referrer, noindex/nofollow, nosniff, DENY e
CSP default-src none (somente script/connect self e estilo inline).
Vercel encaminha a landing ao servidor; service worker não cacheia/intercepta
landing, página segura ou endpoints de convite.

Script captura o fragment em closure, remove via `history.replaceState`, faz
POST same-origin de handoff, descarta raw e navega `/painel/convite-clinica`.
GET/scanners nunca aceitam membership. Raw não entra em cookie/storage/URL
de login/OAuth state. Handoff cookie `ec_clinic_invite`: outro segredo forte,
HttpOnly/Secure/SameSite=Lax, Path `/api/clinic/invitations`, Max-Age 2700
(45 minutos). Convite válido por 72 horas. Status público exibe apenas nome,
papel, capacidade pretendida e expiração; não exibe e-mail convidado completo.

Entrar/Criar conta usam o mecanismo Google existente com único next allowlisted:
`/painel/convite-clinica`. Login volta ao convite antes dos guards individuais.
Aceite exige ação explícita, POST, origem, JWT e cookie. SQL lê `auth.users.email`
e `email_confirmed_at` atuais, nunca metadata. Cookie furtado com outro e-mail
não concede acesso; e-mail não confirmado não cria membership provisória.

Após aceite: cookie consumido/limpo, contexto revalidado e clínica aceita
selecionada explicitamente. Perfil individual pending não bloqueia apenas a
rota clínica quando há contexto server-resolved ready, mesmo usuário, gate
público e organização autorizada. Contexto pessoal, inactive, cache de outro
usuário e demais guards permanecem bloqueados. Sem alterar status do perfil
nem contratar/alterar assinatura individual.

## Seats, lifecycle, concorrência e audit

Emissão clínica reserva 1, administrativa reserva 0 mesmo com vagas esgotadas.
Aceite preserva a lógica mais forte da migration 13: valida reserva existente,
reserved -1 / active +1 na mesma transação, sem exigir outra vaga. Membership
active/suspended existente é recusada; removed permite reentrada histórica.

Locks consistentes: organization → subscription → invitation → handoff.
Expiração lógica é materializada e auditada uma vez, sem cron. Revogação libera
reserva e invalida handoffs. Reenvio gira hash/versão, renova 72h, mantém mesma
invitation/reserva, invalida tokens/handoffs anteriores e cria nova tentativa.
Limites mantidos: 20/ator/hora, 100/organização/dia, 3/destinatário/dia;
tentativas de reenvio agora contam também. Cooldown adicional de 60 segundos.
Audit só eventos/IDs/estados, sem token/body/link/e-mail/erros do provider.

Equipe possui formulário e lista separada de convites pendentes, papéis
conforme owner/manager, aviso de reserva, métricas de seats do backend,
status distinto de convite/entrega, reenvio e revogação. Não há pacientes
organizacionais nem exposição de link ao emissor.

## Evidências técnicas

`tests/clinic-invitations.test.ts`: HTTP funcional, emissão/JWT/ator confiável,
DTO sem token, erro bruto sanitizado, fragment exchange simulado, landing/CSP,
cookie, TTL, e-mail confirmado/mismatch, replay, falha, rotação, tenants, seats,
concurrency mock e isolamento produção. Sentinel gerado somente em runtime;
conteúdo sensível fica apenas em payload mock/memória, ausente dos snapshots,
respostas, logs/erros efetivamente capturados, ledger genérico, analytics e arquivos verificados. Não é uma suíte
somente regex, nem pretende substituir concorrência PostgreSQL real.

`scripts/clinic-invitations-staging-smoke.ts --confirm-staging-only`: duas
execuções PASS com RPCs reais e HTTP local ligado ao staging. Auth usa
`generateLink` + `verifyOtp`, depois sessões normais; sem e-mail externo e sem
edição manual de email_confirmed_at. Não é prova de OAuth/browser/provider.
Teste novo cria conta somente depois de emitir convite e comprova confirmação
necessária antes do aceite. UUIDs exigidos antes de cada etapa.

Comprovados no staging: trigger professionals, owner/manager, clínico/admin
sem vaga, conversão, falha retaining reservation, isolamento de list/resend/
revoke, cookie com e-mail errado, cooldown, rotação e handoff antigo DENY,
TTL45min, expiry/audit único, emissão/aceite concorrentes e corridas
resend-vs-accept/revoke-vs-accept com estado/membership consistentes, grants
legados revogados e ausência de segredos raw nos snapshots/DTOs.
Datas de cooldown/expiração alteradas somente em fixtures sintéticos para
testar esses estados; nenhum status de sucesso/membership foi forçado.

IDs TEST não secretos da última execução, já removidos:
organizações `107985d2-c867-4569-a62a-116d00657527`,
`c75bc89a-dadd-4b15-aa10-921b59f0ab26`;
convites `db62e79c-d2f8-426b-84d1-fd12e8963537`,
`5b0593e5-778e-4af9-8c58-4689be825ea3`,
`424543bc-ab71-45e8-8ab6-1b1d12a8f0e4`,
`1629cd17-6296-402a-9560-b4c060494c3f`.

Regression explícita environment-isolation/context/team/entitlement/billing/
stripe-webhook-analytics/payment-confirmation/invitations PASS.
`npm test` completo PASS, incluindo analytics. Lint/build/diff-check PASS;
warning de chunk >500kB preexistente, não erro. Nenhuma falha preexistente
foi reclassificada para mascarar um gate desta fase.

Security Advisor: baseline14 WARN → 11 WARN +2 INFO. Três WARN de execução
dos RPCs legados removidos; dois INFO rls_enabled_no_policy são esperados nas
novas tabelas privadas sem grants/políticas de acesso. Não são abertura de
RLS; nenhum P0/P1/WARN novo. Performance Advisor18 INFO →18 INFO, sem novos
FKs sem índice. MCP advisors recusou permissão; usado Management API autorizado.
Referências: [linter RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[grants definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[SMTP/TLS/logging](https://nodemailer.com/smtp),
[generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

## Runtime staging e publicação

Commits publicados em `feat/clinicas`: `5988a01` (implementação), `b881061`
(schema headers), `c2ddfe0` (ordem CSP). Sem merge/push em main.
Deployment funcional `c2ddfe0`:
`dpl_Awdrm6mqywatTweSjqrNXuEbkSRP`, estado READY, projeto staging existente.
Também o deployment `b881061` ficou READY.

Health real HTTPS do domínio staging, atravessando Deployment Protection com
`vercel curl`: HTTP200, corpo exato `{"status":"ok"}`, não HTML de autenticação.
Landing final retorna HTTP503 enquanto `CLINIC_FEATURE_ENABLED=false` (estado
final deliberadamente fechado), com no-store/no-referrer/noindex,nofollow/
nosniff/DENY/CSP default-src none efetivos. API handoff sem feature habilitada
retorna feature_unavailable/503. Não declarar browser/OAuth/landing habilitada
como smoke real aprovado: HTML200/exchange foram verificados no teste funcional
mock, e o banco real via smoke técnico local→staging descrito acima.

Configuração Vercel relida pela API oficial: APP_ENV/VITE_APP_ENV staging,
PUBLIC_APP_URL staging, URL Supabase ref `hwkdwinfckmjoriqxbjk`,
CLINIC_FEATURE_ENABLED/VITE_CLINIC_FEATURE_ENABLED false, EMAIL_SEND_ENABLED
false, billing false, invitation delivery false. As 29 variáveis anteriores
foram mantidas; apenas os dois gates false explícitos adicionados (total31).
Sem credenciais do transporte dedicado ou cópia de secrets de produção.

## Cleanup e próximo passo

### Revalidação da retomada — 2026-09-17

O deployment do commit `8df73a9`,
`dpl_5szqDdXa9H81RR2ewL8FtT7ummjR`, está READY. A API oficial confirma
o Project ID staging existente, o team TARGET, o repositório
`studio4x/evolucao-clinica` e a branch `feat/clinicas`.
No domínio customizado, `vercel curl` atravessou Deployment Protection:
`/api/health` HTTP200 com corpo exato `{"status":"ok"}`. A landing
`/convite-clinica` permanece HTTP503 pelo gate OFF, com os headers restritivos
no-store/no-referrer/noindex,nofollow/nosniff/DENY/CSP efetivos.

As 31 env vars permanecem presentes; APP_ENV/VITE_APP_ENV e URL pública são
staging, com Supabase `hwkdwinfckmjoriqxbjk`. Feature frontend/backend,
entrega, e-mail e billing continuam false. Não há campos SMTP dedicados
configurados na Vercel nem no `.env.local`; tracking ainda não foi confirmado.
Auth retorna Google OFF e mailer_autoconfirm false. Esses pré-requisitos
continuam bloqueando o smoke externo; não foi solicitada autorização de envio.

Consulta somente leitura confirma zero auth.users, professionals,
organizations, invitations, deliveries, handoffs e eventos de audit;
runtime staging e gate global false. Nenhum fixture recriado, nenhum e-mail
externo enviado, nenhuma alteração em produção, Stripe, Auth ou schema.
Os testes locais PASS registrados acima correspondem à implementação
publicada; esta retomada apenas revalidou o runtime e atualizou documentação.
Estado permanece **FASE 2C BLOQUEADA**.

Git: implementação `5988a01`, publicada somente em `feat/clinicas`. O primeiro
deployment staging foi recusado por schema de `vercel.json`: headers da landing
haviam sido inseridos em rewrites. Corrigido na seção headers, com teste
permanente de estrutura e build incrementada; não houve promoção do deployment
ERROR ao domínio. O último READY anterior permaneceu disponível nesse intervalo.
O teste security-policy detectou que a CSP específica precedia a global na
lista; a ordem foi corrigida (global primeiro, exceção restritiva depois), sem
afrouxar a CSP da landing nem remover a regressão existente. Essas duas falhas
foram introduzidas nesta implementação, corrigidas aqui e não reclassificadas
como preexistentes.

Cleanup PASS após cada smoke: auth.users=0, professionals=0, organizations=0,
invitations=0, deliveries=0, handoffs=0, audit=0. Remoção limitada aos UUIDs
criados nesta execução, com helper staging de audit; sem limpeza histórica.
Gate global false, entrega false e billing false. E-mails externos: **0**.

Resolver provider dedicado/tracking e Auth Google staging. Depois revalidar
todos os gates técnicos/runtime, informar destinatário controlado, provider,
convite sintético e cleanup; parar para autorização explícita de UM envio.
Somente depois validar recebimento/link sem tracking, handoff/browser/login,
aceite/contexto, clínico/admin conforme autorização e cleanup final. Até lá
não declarar FASE 2C APROVADA PARA REVISÃO.
