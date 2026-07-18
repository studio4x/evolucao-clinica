# Especificação Técnica — Módulo de Jornada de Ativação e Automação de Relacionamento

**Produto:** Evolução Clínica  
**Repositório analisado:** `studio4x/evolucao-clinica`  
**Branch:** `main`  
**Commit de referência identificado durante a análise:** `0852304f0e460ab201cdd46a9417db7b82e2695a`  
**Data da análise:** 16/07/2026  
**Versão do documento:** 1.0  
**Documento funcional relacionado:** `jornada_ativacao_evolucao_clinica.md`

---

# 1. Objetivo

Este documento descreve como implementar, dentro do código atual do Evolução Clínica, um módulo completo de:

- jornada principal de ativação de 15 mensagens;
- e-mails condicionais conforme o comportamento do usuário;
- segmentação por profissão, plano e estágio de ativação;
- priorização e substituição de mensagens;
- controle de frequência;
- consentimento e descadastro;
- fila de disparos;
- idempotência;
- auditoria;
- métricas;
- painel administrativo;
- testes e implantação gradual.

O objetivo é entregar à IA responsável pela implementação uma especificação técnica suficientemente detalhada para trabalhar no repositório existente sem inventar uma nova arquitetura incompatível com a plataforma.

---

# 2. Resumo executivo da análise

O Evolução Clínica já possui uma base importante para o módulo:

- frontend React 19 com Vite e TypeScript;
- backend Node.js com Express;
- Supabase para autenticação e PostgreSQL;
- deploy compatível com Vercel;
- envio de e-mails por SMTP ou Brevo;
- tabela de auditoria `email_deliveries`;
- sistema de notificações in-app, push e e-mail;
- rotas protegidas por autenticação e função administrativa;
- cron jobs usando Supabase `pg_cron` e `pg_net`;
- cadastro de profissionais;
- período de teste;
- acompanhamento de assinatura;
- cadastro de pacientes;
- criação de evoluções;
- documentos e relatórios;
- um sistema público chamado “Jornada de 15 dias”.

Apesar dessas bases, o sistema atual **não possui um motor de automação individual por usuário**.

O sistema existente de “Jornada” foi construído para:

- publicar conteúdos em datas globais;
- disponibilizar páginas públicas;
- administrar conteúdos da comunidade/jornada pública;
- liberar cada conteúdo simultaneamente para todos.

Esse sistema não acompanha:

- o dia relativo ao cadastro de cada usuário;
- ações realizadas dentro da plataforma;
- próxima melhor ação;
- substituição de uma mensagem por outra;
- pausa da sequência;
- usuários que assinaram;
- usuários inativos;
- limite de frequência;
- preferências de comunicação.

Portanto, a recomendação é manter a jornada pública existente e criar um módulo independente chamado internamente de **Lifecycle Automation** ou **Automação de Relacionamento**.

---

# 3. Arquitetura atual identificada

## 3.1. Aplicação

### Frontend

- React `19`;
- React Router;
- Vite;
- Tailwind CSS;
- Zustand;
- acesso direto ao Supabase pelo navegador;
- PWA e fila offline.

Arquivos principais:

- `src/App.tsx`
- `src/supabaseClient.ts`
- `src/store/authStore.ts`
- `src/pages/`
- `src/components/`
- `src/services/`
- `src/utils/`

### Backend

O backend principal está concentrado em:

- `server.ts`

O arquivo possui mais de 5.000 linhas e reúne:

- autenticação;
- processamento de IA;
- notificações;
- push;
- SMTP;
- Brevo;
- assinaturas;
- cron jobs;
- suporte;
- rotas administrativas;
- processamento de relatórios;
- integração com o banco.

Na Vercel:

- `api/index.ts` importa e exporta o `app` do `server.ts`;
- todas as rotas `/api/*` são reescritas para `api/index.ts`;
- a duração atual das funções é de até 60 segundos.

Arquivos:

- `server.ts`
- `api/index.ts`
- `vercel.json`

### Banco de dados

- Supabase PostgreSQL;
- migrations em `supabase/migrations/`;
- Row Level Security;
- uso da chave `SUPABASE_SERVICE_ROLE_KEY` no backend;
- frontend utiliza a chave anônima e as políticas de RLS.

### Autenticação

- Supabase Auth;
- perfil complementar na tabela `professionals`;
- middleware `requireAuth`;
- middleware `requireAdmin`;
- controle de plano com `requireActiveSubscription`.

---

# 4. Recursos existentes que devem ser reaproveitados

## 4.1. Envio de e-mail

O backend já possui:

- `sendEmailViaSmtp`;
- `sendEmailViaBrevo`;
- `sendTransactionalEmail`;
- fallback entre provedores;
- registro do resultado em `email_deliveries`;
- tema visual baseado na identidade configurada;
- helpers de botão, card e estrutura HTML.

Trechos envolvidos:

- tipo `EmailProvider`;
- tipo `EmailDeliveryInput`;
- tipo `EmailDeliveryResult`;
- `recordEmailDelivery`;
- `sendTransactionalEmail`;
- `buildEmailTheme`;
- `buildEmailShell`;
- `buildEmailButton`;
- `buildEmailCard`.

### Decisão

O novo módulo deve utilizar `sendTransactionalEmail`.

Não deve implementar outro cliente SMTP, outro cliente Brevo ou uma biblioteca paralela.

---

## 4.2. Histórico de e-mails

Já existe:

- tabela `email_deliveries`;
- página administrativa `src/pages/EmailHistory.tsx`;
- status `sent` e `failed`;
- provedor;
- destinatário;
- assunto;
- origem;
- erro;
- ID retornado pelo provedor.

### Decisão

Continuar registrando todos os envios em `email_deliveries`.

Criar uma tabela adicional do módulo para controlar:

- agendamento;
- prioridade;
- motivo;
- tentativa;
- bloqueio;
- substituição;
- cancelamento;
- etapa da jornada;
- regra condicional;
- idempotência.

A tabela `email_deliveries` continuará sendo o histórico global do envio final.

---

## 4.3. Cron jobs

O projeto já possui rotas como:

- `/api/cron/send-evolution-reminders`;
- `/api/cron/send-trial-expiration-notices`;
- `/api/cron/publish-journey-contents`;
- `/api/cron/send-daily-push`.

Já existe:

- `CRON_SECRET`;
- `pg_cron`;
- `pg_net`;
- função `buildCronBootstrapSql`;
- função `bootstrapSupabaseCronJobs`.

### Atenção técnica

No código atual, `bootstrapSupabaseCronJobs()` é chamado dentro de `startServer()`.

O `startServer()` não é executado quando `process.env.VERCEL` está definido. Portanto, em produção Vercel, o bootstrap não é garantido durante a inicialização da função serverless.

Também existem migrations antigas que registram rotas de cron sem informar o segredo exigido pela rota.

### Decisão

O cron do novo módulo deve ser instalado de forma explícita e verificável.

Opções aceitas:

1. migration SQL que cria o cron com URL e segredo provenientes de configuração segura;
2. endpoint administrativo protegido que registra/repara os jobs;
3. processo de deploy documentado que executa o bootstrap;
4. Vercel Cron, caso o plano e a frequência permitam.

A implementação não deve depender silenciosamente de `startServer()` em ambiente Vercel.

---

## 4.4. Jornada pública existente

Já existem:

