# Migração Vercel para scope dedicado

**Data da execução:** 15/09/2026
**Escopo:** somente infraestrutura Vercel  
**Estado atual:** staging transferido e validado nos gates de configuração/runtime; Auth/RLS bloqueado porque a criação de uma Secret API Key temporária não foi aceita pela Management API
**Checkpoint funcional:** `feat/clinicas` em `40bd76a`

## Resumo executivo

A topologia correta foi confirmada como Project Transfer entre teams/scopes:

```text
SOURCE: studio4xs-projects
  -> TARGET: evolucao-clinica
```

Na retomada, o novo `VERCEL_SOURCE_TOKEN` foi validado como Owner e o staging foi transferido pelo fluxo REST nativo: criação do transfer request HTTP 200 e aceite pelo destino HTTP 202. O Project ID, deployments, domínios e 29 environment variables foram preservados. Após a correção manual da Branch Tracking, foi executado redeploy oficial no TARGET, sem alteração funcional no código.

A validação pós-transferência encontrou inicialmente que o projeto staging no TARGET estava sem vínculo Git. Após a autorização manual informada pelo usuário, o CLI oficial reconectou o projeto a `studio4x/evolucao-clinica`. A Branch Tracking foi então corrigida manualmente para `feat/clinicas`, confirmada pela API, e o redeploy controlado ficou Ready no TARGET.

O bloqueio anterior com `VERCEL_ACCESS_TOKEN` permanece registrado no histórico abaixo. A sessão Dashboard da origem confirmou originalmente os projetos, mas o team de destino pertence a outro login e não aparecia como destino selecionável.

Nenhuma alteração automática foi feita no Supabase, DNS, GitHub, código funcional, secrets, integrações ou plano Vercel. A autorização GitHub foi feita manualmente pelo usuário. A Fase 1B1 continua bloqueada.

## Retomada — resultado atual

### Retomada pós-transferência — 15/09/2026

- O token do TARGET confirmou o team canônico `evolucao-clinica` e o projeto `evolucao-clinica-staging` no mesmo Project ID `prj_Hmm2uRREtw4qOqPf3Lhg78702hlM`.
- O projeto continua no TARGET, sem conflito de nome; a produção continua no SOURCE.
- O `.vercel/project.json` local foi atualizado para o mesmo Project ID de staging e para o `orgId` canônico do TARGET. O arquivo continua ignorado pelo Git.
- A nova tentativa oficial `npx vercel@latest git connect --yes`, usando o remoto exato `https://github.com/studio4x/evolucao-clinica.git`, o escopo TARGET e modo não interativo, retornou **Connected**.
- A API confirmou `link.type=github`, organização `studio4x`, repositório `evolucao-clinica`, credencial Git associada e repositório público. Não houve bloqueio de plano Hobby por repositório privado.
- A validação obrigatória pela API confirmou simultaneamente `projectId=prj_Hmm2uRREtw4qOqPf3Lhg78702hlM`, `projectName=evolucao-clinica-staging`, `accountId=team_opJQiM63Vn6P0uOe5Om8e1HD`, `repository=studio4x/evolucao-clinica` e `productionBranch=feat/clinicas`.
- O valor local de `VERCEL_TARGET_TEAM_ID` continuou tratado somente como possível slug; o ID canônico usado nas chamadas foi obtido/confirmado pela API: `team_opJQiM63Vn6P0uOe5Om8e1HD`.
- O redeploy oficial `vercel redeploy` do deployment anterior recebeu a URL `evolucao-clinica-staging-38k6g9i9c-evolucao-clinica.vercel.app` e UID `dpl_48CShx7gLcunfWS2g6DomUx6wAwW`. A API confirmou `READY`, `target=production`, o Project ID do TARGET, ref Git `feat/clinicas` e SHA `9dbf4e66ec731e9cccc17a022f64301f7811752d`.
- A API confirmou 29 environment variables no projeto. Nenhuma variável, domínio, protection setting, projeto de produção ou código funcional foi alterado.

### Gates executados após a correção da branch

