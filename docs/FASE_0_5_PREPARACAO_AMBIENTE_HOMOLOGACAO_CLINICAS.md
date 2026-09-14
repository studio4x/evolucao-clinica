# Fase 0.5 — Preparação segura do ambiente de homologação do Plano Clínica

**Status:** Fase 0.5 operacionalmente concluída; Fase 1 ainda não iniciada

**Data da auditoria:** 14/09/2026

**Base aprovada:** `9497a14cc54bff693a35acc7d503bc93bbfa63ca`

**Escopo:** ambientes, variáveis, integrações, fail-fast, guardas e pré-requisitos da futura branch `feat/clinicas`

**Fora do escopo:** Fase 1, migrations empresariais, tabelas de organizações, RLS empresarial, cobrança do Plano Clínica, compartilhamento de pacientes e qualquer alteração no Supabase de produção

## Atualização final — 14/09/2026

O Supabase staging foi provisionado no projeto `hwkdwinfckmjoriqxbjk`, as credenciais exclusivas foram configuradas no projeto Vercel `evolucao-clinica-staging` e o primeiro deployment isolado foi validado. O banner, `/api/health`, identidade `staging`, ref efetivo e ausência de service role no DOM foram confirmados. Os cenários fail-fast, o bloqueio deny-by-default das integrações e o inventário somente leitura do Supabase de produção foram concluídos. O inventário detalhado está em [INVENTARIO_SUPABASE_PRODUCAO_PRE_CLINICAS.md](./INVENTARIO_SUPABASE_PRODUCAO_PRE_CLINICAS.md).

Nenhuma migration, alteração de schema, dado, Auth, Storage, Vault, Edge Function ou cron de produção foi executada. Não foi identificado P0; os riscos P1/P2 registrados no inventário continuam sendo pré-requisitos de desenho e revisão antes da Fase 1.

Os blocos de diagnóstico abaixo preservam o histórico da preparação e dos riscos encontrados antes do provisionamento. Para o estado atual, prevalecem esta atualização final e o inventário somente leitura vinculado acima.

## Conclusão executiva

A branch `feat/clinicas` **não deve ser publicada ainda**. O hardening de código foi implementado, as novas variáveis obrigatórias foram cadastradas no escopo Production e a criação automática de Previews foi desativada no projeto Vercel público sem alterar a branch de produção `main`.

