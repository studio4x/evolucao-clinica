# Fase 2C — convites reais, entrega transacional e aceite seguro

Data inicial: 2026-09-16. Retomada: 2026-09-17. Branch: `feat/clinicas`.
Referência inicial: `2c5de70`; referência do estado funcional desta tentativa: `53014bf`.
Build web: `v1.10.878`; Android/Play Store inalterado (`1.0.87`), sem AAB.

## Estado atual

**FASE 2C BLOQUEADA — RESOLUÇÃO DE CONTEXTO PÓS-ACEITE.**

A última tentativa avançou além dos bloqueios anteriores. Google OAuth real,
callback do Supabase staging, sessão, `email_confirmed_at`, fragment exchange,
remoção do raw token da URL, handoff de uso único, aceite server-side,
membership `active` e `clinical_access_enabled=true` foram confirmados.

O bloqueio restante ocorreu depois do aceite: a interface não concluiu a
hidratação/resolução do contexto organizacional e exibiu erro genérico. O
recarregamento posterior mostrou o convite indisponível, comportamento compatível
com o handoff one-time já consumido. Não houve replay, novo convite ou alteração
de código nesta execução.

Tracking/link rewriting da Brevo continua pendente. Nenhum e-mail externo foi
enviado, nenhuma operação Google Drive ocorreu e produção, Stripe, DNS, Brevo
global, `main` e Fase 3 permaneceram intocados.

## Isolamento e gates

Somente Supabase `hwkdwinfckmjoriqxbjk`, team Vercel `evolucao-clinica`, projeto
staging existente `prj_Hmm2uRREtw4qOqPf3Lhg78702hlM`, branch `feat/clinicas`.
API revalida `APP_ENV=staging`, URL Supabase exata e origem
`https://staging.evolucaoclinica.app.br`. Em produção/development falha fechada.

### Diagnóstico somente leitura — resolução de contexto pós-aceite — 2026-09-17

**Causa raiz provável, confirmada pelo caminho de código:** há uma corrida de
hidratação no frontend. O bootstrap de autenticação chama
`hydrateForUser` antes ou durante a entrada no convite. O store mantém uma
promessa global `inFlight` por usuário e `revalidateForUser` apenas delega para
`hydrateForUser`; se a primeira consulta ainda estiver pendente, a revalidação
pós-aceite reutiliza a mesma promessa em vez de iniciar uma leitura nova.

O fluxo de aceite então recebe `organizationId`, chama a revalidação, verifica
se a organização já apareceu no array e lança `context_unavailable` quando a
resposta reutilizada ainda representa o estado anterior, sem membership. O
`catch` de `ClinicInvitationAccept` converte esse erro não mapeado na mensagem
genérica exibida no browser. Isso explica o aceite backend PASS seguido de erro
visual/contextual.

Arquivos e pontos relevantes:

- `src/pages/ClinicInvitationAccept.tsx`: aceite, revalidação imediata,
  verificação por `organizationId` e navegação final;
- `src/store/clinicContextStore.ts`: deduplicação global `inFlight` e ausência
  de uma invalidação/força de refetch específica para pós-aceite;
- `src/App.tsx`: hidratação de contextos durante `INITIAL_SESSION`/`SIGNED_IN`
  e revalidação em eventos de foreground/pageshow;
- `server/clinic/clinicContextRoutes.ts`: consulta autenticada de memberships
  ativas por `professional_id`, com join obrigatório da organização;
- `src/services/clinicContext.ts`: `cache: no-store`, portanto o indício
  principal não é cache HTTP, mas deduplicação/estado em memória.

**RLS e entitlement:** as policies de `organization_memberships` e
`organizations` delegam a `private.can_access_organization_workspace`, que
exige `auth.uid()`, gate global, feature flag da organização, entitlement
`full`/`restricted` e membership ativa. A resolução de entitlement também
valida subscription estrutural e seats. Não há evidência nesta investigação de
claim de `user_metadata` ou refresh obrigatório de JWT; a consulta usa o Bearer
token atual e `auth.uid()`. A dependência de entitlement é real e deve ser
mantida no próximo teste, mas não explica sozinha o padrão observado quando o
aceite já retornou membership ativa.