- Os 29 nomes de environment variables permanecem no TARGET; seus valores não foram registrados.
- A resposta protegida de `vercel curl /api/health --deployment https://staging.evolucaoclinica.app.br` retornou exatamente `{"status":"ok"}`. HTML de autenticação não foi aceito como health. A CLI gerou bypass temporário oficial; Deployment Protection não foi desabilitada.
- O domínio `staging.evolucaoclinica.app.br` está verificado pela API e respondeu via HTTPS. A home real retornou HTML da aplicação, incluindo `VITE_SUPABASE_URL` apontando para `hwkdwinfckmjoriqxbjk.supabase.co`.
- O navegador externo encontrou a tela de Deployment Protection (`You Need Access`), mas a validação equivalente autorizada confirmou o código do banner, o texto `AMBIENTE DE HOMOLOGAÇÃO` no bundle remoto atual, `APP_ENV=staging`, `VITE_APP_ENV=staging`, `PUBLIC_APP_URL` do staging, ref Supabase staging e `/api/health` real. O gate visual fica registrado como **PASS EQUIVALENTE**, sem desligar a proteção.
- A API oficial Vercel descriptografou 27 variáveis não administrativas e confirmou `APP_ENV=staging`, `VITE_APP_ENV=staging`, `EXPECTED_SUPABASE_PROJECT_REF=hwkdwinfckmjoriqxbjk`, `VITE_EXPECTED_SUPABASE_PROJECT_REF=hwkdwinfckmjoriqxbjk`, `PUBLIC_APP_URL=https://staging.evolucaoclinica.app.br`, `VITE_SUPABASE_URL` do staging e todas as flags de integração/Clinic OFF. `SUPABASE_SERVICE_ROLE_KEY` e seu hash permanecem secrets não descriptografáveis para o token; `VITE_SUPABASE_SERVICE_ROLE_KEY` não existe.
- O `vercel env pull` oficial foi usado somente como diagnóstico: os secrets foram substituídos por `[SENSITIVE]`, o arquivo temporário foi removido imediatamente e `.env.local` não foi alterado.
- O bundle público contém o literal do ref de produção por causa da variável de guarda `VITE_PRODUCTION_SUPABASE_PROJECT_REF`; a URL efetiva de conexão e o health runtime continuam no staging. Isso não é uma credencial, mas deve ser tratado separadamente se “ref de produção ausente” significar ausência literal no bundle.
- A Management API oficial Supabase, em modo read-only, confirmou exatamente as seis tabelas públicas individuais: `professionals`, `evolution_templates`, `patients`, `evolutions`, `patient_reports` e `plans`; RLS habilitada nas seis; zero usuários Auth e zero linhas nessas tabelas; zero buckets Storage; zero secrets Vault; ausência do schema `cron`; nenhum objeto empresarial. O artefato/manifest continua identificando o baseline como `20260914-individual-core-v1`; o banco não mantém tabela de metadados desse rótulo.
- O smoke Auth/RLS não foi executado: a API Vercel não permite descriptografar a `SUPABASE_SERVICE_ROLE_KEY` sensível para o token disponível; a chave local pertence à produção e não foi usada. O conector MCP Supabase também continua sem permissão `-32600`. Nenhum usuário ou dado sintético foi criado nesta retomada.
- Na retomada final do gate, a ref `hwkdwinfckmjoriqxbjk` foi confirmada diretamente pela Management API como o projeto staging saudável. A listagem de API keys retornou somente metadados (duas legacy, uma `publishable` e uma `secret`); nenhum valor foi registrado.
- Foram tentadas somente chamadas oficiais de criação de API key temporária, com o nome solicitado e payload documentado (`type=secret`, `secret_jwt_template.role=service_role`), com e sem `reveal=true`. Todas retornaram HTTP 400; a variante de diagnóstico `publishable` também retornou HTTP 400. Não houve resposta 201, portanto nenhuma chave temporária foi criada. A confirmação posterior listou zero ocorrências dos nomes de diagnóstico e quatro chaves existentes.
- A chave `default` `secret` existente e a legacy `service_role` não foram usadas como atalho, pois não atenderiam ao requisito de credencial administrativa exclusiva e temporária. Nenhum usuário, dado sintético ou alteração de schema foi criado nesta tentativa.
- A credencial inserida em `SUPABASE_STAGING_SECRET_KEY` foi validada sem registrar seu valor e corresponde à `secret` existente com nome `default`. Ela foi recusada antes de qualquer chamada Auth/RLS; nenhuma chave, usuário ou dado foi alterado.
- Testes locais atuais: `npm run test:environment-isolation` PASS; `npm test` PASS; `npm run lint` PASS; `npm run build` PASS com aviso preexistente de chunks grandes; `git diff --check` PASS.
- Não houve redeploy de produção, promoção, alteração de DNS, alteração no GitHub ou transferência de produção.