- tabela `journeys`;
- tabela `journey_contents`;
- migration `20260714153000_create_journey_system.sql`;
- painel `src/components/admin/JourneyAdmin.tsx`;
- página pública `src/pages/PublicJourneyIndex.tsx`;
- cron de publicação;
- rotas `/jornada/...`.

### Decisão

Não utilizar `journeys` e `journey_contents` como tabelas de automação de e-mail.

Motivos:

- a publicação atual é global;
- as datas são absolutas;
- o conteúdo é público;
- não existe matrícula individual;
- não existe estado por usuário;
- não existe prioridade;
- não existe substituição;
- não existe comportamento condicional.

O painel atual deverá continuar sendo identificado como a jornada pública/comunidade.

O novo módulo deve ter nome administrativo distinto:

> Onboarding dos Usuários

ou:

> Automação de Relacionamento

---

# 5. Principais descobertas que afetam a estratégia

## 5.1. O período de teste atual é de 7 dias

No backend:

```ts
const TRIAL_DURATION_DAYS = 7;
```

O perfil é criado com:

- `subscription_plan = "trial"`;
- `subscription_status = "trialing"`;
- `trial_ends_at`;
- `subscription_ends_at`.

### Consequência

Uma conversão planejada somente para os dias 14 e 15 chegaria tarde para usuários que não assinaram.

### Regra proposta

- a jornada educativa pode ter 15 mensagens;
- os avisos comerciais devem ser relacionados a `trial_ends_at`;
- três dias antes do fim: preparação;
- um dia antes: lembrete;
- no fim: expiração;
- depois da expiração: recuperação;
- usuário assinante continua na parte educativa;
- usuário não assinante recebe conteúdo adaptado após a expiração.

---

## 5.2. Já existe e-mail de boas-vindas

O `bootstrapOnboardingAccess` chama `sendWelcomeEmail`.

A função verifica `email_deliveries` com:

- `source = "welcome"`;
- `status = "sent"`.

### Decisão

O e-mail existente deve ser considerado **Dia 0 transacional**.

A jornada principal deve iniciar:

- 24 horas depois da ativação da conta;
- ou no próximo horário permitido configurado.

Não enviar outra mensagem genérica de boas-vindas no mesmo dia.

---

## 5.3. O onboarding atual é parcialmente local

O estado de onboarding utiliza:

- `localStorage`;
- arquivo `src/utils/onboarding.ts`;
- campo `professionals.onboarding_completed`.

O estado detalhado, como:

- `intro`;
- `patient`;
- `evolution`;
- `agenda`;
- `complete`;

fica principalmente no navegador.

### Consequência

O backend não consegue depender apenas desse estado para automações.

### Decisão

O motor de automação deve calcular ativação usando dados persistentes:

- quantidade de pacientes;
- quantidade de evoluções;
- status da evolução;
- uso de áudio;
- prontuário vinculado;
- assinatura;
- último acesso;
- eventos registrados no banco.

---

## 5.4. Pacientes e evoluções são gravados diretamente pelo frontend

Exemplos:

- `PatientForm.tsx` grava diretamente em `patients`;
- `NewEvolution.tsx` grava diretamente em `evolutions`;
- atualização de perfil também ocorre diretamente pelo Supabase no frontend.

### Consequência

Adicionar eventos somente no Express não capturaria todas as ações.

### Decisão

Eventos persistentes importantes devem ser criados preferencialmente por triggers PostgreSQL.

Eventos de interface que não resultam em alteração de banco devem ser enviados por uma rota de telemetria autenticada.

---

## 5.5. O fluxo atual de evolução não possui uma etapa formal de revisão antes de salvar

Em `NewEvolution.tsx`, o fluxo principal é:

1. criar/upsert da evolução com status de processamento;
2. transcrever o áudio;
3. adicionar o resultado ao Google Docs;
4. atualizar a evolução como concluída;
5. emitir notificação de sucesso.

Não foi identificada uma etapa persistida chamada:

- `reviewed`;
- `approved`;
- `confirmed_by_professional`.

### Consequência

Não é possível afirmar tecnicamente que o usuário “revisou antes de salvar”.

### Decisão

Para a primeira versão, considerar ativação técnica quando:

- paciente cadastrado;
- prontuário vinculado;
- evolução concluída;
- transcrição concluída;
- inserção no Google Docs concluída.

O evento `evolution_reviewed` só deve ser implementado quando o produto possuir uma ação explícita de revisão/confirmação.

---

## 5.6. A criação da primeira evolução depende do Google Docs

O fluxo bloqueia a criação quando o paciente não possui `google_doc_id`.

Também depende de permissões do Google.

### Consequência

A jornada não deve recomendar apenas “cadastre o paciente” e imediatamente “crie a evolução” sem verificar o prontuário.

### Estados necessários

- paciente criado;
- Google Docs vinculado;
- evolução iniciada;
- evolução concluída.

### Mensagem condicional adicional

> Paciente cadastrado, mas prontuário ainda não vinculado.

CTA:

> Vincular ou criar prontuário

---

## 5.7. A notificação atual também envia e-mail

`sendNotificationInternal` realiza:

- registro in-app;
- push;
- e-mail.

Chamadas feitas após:

- paciente cadastrado;
- evolução criada;
- outras ações;

podem gerar e-mails.

### Risco

O usuário pode receber:

1. e-mail automático da notificação;
2. e-mail condicional da jornada sobre a mesma ação.

### Decisão

Adicionar política explícita de canais.

Exemplo:

```ts
type NotificationChannels = {
  inApp?: boolean;
  push?: boolean;
  email?: boolean;
};
```

Para confirmações comuns da interface:

```ts
channels: {
  inApp: true,
  push: true,
  email: false
}
```

Para notificações importantes:

```ts
channels: {
  inApp: true,
  push: true,
  email: true
}
```

O módulo de relacionamento deve enviar e-mails por sua própria política, sem depender de `sendNotificationInternal`.

---

## 5.8. Não foi localizado um sistema de preferências ou descadastro de e-mails educativos

Não foram identificados campos claros de:

- opt-out de marketing;
- opt-out de onboarding educativo;
- token de descadastro;
- lista de supressão;
- preferência de frequência.

### Decisão

O módulo deve incluir preferências de comunicação antes do disparo em produção.

Mensagens estritamente transacionais podem seguir regra diferente, mas os e-mails educativos e comerciais devem respeitar a preferência do usuário.

A implementação jurídica final deve ser validada conforme a política de privacidade adotada.

---

# 6. Nome e limites do módulo

## Nome técnico recomendado

```text
lifecycle
```

## Nome no painel

```text
Onboarding dos Usuários
```

## Responsabilidades

O módulo será responsável por:

- matrícula do usuário;
- estado de ativação;
- registro de eventos;
- seleção da próxima mensagem;
- agenda;
- prioridade;
- cooldown;
- supressão;
- renderização do template;
- entrega;
- auditoria;
- métricas;
- administração.

## Não será responsável por

- autenticação;
- cobrança;
- transcrição;
- criação de pacientes;
- criação de evoluções;
- Google Docs;
- push genérico;
- jornada pública;
- processamento de pagamento.

Ele apenas observará esses domínios e reagirá aos eventos.

---

# 7. Estrutura de diretórios proposta

A implementação deve reduzir o crescimento do `server.ts`.