**Seleção explícita:** o frontend já usa o `organizationId` retornado pelo
aceite, mas `selectContext` só persiste a seleção se a organização já estiver
presente no array hidratado. Não existe seleção por nome nem endpoint separado
de seleção. O ponto frágil é a disponibilidade da organização no momento da
segunda leitura.

**Limite da evidência:** não foi feita nova criação de fixture e não houve
requisição autenticada adicional ao endpoint em staging nesta investigação.
Assim, a corrida frontend é evidência de código e a causa mais provável; o
status exato da resposta real de `/api/clinic/contexts` durante o smoke original
não foi capturado.

**Testes existentes:** `test:clinic-context` cobre transformação, filtros
locais, persistência e revalidação sequencial; `test:clinic-invitations` cobre
aceite server-side, concorrência do aceite e isolamento. Nenhum cobre a
interseção accept → revalidate enquanto uma hidratação anterior está pendente,
nem a resolução autenticada real de contextos imediatamente após o aceite.

**Correção mínima proposta, não implementada:** tornar a revalidação
pós-aceite uma leitura nova/forçada após a conclusão da consulta anterior, ou
invalidar explicitamente a promessa em voo antes de refazer a consulta; depois
selecionar o `organizationId` retornado somente contra a resposta fresca. O
aceite server-side e as verificações RLS/entitlement devem permanecer
autoritativos.

Classificação proposta para o próximo patch: migration **não necessária**;
alteração de RLS **não indicada**; contrato de API **não precisa mudar**;
alteração de frontend/store **necessária**; novo smoke real **necessário após
o patch**. Não foram feitas alterações nesta investigação.

O deployment de restauração `dpl_7ALNQTDj1xxYTm6dwu3Ac34v5UU5` correspondeu
ao estado funcional anterior. O push documental posterior gerou
`dpl_7pHMjiVVYwXjebk8jcDiCo2F7vND`, também `READY`, com health oficial PASS;
essa é a origem da divergência documental de IDs, não uma mudança funcional.

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

### Encerramento seguro da tentativa atual — 2026-09-17 — referência `53014bf`

Esta tentativa foi encerrada sem investigação ou correção de código. O smoke
real confirmou staging, Deployment Protection, Google OAuth, callback Supabase,
sessão autenticada, `email_confirmed_at`, fragment exchange, remoção do raw
token da URL, handoff one-time, aceite server-side, membership `active` e
`clinical_access_enabled=true`.

Após o aceite, a interface falhou ao concluir a hidratação/resolução do
contexto organizacional. A aceitação no backend permaneceu confirmada; a
conclusão visual/contextual ficou **PENDING**. O reload posterior do convite
consumido exibiu indisponibilidade, comportamento esperado para um handoff de
uso único. Não houve tentativa de replay, reutilização de cookie ou novo
fixture.

O cleanup foi concluído somente para os identificadores criados nesta
tentativa. A verificação final confirmou zero `auth.users` de teste,
`professionals`, `organizations`, `organization_memberships`,
`organization_invitations`, `organization_invitation_handoffs`,
`organization_invitation_deliveries`, subscriptions, feature flags e eventos
de auditoria associados ao fixture. O global clinic gate foi restaurado para
`false`.

No projeto Vercel staging, as flags `CLINIC_FEATURE_ENABLED`,
`VITE_GOOGLE_INTEGRATIONS_ENABLED` e `GOOGLE_INTEGRATIONS_ENABLED` foram
restauradas para `false`; `CLINIC_INVITATION_DELIVERY_ENABLED` e
`CLINIC_BILLING_ENABLED` permaneceram `false`. O redeploy final
`dpl_7ALNQTDj1xxYTm6dwu3Ac34v5UU5` ficou `READY`. O `vercel curl` oficial
retornou HTTP 200 com corpo exato `{"status":"ok"}` no deployment e no
domínio staging.