### Acesso e transferência

- `VERCEL_SOURCE_TOKEN`: validado pela API como usuário `studio4x`, Owner do team `studio4xs-projects`.
- SOURCE real: `team_IRE2lAAPj5Ibe0OtvXlLpMBa` / `studio4xs-projects`.
- TARGET real: `team_opJQiM63Vn6P0uOe5Om8e1HD` / `evolucao-clinica`, Owner, Hobby.
- Os scopes são diferentes.
- O valor local de `VERCEL_TARGET_TEAM_ID` não coincidiu com o ID canônico; foi usado exclusivamente o ID retornado pela API.
- O TARGET estava vazio e sem conflito de nome antes do aceite.
- Staging: `POST /projects/prj_Hmm2uRREtw4qOqPf3Lhg78702hlM/transfer-request?teamId=team_IRE2lAAPj5Ibe0OtvXlLpMBa` retornou HTTP 200.
- Aceite: `PUT /projects/transfer-request/{code}?teamId=team_opJQiM63Vn6P0uOe5Om8e1HD` retornou HTTP 202.
- O código temporário não foi impresso, salvo ou documentado.
- Produção: não transferida.

### Staging pós-transferência

| Verificação | Resultado |
|---|---|
| Projeto pertence ao TARGET | **PASS**; `accountId=team_opJQiM63Vn6P0uOe5Om8e1HD` |
| Project ID | **PASS**; preservado como `prj_Hmm2uRREtw4qOqPf3Lhg78702hlM` |
| Nome | **PASS**; `evolucao-clinica-staging` |
| Environment variables | **PASS**; 29 nomes/scopes preservados, valores não registrados |
| Domínios | **PASS**; staging e `project-j4206.vercel.app` verificados |
| Deployments | **PASS**; redeploy `dpl_48CShx7gLcunfWS2g6DomUx6wAwW` Ready no TARGET, ref `feat/clinicas` |
| Supabase ref | **PASS parcial**; HTML runtime aponta para `hwkdwinfckmjoriqxbjk`; valores completos das env vars não foram descriptografados |
| Git repository no projeto | **PASS**; `link.type=github`, `org=studio4x`, `repo=evolucao-clinica` |
| Production Branch na configuração | **PASS**; `link.productionBranch=feat/clinicas` |
| Git webhook/auto-deploy | **PASS parcial**; redeploy oficial preservou ref/SHA do Git conectado |
| `/api/health` efetivo | **PASS**; `vercel curl` protegido retornou `{"status":"ok"}` |
| Banner autenticado | **PASS EQUIVALENTE**; código + texto no bundle remoto + configuração staging; proteção permaneceu ON |
| Baseline live | **PASS estrutural**; seis tabelas, RLS, zero dados, zero Storage/Vault/cron; rótulo confirmado no artefato |
| Auth/RLS sintético | **BLOQUEADO**; a criação da Secret API Key temporária pela Management API retornou HTTP 400; nenhum usuário/dado foi criado |
| Ref de produção no bundle | **REFERÊNCIA DE GUARDA — NÃO É CONEXÃO COM PRODUÇÃO**; literal presente somente na guarda Vite, conexão efetiva aponta para staging |
| Produção | **NÃO TRANSFERIDA**, conforme gate |

O redeploy pós-reconexão usou o deployment existente, sem commit ou mudança funcional artificial. O SHA do deployment é `9dbf4e66ec731e9cccc17a022f64301f7811752d`, na branch `feat/clinicas`.

### Motivo do bloqueio da produção

O Project Transfer preservou os deployments e os metadados históricos. O vínculo Git, a Production Branch, o health e a identidade staging agora estão corretos no TARGET. A produção permanece no SOURCE, intacta; o único bloqueio restante é o smoke Auth/RLS, porque a Management API rejeitou a criação da credencial temporária necessária.

### Segurança e escopo

- Nenhuma migration, SQL de escrita, Auth, RLS, Storage, Vault, cron ou dado Supabase foi alterado.
- Nenhum DNS, domínio, alias, código funcional ou configuração GitHub foi alterado automaticamente; a autorização GitHub foi feita manualmente pelo usuário.
- Nenhuma integração Marketplace, recurso pago, upgrade ou add-on foi criado.
- Nenhuma credencial ou valor de environment variable foi registrado. Nenhuma chave temporária foi criada; as quatro chaves existentes permaneceram inalteradas.
- Não houve dados reais, integrações ou smoke test parcial; nenhum dado sintético foi criado porque a credencial staging segura não estava disponível.

