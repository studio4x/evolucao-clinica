# Auditoria técnica — Meta Pixel, cadastro e áreas autenticadas

**Projeto:** Evolução Clínica

**Domínio:** `evolucaoclinica.app.br`

**Data da auditoria:** 21 de agosto de 2026

**Baseline do repositório oficial:** `main` — commit `9db4b30a49c3b07e1f264e376b7ca322582ef70a`

**Build analisada:** `v1.10.824` / aplicativo móvel `1.0.85`
**Natureza da análise:** exclusivamente técnica, sem afirmações jurídicas sobre LGPD ou conformidade.

## 1. Escopo e metodologia

Este documento consolida duas auditorias complementares:

1. verificação do rastreamento de cadastro de novo usuário e da existência de um evento Meta `CompleteRegistration` utilizável para otimização de campanhas;
2. verificação das páginas e contextos em que Meta Pixel, Google Tag Manager e integrações de marketing permanecem carregados, especialmente nas áreas autenticadas e clínicas.

Foram analisados:

- fluxo Landing Page → Login → Supabase Auth → criação/carregamento do perfil → onboarding;
- todos os usos encontrados de `fbq`, `dataLayer`, `gtag`, `trackEvent`, `PageView`, `ViewContent`, Meta Pixel e Facebook Pixel;
- rotas públicas, autenticadas, administrativas e de documentos públicos;
- parâmetros aceitos pelo serviço central de analytics;
- consentimento separado de Analytics e Marketing;
- Meta Conversions API server-side;
- captura de UTM, `gclid`, `fbclid`, referrer e landing page;
- container publicado `GTM-W2JZ8SJG`;
- testes automatizados relacionados a analytics, aquisição, CAPI e política de recursos externos.

Raiz local usada na auditoria:

```text
C:\PLATAFORMAS VS CODE\EVOLUÇÃO CLINICA\evolucao-clinica
```

O estado oficial mais recente foi confirmado com `git fetch`/`git pull --ff-only`. A análise foi feita sobre `origin/main`/`main` no commit indicado acima.

## 2. Resumo executivo consolidado

### 2.1 Cadastro como conversão Meta

Hoje o cadastro gera o evento interno/GA4 `sign_up`, mas não gera um evento Meta padrão `CompleteRegistration`.

Não existe no repositório:

```javascript
fbq('track', 'CompleteRegistration')
```

Também não existe:

- `fbq('trackCustom', 'sign_up')`;
- tag Meta no GTM publicado convertendo `sign_up` em `CompleteRegistration`;
- Conversions API para cadastro;
- `event_id` de cadastro;
- deduplicação persistente do `sign_up` atual.

Conclusão sobre a pergunta principal da primeira auditoria:

> **Hoje, quando um usuário novo conclui o cadastro no Evolução Clínica, não há evidência de que a Meta receba um `CompleteRegistration` confiável e utilizável para otimização de campanhas.**

Classificação:

**❌ Não está configurado adequadamente para otimizar campanhas Meta por `CompleteRegistration`.**

### 2.2 Pixel nas áreas autenticadas

O Meta Pixel não está limitado ao funil comercial. Com consentimento de Marketing, ele pode ser carregado em qualquer rota da SPA, inclusive:

- dashboard autenticado;
- pacientes;
- prontuários;
- criação de evoluções;
- histórico;
- gravações e compartilhamento de áudio;
- perfil profissional;
- suporte;
- área administrativa;
- relatórios públicos identificados por ID.

O código não envia nomes de pacientes, textos clínicos, diagnósticos ou transcrições explicitamente para a Meta. Entretanto, existe risco de exposição contextual por URL, pois a inicialização global chama um `PageView` padrão sem sanitizar a URL atual.

Conclusão sobre a segunda auditoria:

> **Os parâmetros clínicos personalizados estão bem restringidos, mas o escopo global do Pixel não oferece uma separação técnica rígida entre aquisição e área clínica.**

Classificação:

**⚠️ Requer limitação por rota e sanitização de URLs antes de qualquer evento de Marketing.**

## 3. Arquivos e funções principais