Nenhum e-mail foi enviado. Google Drive não foi acessado. Produção, Stripe,
Brevo global, DNS, `main` e Fase 3 permaneceram inalterados. A próxima ação
deve ser uma investigação separada de `/api/clinic/contexts`, hidratação,
eventual race/staleness/cache, RLS e seleção explícita de organização; ela não
foi iniciada nesta execução.

### Smoke OAuth com gates temporários — 2026-09-17 — referência `5fec404`

Os gates `VITE_GOOGLE_INTEGRATIONS_ENABLED` e
`GOOGLE_INTEGRATIONS_ENABLED` foram habilitados **somente** no projeto
Vercel `evolucao-clinica-staging`, team TARGET, para o redeploy
`dpl_72g1xJwa5Q1XDxUATshyznFT2sEz`. O deployment ficou READY; `/api/health`
retornou HTTP200 com `{"status":"ok"}` na URL do deployment e no domínio
customizado. Delivery e billing permaneceram false.

No Edge, Deployment Protection não bloqueou a aplicação. A página real de
login carregou, o modal de segurança foi concluído e o fluxo chegou ao
seletor de contas Google. Como o perfil continha várias contas e nenhuma foi
identificada inequivocamente como conta controlada de teste, o agente não
selecionou nenhuma. Não solicitada nem registrada senha, OTP ou credencial;
nenhuma conta pessoal/profissional foi usada por suposição. O seletor exibiu
somente o escopo OAuth já previsto pelo contrato (`drive.file`); nenhuma API
do Drive foi acessada, e nenhum arquivo foi criado, alterado ou removido.

Por isso, OAuth callback, sessão Supabase, `auth.users.email`,
`email_confirmed_at`, retorno `/painel/convite-clinica` e fluxo fragment /
handoff não foram declarados PASS. Nenhum fixture, usuário sintético ou token
de convite foi criado; consequentemente não houve alteração de storage,
metadata, analytics, logs ou histórico por fixture. Não houve e-mail externo.

### Restauração obrigatória concluída

Independentemente do smoke incompleto, os dois gates foram restaurados para
false no projeto staging e houve novo redeploy:
`dpl_62gbkhLzTZxd1rwWUcGaAxXFGxQQ`, READY. O health retornou novamente
HTTP200 e `{"status":"ok"}` no deployment e no domínio customizado.
Releitura pela API oficial confirmou:

- `VITE_GOOGLE_INTEGRATIONS_ENABLED=false`;
- `GOOGLE_INTEGRATIONS_ENABLED=false`;
- `CLINIC_INVITATION_DELIVERY_ENABLED=false`;
- `CLINIC_BILLING_ENABLED=false`.

Consulta somente leitura no Supabase staging confirmou users,
professionals, organizations, memberships, invitations, deliveries,
handoffs e audit em zero, com global clinic gate false. Produção, Stripe,
Brevo, DNS, `main`, Drive e Fase 3 permaneceram intocados.

Estado desta retomada: **FASE 2C BLOQUEADA — GOOGLE AUTH STAGING**. Para uma
nova tentativa, é necessário selecionar manualmente uma conta Google
controlada de teste no seletor já aberto, sem escolher contas pessoais ou de
profissionais. Tracking/link rewriting Brevo continua gate separado e não foi
alterado.

### Retomada OAuth após acesso Vercel manual — referência `be17fbb`

Branch feat/clinicas, HEAD be17fbb e worktree limpo no início. A mesma aba
Edge estava na URL autorizada `/login?next=%2Fpainel%2Fconvite-clinica`:
aplicação real carregada, banner AMBIENTE DE HOMOLOGAÇÃO, botão Acessar com
Google e build v1.10.878. **You Need Access ausente**. Não recarregada a aba
desnecessariamente; não alterada Deployment Protection, não criado bypass,
não tornada pública nenhuma URL staging.