### Pendências da retomada

1. Ação humana necessária no Dashboard do Supabase staging: `Evolução Clínica Staging → Settings → API Keys`; criar uma Secret API Key temporária dedicada, com nome diferente de `default` (preferencialmente `staging-migration-validation-20260915`), e disponibilizá-la por canal seguro. A credencial fornecida correspondeu à chave `default` e não foi usada.
2. Executar o smoke Auth/RLS, remover os dados sintéticos e revogar a chave temporária após a validação.
3. Somente após esse gate ser revisado, avaliar a transferência da produção. A Fase 1B1 não foi retomada.

### Estado final da retomada

**STAGING VERCEL AINDA BLOQUEADO — NECESSÁRIA SECRET KEY TEMPORÁRIA DO SUPABASE STAGING**

## Histórico da primeira execução

As seções A–L abaixo preservam o relatório da primeira execução, quando a origem ainda usava apenas o token legado e nenhum projeto havia sido transferido.

## A. Acesso

| Item | Resultado |
|---|---|
| Scope origem | `studio4xs-projects` |
| Team ID origem real | `team_IRE2lAAPj5Ibe0OtvXlLpMBa` |
| Scope destino | `evolucao-clinica` |
| Team ID destino real | `team_opJQiM63Vn6P0uOe5Om8e1HD` |
| Escopos diferentes | **PASS** |
| Origem contém os projetos | **PASS**, confirmado no Dashboard e na API para produção |
| Destino identificado | **PASS**, confirmado pelo token de destino e slug |
| Conflito de nomes no destino | **PASS**, listagem do destino retornou zero projetos |
| Permissão efetiva de origem para transferir | **FAIL**, o token legado recebeu HTTP 404 ao iniciar o transfer request |
| Permissão de recebimento no destino | Owner confirmado pelo token de destino; aceite não foi tentado porque não houve código |
| Método planejado | Project Transfer nativo da Vercel |
| Método executado | Nenhum: bloqueado antes do início |

O `VERCEL_ACCESS_TOKEN` foi usado como candidato de origem. A API permitiu listar o projeto de produção, mas `GET /v2/user` retornou 404, `GET /v2/teams` retornou 403 e o projeto staging retornou 404. O Dashboard autenticado como `studio4x` confirmou o team de origem e ambos os projetos.

O token de destino autenticou a conta `evolucaoclinicaapp` e resolveu o team `evolucao-clinica` como Owner, no plano Hobby. Nenhum token ou valor de secret foi impresso.

## B. Staging

| Item | Origem / resultado |
|---|---|
| Nome | `evolucao-clinica-staging` |
| Project ID antes | `prj_Hmm2uRREtw4qOqPf3Lhg78702hlM` |
| Project ID depois | Não aplicável: não transferido |
| Scope atual | `studio4xs-projects` |
| Git | `studio4x/evolucao-clinica`, conectado |
| Production Branch | `feat/clinicas` |
| Checkpoint | deployment Ready em `40bd76a` |
| Framework | Vite |
| Node | 24.x, conforme configuração exibida |
| Domínio | `staging.evolucaoclinica.app.br`, Valid Configuration |
| Domínio alternativo | `project-j4206.vercel.app`, Valid Configuration |
| HTTPS | Dashboard válido; resposta pública HTTP 200 |
| Deployment Protection | configuração existente no projeto; a resposta pública sem sessão é a página de autenticação Vercel |
| Environment variables | 28 nomes, somente Production, valores não registrados |
| Supabase esperado | `hwkdwinfckmjoriqxbjk` |
| Deployment | Ready em `40bd76a`; deployment controlado já existente antes desta execução |
| Integrações | nenhuma instalada no Dashboard |
| Cron Vercel | nenhum job exibido |
| Web Analytics | não habilitado no overview |
| Speed Insights | sem upgrade/habilitação adicional observada |
| Transferido | **não** |

O endpoint público `/api/health` do staging devolveu HTTP 200 com HTML da autenticação da Vercel, e não o JSON da aplicação. Por isso, health efetivo, banner, ref Supabase, Auth/RLS e isolamento pós-transferência não foram declarados como validados.

## C. Produção