| Arquivo | Função na auditoria |
| --- | --- |
| [`src/main.tsx`](../src/main.tsx) | Inicializa analytics antes da renderização do Router |
| [`src/App.tsx`](../src/App.tsx) | Define rotas, observa autenticação, dispara `login`/`sign_up` e page views internos |
| [`src/pages/Login.tsx`](../src/pages/Login.tsx) | Inicia Google OAuth/Supabase Auth |
| [`src/services/analytics.ts`](../src/services/analytics.ts) | Centraliza consentimento, GTM, GA4, Firebase e Meta Pixel |
| [`src/components/CookieConsent.tsx`](../src/components/CookieConsent.tsx) | Preferências separadas de Analytics e Marketing |
| [`src/utils/acquisitionTracking.ts`](../src/utils/acquisitionTracking.ts) | UTM, `gclid`, `fbclid`, referrer e signup touch |
| [`src/utils/acquisitionAttribution.ts`](../src/utils/acquisitionAttribution.ts) | Normalização, classificação e sanitização de atribuição |
| [`src/pages/Onboarding.tsx`](../src/pages/Onboarding.tsx) | `onboarding_begin` e `onboarding_complete` |
| [`src/pages/PatientForm.tsx`](../src/pages/PatientForm.tsx) | `patient_created` |
| [`src/pages/NewEvolution.tsx`](../src/pages/NewEvolution.tsx) | Eventos de início/conclusão de evolução |
| [`src/components/onboarding/GrowthProfileGate.tsx`](../src/components/onboarding/GrowthProfileGate.tsx) | Segmento e contexto profissional para Analytics |
| [`src/pages/SuccessPage.tsx`](../src/pages/SuccessPage.tsx) | Meta `Purchase` após confirmação de pagamento |
| [`supabase/functions/_shared/metaDelivery.ts`](../supabase/functions/_shared/metaDelivery.ts) | Meta CAPI exclusivamente para `Purchase` |
| [`supabase/functions/process-analytics-deliveries/index.ts`](../supabase/functions/process-analytics-deliveries/index.ts) | Retry de GA4 e Meta CAPI |
| [`supabase/migrations/20260818190000_add_meta_capi_delivery.sql`](../supabase/migrations/20260818190000_add_meta_capi_delivery.sql) | Fila idempotente de compras Meta |
| [`tests/analytics.test.ts`](../tests/analytics.test.ts) | Matriz de consentimento e destinos web/nativos |
| [`tests/meta-capi.test.ts`](../tests/meta-capi.test.ts) | Payload, consentimento e deduplicação da CAPI de compra |

## Parte I — Auditoria do cadastro e `CompleteRegistration`

## 4. Fluxo atual do cadastro

O fluxo observado é:

```text
Landing Page
  → captura UTM/gclid/fbclid
  → /login
  → OAuth Google/Supabase
  → retorno para /painel
  → Supabase Auth emite SIGNED_IN
  → dispara login
  → compara created_at com last_sign_in_at
  → se diferença < 5 minutos, dispara sign_up
  → carrega/cria o perfil professional
  → encaminha ao onboarding
  → onboarding_begin
  → onboarding_complete
```

A Landing Page direciona para `/login`. O login usa Google OAuth por meio de `requestGoogleOAuth()`.

O cadastro é identificado em `src/App.tsx`, dentro do listener `supabase.auth.onAuthStateChange`:

```typescript
if (session && _event === 'SIGNED_IN') {
  const method = typeof session.user.app_metadata?.provider === 'string'
    ? session.user.app_metadata.provider
    : 'google';

  trackEvent('login', { method }, {
    dedupeKey: `login:${session.user.id}:${session.user.last_sign_in_at || 'session'}`
  });

  const createdAt = new Date(session.user.created_at).getTime();
  const signedInAt = new Date(session.user.last_sign_in_at || '').getTime();

  if (
    Number.isFinite(createdAt) &&
    Number.isFinite(signedInAt) &&
    Math.abs(signedInAt - createdAt) < 5 * 60 * 1000
  ) {
    trackEvent('sign_up', { method }, {
      dedupeKey: `sign_up:${session.user.id}`
    });
  }
}
```

Portanto:

- o evento disparado é `sign_up`;
- o método normalmente é `google`;
- “novo usuário” é definido por uma heurística de diferença inferior a cinco minutos;
- o evento ocorre em `SIGNED_IN`;
- o evento ocorre antes da confirmação do perfil profissional e antes da conclusão do onboarding.

A criação ou regularização do perfil ocorre posteriormente em `bootstrapOnboardingAccess()` no servidor. O evento de onboarding concluído é independente:

```typescript
trackEvent('onboarding_complete', {}, {
  dedupeKey: `onboarding_complete:${user.id}`,
  persistDedupe: true
});
```

## 5. O cadastro está sendo rastreado?

Sim, para o subsistema interno de Analytics.

| Item | Resultado |
| --- | --- |
| Arquivo | `src/App.tsx` |
| Função/contexto | `supabase.auth.onAuthStateChange` |
| Momento | evento Supabase Auth `SIGNED_IN` |
| Condição de novo usuário | `abs(last_sign_in_at - created_at) < 5 minutos` |
| Nome do evento | `sign_up` |
| Parâmetro | `method`, normalmente `google` |
| Deduplicação | apenas memória, não persistente |