Baseline somente leitura antes do login: users/professionals/organizations/
memberships/invitations/deliveries/handoffs/audit zero e gate global false.
Acionados Acessar com Google e slides do modal de segurança existente,
depois Continuar para o Google. O browser permaneceu no login staging,
com um alerta JavaScript ativo; não houve tela de escolha de conta.
O controle da aba sofreu timeout ao tentar tratar o alerta e foi recuperado
sem mecanismo alternativo de automação. Não coletadas senhas/cookies/tokens
de sessão, não registrada conta pessoal, não repetido o login.

Causa do bloqueio no fluxo da aplicação: `requestGoogleOAuth()` executa
`assertPublicEffectEnabled('google')` **antes** de signInWithOAuth e de
armazenar escopos pendentes. API oficial Vercel confirma
`VITE_GOOGLE_INTEGRATIONS_ENABLED=false` e `GOOGLE_INTEGRATIONS_ENABLED=false`
no projeto staging. A condição lança o erro definido no código:
`Integração google desabilitada neste ambiente.`
Essa mensagem é determinada pelo guard; o texto do alerta/log não foi
extraído do browser após o timeout. Não atribuir o bloqueio a Google Cloud,
Client Secret, callback ou Vercel sem evidência desses passos.

Supabase Auth revalidado separadamente: Google provider ON e
mailer_autoconfirm false. Provider ON não sobrepõe o gate frontend.
Outro limite relevante para a próxima decisão: o fluxo existente usa o
conjunto login com escopo `drive.file`, não somente autenticação básica.
Não habilitado o gate Google amplo nem mudado esse contrato funcional
automaticamente para contornar o isolamento. É necessário decidir/autorizar
a configuração temporária staging ou o isolamento entre OAuth de login e
integrações Drive/Calendar antes de retomar o browser. Não implementado fix.

Gates desta tentativa: aplicação/Deployment Protection PASS; login Google
**BLOCKED antes de OAuth**; callback Supabase, sessão, auth.users.email,
email_confirmed_at e retorno seguro `/painel/convite-clinica` **PENDING**.
Não é prova de falha do provider OAuth, mas impede validar o fluxo real pedido.
Fixture fragment/handoff/OAuth **não iniciado**, pois depende do OAuth básico
PASS. Não gerado token de convite; ausência de vazamento de token nos canais
pedidos não foi declarada como PASS runtime sem esse teste.

Cleanup relido após tentativa: todos os oito contadores permanecem zero.
Nenhum usuário/fixture criado, nenhum dado removido, nenhum email_confirmed_at
editado. Delivery/billing/global clinic gate false; feature frontend/backend
também false. Nenhuma alteração em env vars, schema, Auth ou código nesta
retomada. E-mails externos zero; tracking/link rewriting permanece PENDING,
sem alteração global Brevo. SMTP PASS e testes PASS anteriores são históricos
registrados, não reexecutados nesta tentativa somente browser/leitura/docs.
`git diff --check` PASS na atualização documental. Produção, Stripe, DNS,
main, patients/evolutions e Fase3 intocados. Estado atual:
**FASE 2C BLOQUEADA — GOOGLE AUTH STAGING**.

### Revalidação atual após revisão manual — referência `9f5decc`

`.env.local` ignorado pelo Git e não rastreado, confirmado antes das operações.
Presença PASS das seis variáveis SMTP e das seis referências
`GOOGLE_AUTH_STAGING_*`, sem exibir valores. Formato SMTP esperado e URLs
Google staging PASS. Referência local GOOGLE_AUTH_STAGING_ENABLED não está
true; não foi alterada nem utilizada como estado autoritativo do provider.

Somente `CLINIC_INVITATION_SMTP_USER` divergia da configuração Vercel anterior;
atualizado a partir do arquivo local, exclusivamente no projeto staging.
As demais variáveis SMTP já correspondiam ao arquivo. Total37 env vars,
delivery/billing OFF, tracking false preservado. Google Client Secret não
propagado à Vercel nem a variável VITE_. Não consultadas credenciais de produção.
Relitura individual das env vars PASS sem stdout dos valores.