O Supabase staging não foi criado porque a organização já possui dois projetos e a API administrativa não informa o plano financeiro. A página de cobrança exige uma sessão interativa autenticada. Pela [tabela oficial de preços do Supabase](https://supabase.com/pricing), projetos adicionais em plano pago partem de US$ 10 por mês; portanto, a criação foi interrompida antes de qualquer possível cobrança.

O projeto Vercel `evolucao-clinica-staging` foi criado posteriormente pela sessão autenticada do painel, depois que o token de API restrito ao projeto de produção retornou HTTP 403. O projeto permanece sem vínculo Git e sem deployment. Foram cadastradas apenas configurações não sensíveis e deny-by-default; nenhuma credencial Supabase foi reutilizada. A autenticação da Vercel protege **todos os deployments** do projeto.

O domínio `staging.evolucaoclinica.app.br` foi associado ao ambiente Production desse projeto, mas continua com `Invalid Configuration` até a criação externa do CNAME `staging` apontando para `fe82ddbba431ebd2.vercel-dns-017.com.` com proxy desativado. Nenhuma migration, alteração de schema ou mudança de dados foi executada no Supabase.

## Atualização operacional da Fase 0.5B

### Recursos externos

| Recurso | Resultado em 14/09/2026 | Estado seguro |
|---|---|---|
| Supabase staging | Não criado; possível custo adicional de US$ 10/mês exige confirmação do plano/cobrança | Produção intocada; nenhum projeto ou dado copiado |
| Vercel staging | Criado como `evolucao-clinica-staging` (`prj_Hmm2uRREtw4qOqPf3Lhg78702hlM`), sem Git e sem deployment | Vercel Authentication em `All Deployments`; nenhuma credencial Supabase cadastrada |
| Vercel Production | `previewDeploymentsDisabled=true`; branch de produção permanece `main` | A futura `feat/clinicas` não gera Preview neste projeto |
| Variáveis Production | Núcleo Supabase/URL reaplicado a partir das credenciais locais validadas; 25 novas variáveis/flags verificadas no escopo Production | Valores permanecem protegidos e não foram documentados |
| Variáveis Vercel staging | 23 configurações não sensíveis no escopo Production do projeto; identidade `staging`, origem prevista e todas as integrações/feature flags desligadas | Faltam intencionalmente URL, anon key, service role, ref esperada e fingerprint do Supabase staging |
| Domínio de staging | Associado ao projeto, aguardando CNAME externo `staging` → `fe82ddbba431ebd2.vercel-dns-017.com.` com proxy desativado | Domínio público de produção não foi alterado; não há conteúdo publicado |
| Capacidade Vercel | Time no plano Hobby sinaliza recursos gratuitos excedidos; Functions Storage mostrava 50,63 GB usados de 10 GB | Nenhum primeiro deployment foi tentado; eventual upgrade ou cobrança depende de aprovação explícita |

### Hardening implementado

- `APP_ENV` e `VITE_APP_ENV` identificam explicitamente o ambiente;
- URL, chave e `EXPECTED_SUPABASE_PROJECT_REF` são obrigatórios e validados antes da inicialização;
- staging recusa o project ref e a origem pública de produção;
- o cliente e o backend não possuem mais fallback para URL ou anon key de produção;
- `CRON_SECRET` e `WHATSAPP_OTP_SECRET` não são mais derivados de credenciais sem relação;
- flags de integrações usam comparação explícita com `true`; ausência equivale a bloqueio;
- WhatsApp, e-mail, push, n8n, lotes, lifecycle, cron, Gemini, Analytics, Meta, billing e Google possuem guardas em seus pontos de efeito;
- Stripe Live e origem de produção são recusados pelo código compartilhado de billing quando `APP_ENV=staging`;
- o bundle de staging exibirá o banner persistente `AMBIENTE DE HOMOLOGAÇÃO`;
- `VITE_CLINIC_FEATURE_ENABLED` e `CLINIC_FEATURE_ENABLED` permanecem `false` por padrão.

### Gates que continuam fechados

1. confirmar no painel autenticado do Supabase se um terceiro projeto está incluído ou aprovar o custo de US$ 10/mês;
2. criar o Supabase staging vazio e cadastrar exclusivamente suas credenciais no projeto Vercel staging;
3. publicar o CNAME externo do domínio de homologação;
4. confirmar capacidade gratuita disponível na Vercel ou aprovar conscientemente qualquer alteração de plano antes do primeiro deployment;
5. executar o primeiro deployment, validar proteção, banner, logs e negações de integração;
6. somente então realizar o inventário read-only do banco de produção;
7. criar `feat/clinicas` apenas após todos esses gates.

---

As seções A a G abaixo preservam o diagnóstico-base do commit `d2c8afc`. Em caso de divergência de estado, a atualização operacional acima prevalece.

## A. Riscos encontrados

### A.1 Bloqueadores críticos

| Arquivo ou configuração | Comportamento atual | Risco | Prioridade |
|---|---|---|---:|
| `src/supabaseClient.ts` | Quando `VITE_SUPABASE_URL` está ausente, usa a URL do projeto de produção. Quando `VITE_SUPABASE_ANON_KEY` está ausente, decodifica uma anon key embutida no bundle. | Preview ou staging incompleto conecta silenciosamente ao Auth, Database, Realtime e Storage de produção. A anon key é pública, mas o fallback para o ambiente incorreto é crítico. | P0 |
| `server.ts` | Quando `VITE_SUPABASE_URL` está ausente, usa a URL de produção; exige apenas que alguma `SUPABASE_SERVICE_ROLE_KEY` esteja presente. | Uma service role de produção combinada com o fallback permite operações administrativas reais a partir de Preview. | P0 |
| Vercel, projeto atual | Vinte variáveis possuem o mesmo registro para `preview` e `production`, sem `gitBranch`: batch webhook/token, Firebase Admin, duas chaves Gemini, n8n, `NODE_ENV`, Google Picker e diversas configurações WhatsApp. | Qualquer Preview pode chamar provedores, consumir quota ou enviar mensagens reais. | P0 |
| Vercel, projeto atual | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` existem em Preview e produção em registros separados, mas os valores são write-only e não puderam ser comparados. | Não é possível provar que Preview aponta para outro projeto. A existência de registros separados não prova que os valores sejam diferentes. | P0 |
| Vercel/Git | Uma publicação de branch não principal normalmente cria Preview automaticamente. | Publicar `feat/clinicas` antes do isolamento pode iniciar a aplicação com as configurações atuais. | P0 |
| `server.ts` + tabela `settings` | E-mail/Brevo, VAPID, push, tracking, Gemini, pagamentos e lifecycle usam configurações persistidas no banco. | Se Preview alcançar o Supabase de produção, variáveis Vercel vazias não impedem os efeitos: a própria configuração real pode ser carregada da tabela `settings`. | P0 |
| `supabase/functions/_shared/billing.ts` | O ambiente financeiro pode ser lido de `settings.payment_settings`; `APP_ORIGIN` cai no domínio público. | Preview ligada ao Supabase de produção pode invocar Edge Functions reais e, se o ambiente salvo for `PRODUCTION`, alcançar Stripe Live. | P0 |
| Migrations de cron | Há jobs históricos com URL pública direta e jobs posteriores baseados em `vault.decrypted_secrets`. | Reproduzir migrations em staging pode agendar chamadas para produção ou n8n real. | P0 |

### A.2 Riscos altos

| Arquivo ou configuração | Comportamento atual | Risco | Prioridade |
|---|---|---|---:|
| `server.ts` | `PUBLIC_APP_URL` ausente vira o domínio de produção. A origem é usada em lifecycle, e-mails, push e links gerados. | Links emitidos por staging apontam para produção; jobs podem chamar a origem errada. | P1 |
| `server.ts` | `CRON_SECRET` ausente é derivado de service role, anon key e origem. | Segredo operacional não é independente, pode coincidir entre ambientes e reutiliza material de credencial de banco. | P1 |
| `server/whatsapp/whatsappOtp.ts` | `WHATSAPP_OTP_SECRET` ausente cai em `WHATSAPP_APP_SECRET` ou `WHATSAPP_ACCESS_TOKEN`. | Preview e produção podem compartilhar a mesma chave de OTP e o mesmo token de envio. | P1 |
| `server/whatsapp/whatsappClient.ts` e rotas de envio | Não existe uma chave global de `WHATSAPP_SEND_ENABLED`; a presença de token e phone number permite envio quando uma rota autorizada é acionada. | Staging pode enviar para destinatários reais. | P1 |
| `server.ts` | Firebase Admin é inicializado sempre que `FIREBASE_SERVICE_ACCOUNT_JSON` está presente. | Credencial hoje compartilhada com Preview pode enviar push real e consumir o mesmo projeto Firebase. | P1 |
| `server.ts` | Gemini usa chave do banco ou das variáveis e não possui guarda por ambiente. | Custo real e processamento indevido de dados caso staging use configuração real. | P1 |
| `api/campaign-dashboard.ts` e `api/campaign-dispatch.ts` | Webhook e token de disparo em lote existem no mesmo registro de Preview e produção. | Ação administrativa em Preview pode atingir o fluxo n8n real. | P1 |
| `server.ts` e módulos n8n | URLs e tokens n8n estão disponíveis em Preview; `.env.example` contém URLs operacionais reais como exemplo. | Cópia de ambiente ou acionamento manual pode executar automações reais. | P1 |
| `src/services/analytics.ts` e Edge Functions de analytics/Meta | O frontend pode carregar IDs da tabela `settings`; não há bloqueio por `APP_ENV`. | Preview pode poluir GA4, GTM e Meta, apesar das guardas de consentimento. | P1 |
| `supabase/functions/_shared/metaDelivery.ts` e `_shared/analyticsDelivery.ts` | Tokens server-side vêm de Supabase Secrets e as filas vêm do banco. | Se funções/configurações de produção forem reutilizadas, eventos podem ser enviados a propriedades reais. | P1 |
| `server.ts`, serviços de frontend e Storage | Buckets `brand`, `notifications`, `support_attachments` e `temp-audio` seguem o projeto Supabase configurado. | Preview ligada a produção pode ler, gravar ou remover objetos reais. | P1 |
| Google Auth/Drive/Docs/Calendar | OAuth usa a origem atual para web, mas o provider pertence ao Supabase configurado; APIs usam tokens concedidos pelo usuário. | Preview ligada a Auth de produção ou testada com conta pessoal pode acessar Drive/Docs/Agenda reais. | P1 |

### A.3 Riscos médios e dívida de configuração

| Arquivo ou configuração | Comportamento atual | Risco | Prioridade |
|---|---|---|---:|
| `src/pages/AdminPanel.tsx` | Exibe URL de webhook Stripe usando o Supabase de produção como fallback. | Operador pode cadastrar ou copiar o endpoint errado. | P2 |
| `server/whatsapp/journeyPublications.ts` | Normaliza origem com fallback público de produção. | Conteúdo e links de staging podem atravessar para produção. | P2 |
| `scripts/journey-whatsapp-smoke-test.ts` | Sem `PUBLIC_APP_URL`, testa o domínio público. | Execução local incompleta pode atingir endpoints reais. | P2 |
| `src/utils/professionalFunnelMessages.ts` e `src/pages/PublicJourneyIndex.tsx` | Links comerciais usam a origem pública fixa. | Em staging, CTAs podem levar ao ambiente real. | P2 |
| `.env.example` | Não declara `VITE_SUPABASE_ANON_KEY`, `APP_ENV` nem guardas outbound; contém URLs n8n reais e origens de produção. | Facilita uma configuração incompleta ou perigosa por cópia. | P2 |
| `supabase/config.toml` | Arquivo não existe. | Auth, redirects, funções e configurações de ambientes não têm inventário declarativo no repositório. | P2 |
| Proteção da Vercel | A consulta de variáveis funcionou, mas a inspeção de proteção/branch do projeto retornou 404 com o token disponível. | Não foi possível comprovar proteção de acesso nem a política exata de branch pela API. | P2 |
| `NODE_ENV` | Está no mesmo registro remoto para Development, Preview e Production. | `NODE_ENV` não identifica staging de forma confiável e não deve ser a fonte de verdade do ambiente. | P2 |

### A.4 Hardcodes legítimos ou aceitáveis no escopo atual

| Local | Classificação | Condição |
|---|---|---|
| `twa-manifest.json`, `app/build.gradle`, launcher e recursos Android | Valor de produção legítimo | O TWA publicado deve continuar apontando ao domínio público. Não será usado para homologação inicial. |
| `public/robots.txt`, `public/sitemap.xml`, metadados canônicos e links institucionais | Configuração pública de produção | Não é segredo. Deve ser neutralizada ou gerar `noindex` no projeto staging, mas não conecta ao banco. |
| `VITE_SUPABASE_ANON_KEY` | Credencial pública | Pode existir no bundle. O problema é pertencer ao projeto errado ou existir como fallback silencioso. |
| `SUPABASE_SERVICE_ROLE_KEY`, tokens Stripe, WhatsApp, n8n, Firebase Admin, GA4 API secret e Meta CAPI | Segredo | Nunca usar prefixo `VITE_`, nunca registrar valor em documentação/log e nunca compartilhar entre ambientes. |

---

## B. Variáveis de produção

### B.1 Núcleo que deverá ser obrigatório antes de remover fallbacks

| Variável | Camada | Finalidade | Estado observado |
|---|---|---|---|
| `APP_ENV=production` | backend | Fonte de verdade do ambiente | Proposta; ainda ausente |
| `VITE_APP_ENV=production` | build/frontend | Espelho público validado de `APP_ENV` | Proposta; ainda ausente |
| `PUBLIC_APP_URL` | backend | Origem canônica de links e callbacks | Nome presente em Production |
| `VITE_SUPABASE_URL` | frontend/backend atual | URL do Supabase de produção | Nome presente em Production |
| `VITE_SUPABASE_ANON_KEY` | frontend | Chave pública do projeto de produção | Nome presente em Production |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Cliente administrativo server-side | Nome presente em Production |
| `EXPECTED_SUPABASE_PROJECT_REF` | backend/build | Confirmar que a URL pertence ao projeto esperado | Proposta; ausente |
| `SUPABASE_SERVICE_ROLE_KEY_SHA256` | backend | Fingerprint esperado, sem registrar a chave | Proposta; ausente |
| `CRON_SECRET` | backend | Autorização independente dos endpoints cron | Nome presente somente em Production |

Antes da mudança de código, os valores devem ser validados dentro de uma execução de produção controlada, sem imprimi-los. A auditoria confirmou os nomes, não os valores.

### B.2 Variáveis condicionais por integração ativa

#### Banco e operação

- `DATABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_DATABASE_URL`, `POSTGRES_URL` ou `POSTGRES_PRISMA_URL`: somente quando o reload direto do schema for necessário.
- `VERCEL_PRODUCTION_URL`: metadado de domínio; não substitui `PUBLIC_APP_URL`.

#### Gemini

- `GEMINI_API_KEY_REAL` ou `GEMINI_API_KEY`.

#### WhatsApp

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_OTP_SECRET`
- `WHATSAPP_AUTH_TEMPLATE`
- `WHATSAPP_AUTH_TEMPLATE_LANGUAGE`
- `WHATSAPP_N8N_EVENTS_TOKEN`
- `WHATSAPP_OPT_OUT_WEBHOOK_TOKEN`
- `WHATSAPP_USER_LOOKUP_TOKEN`
- `WHATSAPP_JOURNEY_PUBLICATION_TOKEN`
- `WHATSAPP_JOURNEY_DEFAULT_DESTINATION_KEY`
- `WHATSAPP_TEMPLATE_ACCOUNT_ACCESS`
- `WHATSAPP_TEMPLATE_SUPPORT_UPDATE`
- `WHATSAPP_TEMPLATE_SUBSCRIPTION_UPDATE`
- `WHATSAPP_TEMPLATE_PAYMENT_UPDATE`
- `WHATSAPP_TEMPLATE_SECURITY_NOTICE`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- `WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS=false`

`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_OTP_SECRET` não apareceram na listagem Vercel de Production. É necessário confirmar se esses valores estão em outra camada; nenhum fallback deve ser considerado substituto seguro.

#### n8n e lotes

- `N8N_JOURNEY_GROUP_CHECK_WEBHOOK_URL`
- `N8N_JOURNEY_GROUP_CHECK_TOKEN`
- `EVOLUCAO_CLINICA_BATCH_DISPATCH_WEBHOOK_URL`
- `EVOLUCAO_CLINICA_BATCH_DISPATCH_TOKEN`

#### Push

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- Configuração VAPID persistida em `settings.notification_settings`, enquanto esse modelo existir.

#### Analytics

- `VITE_GTM_ID`
- `VITE_GA_MEASUREMENT_ID`
- `VITE_ANALYTICS_DIRECT_GA4`
- IDs públicos persistidos em `settings.tracking_settings`, enquanto esse modelo existir.

#### Lifecycle

- `LIFECYCLE_SEND_ENABLED`
- `LIFECYCLE_DRY_RUN`
- `LIFECYCLE_GLOBAL_OUTAGE`
- `LIFECYCLE_FAILURE_ALERT_THRESHOLD`
- `LIFECYCLE_FAILURE_ALERT_COOLDOWN_MINUTES`

O banco também pode substituir essas opções em `settings.lifecycle_config`; por isso, a separação do Supabase é obrigatória.

### B.3 Supabase Edge Functions e Vault de produção

Essas variáveis não pertencem à Vercel e devem ser auditadas no projeto Supabase correto:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ORIGIN`
- `PAYMENT_ENVIRONMENT=PRODUCTION`
- `STRIPE_SECRET_KEY_PROD`
- `STRIPE_PUBLISHABLE_KEY_PROD`
- `STRIPE_WEBHOOK_SECRET_PROD`
- `STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_PROD`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_RTDN_AUDIENCE`
- `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`
- `GA4_MEASUREMENT_ID`
- `GA4_API_SECRET`
- `ANALYTICS_MEASUREMENT_ENV=production`
- `ANALYTICS_DELIVERY_CRON_TOKEN`
- `META_CAPI_TOKEN`
- secrets Vault usados por cron: `lifecycle_origin`, `lifecycle_cron_secret`, `journey_n8n_webhook_url`, `journey_n8n_webhook_token`, `analytics_delivery_retry_url` e `analytics_delivery_cron_token`.

---

## C. Variáveis de staging

As variáveis abaixo são a matriz desejada; nomes marcados como **propostos** ainda exigem implementação.

### C.1 Identidade e banco — obrigatórias

| Variável | Valor lógico | Finalidade |
|---|---|---|
| `APP_ENV` | `staging` | Identidade canônica server-side. Não inferir por hostname ou `NODE_ENV`. |
| `VITE_APP_ENV` | `staging` | Identidade pública do bundle; deve concordar com `APP_ENV`. |
| `PUBLIC_APP_URL` | domínio exclusivo de homologação | Links e callbacks nunca apontam para produção. |
| `VITE_SUPABASE_URL` | URL do projeto staging | Auth, Database, Realtime e Storage isolados. |
| `VITE_SUPABASE_ANON_KEY` | chave pública do projeto staging | Não reutilizar a anon key de produção. |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do projeto staging | Somente backend; nunca prefixar com `VITE_`. |
| `EXPECTED_SUPABASE_PROJECT_REF` | ref pública do staging | Validar o hostname do Supabase. **Proposta.** |
| `FORBIDDEN_SUPABASE_PROJECT_REF` | ref pública de produção | Staging falha se detectar a ref proibida. **Proposta.** |
| `SUPABASE_SERVICE_ROLE_KEY_SHA256` | fingerprint da chave staging | Validar associação da credencial sem logar a chave. **Proposta.** |
| `FORBIDDEN_SERVICE_ROLE_KEY_SHA256` | fingerprint da chave de produção | Staging falha se a credencial proibida aparecer. **Proposta; armazenar como sensitive.** |
| `CRON_SECRET` | segredo novo e exclusivo | Mesmo com jobs desabilitados, nunca derivar de outras chaves. |

### C.2 Guardas outbound — deny-by-default

| Variável proposta | Valor inicial | Finalidade |
|---|---|---|
| `EMAIL_SEND_ENABLED` | `false` | Bloqueia qualquer envio Brevo/SMTP. |
| `WHATSAPP_SEND_ENABLED` | `false` | Bloqueia texto, template, OTP e jornadas. |
| `PUSH_SEND_ENABLED` | `false` | Bloqueia Web Push e Firebase. |
| `N8N_CALLS_ENABLED` | `false` | Bloqueia chamadas a webhooks n8n. |
| `BATCH_DISPATCH_ENABLED` | `false` | Bloqueia disparos de captação. |
| `GEMINI_ENABLED` | `false` | Bloqueia consumo de IA até haver chave de teste. |
| `ANALYTICS_SEND_ENABLED` | `false` | Bloqueia GTM, GA4 e delivery server-side. |
| `META_DELIVERY_ENABLED` | `false` | Bloqueia Pixel/CAPI no ambiente de teste. |
| `CRON_JOBS_ENABLED` | `false` | Recusa execução de jobs e schedulers. |
| `BILLING_ENABLED` | `false` | Bloqueia checkout até Stripe Test estar pronto. |
| `GOOGLE_INTEGRATIONS_ENABLED` | `false` | Bloqueia OAuth incremental/Drive/Docs/Agenda até o cliente staging estar pronto. |

Uma variável global como `OUTBOUND_INTEGRATIONS_ENABLED=false` pode funcionar como kill switch adicional, mas não substitui guardas granulares.

### C.3 Allowlists de homologação

| Variável proposta | Uso |
|---|---|
| `STAGING_ALLOWED_EMAIL_RECIPIENTS` | E-mails autorizados, normalizados e validados no servidor. |
| `STAGING_ALLOWED_WHATSAPP_RECIPIENTS` | Telefones de teste autorizados. |
| `STAGING_ALLOWED_PUSH_USER_IDS` | IDs de usuários sintéticos que podem receber push. |
| `STAGING_ALLOWED_WEBHOOK_HOSTS` | Hosts de automação exclusivamente de teste. |
| `STAGING_ALLOWED_GOOGLE_ACCOUNTS` | Contas Google sintéticas autorizadas para homologação. |

Nenhuma allowlist deve ser aplicada apenas no frontend.

### C.4 Stripe Test e Supabase Edge Functions de staging

- `PAYMENT_ENVIRONMENT=TEST`
- `APP_ORIGIN` com o domínio de staging, obrigatório e sem fallback
- `STRIPE_SECRET_KEY_TEST`
- `STRIPE_PUBLISHABLE_KEY_TEST`
- `STRIPE_WEBHOOK_SECRET_TEST`
- `STRIPE_SUBSCRIPTIONS_PAYMENT_METHOD_CONFIGURATION_ID_TEST`, se usado
- `ANALYTICS_MEASUREMENT_ENV=staging`
- `ANALYTICS_DELIVERY_CRON_TOKEN`, somente se a integração de teste for habilitada
- `GOOGLE_PLAY_*`: ausentes/desabilitadas na homologação web inicial
- `META_CAPI_TOKEN`: ausente enquanto Meta estiver desabilitado

Nenhuma variável `STRIPE_*_PROD` deve existir no Supabase staging. Uma chave que comece como Stripe Live deve causar erro de inicialização/uso quando `APP_ENV=staging`.

---

## Matriz de ambientes e integrações

| Camada | Produção | Homologação Plano Clínica |
|---|---|---|
| Domínio | `www.evolucaoclinica.app.br` | domínio/subdomínio exclusivo, ainda a definir |
| Vercel | projeto atual | projeto separado e protegido; branch de produção `feat/clinicas` somente depois das guardas |
| Supabase | projeto atual | projeto separado, vazio de dados reais |
| Auth/OAuth | provider atual e redirects públicos | provider/client staging, redirects apenas do domínio staging |
| Database | dados reais | schema compatível + dados sintéticos |
| Storage | buckets reais | buckets próprios e objetos sintéticos |
| Stripe | Live Mode | inicialmente desligado; depois Test Mode |
| APIs server-side | integrações reais conforme configuração | guardas por `APP_ENV`, credenciais staging e deny-by-default |
| E-mail | Brevo/configuração real | desabilitado; depois allowlist de caixas de teste |
| WhatsApp | WABA/número real | desabilitado; depois número/conta de teste e allowlist |
| n8n | webhooks operacionais | desabilitado; depois workflows/URLs próprios de teste |
| Push | Firebase/VAPID reais | desabilitado; projeto e chaves próprias somente se necessário |
| Gemini | chave/configuração real | mock/desabilitado; depois chave de quota controlada |
| Analytics/Meta | propriedades reais com consentimento | desabilitado; depois propriedade/dataset separado |
| Cron/jobs | jobs reais | nenhum job agendado por padrão |
| Android/TWA | wrapper público atual | fora da Fase 0.5; teste inicial apenas no navegador |

### Classificação inicial das integrações em staging

| Integração | Estado inicial | Condição para habilitar |
|---|---|---|
| Supabase Auth/Database/Realtime | Habilitada | Somente projeto staging e usuários sintéticos. |
| Supabase Storage | Habilitada | Somente buckets staging e objetos sintéticos. |
| Stripe | Test Mode | Produto/preços/webhook Test exclusivos e guarda contra Live. |
| Google login | Requer configuração | OAuth staging + redirects autorizados + contas sintéticas. |
| Google Drive/Docs/Calendar | Desabilitada | Habilitar apenas com contas sintéticas e cliente staging. |
| Gemini | Mock/desabilitada | Chave de teste/quota controlada e conteúdo sintético. |
| E-mail | Desabilitada | Guard server-side + allowlist + configuração de teste. |
| WhatsApp/OTP/jornada | Desabilitada | Guard server-side + allowlist + conta/número de teste. |
| Firebase/Web Push | Desabilitada | Projeto/chaves staging e usuários sintéticos. |
| n8n | Desabilitada | Workflows staging e allowlist de hosts. |
| Analytics/GA4/GTM | Desabilitada | Propriedade/containers separados e sem dados clínicos. |
| Meta Pixel/CAPI | Desabilitada | Dataset/test event separado e consentimento preservado. |
| Cron/jobs | Desabilitada | Destinos staging, segredo exclusivo e ativação job a job. |
| Webhooks inbound | Requer configuração | URLs staging, segredos exclusivos e assinatura obrigatória. |
| Google Play/RTDN | Desabilitada | Fora da homologação web; sem novo `.aab`. |

---

## D. Configurações externas que precisam ser realizadas

### D.1 Supabase

1. Criar um projeto Supabase separado para staging; não reutilizar produção.
2. Não clonar dados, objetos de Storage, `settings`, Vault, usuários Auth ou secrets de produção.
3. Registrar de forma segura a URL, anon/publishable key, service role e project ref do staging.
4. Configurar Site URL e redirects Auth somente para os domínios de staging definidos.
5. Criar/configurar o provider Google de staging; não presumir que as credenciais OAuth de produção possam ser reutilizadas.
6. Manter Edge Functions e secrets externos não implantados ou desabilitados até a revisão individual.
7. Não executar ainda as migrations do repositório. Primeiro criar o procedimento de bootstrap que não agenda cron nem grava origens públicas.
8. Preparar buckets vazios equivalentes apenas quando necessários: `brand`, `notifications`, `support_attachments` e `temp-audio`.
9. Preparar usuários e objetos exclusivamente sintéticos.
10. Conceder acesso read-only seguro ao schema efetivamente implantado de produção para o inventário futuro, sem fornecer service role ao frontend ou registrar credenciais em arquivos versionados.

Embora Supabase Branching ofereça ambientes separados, ele clona configuração e Edge Functions do projeto principal. Para este roadmap, permanece aprovada a topologia de **projeto staging separado**, que reduz o acoplamento e permite provisionamento deliberado.

### D.2 Vercel

1. Criar um projeto Vercel separado para homologação, sem fazer o primeiro deployment antes de cadastrar as variáveis seguras. A Vercel considera o primeiro deployment de um projeto como Production mesmo se vier de outra branch.
2. Definir `feat/clinicas` como production branch apenas no projeto de homologação.
3. Impedir que o projeto público atual faça deploy da branch `feat/clinicas`, usando configuração específica do projeto, não uma regra versionada que também desative o staging.
4. Cadastrar as variáveis staging uma a uma; não importar valores de Production automaticamente.
5. Remover do escopo Preview do projeto atual as credenciais externas reais que não precisam estar ali, ou substituí-las por valores de teste/guardas desabilitadas.
6. Configurar Deployment Protection no projeto de homologação e validar o acesso antes de qualquer dado, ainda que sintético.
7. Associar um domínio exclusivo somente depois do primeiro deployment seguro.
8. Confirmar no painel a production branch, branch tracking, proteção e destinos das variáveis, pois a API disponível nesta auditoria não permitiu inspecionar esses campos.

### D.3 Stripe

1. Criar produto, preços base/licença e webhook exclusivamente em Test Mode quando a Fase 2 estiver autorizada.
2. Usar endpoint do Supabase staging e segredo de webhook de teste próprio.
3. Não copiar `settings.payment_settings` de produção.
4. Garantir que staging não possua chaves `STRIPE_*_PROD`.
5. Manter `BILLING_ENABLED=false` até teste de configuração e assinatura do webhook.

### D.4 OAuth e Google

1. Criar ou separar um OAuth Client para o domínio staging.
2. Cadastrar origens JavaScript e redirects do Supabase/Auth de staging.
3. Usar contas Google sintéticas para Drive, Docs e Calendar.
4. Configurar uma Google Picker API key restrita à origem staging ou manter o Picker desligado.
5. Não habilitar Google Play, RTDN ou credencial de conta de serviço na homologação web inicial.

### D.5 Demais integrações

- **Brevo/e-mail:** conta/configuração de teste ou allowlist rígida; envio começa desligado.
- **WhatsApp:** WABA/número de teste e tokens exclusivos; envio e OTP começam desligados.
- **n8n:** workflows e URLs staging separados; não reutilizar os endpoints encontrados no `.env.example` ou na Vercel atual.
- **Firebase/push:** projeto Firebase separado; sem `FIREBASE_SERVICE_ACCOUNT_JSON` enquanto desabilitado.
- **Gemini:** chave de quota controlada; manter mock/desabilitado até necessário.
- **Analytics/Meta:** propriedade/container/dataset separados ou nenhuma credencial; manter desligado por padrão.
- **Cron:** nenhum schedule ativo até cada URL, segredo e efeito serem testados em staging.

---

## E. Alterações de código necessárias

As mudanças abaixo compunham o backlog técnico original da Fase 0.5. Os itens de hardening, fail-fast, flags, banner e testes já foram implementados e publicados em `main` com as flags de clínicas desligadas. Permanecem pendentes somente os itens que dependem do Supabase staging, de credenciais externas próprias ou do inventário read-only.

| Arquivo previsto | Objetivo |
|---|---|
| Novo módulo compartilhado de configuração de ambiente | Validar `APP_ENV`, `VITE_APP_ENV`, origem, project ref e fingerprints sem logar secrets. |
| `src/supabaseClient.ts` | Remover URL/anon fallback; falhar de forma explícita quando ausentes; validar ref esperada/proibida. |
| `server.ts` | Remover fallbacks de Supabase e origem; exigir `CRON_SECRET`; aplicar guardas de staging antes de criar clientes privilegiados. |
| `server.ts` e adaptadores de e-mail/push/Gemini | Aplicar switches deny-by-default e allowlists no servidor. |
| `server/whatsapp/whatsappClient.ts` e `whatsappOtp.ts` | Exigir `WHATSAPP_SEND_ENABLED`; retirar fallback do segredo OTP para access token; aplicar allowlist staging. |
| `server/journeys/journeyPublisher.ts` e `server/whatsapp/journeyPublications.ts` | Recusar publicações quando a integração estiver desligada; remover origem pública como fallback operacional. |
| `api/campaign-dashboard.ts` e `api/campaign-dispatch.ts` | Exigir `BATCH_DISPATCH_ENABLED` e host staging permitido. |
| `supabase/functions/_shared/billing.ts` | Exigir `APP_ORIGIN`; impedir Stripe Live em staging; não permitir que uma configuração de banco contorne `APP_ENV`. |
| Edge Functions de analytics/Meta | Exigir guards explícitos antes de entregar qualquer evento. |
| `src/services/analytics.ts` | Não carregar ou emitir GTM/GA4/Meta quando `VITE_APP_ENV=staging` e a integração estiver desligada. |
| `src/pages/AdminPanel.tsx` | Remover fallback da URL do webhook Stripe e exibir o ambiente ativo de forma inequívoca. |
| `src/utils/professionalFunnelMessages.ts`, `src/pages/PublicJourneyIndex.tsx` e smoke tests | Usar origem validada; nunca cair na origem pública em staging/teste. |
| `.env.example` | Documentar todas as variáveis, incluir anon key e guardas com defaults falsos; remover endpoints reais dos exemplos. |
| Novo banner de ambiente | Exibir persistentemente **Ambiente de homologação** quando `VITE_APP_ENV=staging`. |
| Novos testes de configuração | Cobrir ausência de variáveis, ref proibida, service role proibida, chave Stripe Live, origem pública, outbound desligado e allowlists. |
| Procedimento/script de auditoria | Comparar somente nomes, escopos, refs e fingerprints; nunca imprimir valores. |
| Procedimento de bootstrap Supabase staging | Aplicar schema de forma controlada, sem dados reais, sem Vault de produção e sem jobs ativos. Não será uma migration empresarial. |

Qualquer alteração de código exigirá atualização da build em `src/components/layout/AppVersion.tsx`. Mudanças apenas web/backend não exigem novo `.aab`.

---

## Inventário futuro do banco real

Quando houver acesso read-only seguro, o inventário deverá consultar o estado efetivamente implantado e registrar:

- schemas e schemas expostos pela Data API;
- tabelas e colunas com tipos/defaults/nullability;
- PKs, FKs, unique constraints e checks;
- índices, inclusive colunas usadas em RLS e chaves estrangeiras;
- triggers e funções chamadas por triggers;
- functions/RPCs, owner, linguagem, volatilidade, `SECURITY DEFINER`, `search_path` e grants de `EXECUTE`;
- views/materialized views, owner e `security_invoker` quando aplicável;
- grants de schemas, tabelas, sequences e functions;
- RLS habilitada/forçada e todas as policies com `USING`/`WITH CHECK`;
- buckets, objetos esperados e policies de `storage.objects`;
- Edge Functions implantadas, autenticação exigida e nomes de secrets, nunca valores;
- extensões, Vault e todos os schedules de `cron.job`;
- jobs externos, webhooks, queues e chamadas `pg_net`;
- todas as referências a `professional_id`, `patient_id`, `auth.uid()` e service role;
- divergências entre banco real, migrations e tipos TypeScript.

O inventário deve ser exportado como metadados sem conteúdo clínico. Nenhuma linha de paciente, evolução, documento, áudio ou mensagem deverá ser copiada.

### Atenção especial a `patients`

O repositório já mostra consultas à tabela `patients` em `server.ts`, módulos de admin/lifecycle, telas de dashboard, cadastro, detalhe, histórico, onboarding, nova evolução, Share Target e backup. Isso é evidência de dependência do código, mas não confirma o schema real.

O inventário deverá provar antes de qualquer desenho:

1. semântica atual de `patients.professional_id`;
2. constraints, índices, triggers, RLS e grants;
3. entidades dependentes por FK ou query, especialmente evoluções e relatórios;
4. backups, importações, exclusões e fluxos de suporte;
5. Storage e documentos Google associados;
6. Edge Functions, jobs e funções privilegiadas que leem pacientes;
7. efeitos de troca, suspensão ou exclusão do profissional;
8. dados legados que contrariem constraints presumidas.

Somente após essa prova será escolhida a evolução aditiva de `patients`, a camada `organization_patients` ou outra estratégia. A Fase 0.5 não altera `patients`.

### Princípio futuro dos contadores de licença

- `contracted_seats`: estado contratual persistido e confirmado por cobrança.
- `active_seats`: derivado de memberships clínicas ativas.
- `reserved_seats`: derivado de convites clínicos pendentes e válidos.
- `available_seats`: expressão derivada de contratado menos ativo menos reservado.

Persistência redundante de contadores somente será aceita na Fase 2 se houver necessidade de performance comprovada, atualização transacional e rotina de reconciliação.

---

## Estratégia futura de feature flag

A feature não deve ser liberada pela mera presença das tabelas ou por decisão do frontend.

1. **Kill switch global server-side:** `FEATURE_CLINICS_ENABLED=false` por padrão.
2. **Espelho público:** `VITE_FEATURE_CLINICS_ENABLED=false` apenas para navegação/UX, nunca para autorização.
3. **Fonte de verdade no banco:** futura flag global e allowlist por organização, ausentes equivalendo a `false`.
4. **Avaliação cumulativa:** ambiente permitido + kill switch global + organização explicitamente habilitada + membership/permissão válida.
5. **RLS/RPC:** acesso empresarial deve continuar negado mesmo que alguém force rota, componente ou request no navegador.
6. **Incidente:** desabilitar globalmente sem apagar dados nem afrouxar o fluxo individual.
7. **Piloto:** ativação somente por organização; nunca por e-mail, hostname ou papel global.

O formato definitivo das tabelas de flags pertence à Fase 1 e não foi criado aqui.

---

## Android/TWA

Foram encontradas referências intencionais ao domínio público em `twa-manifest.json`, `app/build.gradle`, `app/src/main/...` e recursos Android. O wrapper atual é de produção e deve permanecer assim.

- Homologação inicial será via navegador.
- Não será criado host Android staging nesta etapa.
- Não será alterado `versionCode`, `versionName`, `PLAY_STORE_VERSION` ou manifest.
- Não será gerado `.aab`.

---

## F. Itens executados com segurança

- Implementado e publicado em `main` o hardening fail-fast de frontend, backend, API routes e código-fonte compartilhado das Edge Functions.
- Removidos os fallbacks conhecidos para URL/anon key Supabase, origem pública, segredo de cron e segredo OTP.
- Adicionadas identidade explícita de ambiente, validação de project ref/service role/origem e flags deny-by-default.
- Adicionados banner de homologação e testes automatizados de isolamento; build, lint e suíte completa foram aprovados.
- Confirmado smoke test autenticado do fluxo individual em produção sem banner de staging, com `/api/health` saudável.
- Desativada a criação de Preview no projeto Vercel público; `main` permanece sua branch de produção.
- Criado o projeto Vercel `evolucao-clinica-staging` sem Git e sem deployment.
- Cadastradas 23 configurações não sensíveis no projeto staging, com integrações e Plano Clínica desligados.
- Protegidos todos os futuros deployments do projeto staging por autenticação da Vercel.
- Associado o domínio `staging.evolucaoclinica.app.br`, ainda sem DNS válido e sem conteúdo publicado.
- Auditados código frontend, backend, API routes, Edge Functions, migrations, scripts, Vercel, Android/TWA e exemplos de ambiente.
- Confirmado que `.env.local` é ignorado pelo Git; nenhum valor foi exibido ou commitado.
- Confirmado que o `.env` versionado não possui variáveis configuradas.
- Confirmado que não existe `supabase/config.toml` no repositório.
- Confirmados hardcodes e fallbacks adicionais além dos dois inicialmente conhecidos.
- Confirmados jobs/migrations que usam domínio público, Vault e `pg_net`.
- Confirmados buckets referenciados: `brand`, `notifications`, `support_attachments` e `temp-audio`.
- Consultada documentação oficial atual da Vercel sobre Preview/Production e variáveis por ambiente e documentação do Supabase sobre ambientes isolados.
- Nenhuma branch `feat/clinicas`, Preview, deployment de staging, migration, publicação de Edge Function, webhook ou mensagem foi criada/disparada.
- Nenhum dado ou schema de produção foi lido ou alterado.

---

## G. Itens bloqueados

| Item | Motivo exato |
|---|---|
| Publicar `feat/clinicas` | O Supabase staging ainda não existe e o primeiro deployment seguro ainda não foi validado. |
| Criar projeto Supabase staging | A organização já possui dois projetos e o plano financeiro não pôde ser confirmado; um projeto adicional pode custar a partir de US$ 10/mês. |
| Primeiro deployment Vercel staging | Faltam as credenciais exclusivas do Supabase staging e o time Hobby sinaliza recursos gratuitos excedidos. Nenhuma cobrança ou upgrade foi autorizado. |
| Ativar domínio de staging | O CNAME externo ainda precisa ser criado no Cloudflare; o domínio está em `Invalid Configuration`. |
| Aplicar migrations existentes em staging | O histórico contém jobs e origens reais; falta um bootstrap neutralizado e revisado. |
| Inventariar banco real | Deve ocorrer somente depois do primeiro deployment isolado e requer uma conexão read-only que não foi configurada. |
| Validar Stripe Test | Produtos, preços, endpoints e secrets Test ainda não existem no ambiente staging. |
| Validar OAuth staging | DNS, client/provider e redirects staging ainda não estão concluídos. |
| Habilitar mensageria, push, n8n, analytics ou Meta | As guardas existem, mas não há destinos/projetos de teste confirmados; os switches permanecem `false`. |
| Iniciar Fase 1 | Expressamente fora do escopo desta execução e bloqueada pelo gate técnico. |

---

## H. Próximo passo obrigatório

Antes de ser seguro criar e publicar `feat/clinicas`, deve ocorrer, nesta ordem:

1. **Pendente:** confirmar o plano/custo e criar o projeto Supabase staging vazio, registrando credenciais exclusivas.
2. **Pendente:** criar o CNAME externo do domínio de homologação e aguardar validação.
3. **Concluído:** criar o projeto Vercel de homologação protegido, sem deployment inicial.
4. **Concluído:** impedir que o projeto público gere Preview da futura `feat/clinicas`.
5. **Parcial:** identidade e switches outbound estão cadastrados como `false`; faltam somente as credenciais e fingerprints do Supabase staging.
6. **Concluído até aqui:** nenhuma credencial externa real foi copiada para o projeto staging.
7. **Concluído:** hardening fail-fast e guardas publicados em `main` com variáveis Production validadas.
8. **Concluído:** build/testes de ambiente e smoke test do fluxo individual em produção foram aprovados.
9. **Pendente:** restaurar capacidade gratuita da Vercel ou aprovar mudança de plano e realizar o primeiro deployment do código endurecido no projeto staging com dados sintéticos, sem criar ainda `feat/clinicas`.
10. **Pendente:** inventariar o banco real com acesso read-only antes de desenhar qualquer migration da Fase 1.
11. **Pendente:** somente depois do deployment isolado, da regressão de produção e do inventário, criar e publicar `feat/clinicas` sem iniciar a Fase 1.

Até a conclusão dos itens pendentes e a validação do primeiro deployment, a decisão operacional permanece:

```text
feat/clinicas remota = não publicar
Preview de clínicas = não criar
Supabase de produção = não usar para homologação
integrações externas em staging = desabilitadas
migrations empresariais = não iniciar
```

## Referências oficiais consultadas

- [Vercel — Environments](https://vercel.com/docs/deployments/environments)
- [Vercel — Managing environment variables across environments](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Supabase — Branching](https://supabase.com/docs/guides/deployment/branching)
- [Supabase — Using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)