Essa condição não é uma confirmação transacional de primeira criação. É uma heurística temporal.

## 6. O cadastro é enviado diretamente ao Meta Pixel?

Não.

As chamadas diretas encontradas são:

### Inicialização

```typescript
window.fbq('consent', 'grant');
window.fbq('init', pixelId);
window.fbq('track', 'PageView');
```

### Checkout

```typescript
window.fbq?.('track', 'InitiateCheckout', sanitized);
```

### Compra confirmada

```typescript
window.fbq?.('track', 'Purchase', {
  value: input.amount,
  currency: 'BRL',
  content_name: planName,
  content_category: 'Subscription',
  content_ids: [planId],
  content_type: 'product'
}, {
  eventID: `purchase-${transactionId}`
});
```

Não existe chamada direta de `CompleteRegistration` ou `sign_up` para a Meta.

## 7. O `sign_up` entra no `dataLayer`?

O objeto genérico enviado ao `dataLayer` é:

```typescript
window.dataLayer.push({
  event: normalized,
  ...sanitized,
  analytics_destination: analyticsThroughGtm,
  marketing_destination: marketingThroughGtm
});
```

Para `sign_up` no navegador, com consentimento de Analytics e GTM configurado, o resultado esperado é:

```javascript
dataLayer.push({
  event: 'sign_up',
  method: 'google',
  analytics_destination: true,
  marketing_destination: false
});
```

O motivo é:

```typescript
const MARKETING_EVENT_NAMES = new Set(['begin_checkout']);
```

Consequências:

- `sign_up` nunca recebe `marketing_destination: true`;
- se Analytics for aceito, ele pode ir ao GTM/GA4;
- se apenas Marketing for aceito e Analytics for negado, `sign_up` não entra no `dataLayer`;
- a existência do evento no `dataLayer` não autoriza uma tag de Marketing.

## 8. O GTM publicado converte `sign_up` em `CompleteRegistration`?

Não no container publicado verificado durante a auditoria.

O `tracking_settings` público confirmou:

```text
GTM: GTM-W2JZ8SJG
Meta Pixel: 4050515911745193
```

No JavaScript compilado do container `GTM-W2JZ8SJG` foram encontrados:

- Google Tag `G-HQE1THHB7X`;
- Google Ads `AW-18388392858`;
- Conversion Linker;
- tag GA4 de eventos;
- listeners de link e History Change;
- expressão de eventos contendo `sign_up`, `patient_created` e eventos de evolução.

Não foram encontrados:

- `CompleteRegistration`;
- `ViewContent`;
- `fbq`;
- ID do Pixel Meta;
- Custom HTML;
- tag Meta.

O `sign_up` está na regra da tag GA4, condicionada a `analytics_destination=true`.

Configurações do Events Manager, Event Setup Tool e histórico do container são externas ao repositório. A verificação do container publicado mostra o estado atual acessível, mas não substitui inspeção dos painéis.

> **Não é possível confirmar apenas pelo código do repositório se configurações automáticas adicionais existem no Events Manager.**

## 9. O que chega ao GA4

`sign_up` é um evento compatível com GA4.

No navegador com GTM:

- entra no `dataLayer` quando Analytics está consentido;
- a tag GA4 publicada reconhece `sign_up`;
- `analytics_destination` precisa ser `true`.

Sem GTM e com `VITE_ANALYTICS_DIRECT_GA4=true`, o caminho alternativo é:

```typescript
window.gtag('event', normalized, sanitized);
```

No Android/WebView, com consentimento de Analytics, o evento usa a ponte Firebase nativa e não duplica o stream web.

Esta auditoria comprova o encaminhamento configurado, mas não inspecionou um cadastro real no GA4 Realtime/DebugView.

> **Não é possível confirmar a chegada efetiva de um cadastro real ao GA4 apenas pelo código do repositório.**

## 10. Riscos de duplicidade e perda do cadastro

Para `CompleteRegistration`, não existe duplicidade hoje porque não existe envio.

Para o `sign_up` atual:

- a deduplicação usa `sentDedupeKeys`, um `Set` em memória;
- `persistDedupe` não é usado no `sign_up`;
- reload apaga a deduplicação;
- novo login/reload em até cinco minutos pode repetir o evento;
- outro navegador ou dispositivo também pode repetir;
- React Strict Mode tende a ser contido pelo `Set` dentro da mesma execução;
- o guard `authSessionHandlingRef` protege o perfil, mas o tracking ocorre antes dele;
- OAuth posterior normalmente não passa pela janela de cinco minutos, mas pode passar logo após a criação;
- caminhos expostos apenas como `INITIAL_SESSION`, e não `SIGNED_IN`, não geram cadastro;
- evento descartado antes do consentimento não é enfileirado;
- se a configuração dinâmica ainda não tiver sido carregada, há risco de o evento ser perdido;
- não existe `event_id` de cadastro.