Redeploy oficial do commit `9f5decc`:
`dpl_4K1rJgZptonprdaGm4ATUeRi99Kb`, READY, mesmo Project ID staging existente,
TARGET e branch `feat/clinicas`. Ambiente Vercel `production` aqui corresponde
ao deployment da branch de produção **do projeto staging**, não à produção
do aplicativo. APP_ENV/VITE_APP_ENV staging, URL pública staging e Supabase
`hwkdwinfckmjoriqxbjk` revalidados. Health HTTPS via `vercel curl` PASS tanto
na URL do deployment quanto no domínio customizado: HTTP200 e
`{"status":"ok"}` exato, não HTML de autenticação.

SMTP com opções equivalentes às do sender existente, sem mudar código:

- Provider: Brevo configured, SMTP key dedicada fornecida pelo usuário presente.
- DNS, connection, STARTTLS, certificate: PASS; TLS1.3 com certificado validado.
- `transporter.verify()` / authentication: **PASS**, uma tentativa AUTH.
- Brevo sender: **NOT VERIFIED**; formato PASS, autorização não demonstrada
  por verify e nenhum envio executado para tentar prová-la.
- Tracking/link rewriting: **PENDING**, flag false preservada; nenhuma alteração
  global da Brevo. Anonymous Tracking não equivale a OFF conforme referência
  oficial acima. Necessária garantia por mensagem/integração que não impacte
  transacionais de produção; não implementado header sem documentação oficial.
- E-mails externos: **0**; `sendMail()` não executado.

A falha EAUTH/535 registrada na seção histórica abaixo **não persiste** nesta
tentativa. Não assumir que nova SMTP key isola tracking ou autentica o remetente.

Supabase Auth autoritativo revalidado: Google provider **ON**, Client ID
corresponde à referência local, Site URL staging correto, redirect exato
`/painel/convite-clinica` permitido. Wildcard staging já existente permaneceu
inalterado; não aberta nova permissão. mailer_autoconfirm false preservado.
Nenhum novo OAuth Client criado, nenhum secret rotacionado, nenhuma alteração
na configuração Auth pelo agente. A comparação de secret não foi usada como
prova: leitura da configuração não demonstra funcionamento do OAuth browser.
O código usa retorno intermediário `/login?next=%2Fpainel%2Fconvite-clinica`,
e depois a rota segura; Client ID/Secret não foram expostos.

Browser real conectado (Edge): acesso a `/login?next=...` no domínio staging
retornou **You Need Access** da Vercel, antes de renderizar a aplicação.
Não solicitado acesso por botão, não removida proteção, não criada exceção
pública nem bypass persistente. Somente esse browser está conectado.
Segundo a [documentação Vercel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection),
há métodos oficiais para automação/compartilhamento; não foram criadas novas
credenciais de bypass nem enfraquecida proteção para substituir o login humano.
A alternativa mínima escolhida é entrar no browser com a conta Vercel já
autorizada para o TARGET, sem mudar permissões. Aba mantida para essa ação.
Solicitada também identidade Google controlada de teste, sem senha.

OAuth browser: **BLOCKED / gate não PASS**. Callback, return staging,
professional via trigger, email confirmado e invite OAuth redirect:
**PENDING — não executados**, não falha comprovada do provider Google.
Nenhum usuário/convite criado, nenhum token de convite gerado ou transportado,
nenhum email_confirmed_at editado. Não houve teste fragment/handoff/OAuth real
nesta retomada; testes mock existentes não substituem esse gate.

Testes reexecutados: environment-isolation PASS, clinic-invitations PASS,
`npm test` completo PASS, lint PASS, build PASS; warning preexistente de
chunks >500kB. Varredura da build: SMTP USER/PASS e Google Client Secret ausentes.
Nenhuma alteração funcional/schema/migration/build web/Android.
`git diff --check` PASS; alteração e publicação somente documentais em
`feat/clinicas`, sem merge em main.
Cleanup somente leitura PASS: users/professionals/organizations/memberships/
invitations/deliveries/handoffs/audit todos zero. Global clinic gate false,
delivery/billing false; feature não foi habilitada temporariamente.
Supabase produção, Vercel produção, key SMTP produção, Google OAuth produção,
Stripe, DNS, main e patients/evolutions: **NÃO ALTERADOS** pelo agente.
Configuração global Brevo **NÃO ALTERADA**. Primeiro envio externo continua
sem autorização; Fase3 não iniciada. Retomar OAuth somente após acesso Vercel
no browser e definição da conta Google controlada, sem alterar infraestrutura
de produção nem enviar e-mail.