```text
server/
  email/
    emailTypes.ts
    emailSettings.ts
    emailTheme.ts
    emailDelivery.ts
    emailRenderer.ts

  lifecycle/
    lifecycleTypes.ts
    lifecycleConstants.ts
    lifecycleRepository.ts
    lifecycleEvents.ts
    lifecycleState.ts
    lifecycleRules.ts
    lifecycleScheduler.ts
    lifecycleQueue.ts
    lifecycleRenderer.ts
    lifecycleDelivery.ts
    lifecycleMetrics.ts
    lifecycleRoutes.ts
    lifecycleAdminRoutes.ts
    lifecycleCronRoutes.ts
    lifecycleUnsubscribe.ts
    templates/
      tokenRegistry.ts
      defaultTemplates.ts

src/
  components/
    admin/
      lifecycle/
        LifecycleAdmin.tsx
        LifecycleOverview.tsx
        LifecycleCampaignEditor.tsx
        LifecycleStepEditor.tsx
        LifecycleConditionalRules.tsx
        LifecycleUsers.tsx
        LifecycleDeliveries.tsx
        LifecycleSettings.tsx
        LifecycleTemplatePreview.tsx
        LifecycleSimulationModal.tsx

  services/
    lifecycleClient.ts
    lifecycleTelemetry.ts

  pages/
    CommunicationPreferences.tsx
    Unsubscribe.tsx

supabase/
  migrations/
    <timestamp>_create_lifecycle_core.sql
    <timestamp>_create_lifecycle_event_triggers.sql
    <timestamp>_seed_activation_journey.sql
    <timestamp>_create_lifecycle_claim_functions.sql
    <timestamp>_add_lifecycle_tracking_to_email_deliveries.sql
```

### Observação

O diretório `server/` é recomendado para impedir que módulos exclusivos do backend sejam misturados ao bundle do frontend.

O `server.ts` deve apenas:

- importar os registradores de rotas;
- inicializar dependências;
- manter compatibilidade com `api/index.ts`.

---

# 8. Modelo de dados proposto

## 8.1. `lifecycle_campaigns`

Define uma campanha ou jornada.

```sql
CREATE TABLE public.lifecycle_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  campaign_type text NOT NULL
    CHECK (campaign_type IN ('sequence', 'conditional', 'reactivation', 'customer')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  default_send_time time NOT NULL DEFAULT '08:30',
  max_messages_per_24h integer NOT NULL DEFAULT 1,
  enrollment_window_days integer,
  completion_window_days integer DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL
);
```

### Campanhas iniciais

- `new_user_activation_15d`
- `inactive_user_reactivation`
- `trial_conversion`
- `customer_adoption`
- `cancellation_feedback`

---

## 8.2. `lifecycle_steps`

Define as mensagens da sequência principal.

```sql
CREATE TABLE public.lifecycle_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
    REFERENCES public.lifecycle_campaigns(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  position integer NOT NULL,
  day_offset integer NOT NULL DEFAULT 0,
  send_time time,
  category text NOT NULL,
  priority integer NOT NULL DEFAULT 50,
  subject_template text NOT NULL,
  preheader_template text,
  body_markdown text NOT NULL,
  cta_label_template text,
  cta_route_template text,
  fallback_cta_route text,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_rule_key text,
  skip_rule_key text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_key),
  UNIQUE (campaign_id, position)
);
```

### Observação

`audience_filter` deve aceitar apenas filtros conhecidos.

Não executar código arbitrário armazenado em JSON.

Exemplo:

```json
{
  "allowed_account_types": ["individual", "clinic"],
  "allowed_subscription_statuses": ["trialing", "active"],
  "exclude_roles": ["admin"]
}
```

---

## 8.3. `lifecycle_enrollments`

Representa a matrícula individual.

```sql
CREATE TABLE public.lifecycle_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL
    REFERENCES public.lifecycle_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active',
      'paused',
      'completed',
      'cancelled',
      'suppressed',
      'expired'
    )),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  current_position integer NOT NULL DEFAULT 0,
  next_step_at timestamptz,
  completion_deadline_at timestamptz,
  pause_reason text,
  cancellation_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);
```

---

## 8.4. `lifecycle_user_state`

Mantém um resumo rápido do usuário.

```sql
CREATE TABLE public.lifecycle_user_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  activation_level integer NOT NULL DEFAULT 0,
  activation_status text NOT NULL DEFAULT 'registered',

  first_login_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,

  patients_count integer NOT NULL DEFAULT 0,
  first_patient_at timestamptz,
  latest_patient_at timestamptz,

  linked_records_count integer NOT NULL DEFAULT 0,
  first_record_linked_at timestamptz,

  evolutions_count integer NOT NULL DEFAULT 0,
  first_evolution_started_at timestamptz,
  first_evolution_completed_at timestamptz,
  latest_evolution_at timestamptz,

  audio_evolutions_count integer NOT NULL DEFAULT 0,
  reports_count integer NOT NULL DEFAULT 0,
  migrations_count integer NOT NULL DEFAULT 0,

  onboarding_completed_at timestamptz,

  subscription_plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  subscription_cancelled_at timestamptz,

  profession text,
  account_type text,

  last_relationship_email_at timestamptz,
  next_relationship_email_eligible_at timestamptz,

  state_version integer NOT NULL DEFAULT 1,
  recalculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Por que manter estado resumido

Sem essa tabela, cada execução do cron teria que contar:

- pacientes;
- evoluções;
- documentos;
- logins;
- assinaturas;

para todos os usuários.

O resumo reduz custo e melhora previsibilidade.

### Fonte de verdade

As tabelas de domínio continuam sendo a fonte de verdade.

`lifecycle_user_state` é um índice derivado e deve possuir rotina de recálculo.

---

## 8.5. `lifecycle_events`

Registro append-only dos eventos.

```sql
CREATE TABLE public.lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  source text NOT NULL
    CHECK (source IN ('database_trigger', 'backend', 'frontend', 'webhook', 'admin')),
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lifecycle_events_idempotency_unique
  ON public.lifecycle_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX lifecycle_events_user_time_idx
  ON public.lifecycle_events(user_id, occurred_at DESC);

CREATE INDEX lifecycle_events_name_time_idx
  ON public.lifecycle_events(event_name, occurred_at DESC);
```

### Regra de privacidade

Não armazenar em `metadata`:

- transcrição;
- texto clínico;
- conteúdo do prontuário;
- nome do paciente;
- observações clínicas;
- dados sensíveis desnecessários.

Armazenar apenas:

- IDs;
- status;
- contagens;
- duração;
- tipo do recurso;
- origem;
- resultado técnico.

---

## 8.6. `lifecycle_rules`

Cadastro administrativo das regras condicionais.

```sql
CREATE TABLE public.lifecycle_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_event text,
  rule_type text NOT NULL
    CHECK (rule_type IN ('event', 'inactivity', 'deadline', 'state')),
  priority integer NOT NULL DEFAULT 50,
  cooldown_hours integer NOT NULL DEFAULT 24,
  delay_minutes integer NOT NULL DEFAULT 0,
  condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Regra de segurança

`condition_config` não deve ser interpretado como SQL livre.

O TypeScript deve mapear `rule_key` para avaliadores conhecidos.

---

## 8.7. `lifecycle_dispatches`

Fila e auditoria específica do módulo.