## 11. Consentimento no cadastro

O comportamento das ferramentas é separado por finalidade:

- `initAnalytics()` é chamado antes de renderizar a aplicação;
- o Consent Mode Google começa com todos os armazenamentos negados;
- nenhum GTM, GA4 direto ou Pixel carrega antes de uma escolha persistida;
- GTM carrega com Analytics ou Marketing;
- GA4 direto exige Analytics e ausência de GTM;
- Meta Pixel exige Marketing;
- `sign_up` exige Analytics;
- revogar Marketing chama `fbq('consent', 'revoke')`;
- eventos descartados não são enviados retroativamente.

Há uma observação separada: `captureAcquisitionData()` é executado sem consultar o consentimento. Ele pode gravar em `localStorage`:

- UTM source/medium/campaign/term/content;
- `gclid`;
- `fbclid`;
- referrer;
- landing page;
- timestamp de primeiro contato.

Após o login, `syncAcquisitionWithDatabase()` também pode sincronizar `acquisition_info` e `signup_acquisition_info` sem consultar Analytics ou Marketing.

Essa captura não envia o cadastro à Meta, mas é tecnicamente anterior e independente do banner.

## 12. Meta Conversions API

Existe Meta CAPI, mas exclusivamente para compras confirmadas.

O payload é:

```typescript
{
  event_name: 'Purchase',
  event_time: eventTime,
  event_id: `purchase-${transactionId}`,
  action_source: 'website',
  user_data: {
    external_id: [sha256(userId)]
  },
  custom_data: {
    value,
    currency: 'BRL'
  }
}
```

O endpoint é:

```text
POST https://graph.facebook.com/v25.0/{pixelId}/events
```

O token é lido de `META_CAPI_TOKEN` no ambiente server-side.

Características:

- exige `analytics_consents.marketing_granted`;
- usa `meta_event_deliveries`;
- possui `event_key` único;
- usa claim atômico, lock e retry;
- envia apenas compra inicial Stripe ou Google Play;
- navegador e CAPI compartilham o `eventID` de compra.

Não existem na CAPI:

- `CompleteRegistration`;
- cadastro ou onboarding;
- `_fbp`;
- `_fbc`;
- `fbclid`;
- `event_source_url`;
- e-mail ou telefone.

Referências a `graph.facebook.com` no módulo WhatsApp são integração de mensagens e não Conversions API.

A presença do código não comprova que migrations, worker e `META_CAPI_TOKEN` estejam operacionais no ambiente atual.

## 13. Classificação da primeira auditoria

**❌ Não configurado adequadamente para `CompleteRegistration`.**

O projeto rastreia cadastro para Analytics, mas não fornece à Meta um evento padrão de cadastro confiável. Não é seguro assumir que uma campanha criada hoje pode otimizar por `CompleteRegistration`.

## Parte II — Auditoria do Pixel, GTM e áreas autenticadas

## 14. Onde Pixel e GTM são carregados

### 14.1 Meta Pixel

`initializeMeta()` não verifica rota. A única condição funcional é:

```typescript
if (preferences.marketing) {
  grantMeta();
  initializeMeta();
  void loadDynamicIds();
}
```

Assim, o Pixel pode inicializar em qualquer rota quando:

1. a página abre com `cookie-consent.marketing=true` persistido; ou
2. o usuário concede Marketing na rota atual.

Rotas públicas e comerciais:

```text
/
/login
/checkout
/checkout/success
/checkout/sucess
/privacy
/terms
/jornada/*
```

Cadastro e onboarding:

```text
/onboarding
/pending
```

Áreas clínicas autenticadas:

```text
/painel/dashboard
/painel/patients
/painel/patients/new
/painel/patients/:id
/painel/patients/:id/edit
/painel/patients/:id/evolutions/new
/painel/history
/painel/share-target
/painel/migration
/painel/backup-exportacao
/painel/profile
/painel/support/*
```

Áreas administrativas:

```text
/admin/*
```

Documentos públicos:

```text
/public/reports/:reportId
```

### 14.2 Google Tag Manager

O GTM também não tem restrição de rota no cliente:

```typescript
if (preferences.analytics || preferences.marketing) {
  initializeGtm();
  void loadDynamicIds();
}
```

Portanto, seu script pode carregar em qualquer rota.

No container publicado:

- Google Tag/GA4 é configurado globalmente com `send_page_view=false`;
- a tag de eventos GA4 depende de `analytics_destination=true`;
- Google Ads e Conversion Linker dependem de carga inicial na raiz `/` e Marketing consentido;
- não existe tag Meta.

## 15. O Pixel é global ou limitado ao funil?

O Pixel é global.

`initAnalytics()` ocorre em `src/main.tsx`, antes do Router. Não existe política como:

```typescript
isMetaAllowedRoute(pathname)
```

Também não existe revogação automática ao entrar em:

```text
/painel/*
/admin/*
/public/reports/*
```

Uma vez carregado, `metaLoaded` permanece verdadeiro durante a execução da SPA.

## 16. O Pixel continua ativo depois do login?

Sim.

Se o usuário aceita Marketing na Landing Page e depois entra no sistema:

- `fbevents.js` permanece carregado;
- `window.fbq` e `window._fbq` permanecem disponíveis;
- não há revogação por autenticação ou rota;
- não há isolamento do script em relação ao DOM autenticado.

### 16.1 Navegação SPA normal

Ao navegar sem reload, o código não chama um novo `PageView` da Meta em cada mudança de rota.

O observador global de rota executa:

```typescript
trackPageView(location.pathname);
```

Esse `page_view` é um evento de Analytics, não de Marketing.

### 16.2 Reload, deep link ou consentimento concedido na área clínica

Nesses cenários, `initializeMeta()` é executado na URL atual e chama:

```typescript
fbq('track', 'PageView');
```

Não há sanitização prévia de `window.location.href`.

## 17. Dados que podem ser enviados nas áreas autenticadas

### 17.1 Meta `PageView`

O maior risco está no contexto padrão do navegador, potencialmente incluindo:

- URL atual;
- path;
- query string;
- referrer;
- título do documento;
- cookies/identificadores do Pixel;
- informações técnicas de navegador e dispositivo.

O código não fornece URL canônica e não remove identificadores antes da inicialização.

### 17.2 Eventos Meta comerciais

`InitiateCheckout` recebe somente:

```typescript
{
  plan_id,
  plan_name,
  value,
  currency: 'BRL',
  payment_provider
}
```

`Purchase` recebe valor, moeda, plano, categoria de assinatura e `eventID` de transação.

Não existe envio explícito para a Meta de:

- nome de paciente;
- prontuário;
- conteúdo de evolução;
- anamnese;
- gravação ou áudio;
- transcrição;
- diagnóstico;
- texto de documento;
- telefone ou e-mail;
- especialidade profissional;
- UUID de paciente como parâmetro customizado;
- `ViewContent` clínico.

### 17.3 Eventos clínicos no GTM/GA4

O sistema produz:

```text
patient_created
evolution_started
evolution_completed
audio_evolution_completed
```

`patient_created` não envia parâmetros. O ID de paciente aparece somente na chave de deduplicação local:

```typescript
dedupeKey: `patient_created:${user.id}:${patientId}`
```

As evoluções enviam somente:

```typescript
{
  input_mode: 'audio' | 'text' | 'hybrid',
  is_first_activation: boolean
}
```

Esses eventos chegam atualmente à tag GA4 quando Analytics está consentido. Não chegam a uma tag Meta no container publicado.

### 17.4 Dados profissionais

`professional_profile_complete` pode enviar ao GA4:

```typescript
{
  professional_segment,
  work_context
}
```

O container GA4 possui variáveis explícitas para esses campos. Eles não seguem atualmente para a Meta.

O UUID Supabase aplicado em `setAnalyticsUser()` é usado na ponte nativa Firebase, não no Pixel web.

## 18. Risco de URLs e identificadores clínicos

### 18.1 Paths com identificadores

```text
/painel/patients/:id
/painel/patients/:id/edit
/painel/patients/:id/evolutions/new
/public/reports/:reportId
/painel/support/:ticketId
```

Mesmo sem nome ou conteúdo, esses paths podem revelar:

- acesso a um registro de paciente;
- identificador estável do registro;
- contexto de prontuário/evolução;
- identificação de documento ou chamado.

### 18.2 Query strings e tokens

Exemplos presentes no projeto:

```text
/painel/patients/:id/evolutions/new?draftId=UUID
/painel/patients/:id/evolutions/new?date=AAAA-MM-DD
/painel/patients/new?onboarding=1
/checkout/success?session_id=...
/feedback/continuidade?token=...
/reativar-teste?token=...
/descadastro?token=...
```

Também pode existir uma janela de tempo no retorno OAuth em que `code` ainda está na URL.

Como `initAnalytics()` ocorre cedo, existe risco de corrida entre:

- processamento/limpeza de código OAuth;
- leitura de parâmetros de checkout;
- carregamento dinâmico do Pixel;
- disparo do `PageView`.

### 18.3 Sanitização interna do GA4

O page view interno usa apenas `location.pathname` e remove query/hash:

```typescript
trackPageView(location.pathname);
```

O sanitizador aceita apenas parâmetros pré-definidos e rejeita valores contendo termos como:

```text
patient
evolution
clinical
diagnos
transcri
document
drive
email
phone
token
record
```

Por isso, `page_location` de `/painel/patients/...` tende a ser removido do objeto GA4.

Essa proteção não cobre:

- o `PageView` padrão do Pixel;
- URL observada automaticamente por código de terceiro;
- `/public/reports/:reportId`, que não contém os termos bloqueados;
- `/painel/support/:ticketId`;
- configurações externas do Event Setup Tool;
- permanência do script Meta no contexto autenticado.

### 18.4 Nome de paciente em `document.title`

Durante impressão/download, existem títulos temporários como:

```typescript
document.title = `Prontuario_Evolucoes_${cleanPatientName}`;
document.title = `Evolucao_Clinica_${cleanPatientName}_${cleanDate}`;
```

Esses títulos são restaurados depois da operação e não há `fbq` explícito no mesmo fluxo. Não foi encontrado envio intencional do nome.

Ainda assim, manter o Pixel carregado nessas telas cria risco evitável se:

- evento automático externo ler o título;
- Pixel for inicializado durante esse intervalo;
- configuração externa observar DOM ou título.

## 19. Event Setup Tool e automação externa

O repositório não configura `ViewContent` nem eventos automáticos Meta.

Entretanto, o Meta Events Manager permite configurar eventos por ferramenta visual, sem alteração do código do site. Por isso:

- ausência no repositório não comprova que o Event Setup Tool está vazio;
- ausência no GTM não comprova ausência de regras automáticas associadas ao Pixel;
- a classificação “Saúde e bem-estar – outro” e “Configuração básica” não deve ser usada como substituto de minimização no código.

> **É necessário inspecionar o Events Manager para confirmar que eventos automáticos/Event Setup Tool estão desativados nas rotas clínicas.**

## 20. Arquitetura recomendada

### 20.1 Rotas Meta permitidas

```text
/
/login
/jornada/*
/checkout
/checkout/success
/checkout/sucess
```

`/checkout/success` deve ser permitido somente depois de preservar internamente e remover da URL os identificadores necessários.

Eventos permitidos:

```text
PageView comercial sanitizado
CompleteRegistration
InitiateCheckout
Purchase
```

### 20.2 Rotas Meta bloqueadas

```text
/onboarding
/painel/*
/admin/*
/public/reports/*
rotas com token
```

Isso cobre:

- pacientes;
- prontuários;
- evoluções;
- gravações;
- transcrições;
- documentos;
- histórico;
- dashboard;
- perfil;
- migração e backup;
- suporte autenticado;
- relatórios públicos.

A rota `/painel/subscription` é comercial, mas permanece dentro do painel. A alternativa mais segura é não liberar page views Meta nessa rota e emitir `InitiateCheckout` apenas no clique que inicia o checkout.

## 21. Mudanças exatas recomendadas

### 21.1 Criar política explícita de rotas

Em `src/services/analytics.ts`, criar função equivalente a:

```typescript
const isMetaAllowedRoute = (pathname: string) =>
  pathname === '/' ||
  pathname === '/login' ||
  pathname === '/checkout' ||
  pathname === '/checkout/success' ||
  pathname === '/checkout/sucess' ||
  pathname.startsWith('/jornada');
```

Toda rota não listada deve permanecer bloqueada para Marketing.

### 21.2 Remover `PageView` da inicialização

Separar:

```typescript
initializeMeta();
trackAllowedMetaPageView();
```

`initializeMeta()` não deve executar automaticamente:

```typescript
window.fbq('track', 'PageView');
```

O page view deve ser explícito, sanitizado e restrito à allowlist.

### 21.3 Revogar Meta nas rotas bloqueadas

Criar observador de rota:

```typescript
if (isMetaAllowedRoute(location.pathname) && marketingConsent) {
  fbq('consent', 'grant');
} else {
  fbq('consent', 'revoke');
}
```

O script pode permanecer carregado, mas não deve ter autorização de envio em contexto clínico.

### 21.4 Desabilitar configuração automática

Antes de `init`:

```typescript
fbq('set', 'autoConfig', false, pixelId);
fbq('init', pixelId);
```

Também é necessário revisar e remover, no Events Manager, regras do Event Setup Tool que cubram rotas clínicas.