### Configuração SMTP dedicada — retomada após `df25ae6`

Antes da configuração, `git check-ignore .env.local` PASS e
`git ls-files -- .env.local` vazio. Arquivo permanece ignorado/unversioned;
nenhum valor sensível foi exibido, documentado ou adicionado ao Git.

Provider Brevo: **configured**, com chave SMTP dedicada fornecida pelo usuário
no `.env.local`. Presença/formato PASS para HOST, PORT, USER, PASS, FROM e
TRACKING_DISABLED. Host esperado, porta admitida, remetente em formato válido,
boolean explícito e ausência do prefixo de API key PASS. Isso não comprova
validade/ativação da SMTP key nem autorização do remetente.

Configuração via API oficial Vercel, valores lidos somente em memória e
reenviados sem stdout: seis variáveis `CLINIC_INVITATION_SMTP_*` adicionadas
somente a `evolucao-clinica-staging`. Total **37 env vars**, preservadas as 31
anteriores. Nenhuma variável SMTP com prefixo VITE_. Escopo Vercel `production`
é o ambiente de deployment da branch `feat/clinicas` **deste projeto staging**,
não o projeto de produção. Project ID/team/repositório/branch revalidados.
Relitura individual confirmou correspondência exata dos valores sem revelá-los.
Delivery/billing false; valor de tracking fornecido foi preservado false.

Redeploy oficial do commit funcional `8df73a9` após propagar as env vars:
`dpl_DmucegUoeySREd2MqMAucXRnKd6A`, **READY**, mesmo Project ID staging e
branch `feat/clinicas`, sem alteração de código. `vercel curl` atravessou
Deployment Protection tanto na URL do deployment quanto no domínio customizado:
HTTP200, corpo exato `{"status":"ok"}`, não HTML de autenticação.
APP_ENV/VITE_APP_ENV staging, URL pública staging e Supabase ref staging
revalidados. Varredura da build frontend confirma usuário/senha SMTP ausentes.
Gates delivery/billing também false no `.env.local`.

Sender aprovado permanece inalterado. Executado `Nodemailer transporter.verify()`
com opções equivalentes às do sender: requireTLS, validação normal do
certificado, TLS mínimo 1.2, sem debug/logging/fallback. Resultado:

- DNS: PASS.
- SMTP connection: PASS.
- TLS/certificado: PASS; handshake separado sem AUTH confirmou TLS 1.3.
- Authentication / SMTP verify: **FAIL — EAUTH, SMTP 535**.
- Sender: **not verified**; somente formato PASS.
- Tracking: **pending**, flag false preservada.
- Link rewriting: **pending**.
- E-mails enviados: **0**; `sendMail` não executado, AUTH não repetido.