| Item | Origem / resultado |
|---|---|
| Nome | `evolucao-clinica` |
| Project ID antes | `prj_Ch3PtwRA03Ah1S8JSUqoCdxH4gCT` |
| Project ID depois | Não aplicável: não transferido |
| Scope atual | `studio4xs-projects` / `team_IRE2lAAPj5Ibe0OtvXlLpMBa` |
| Git | `studio4x/evolucao-clinica`, conectado |
| Production Branch | `main` |
| Framework | Vite |
| Node | 24.x |
| Região de função | `iad1` |
| Environment variables | 65 registros; nomes e scopes inventariados, valores não registrados |
| Deployment atual Ready/Promoted | `dpl_56tNv8NQHhP4g58F2Ra2DasKJfSY` |
| Commit atual | `d174cec66672354955f0a529aa07152f8e0e7c30` em `main` |
| Domínios | `evolucaoclinica.app.br`, `www.evolucaoclinica.app.br`, `evolucao-clinica-five.vercel.app` |
| HTTPS / health | **PASS**; `/api/health` respondeu `{"status":"ok"}` e a home respondeu HTTP 200 |
| Preview deployments | desabilitados na configuração observada |
| Speed Insights | habilitado com dados existentes; nenhuma alteração feita |
| Transferido | **não** |

## Inventário técnico e matriz de transferência

| Configuração | Origem staging | Origem produção | Transferível automaticamente? | Validação pós-transferência |
|---|---|---|---|---|
| Project ID/nome | confirmado no Dashboard | confirmado pela API/Dashboard | Sim, preservando ID quando suportado | Não executada |
| Git repository | `studio4x/evolucao-clinica` | `studio4x/evolucao-clinica` | Sim | Staging e produção confirmados antes |
| Production Branch | `feat/clinicas` | `main` | Sim | Não executada |
| Framework/root/build | Vite; root/build padrão | Vite; root/build padrão | Sim | Não executada |
| Node/function region | Node 24.x; região não alterada | Node 24.x; `iad1` | Sim | Não executada |
| Environment variables | 28, Production | 65, scopes preservados na origem | Project vars são copiadas; `vercel.json` `env`/`build.env` exigem tratamento separado | Não executada |
| Domínios e aliases | 2 domínios válidos | 3 domínios/aliases de produção | Sim, por delegação nativa | Não executada |
| Deployment Protection | proteção existente; autenticação observada no acesso público | inventário pós-transferência não iniciado | Configuração do projeto | Não executada |
| Cron Jobs Vercel | nenhum exibido | não transferido/inventariado como execução | Sim quando configurado | Não executada |
| Web Analytics | não habilitado | não alterado | Sim quando configurado | Não executada |
| Speed Insights | não habilitado adicionalmente | habilitado com dados | Sim, conforme Project Transfer | Não executada |
| Integrações Marketplace | nenhuma instalada no staging | nenhuma reconstrução executada | Não; requer reconexão/transferência própria | Não executada |
| Edge Config/Global Config | não identificado | não identificado | Não; mecanismo separado | Não executada |
| Vercel Blob | não identificado | não identificado | Não; mecanismo separado | Não executada |
| Monitoring/logs | dados não migrados | dados não migrados | Não | Não executada |
| Custom Log Drains | não identificado | não identificado | Não | Não executada |
| Recursos team-level/shared vars | não confirmados como dependência | não confirmados como dependência | Não necessariamente | Bloqueio mantido antes da transferência |

## D. Recursos não transferidos

Como nenhum Project Transfer foi concluído, nenhum recurso foi movido. Para um futuro transfer nativo, a documentação oficial da Vercel indica que os itens abaixo não acompanham automaticamente o projeto e devem ser tratados separadamente, se existirem:

- integrações Marketplace;
- Edge Configs/Global Configs;
- dados de uso;
- seção Active Branches;
- variáveis definidas em `env` ou `build.env` do `vercel.json`;
- dados de Monitoring;
- logs de runtime e build;
- Custom Log Drains;
- Vercel Blob;
- Secure Compute, Static IPs, Sandboxes e Snapshots.

No staging, o Dashboard confirmou **nenhuma integração instalada** e não exibiu cron jobs. Não foi feita reconstrução nem criação paga.

## E. Integrações

| Projeto | Antes | Depois | Ação |
|---|---|---|---|
| Staging | nenhuma integração instalada | inalterado | nenhuma |
| Produção | transferência não iniciada; inventário de Marketplace não concluído | inalterado | nenhuma |
| Supabase | associação permanece fora do escopo Vercel | inalterado | nenhuma |

## F. DNS