### 21.5 Restringir consentimento publicitário Google por rota

Calcular:

```typescript
const marketingRuntimeAllowed =
  preferences.marketing &&
  isMarketingAllowedRoute(window.location.pathname);
```

Em área clínica:

```typescript
ad_storage: 'denied',
ad_user_data: 'denied',
ad_personalization: 'denied'
```

`analytics_storage` pode continuar independente, baseado na escolha de Analytics.

### 21.6 Proteger URLs de checkout e OAuth

Antes de permitir qualquer evento Meta:

1. ler `session_id`, `code` ou token necessário;
2. manter o valor em memória ou `sessionStorage`;
3. remover o parâmetro visível com `history.replaceState`;
4. somente então inicializar o Pixel ou emitir conversão.

O bootstrap atual é cedo demais para garantir essa sequência.

### 21.7 Canonicalizar page views de Analytics

Mapeamentos recomendados:

```text
/painel/patients/:id                  → /painel/patients/detail
/painel/patients/:id/edit             → /painel/patients/edit
/painel/patients/:id/evolutions/new   → /painel/evolutions/new
/public/reports/:reportId             → não rastrear
/painel/support/:ticketId             → /painel/support/detail
```

Usar títulos fixos por rota. Não usar `document.title` dinâmico de páginas clínicas como parâmetro de analytics.

### 21.8 Manter eventos clínicos fora de Marketing

Garantir permanentemente:

```text
patient_created
evolution_started
evolution_completed
audio_evolution_completed
```

com:

```typescript
marketing_destination: false
```

Para minimização máxima, eventos de produto clínico podem ser enviados por GA4 direto/Firebase, sem passar pelo mesmo container GTM usado para mídia.

### 21.9 Implementar `CompleteRegistration`

Criar função dedicada, por exemplo:

```typescript
trackCompleteRegistrationOnce({ userId, method });
```

Requisitos:

- somente conta realmente nova;
- consentimento de Marketing;
- antes da entrada no onboarding clínico;
- deduplicação persistente;
- `eventID` estável e opaco se houver futura CAPI;
- nenhum e-mail, telefone, UUID de paciente ou dado clínico;
- não coexistir com tag duplicada no GTM.

Exemplo conceitual:

```javascript
fbq('track', 'CompleteRegistration', {
  content_name: 'Cadastro Evolução Clínica'
}, {
  eventID: '<identificador-estável-e-opaco>'
});
```

### 21.10 Comparação: direto versus GTM

| Critério | Pixel direto | GTM |
| --- | --- | --- |
| Controle no repositório | alto | parcial |
| Testabilidade | alta | depende também do container |
| Consentimento atual | já centralizado | exige condição externa correta |
| Situação atual | Pixel base já é direto | não há tag Meta publicada |
| Risco de duplicidade | baixo se exclusivo | alto se coexistir com chamada direta |
| Recomendação | **preferida** | alternativa possível |

A opção recomendada é o envio direto pelo serviço central de analytics, com allowlist de rota e deduplicação persistente.

Caso seja usado GTM:

1. o código precisa permitir `sign_up` como destino de Marketing somente na rota autorizada;
2. o `dataLayer` deve ter `marketing_destination=true`;
3. a tag Meta deve emitir `CompleteRegistration`;
4. o gatilho deve exigir `event=sign_up` e `marketing_destination=true`;
5. a chamada direta deve ser removida para evitar duplicidade.

## 22. Testes necessários para a implementação

Adicionar cobertura para provar que:

- Pixel não inicializa em `/painel/*`;
- Pixel não inicializa em `/admin/*`;
- Pixel não inicializa em `/public/reports/*`;
- entrada em rota clínica executa `consent revoke`;
- retorno à Landing restaura Marketing somente com consentimento persistido;
- nenhum `PageView` contém query ou hash;
- `session_id`, `code`, tokens e UUIDs nunca chegam a `fbq`;
- eventos clínicos nunca recebem `marketing_destination=true`;
- `CompleteRegistration` dispara uma única vez;
- reload, OAuth e React Strict Mode não duplicam o cadastro;
- checkout e compra continuam funcionando;
- parâmetros clínicos, nomes, e-mail e telefone são recusados.

Validações operacionais posteriores:

- Meta Pixel Helper;
- aba Network do navegador;
- Meta Test Events;
- cadastro Google realmente novo;
- reload e deep link nas rotas clínicas;
- OAuth com retorno contendo `code`;
- Stripe/Google Play confirmados;
- GTM Preview;
- GA4 DebugView/Realtime.

## 23. Arquivos previstos para alteração futura

Caso as recomendações sejam aprovadas para implementação:

| Arquivo | Alteração prevista |
| --- | --- |
| `src/services/analytics.ts` | Política de rotas, Pixel sem PageView automático, autoConfig off, CompleteRegistration e dedupe |
| `src/App.tsx` | Observador de rota Marketing e chamada do cadastro confirmado |
| `src/pages/SuccessPage.tsx` | Preservar e limpar query antes do evento Meta |
| `src/main.tsx` | Ajustar ordem do bootstrap se necessário para limpar OAuth/checkout |
| `tests/analytics.test.ts` | Matriz de rotas, consentimento, URL e deduplicação |
| `tests/security-policy.test.ts` | Garantir isolamento e domínios necessários sem enfraquecer CSP |
| `docs/ANALYTICS_GOOGLE_ADS_SETUP.md` | Documentar o novo contrato de rotas e destinos |
| `src/components/layout/AppVersion.tsx` | Incrementar build conforme regra do projeto |

Como qualquer alteração em código exige atualização da build exibida no rodapé, a implementação deverá incrementar `APP_VERSION` de `v1.10.824` para a próxima versão `v1.10.X` disponível no momento da mudança. `PLAY_STORE_VERSION` não deve ser alterada sem geração de um novo AAB/versionCode.

## 24. Evidências e limites da auditoria

### Comprovado no repositório

- `sign_up` existe e é disparado em `SIGNED_IN` com heurística de cinco minutos;
- não existe `CompleteRegistration`;
- `sign_up` é Analytics, não Marketing;
- Pixel inicializa globalmente após Marketing;
- Pixel chama `PageView` sem política de rota;
- eventos clínicos não passam nome, texto ou ID como parâmetro enviado;
- Meta CAPI existe apenas para `Purchase`;
- consentimento bloqueia carregamento inicial antes da escolha;
- captura de aquisição ocorre independentemente desse consentimento.

### Comprovado no container GTM publicado

- GA4 e Google Ads estão configurados;
- `sign_up` e eventos clínicos estão na tag de eventos GA4;
- Google Ads/Conversion Linker possuem condição de raiz e Marketing;
- não existe tag Meta/`fbq`/`CompleteRegistration`/`ViewContent`/Custom HTML no container compilado verificado.

### Não confirmado nesta auditoria

- chegada real de cadastro no GA4 Realtime;
- chegada real dos eventos no Meta Events Manager;
- estado de eventos automáticos/Event Setup Tool no painel Meta;
- presença e validade atual de `META_CAPI_TOKEN` no Supabase;
- execução recente da fila de Meta CAPI;
- Event Match Quality;
- recebimento real de `CompleteRegistration`, pois o evento não existe;
- comportamento de um navegador autenticado real em todas as rotas.

Quando depender de painel externo:

> **Não é possível confirmar apenas pelo código do repositório.**

## 25. Validações executadas durante as auditorias

Foram executados com sucesso:

```text
npm run test:analytics
npm run test:acquisition
npm run test:meta-capi
npm run test:security-policy
git diff --check
```

Resultados:

```text
analytics.test.ts: OK
acquisition-attribution.test.ts: OK
meta-capi.test.ts: OK
Security policy and external resource tests passed.
```

## 26. Respostas finais objetivas

### A Meta recebe hoje um `CompleteRegistration` confiável?

**Não.**

### O `sign_up` existe?

**Sim, mas como evento de Analytics/GA4.**

### O GTM publicado transforma `sign_up` em `CompleteRegistration`?

**Não.**

### Existe Meta CAPI?

**Sim, somente para `Purchase`.**

### O Pixel está limitado ao funil comercial?

**Não. Ele pode inicializar em qualquer rota quando Marketing está consentido.**

### O Pixel continua carregado depois do login?

**Sim.**

### Há envio explícito de nomes ou textos clínicos à Meta?

**Não foi encontrado.**

### Há risco de URL/path/IDs chegarem à Meta?

**Sim, principalmente em reload, deep link ou consentimento concedido dentro de rota clínica.**

### A arquitetura deve limitar o Pixel por rota?

**Sim. Essa é a recomendação técnica principal.**

### Estado consolidado

```text
Cadastro Meta CompleteRegistration: ❌ não configurado
Eventos clínicos explícitos para Meta: ✅ não encontrados
Pixel restrito ao funil: ❌ não
URL clínica protegida do PageView Meta: ❌ não garantido
Consentimento inicial: ✅ bloqueia antes da escolha
Meta CAPI de cadastro: ❌ inexistente
Meta CAPI de compra: ✅ implementada no código, operação externa não confirmada
Recomendação: allowlist comercial + bloqueio de /painel, /admin e relatórios públicos
```