A resposta não identifica de forma inequívoca a causa do 535. Revisar manualmente
o login SMTP e a nova SMTP key válida/ativa da conta Brevo no `.env.local`;
não substituir por API key, não alterar a key de produção, não flexibilizar TLS.
O [Nodemailer](https://nodemailer.com/smtp) documenta que verify testa conexão,
TLS e autenticação, mas não comprova aceitação de um remetente específico.

**BREVO TRACKING REQUER DECISÃO MANUAL.** Não foi encontrada, nas referências
oficiais consultadas, garantia de tracking/rewrite OFF isolada por SMTP key.
Não declarar inexistente um mecanismo que não foi confirmado. Não inspecionada
a configuração autenticada da conta, nem alteradas configurações globais.
A [documentação Brevo de Anonymous Tracking](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails)
informa que cliques/aberturas continuam rastreados e que a opção transacional
alcança os futuros e-mails transacionais. Não atende ao requisito OFF e sua
alteração na conta compartilhada afetaria também produção.
Solicitar confirmação oficial à Brevo de mecanismo específico por mensagem/
integração que desative clicks/opens/rewrite sem mudar produção. Não foi
adicionado header não documentado ao sender; nova chave não comprova tracking.

**AÇÃO MANUAL NECESSÁRIA — GOOGLE OAUTH STAGING.** Auth staging permanece
Google OFF; não há campos locais de Client ID/Secret Google staging.
Criar OAuth Web Client dedicado, com origin
`https://staging.evolucaoclinica.app.br` e redirect provider
`https://hwkdwinfckmjoriqxbjk.supabase.co/auth/v1/callback`.
Inserir Client ID/Secret com segurança em Supabase staging → Authentication
→ Sign In / Providers → Google. Não enviar secrets no chat nem copiar o client
de produção. Preservar mailer_autoconfirm false. OAuth browser smoke: PENDING,
incluindo retorno ao staging e `/painel/convite-clinica`.

Gates locais reexecutados: environment-isolation PASS, clinic-invitations PASS,
`npm test` completo PASS (incluindo analytics e regressões empresariais), lint
PASS, build PASS. Warning preexistente de chunks >500kB, sem falha. Nenhuma
mudança funcional; build web/Android e migrations inalteradas.
`git diff --check` PASS; publicação apenas documental em `feat/clinicas`.

Cleanup relido via consulta somente leitura: users/professionals/organizations/
memberships/invitations/deliveries/handoffs/audit todos zero, runtime staging,
global clinic gate false. Delivery/billing OFF; nenhum fixture criado.
Supabase produção, Vercel produção, Brevo SMTP key produção, Google OAuth
produção, Stripe, DNS e main: **NÃO ALTERADOS** nesta execução.
Não declarar pronta para smoke externo; primeiro corrigir autenticação SMTP,
comprovar tracking/rewrite OFF e validar Google/browser. Depois parar para
autorização explícita de envio. Fase 3 não iniciada.

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

Resolver garantia de tracking/rewrite e gate do login Google staging para
o smoke OAuth (acesso Vercel resolvido, provider ON, SMTP verify PASS).
Depois revalidar
todos os gates técnicos/runtime, informar destinatário controlado, provider,
convite sintético e cleanup; parar para autorização explícita de UM envio.
Somente depois validar recebimento/link sem tracking, handoff/browser/login,
aceite/contexto, clínico/admin conforme autorização e cleanup final. Até lá
não declarar FASE 2C APROVADA PARA REVISÃO.

### Retomada do smoke Google — 2026-09-17 — commit `13240ec`

Execução limitada ao projeto staging `evolucao-clinica-staging`, no team
TARGET, sem alteração de produção, Stripe, DNS, Brevo, Drive ou `main`.

- Gates temporários Vercel `VITE_GOOGLE_INTEGRATIONS_ENABLED=true` e
  `GOOGLE_INTEGRATIONS_ENABLED=true`: aplicados somente ao staging para o
  smoke e depois restaurados para `false` pela API oficial.
- Deployment temporário `dpl_AKeBr3eLi8rxwDH7BCcunrtgkDP4`: READY, commit
  `13240ec`; `vercel curl` por Deployment Protection retornou HTTP 200 e
  corpo exato `{"status":"ok"}`.
- OAuth real no Edge: conta controlada selecionada manualmente pelo usuário;
  callback retornou ao Supabase staging e ao domínio staging, sem senha
  solicitada/registrada. A rota `/painel/convite-clinica` carregou e não
  exibiu `You Need Access`; o resultado da aplicação sem fixture foi a
  mensagem de acesso ao convite, esperada sem handoff.
- Supabase Auth staging: consulta administrativa sanitizada confirmou um
  usuário recente, e-mail presente e `email_confirmed_at` preenchido. Não
  foram registrados e-mail, UUID, código OAuth, state ou credenciais.
- Fixture sintética: organização, owner, subscription/entitlement full,
  convite e delivery mock foram criados apenas para preparar o teste e foram
  removidos completamente. Nenhum e-mail foi enviado.
- Handoff: bloqueado antes do fragment exchange porque o deployment mantém
  `CLINIC_FEATURE_ENABLED=false`; `/convite-clinica` respondeu
  `Convites indisponíveis`. O gate de feature não foi habilitado fora da
  autorização recebida. Assim, não há evidência PASS para HttpOnly handoff,
  OAuth repetido dentro do convite, aceite/contexto ou ausência do token raw
  em todas as superfícies solicitadas.
- Cleanup Supabase: `auth.users=0`, `professionals=0`, `organizations=0`,
  `organization_memberships=0`, `organization_invitations=0`,
  `organization_invitation_deliveries=0`, `organization_invitation_handoffs=0`,
  `organization_admin_events=0`; global clinic gate `false`.
- Redeploy final `dpl_3j3RiS8gfhEWVogXKBP2Wgc1aEFy`: READY, mesmo commit e
  Project ID. `/api/health` atravessado pela proteção retornou HTTP 200 com
  `{"status":"ok"}`. A API confirmou os dois gates Google com valor
  efetivo `false`, `CLINIC_INVITATION_DELIVERY_ENABLED=false` e
  `CLINIC_BILLING_ENABLED=false` preservados.

Estado desta retomada: **FASE 2C BLOQUEADA — GLOBAL CLINIC GATE**. O OAuth
básico já estava validado; com `CLINIC_FEATURE_ENABLED=true`, o bloqueio
seguinte foi o global clinic gate obrigatório, mantido `false` conforme a
autorização. Tracking/link rewriting Brevo continua um gate separado e nenhum
envio foi realizado. Fase 3 não iniciada.

### Retomada adicional — handoff com global gate desligado — 2026-09-17

Partindo de `c4c99c2`, foram habilitados temporariamente somente no projeto
staging `CLINIC_FEATURE_ENABLED=true`,
`VITE_GOOGLE_INTEGRATIONS_ENABLED=true` e
`GOOGLE_INTEGRATIONS_ENABLED=true`. O deployment
`dpl_FSGZvwvVxVBopS2DNEiLJuppJiQB` ficou READY no commit `13240ec`, e
`vercel curl` por Deployment Protection confirmou HTTP 200 com corpo exato
`{"status":"ok"}`. Supabase runtime confirmado como staging
`hwkdwinfckmjoriqxbjk`.

Foi criada uma fixture mínima sem habilitar o global clinic gate: owner
sintético, organização, entitlement full, feature flag e convite com raw token
gerado somente em runtime. Nenhum delivery foi criado e nenhum e-mail foi
enviado. Em `/convite-clinica#invite=<token-runtime>`, o landing script
removeu o fragmento; a URL final não tinha query nem fragment e não continha
o raw token. A chamada de handoff retornou indisponível porque
`private.invitation_feature_enabled` exige o global clinic gate, que permaneceu
`false`. Portanto não houve handoff persistido, cookie opaco ou avanço para
OAuth/aceite; não foi habilitado outro gate.

Cleanup limitado à fixture: `auth.users=0`, `professionals=0`,
`organizations=0`, `organization_memberships=0`, `organization_invitations=0`,
`organization_invitation_deliveries=0`, `organization_invitation_handoffs=0`
e `organization_admin_events=0`. O global clinic gate permaneceu `false`.

Restauração obrigatória concluída: os três gates temporários foram retornados
a `false`; `CLINIC_INVITATION_DELIVERY_ENABLED=false` e
`CLINIC_BILLING_ENABLED=false` permaneceram intactos. O redeploy final
`dpl_3HhacevdV7Ut5fRRoSNFveHLV4tY` ficou READY, com `/api/health` HTTP 200 e
`{"status":"ok"}`. Produção, Stripe, Brevo, DNS, Drive e `main` não foram
alterados.

Resultado: **FASE 2C BLOQUEADA — GLOBAL CLINIC GATE**. Tracking/link
rewriting Brevo continua pendente. Fase 3 não iniciada.