Não houve alteração de DNS, Cloudflare, aliases ou registros externos. Os domínios permaneceram nos projetos de origem.

## G. Billing

Nenhum upgrade, add-on, método de pagamento, feature paga ou cobrança foi solicitado. Origem e destino foram observados no plano Hobby. O team de origem exibe uso excedido de Functions Storage no Dashboard; isso não foi alterado nem usado como motivo para upgrade.

## H. Segurança

```text
secrets expostos = não
cross-environment = não
Supabase staging alterado = não
Supabase produção alterado = não
dados reais utilizados = não
```

Não foram feitas chamadas de escrita ao Supabase. O conector MCP Supabase estava indisponível por erro de permissão `-32600`; isso impediu uma nova consulta remota, mas não causou alteração. Não foram criados usuários ou dados sintéticos nesta execução.

## I. Git

```text
produção = main
staging = feat/clinicas
```

O HEAD local permaneceu em `feat/clinicas` no checkpoint `40bd76a`, alinhado a `origin/feat/clinicas`. Não houve merge, reset ou alteração funcional.

O deployment de produção observado na origem continua em `main`, commit `d174cec66672354955f0a529aa07152f8e0e7c30`. O deployment de staging observado no Dashboard corresponde ao checkpoint `40bd76a`.

## J. Testes

| Teste | Staging | Produção | Resultado |
|---|---|---|---|
| Health | HTTP 200, mas página de autenticação Vercel; JSON da app não comprovado | `{"status":"ok"}` | Staging não comprovado; produção PASS |
| Domínio/HTTPS | Valid Configuration no Dashboard; HTTP 200 | domínios verificados; HTTP 200 | PASS pré-migração |
| Build | deployment Ready em `40bd76a`; build local PASS | deployment Ready/Promoted | PASS pré-migração |
| Git deployment | `studio4x/evolucao-clinica`, `feat/clinicas`, Ready | `studio4x/evolucao-clinica`, `main`, Ready | PASS pré-migração |
| Supabase ref | esperado `hwkdwinfckmjoriqxbjk`; pós-transferência não aplicável | esperado `kvxboovgrrhhttaqinld`; pós-transferência não aplicável | sem regressão observada; pós-check não executado |
| Environment isolation | `npm run test:environment-isolation` PASS | não aplicável ao transfer | PASS local |
| Auth | baseline anterior documenta PASS; não repetido | não executado | pré-migração |
| RLS staging | baseline anterior documenta PASS; não repetido | não executado | pré-migração |
| Integrações OFF | nomes/flags deny-by-default presentes; valores não expostos | não alterado | staging pré-migração |
| Feature flag Clínica | baseline anterior documenta OFF | não alterado | staging pré-migração |
| `npm test` | PASS | PASS | PASS |
| `npm run lint` | PASS | PASS | PASS |
| `npm run build` | PASS, com aviso preexistente de chunks grandes | PASS local | PASS |
| `git diff --check` | PASS | PASS | PASS |

Os testes de código foram executados no checkpoint local. Nenhum teste pós-transferência foi declarado porque nenhuma transferência ocorreu.

## K. Pendências concretas

1. Disponibilizar um token Owner real do scope `studio4xs-projects` com permissão de Project Transfer, ou conceder ao login Owner da origem acesso ao team destino para que ele apareça no fluxo oficial.
2. Repetir o gate de permissões pela API e criar o transfer request nativo do staging.
3. Aceitar o código do transfer request com o token Owner do team `evolucao-clinica`, caso a Vercel mantenha o fluxo request/accept.
4. Validar integralmente o staging após a transferência e somente então decidir sobre a produção.

Não há pendência de DNS, código, Supabase, migrations, baseline, Fase 1B1 ou upgrade de plano.

## L. Estado final — histórico da primeira execução

**MIGRAÇÃO VERCEL BLOQUEADA**

A execução termina aqui. A Fase 1B1 não foi retomada.

## Referências

- [Vercel — Transferring a project](https://vercel.com/docs/projects/transferring-projects)
- [Vercel — Deploying Git repositories / Production Branch](https://vercel.com/docs/git)
- [Vercel REST API — Create project transfer request](https://vercel.com/docs/rest-api/projects/create-project-transfer-request)
- [Vercel REST API — Accept project transfer request](https://vercel.com/docs/rest-api/projects/accept-project-transfer-request)

## Estado final atual

**STAGING VERCEL AINDA BLOQUEADO**