```sql
CREATE TABLE public.lifecycle_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.lifecycle_enrollments(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.lifecycle_campaigns(id) ON DELETE SET NULL,
  step_id uuid REFERENCES public.lifecycle_steps(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.lifecycle_rules(id) ON DELETE SET NULL,

  message_key text NOT NULL,
  dispatch_type text NOT NULL
    CHECK (dispatch_type IN ('sequence', 'conditional', 'transactional_bridge')),

  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'processing',
      'sent',
      'failed',
      'retry',
      'skipped',
      'cancelled',
      'suppressed',
      'replaced'
    )),

  scheduled_for timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,

  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz,

  dedupe_key text NOT NULL,
  replacement_dispatch_id uuid REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,
  replaced_dispatch_id uuid REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,

  email_delivery_id uuid REFERENCES public.email_deliveries(id) ON DELETE SET NULL,

  rendered_subject text,
  rendered_preheader text,
  rendered_text text,

  skip_reason text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (dedupe_key)
);
```

---

## 8.8. `communication_preferences`

```sql
CREATE TABLE public.communication_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  product_education_enabled boolean NOT NULL DEFAULT true,
  lifecycle_enabled boolean NOT NULL DEFAULT true,
  commercial_enabled boolean NOT NULL DEFAULT true,

  preferred_send_time time,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',

  unsubscribed_at timestamptz,
  unsubscribe_reason text,
  unsubscribe_token_hash text,
  token_created_at timestamptz,

  bounce_status text,
  complaint_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Não armazenar token puro

Gerar um token aleatório e armazenar apenas o hash.

O link contém o token puro.

---

## 8.9. `lifecycle_provider_events`

Opcional na primeira fase.

```sql
CREATE TABLE public.lifecycle_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_delivery_id uuid REFERENCES public.email_deliveries(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Usar para:

- entrega;
- rejeição;
- bloqueio;
- reclamação;
- clique, se integrado;
- abertura, se disponível.

A ativação do usuário deve continuar sendo a métrica principal.

---

# 9. RLS e permissões

## 9.1. Campanhas, etapas e regras

- administradores: acesso total;
- usuários comuns: sem leitura direta;
- backend com service role: acesso total.

## 9.2. Matrículas e estado

Usuário pode ler apenas:

- seu progresso;
- suas preferências.

Não precisa permitir alteração livre de:

- nível de ativação;
- status da matrícula;
- fila;
- eventos do backend.

## 9.3. Preferências

Usuário autenticado pode:

- ler suas preferências;
- atualizar preferências permitidas.

Descadastro público deve ocorrer por endpoint assinado, não por acesso anônimo direto à tabela.

## 9.4. Dispatches

- administradores: leitura;
- backend: controle;
- usuários: sem acesso direto.

---

# 10. Eventos do módulo

## 10.1. Eventos mínimos

```text
user_registered
user_activated
user_logged_in
profile_updated
profession_selected

onboarding_started
onboarding_completed

patient_created
patient_updated
patient_record_linked

evolution_started
evolution_completed
evolution_failed
audio_evolution_completed

patient_history_viewed

report_generated
migration_requested
migration_completed
backup_configured
custom_logo_added
digital_signature_used

trial_started
trial_expiring
trial_expired

subscription_started
subscription_renewed
subscription_status_changed
subscription_cancel_requested
subscription_cancelled

account_inactive
account_reactivated
account_deleted

email_unsubscribed
```

---

# 11. Como capturar cada evento no código atual

## 11.1. `user_registered`

### Fonte recomendada

`bootstrapOnboardingAccess`, quando não existir registro em `professionals`.

Após `ensureActiveProfessionalProfile`:

- inserir evento `user_registered`;
- inserir evento `trial_started`;
- criar preferências;
- criar estado;
- matricular na jornada.

### Idempotency key

```text
user_registered:{user_id}
```

---

## 11.2. `user_activated`

Gerar quando:

- profissional fica `active`;
- conta automática é liberada;
- administrador aprova conta pendente.

Pode ser trigger na tabela `professionals`:

```text
OLD.status != 'active'
NEW.status = 'active'
```

A matrícula principal deve começar em `user_activated`, não no cadastro de uma conta pendente.

---

## 11.3. `user_logged_in`

A rota `/api/onboarding/bootstrap` é chamada durante o carregamento da sessão.

Adicionar:

- atualização de `last_login_at`;
- atualização de `last_activity_at`;
- evento diário deduplicado.

### Dedupe

```text
user_logged_in:{user_id}:{YYYY-MM-DD}
```

Não inserir um evento em cada refresh.

---

## 11.4. `patient_created`

Criar trigger `AFTER INSERT` em `patients`.

O frontend já insere diretamente em `patients`, portanto a trigger é mais confiável.

### Metadata

```json
{
  "has_google_doc": true,
  "reminder_enabled": false
}
```

Sem nome do paciente.

---

## 11.5. `patient_record_linked`

Criar quando:

- `google_doc_id` passa de nulo/vazio para preenchido.

Trigger `AFTER UPDATE`.

---

## 11.6. `evolution_started`

O insert/upsert em `evolutions` ocorre quando o usuário envia os áudios para processamento.

Trigger `AFTER INSERT` ou detecção de upsert inicial:

- `transcription_status = "processing"`.

### Limitação

O início da gravação fica apenas no navegador/IndexedDB.

Para detectar gravação abandonada antes do envio, será necessário um evento frontend adicional.

### Primeira fase

Considerar “evolução iniciada” somente quando a linha foi persistida no Supabase.

---

## 11.7. `evolution_completed`

Trigger quando:

```text
OLD.transcription_status != 'completed'
NEW.transcription_status = 'completed'
AND NEW.google_doc_append_status = 'completed'
```

### Evento de áudio

Se `audio_duration_seconds > 0`, gerar também:

```text
audio_evolution_completed
```

---

## 11.8. `evolution_failed`

Trigger na transição para:

- `transcription_status = failed`;
- ou `google_doc_append_status = failed`.

Esse evento pode gerar suporte contextual, mas não deve virar e-mail em todo erro temporário.

---

## 11.9. `patient_history_viewed`

É um evento de interface.

Adicionar em `PatientDetail.tsx` ou na página que efetivamente exibe o histórico:

```ts
void trackLifecycleEvent('patient_history_viewed', {
  entityType: 'patient',
  entityId: patient.id
});
```

Aplicar cooldown para não registrar repetidamente.

---

## 11.10. `report_generated`

Criar trigger em `patient_reports`.

---

## 11.11. `migration_requested` e `migration_completed`

Criar triggers em `migration_requests` conforme alteração de status.

---

## 11.12. Assinatura

Há múltiplos caminhos:

- Stripe webhook;
- processamento Google Pay;
- endpoints do servidor;
- atualização administrativa.

A forma mais confiável é trigger em `professionals` observando:

- `subscription_plan`;
- `subscription_status`;
- `subscription_ends_at`.

### Regras

- trial para active: `subscription_started`;
- active com nova data final: `subscription_renewed`;
- qualquer mudança de status: `subscription_status_changed`;
- para canceled: `subscription_cancelled`.

O webhook continua processando pagamentos normalmente.

---

# 12. Recalcular estado do usuário

Criar função:

```ts
recalculateLifecycleUserState(userId: string)
```

Ela deve consultar:

- `professionals`;
- `patients`;
- `evolutions`;
- `patient_reports`;
- `migration_requests`;
- demais tabelas confirmadas.

### Cálculo de ativação

#### Nível 0

- perfil existente;
- nenhum paciente.

#### Nível 1

- login realizado;
- onboarding iniciado.

#### Nível 2

- pelo menos um paciente.

#### Nível 3

- paciente com prontuário vinculado.

#### Nível 4

- primeira evolução concluída.

#### Nível 5

- pelo menos três evoluções;
- uso em mais de um dia.

#### Nível 6

- uso recorrente;
- mais de um recurso complementar.

### Status recomendados

```text
registered
profile_started
patient_created
record_linked
first_evolution_completed
activated
recurring
advanced
inactive
churned
```

---

# 13. Matrícula na jornada

## 13.1. Momento

Matricular quando:

- `professionals.status = active`;
- usuário não é administrador;
- usuário permite e-mails;
- campanha está ativa;
- não existe matrícula anterior.

## 13.2. Dia 0

O e-mail de boas-vindas atual continua sendo enviado.

## 13.3. Dia 1

Agendar para:

- 24 horas após `user_activated`;
- respeitando horário configurado;
- respeitando timezone.

## 13.4. Prazo máximo

A sequência de 15 mensagens pode ser concluída em até 25 dias.

Isso permite:

- substituições;
- pausas;
- condicionais;
- problemas de entrega;
- bloqueio por frequência.

---

# 14. Motor de regras

## 14.1. Regra principal

Antes de enviar qualquer mensagem:

1. verificar conta;
2. verificar preferência;
3. verificar campanha;
4. verificar frequência;
5. atualizar estado;
6. buscar condicionais elegíveis;
7. escolher maior prioridade;
8. decidir se o passo da sequência será enviado, adiado ou ignorado;
9. criar dispatch;
10. entregar.

---

## 14.2. Prioridade

Escala sugerida:

| Prioridade | Tipo |
|---:|---|
| 100 | assinatura confirmada, bloqueio, erro crítico |
| 90 | teste terminando, evolução interrompida |
| 80 | abandono de ativação |
| 70 | próxima ação de ativação |
| 60 | reativação |
| 50 | sequência principal |
| 40 | recursos avançados |
| 30 | conteúdo promocional |

---

## 14.3. Substituição

Quando uma condicional for escolhida:

- criar dispatch condicional;
- marcar o passo diário como adiado;
- não avançar a posição da jornada;
- recalcular `next_step_at`.

Não descartar automaticamente o e-mail da sequência.

---

## 14.4. Skip definitivo

Ignorar definitivamente quando:

- objetivo já foi concluído;
- usuário já possui recurso;
- mensagem é comercial e usuário assinou;
- plano não oferece o recurso;
- conta foi cancelada;
- prazo da campanha expirou;
- mensagem ficou obsoleta.

Registrar `skip_reason`.

---

## 14.5. Cooldown

Padrão:

```text
1 e-mail de relacionamento a cada 24 horas
```

Exceções:

- confirmação de pagamento;
- recuperação de senha;
- alerta técnico importante;
- mensagens estritamente transacionais.

---

# 15. Regras condicionais iniciais

## 15.1. Sem novo acesso

```text
rule_key: no_return_after_registration
delay: 24 horas
condition:
  last_login_at is null
priority: 80
```

## 15.2. Acessou, mas não cadastrou paciente

```text
rule_key: logged_in_without_patient
delay: 24 horas
condition:
  last_login_at is not null
  patients_count = 0
priority: 80
```

## 15.3. Paciente sem prontuário

```text
rule_key: patient_without_linked_record
delay: 24 horas
condition:
  patients_count > 0
  linked_records_count = 0
priority: 85
```

## 15.4. Prontuário vinculado, sem evolução

```text
rule_key: linked_record_without_evolution
delay: 24 horas
condition:
  linked_records_count > 0
  evolutions_count = 0
priority: 90
```

## 15.5. Evolução iniciada, mas não concluída

```text
rule_key: evolution_processing_too_long
delay: 2 horas
condition:
  existe evolução processing/failed recente
  não existe conclusão
priority: 95
```

### Cuidado

Não enviar automaticamente se o erro for técnico global.

---

## 15.6. Primeira evolução concluída

```text
rule_key: first_evolution_completed
trigger: evolution_completed
priority: 85
cooldown: 0
```

Antes de enviar, verificar se uma notificação por e-mail equivalente já foi enviada.

---

## 15.7. Nunca utilizou áudio

No sistema atual, a criação principal de evolução já é baseada em áudio.

A regra deve ser validada com dados reais antes de ser ativada.

Caso existam evoluções importadas ou manuais:

```text
evolutions_count >= 2
audio_evolutions_count = 0
```

---

## 15.8. Três dias sem acesso

```text
last_login_at <= now - 3 days
subscription_status in trialing, active
```

## 15.9. Sete dias sem acesso

Prioridade maior e mensagem de retomada.

## 15.10. Quatorze dias sem acesso

Mensagem de dificuldade/suporte.

## 15.11. Fim do teste

Basear em `trial_ends_at`, não em dia fixo da jornada.

- 3 dias antes;
- 1 dia antes;
- no dia;
- 2 dias depois;
- 7 dias depois.

## 15.12. Assinatura concluída

- cancelar mensagens de conversão pendentes;
- manter educação;
- matricular em campanha de adoção de cliente.

---

# 16. Relação entre a jornada de 15 mensagens e o teste de 7 dias

## 16.1. Usuário assina antes do fim do teste

- continua recebendo a jornada educativa;
- dias 14 e 15 deixam de ser comerciais;
- recebe conteúdo avançado.

## 16.2. Usuário não assina

- recebe alertas condicionais ligados ao trial;
- mensagens educativas podem continuar com CTAs compatíveis;
- não enviar CTA para funcionalidade bloqueada sem informar a necessidade de plano;
- após expiração, priorizar retomada e conversão.

## 16.3. Usuário ainda não ativou até o fim do teste

Mensagem recomendada:

- reconhecer que ele não conseguiu experimentar;
- oferecer orientação;
- evitar apenas “assine agora”.

---

# 17. Renderização de templates

## 17.1. Formato armazenado

- assunto em texto;
- preheader em texto;
- corpo em Markdown;
- CTA em campos separados;
- HTML gerado no backend.

## 17.2. Variáveis permitidas

```text
{{primeiro_nome}}
{{nome_completo}}
{{profissao}}
{{quantidade_pacientes}}
{{quantidade_evolucoes}}
{{quantidade_audios}}
{{quantidade_documentos}}
{{plano_atual}}
{{data_fim_teste}}
{{dias_restantes_teste}}
{{proxima_acao}}
{{link_acao}}
{{link_suporte}}
```

## 17.3. Registro central

Criar:

```ts
const LIFECYCLE_TOKEN_REGISTRY = {
  primeiro_nome: ...,
  profissao: ...,
  quantidade_pacientes: ...,
};
```

Não substituir variáveis por acesso dinâmico irrestrito a propriedades.

## 17.4. Escape

- escapar conteúdo do usuário;
- sanitizar Markdown convertido;
- não permitir JavaScript;
- não permitir atributos perigosos;
- não aceitar HTML livre por padrão.

## 17.5. Fallback

Exemplo:

```ts
primeiro_nome || "Profissional"
```

Não renderizar:

```text
undefined
null
NaN
```

---

# 18. Integração com `sendTransactionalEmail`

## 18.1. Alterar tipos

Adicionar ao tipo `EmailDeliverySource`:

```ts
"lifecycle"
"lifecycle-conditional"
"lifecycle-test"
```

## 18.2. Fazer `recordEmailDelivery` retornar o registro

Atualmente a função apenas insere.

Alterar para retornar:

```ts
{
  id,
  provider_message_id,
  status
}
```

## 18.3. Resultado de envio

Expandir:

```ts
type EmailDeliveryResult = {
  provider: EmailProvider;
  messageId: string | null;
  emailDeliveryId: string | null;
};
```

## 18.4. Vincular dispatch

Após envio:

```text
lifecycle_dispatches.email_delivery_id = resultado.emailDeliveryId
```

---

# 19. Fila e processamento

## 19.1. Não enviar diretamente dentro de triggers

Triggers devem apenas:

- registrar evento;
- atualizar estado leve;
- solicitar recálculo.

O envio ocorre no worker/cron.

## 19.2. Função de claim

Criar RPC PostgreSQL:

```sql
claim_lifecycle_dispatches(
  worker_id text,
  batch_size integer
)
```

Usar:

```sql
FOR UPDATE SKIP LOCKED
```

A função deve:

1. selecionar mensagens vencidas;
2. ignorar mensagens já processadas;
3. marcar como `processing`;
4. definir `claimed_at`;
5. definir `claimed_by`;
6. retornar registros.

## 19.3. Endpoint cron

```text
GET /api/cron/process-lifecycle
```

ou:

```text
POST /api/cron/process-lifecycle
```

### Proteção

- exigir `Authorization: Bearer CRON_SECRET`;
- em produção, `CRON_SECRET` deve ser obrigatório;
- não derivar segredo de chave anônima;
- falhar ao iniciar/configurar se ausente.

## 19.4. Batch

Sugestão inicial:

- até 25 mensagens por execução;
- limite interno de 45 segundos;
- cron a cada 5 ou 10 minutos;
- nova execução processa o restante.

## 19.5. Retry

- tentativa 1: imediata;
- tentativa 2: 15 minutos;
- tentativa 3: 2 horas;
- depois: `failed`.

Não repetir automaticamente para:

- destinatário inexistente;
- descadastro;
- bounce permanente;
- conta apagada.

---

# 20. Scheduler diário

Criar função:

```ts
scheduleLifecycleMessages(now: Date)
```

Responsabilidades:

1. encontrar matrículas ativas;
2. atualizar estados desatualizados;
3. identificar passo devido;
4. avaliar condicionais;
5. respeitar preferências;
6. criar dispatch deduplicado;
7. atualizar próximo horário.

### Não enviar durante o scheduler

O scheduler apenas cria a fila.

A entrega fica separada.

---

# 21. Idempotência

## 21.1. Eventos

Exemplo:

```text
evolution_completed:{evolution_id}
```

## 21.2. Passo da sequência

```text
sequence:{enrollment_id}:{step_id}
```

## 21.3. Condicional

```text
conditional:{user_id}:{rule_key}:{event_or_period_key}
```

Exemplo:

```text
conditional:USER:inactive_7d:2026-07-16
```

## 21.4. Assinatura

```text
subscription_started:{transaction_id}
```

## 21.5. Banco

Garantir com índice `UNIQUE`, não apenas com consulta antes do insert.

---

# 22. Preferências e descadastro

## 22.1. Rodapé

E-mails educativos/comerciais devem conter:

- identificação do Evolução Clínica;
- link de preferências;
- link de descadastro;
- suporte.

## 22.2. Endpoint público

```text
GET /api/communication/unsubscribe?token=...
POST /api/communication/unsubscribe
```

## 22.3. Validação

- hash do token;
- expiração ou rotação;
- resposta sem expor existência da conta;
- registro do evento `email_unsubscribed`.

## 22.4. Página

```text
/preferencias-de-comunicacao
/descadastro
```

A página pública deve ser simples e não expor dados clínicos.

---

# 23. Painel administrativo

Adicionar item no menu:

```text
Onboarding dos Usuários
```

Manter o item existente:

```text
Jornada 15 dias
```

para a jornada pública.

## 23.1. Rotas propostas

```text
/admin/lifecycle
/admin/lifecycle/campaigns
/admin/lifecycle/campaigns/:campaignKey
/admin/lifecycle/rules
/admin/lifecycle/users
/admin/lifecycle/users/:userId
/admin/lifecycle/deliveries
/admin/lifecycle/settings
```

## 23.2. Visão geral

Exibir:

- usuários matriculados;
- ativos;
- pausados;
- concluídos;
- ativação em 24h;
- ativação em 7 dias;
- primeira evolução;
- conversão para assinatura;
- e-mails na fila;
- falhas;
- supressões;
- cancelamentos.

## 23.3. Editor de campanha

Permitir:

- ativar/pausar;
- alterar horário;
- alterar passo;
- assunto;
- preheader;
- corpo;
- CTA;
- prioridade;
- regras de elegibilidade;
- visualizar versão desktop/mobile;
- enviar teste.

## 23.4. Usuários

Exibir:

- nome;
- e-mail;
- profissão;
- plano;
- estágio;
- último acesso;
- pacientes;
- evoluções;
- mensagem anterior;
- próxima mensagem;
- matrícula;
- preferência.

Ações:

- pausar;
- retomar;
- cancelar;
- recalcular estado;
- simular próxima mensagem;
- enviar teste apenas para administrador;
- não permitir envio duplicado acidental.

## 23.5. Histórico

Unificar visualmente:

- dispatch;
- email_delivery;
- evento;
- resultado;
- regra aplicada;
- motivo de skip;
- provedor;
- erro.

---

# 24. APIs propostas

## Usuário autenticado

```text
GET  /api/lifecycle/me
POST /api/lifecycle/events
GET  /api/communication/preferences
PUT  /api/communication/preferences
```

## Público assinado

```text
GET  /api/communication/unsubscribe
POST /api/communication/unsubscribe
```

## Cron

```text
POST /api/cron/schedule-lifecycle
POST /api/cron/process-lifecycle
POST /api/cron/recalculate-lifecycle
```

Pode existir um único endpoint orquestrador no MVP:

```text
POST /api/cron/run-lifecycle
```

Mas internamente as etapas devem permanecer separadas.

## Admin

```text
GET    /api/admin/lifecycle/overview
GET    /api/admin/lifecycle/campaigns
POST   /api/admin/lifecycle/campaigns
PUT    /api/admin/lifecycle/campaigns/:id
GET    /api/admin/lifecycle/rules
PUT    /api/admin/lifecycle/rules/:id
GET    /api/admin/lifecycle/users
GET    /api/admin/lifecycle/users/:id
POST   /api/admin/lifecycle/users/:id/pause
POST   /api/admin/lifecycle/users/:id/resume
POST   /api/admin/lifecycle/users/:id/recalculate
GET    /api/admin/lifecycle/deliveries
POST   /api/admin/lifecycle/preview
POST   /api/admin/lifecycle/test-email
POST   /api/admin/lifecycle/simulate
```

Todas as rotas administrativas devem usar:

- `requireAuth`;
- `requireAdmin`.

---

# 25. Serviço de telemetria frontend

Criar:

```text
src/services/lifecycleTelemetry.ts
```

Exemplo:

```ts
export async function trackLifecycleEvent(
  eventName: LifecycleFrontendEvent,
  options: {
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
  } = {}
): Promise<void>
```

### Regras

- falha não deve bloquear a ação principal;
- não enviar texto clínico;
- usar token da sessão;
- aplicar debounce/cooldown;
- backend valida nomes permitidos;
- usuário só pode gerar evento para si.

### Eventos frontend iniciais

- `patient_history_viewed`;
- `feature_discovered`;
- `document_area_viewed`;
- `subscription_page_viewed`;
- `support_opened`.

---

# 26. Ajustes necessários em arquivos existentes

## `server.ts`

- extrair infraestrutura de e-mail;
- importar registradores do módulo;
- adicionar novas fontes de e-mail;
- alterar retorno de `recordEmailDelivery`;
- permitir política de canais em notificações;
- registrar login no bootstrap;
- remover lógica nova do arquivo monolítico.

## `src/App.tsx`

- adicionar rotas públicas de preferências/descadastro;
- manter proteção;
- não executar motor de jornada no frontend.

## `src/pages/AdminPanel.tsx`

- adicionar navegação;
- renderizar `LifecycleAdmin`;
- diferenciar a jornada pública do onboarding dos usuários.

## `src/pages/PatientForm.tsx`

Não é obrigatório emitir `patient_created` no frontend se existir trigger.

Pode emitir apenas eventos de interface não cobertos.

## `src/pages/NewEvolution.tsx`

- eventos persistentes devem vir da trigger;
- opcionalmente emitir início de gravação, com cuidado;
- não enviar e-mail duplicado pela notificação de sucesso.

## `src/pages/PatientDetail.tsx`

- emitir `patient_history_viewed` com cooldown.

## `src/pages/Profile.tsx`

- adicionar acesso às preferências de comunicação;
- utilizar `professional_title` na segmentação.

## `src/services/notificationHelper.ts`

- corrigir origem padrão;
- suportar canais;
- evitar e-mail por padrão em confirmações de rotina.

## `vercel.json`

- avaliar configuração explícita de cron;
- manter limite de 60 segundos;
- garantir que rotas públicas de descadastro sejam reescritas corretamente.

---

# 27. Segmentação por profissão

O campo existente é:

```text
professionals.professional_title
```

Há opções como:

- Psicólogo(a);
- Terapeuta Ocupacional;
- Fisioterapeuta;
- Fonoaudiólogo(a);
- Psicopedagogo(a);
- Nutricionista;
- Enfermeiro(a);
- profissões médicas;
- outros.

## Implementação

Criar normalizador:

```ts
normalizeProfessionSegment(professionalTitle)
```

Retorno:

```text
psychology
occupational_therapy
physiotherapy
speech_therapy
psychopedagogy
nutrition
nursing
medical
clinic
other
```

### Não usar o texto livre diretamente como chave de template

Guardar:

- valor original;
- segmento normalizado.

---

# 28. Conta individual versus clínica

Não foi identificado, na análise principal, um campo consolidado e confiável chamado `account_type`.

### Decisão

Antes de ativar segmentação de clínica:

- confirmar se existe campo equivalente;
- caso não exista, adicionar ao perfil;
- não inferir clínica apenas por número de pacientes.

Possíveis valores:

```text
individual
clinic
team_member
```

---

# 29. Conteúdo da jornada

O arquivo funcional deve ser usado como fonte de conteúdo:

```text
jornada_ativacao_evolucao_clinica.md
```

Na implementação:

- criar seed para 15 passos;
- ajustar conteúdos incompatíveis com o produto real;
- não afirmar revisão formal antes de salvar enquanto não houver essa etapa;
- incluir vinculação do Google Docs;
- adaptar dias posteriores ao fim do teste;
- apresentar somente recursos existentes e disponíveis no plano.

---

# 30. Seed inicial

Criar campanha:

```text
key: new_user_activation_15d
name: Jornada de Ativação — Novos Usuários
type: sequence
status: draft
timezone: America/Sao_Paulo
default_send_time: 08:30
max_messages_per_24h: 1
completion_window_days: 25
```

Criar 15 passos em `draft`.

Somente ativar após:

- revisão de URLs;
- revisão dos planos;
- revisão dos templates;
- teste interno;
- implementação de descadastro.

---

# 31. Métricas

## 31.1. Métricas principais

- cadastro → primeiro retorno;
- cadastro → primeiro paciente;
- paciente → prontuário vinculado;
- prontuário → primeira evolução;
- tempo até primeira evolução;
- ativação em 24 horas;
- ativação em 7 dias;
- uso após 15 dias;
- conversão trial → assinatura;
- retenção após 30 dias.

## 31.2. E-mail

- agendado;
- enviado;
- falhou;
- rejeitado;
- descadastro;
- clique;
- ação realizada após e-mail.

## 31.3. Atribuição

Após cada e-mail, criar janela de atribuição.

Exemplo:

```text
patient_created within 72 hours after dispatch
```

Não afirmar causalidade absoluta.

Registrar:

- `dispatch_id`;
- evento posterior;
- intervalo.

---

# 32. Segurança e privacidade

## 32.1. Não incluir dados clínicos nos e-mails

Evitar:

- nome do paciente;
- diagnóstico;
- texto de evolução;
- conteúdo do prontuário;
- resumo falado;
- documentos.

Mensagens devem falar genericamente:

> Você possui um registro pendente.

Não:

> A evolução do paciente X está pendente.

## 32.2. Links

- usar rotas internas;
- HTTPS;
- não incluir IDs sensíveis desnecessários;
- não incluir tokens de autenticação;
- links de descadastro devem ser próprios e assinados.

## 32.3. SMTP

O código atual usa:

```ts
tls: { rejectUnauthorized: false }
```

Recomendação:

- usar validação padrão em produção;
- permitir exceção somente por configuração explícita e ambiente controlado.

## 32.4. Segredo do cron

Em produção:

- `CRON_SECRET` obrigatório;
- não gerar a partir da chave anônima;
- não registrar o segredo em logs;
- não gravar URL com segredo em conteúdo público.

---

# 33. Concorrência e falhas

## 33.1. Duas execuções de cron

A função de claim com `SKIP LOCKED` impede envio duplo.

## 33.2. Timeout da Vercel

- processar batch;
- encerrar antes do limite;
- retornar contagem;
- restante permanece na fila.

## 33.3. Envio realizado, atualização falhou

Problema clássico:

1. provedor aceita o e-mail;
2. aplicação falha antes de marcar como enviado;
3. retry envia novamente.

### Mitigação

- criar dispatch antes;
- usar ID lógico no cabeçalho/metadado do provedor quando possível;
- guardar provider message ID;
- marcar tentativa imediatamente;
- implementar reconciliação;
- manter dedupe forte.

---

# 34. Migração de usuários existentes

## Padrão recomendado

Não matricular automaticamente todos os usuários antigos.

Criar opções:

- somente novos usuários após a data de ativação;
- matrícula manual;
- coorte piloto;
- backfill selecionado.

## Admin

Campo:

```text
enrollment_mode:
  new_users_only
  selected_users
  all_eligible_users
```

Para primeira ativação:

```text
new_users_only
```

---

# 35. Estratégia de rollout

## Fase 0 — Infraestrutura

- tabelas;
- eventos;
- estado;
- preferências;
- fila;
- cron;
- sem envio real.

## Fase 1 — Modo observação

- calcular mensagens;
- registrar como `skipped/dry_run`;
- validar decisões;
- nenhum e-mail enviado.

## Fase 2 — Equipe interna

- usuários administrativos/testes;
- envio por Brevo ou SMTP configurado;
- simular 15 dias.

## Fase 3 — Coorte pequena

- 5% ou grupo selecionado;
- monitorar falhas;
- verificar duplicidade;
- verificar descadastro.

## Fase 4 — Novos usuários

- ativar para novos cadastros;
- manter rollback.

## Fase 5 — Condicionais avançadas

- reativação;
- churn;
- recursos avançados;
- segmentação por profissão.

---

# 36. Testes obrigatórios

## 36.1. Unidade

- renderização de token;
- fallback;
- regras;
- prioridade;
- cooldown;
- cálculo de datas;
- timezone;
- dedupe;
- ativação;
- trial.

## 36.2. Integração

- trigger de paciente;
- trigger de evolução;
- trigger de assinatura;
- matrícula;
- scheduler;
- claim;
- envio;
- falha;
- retry;
- descadastro;
- cancelamento de dispatch.

## 36.3. Cenários end-to-end

### Cenário A

- novo usuário;
- ativa conta;
- recebe welcome;
- recebe dia 1 depois de 24h;
- cadastra paciente;
- condicional básica deixa de ser elegível.

### Cenário B

- cadastra paciente;
- não vincula prontuário;
- recebe orientação correta;
- não recebe “crie sua evolução” prematuramente.

### Cenário C

- conclui primeira evolução;
- não recebe dois e-mails de celebração;
- sequência continua no dia seguinte.

### Cenário D

- assina no dia 5;
- mensagens comerciais pendentes são canceladas;
- conteúdo educativo permanece.

### Cenário E

- trial expira no dia 7;
- não recebe CTA incompatível;
- conversão é priorizada.

### Cenário F

- descadastra;
- e-mails educativos param;
- e-mails estritamente transacionais seguem política definida.

### Cenário G

- cron roda duas vezes;
- apenas um envio é produzido.

### Cenário H

- provedor falha;
- retry ocorre;
- auditoria registra erro.

### Cenário I

- usuário exclui conta;
- matrícula e estado são removidos;
- dispatches pendentes são cancelados.

---

# 37. Critérios de aceite

A implementação será considerada concluída quando:

1. novo usuário ativo é matriculado uma única vez;
2. welcome existente não é duplicado;
3. 15 passos podem ser administrados;
4. condicionais substituem o passo diário;
5. passo adiado não é perdido;
6. limite de frequência funciona;
7. assinatura remove conversão;
8. trial de 7 dias é respeitado;
9. usuário pode se descadastrar;
10. não há dados clínicos no evento ou no e-mail;
11. e-mails usam a infraestrutura atual;
12. histórico global continua funcionando;
13. dispatch possui auditoria;
14. cron é idempotente;
15. dois workers não enviam duplicado;
16. admin consegue pausar campanha;
17. admin consegue pausar usuário;
18. admin consegue visualizar a próxima mensagem;
19. testes passam;
20. build e TypeScript passam.

---

# 38. Scripts de validação

Executar obrigatoriamente:

```bash
npm run lint
npm run build
```

Adicionar testes automatizados ao projeto.

Sugestão:

- Vitest para unidade;
- testes de integração com Supabase local ou banco de teste;
- testes de rotas com cliente HTTP.

A escolha final deve respeitar o padrão adotado durante a implementação.

---

# 39. Compatibilidade e atualização de build

O README informa que a build exibida no rodapé deve ser atualizada em alterações de código.

Arquivo:

```text
src/components/layout/AppVersion.tsx
```

A IA deve:

1. implementar;
2. executar lint;
3. executar build;
4. atualizar versão;
5. documentar migrations;
6. não deixar alterações apenas locais;
7. usar branch e pull request conforme o fluxo definido pelo responsável.

---

# 40. Ordem recomendada de implementação

## Etapa 1

Refatorar infraestrutura de e-mail sem alterar comportamento.

## Etapa 2

Criar migrations do núcleo lifecycle.

## Etapa 3

Criar event store e triggers.

## Etapa 4

Criar recálculo de estado.

## Etapa 5

Criar matrícula.

## Etapa 6

Criar scheduler e fila.

## Etapa 7

Criar renderer.

## Etapa 8

Integrar entrega.

## Etapa 9

Criar preferências e descadastro.

## Etapa 10

Criar painel administrativo.

## Etapa 11

Criar seed da jornada.

## Etapa 12

Executar dry run.

## Etapa 13

Ativar coorte de teste.

---

# 41. Arquivos que a IA deve analisar antes de alterar

```text
README.md
package.json
server.ts
api/index.ts
vercel.json
vite.config.ts
tsconfig.json

src/App.tsx
src/supabaseClient.ts
src/store/authStore.ts
src/utils/onboarding.ts
src/services/notificationHelper.ts

src/pages/Onboarding.tsx
src/pages/PatientForm.tsx
src/pages/NewEvolution.tsx
src/pages/PatientDetail.tsx
src/pages/Profile.tsx
src/pages/Subscription.tsx
src/pages/AdminPanel.tsx
src/pages/EmailHistory.tsx

src/components/admin/JourneyAdmin.tsx
src/components/admin/DailyPushNotificationManager.tsx

supabase/functions/stripe-webhook/index.ts

supabase/migrations/20260623170000_create_onboarding_notifications.sql
supabase/migrations/20260624100000_add_trial_expiration_notices.sql
supabase/migrations/20260625190000_create_email_deliveries_table.sql
supabase/migrations/20260714153000_create_journey_system.sql
supabase/migrations/20260715121000_create_daily_push_logs.sql
```

Também deve localizar migrations posteriores que tenham alterado essas estruturas.

---

# 42. Instrução final para a IA implementadora

A implementação deve seguir estas regras:

1. não criar um segundo sistema de e-mail;
2. não reutilizar a jornada pública como matrícula individual;
3. não colocar toda a lógica nova em `server.ts`;
4. não depender apenas de `localStorage`;
5. não enviar e-mail dentro de trigger;
6. não armazenar conteúdo clínico em eventos;
7. não executar SQL arbitrário vindo do painel;
8. não enviar mensagens duplicadas;
9. não tratar abertura de e-mail como ativação;
10. não afirmar revisão clínica sem evento real;
11. não deixar conversão somente nos dias 14 e 15;
12. não enviar conteúdo comercial para assinante;
13. não enviar recurso indisponível no plano;
14. não bloquear ação clínica por falha de telemetria;
15. não ativar para todos os usuários sem dry run;
16. manter compatibilidade com Vercel e Supabase;
17. preservar RLS;
18. registrar cada decisão de envio;
19. criar rollback;
20. atualizar documentação e build.

---

# 43. Resultado esperado

Ao final, a plataforma deverá possuir um módulo que:

- conhece o estágio real do usuário;
- reconhece o que ele já fez;
- evita tutoriais obsoletos;
- escolhe uma próxima ação;
- envia no máximo a frequência permitida;
- adapta mensagens ao trial e à assinatura;
- permite administração;
- registra tudo;
- protege dados;
- utiliza a infraestrutura existente;
- pode evoluir sem aumentar ainda mais o acoplamento do `server.ts`.

Esse módulo deverá transformar a jornada de e-mails em uma camada de ativação e relacionamento orientada por comportamento, e não em uma simples sequência cronológica de mensagens.
