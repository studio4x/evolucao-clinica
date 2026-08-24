# Auditoria técnica — atribuição de aquisição e plataforma

Data: 24/08/2026
Escopo: Meta Ads, Google Ads, orgânico, direto, referral, WhatsApp, PWA, Android, Google Play e web.

## Diagnóstico definitivo

O sistema fabricava uma origem de marketing para identificar um contexto técnico:

- server.ts, na rota /manifest.webmanifest, definia start_url como /?utm_source=pwa;
- app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java abria o WebView em /login?utm_source=pwa;
- app/build.gradle e twa-manifest.json repetiam /login?utm_source=pwa;
- o manifesto incorporado em app/src/main/res/raw/web_app_manifest.json repetia /?utm_source=pwa.

O parâmetro chegava ao /login diretamente no Android porque essa era a URL fixa do launcher. No PWA, ele chegava primeiro à home por meio do start_url; a navegação/autenticação posterior preservava o dado capturado em localStorage.

captureAcquisitionData() lia utm_source=pwa, calculava o canal Aplicativo PWA / Android e o persistia nos mesmos JSONs usados para origem de aquisição. Não existia platform nesses objetos. Portanto, a causa não era Meta Ads, Google Ads, GTM, OAuth nem Supabase: era a URL inicial criada pelo próprio aplicativo e o modelo que aceitava o marcador técnico como fonte.

## Comportamento anterior

### First touch

- O primeiro candidato era persistido na chave local de first touch.
- Um first touch válido era mantido.
- A correção anterior permitia substituir apenas o fallback literal pwa quando aparecia uma atribuição com UTM, click ID ou referrer.
- acquisition_info só era gravado se vazio, ou atualizado quando o banco continha o fallback pwa e o navegador possuía uma atribuição considerada melhor.

### Signup touch

- A chave local de current touch era atualizada em uma nova carga.
- O retorno OAuth preservava o touch anterior.
- O fallback literal pwa não substituía um touch pago existente.
- Porém, uma carga posterior sem UTMs fora desse caso podia substituir Meta/Google por tráfego direto antes do cadastro.
- Para contas criadas nas últimas duas horas, o touch era congelado em uma chave pendente por usuário e gravado em signup_acquisition_info se o campo estivesse vazio ou contivesse o fallback pwa.

### Click IDs, referrer e sanitização

- fbclid e gclid já eram capturados junto das UTMs.
- O gclid já prevalecia sobre uma fonte genérica devolvida pelo Install Referrer.
- Somente referrer externo era armazenado; um acesso posterior sem referrer podia substituir o current touch fora das exceções acima.
- A captura ocorre no primeiro efeito de App.tsx. A limpeza da URL ocorre depois, por sanitizeCurrentMarketingUrl().
- O Meta Pixel somente aceita contexto com query string e hash vazios. A correção não altera a allowlist, autoConfig=false, consentimento ou CompleteRegistration.

## Arquitetura implementada

Os JSONs existentes foram evoluídos, sem tabela ou coluna nova. Além dos campos já existentes, cada touch pode conter:

- platform: web, pwa ou android;
- distribution: google_play somente quando comprovado;
- attribution_method: url ou google_play_install_referrer.

### Regra de first touch

O primeiro touch permanece imutável. A única correção permitida é substituir um registro técnico legado — pwa, android, app, mobile ou google_play — por uma origem real comprovada. Um fallback histórico sem nova evidência não recebe backfill especulativo.

### Regra de signup touch

Uma nova origem real com UTM, campanha, click ID ou referrer atualiza o current touch antes do cadastro. OAuth, reload, acesso direto e reabertura por PWA/Android não apagam a última origem real; apenas atualizam platform e, quando comprovada, distribution.

Depois que signup_acquisition_info é gravado, ele permanece imutável, exceto para substituir um fallback técnico legado por atribuição real comprovada.

### Marcadores técnicos

pwa, android, app, mobile, google_play e google-play não são mais fontes de aquisição. URLs antigas ainda abertas por versões instaladas são normalizadas no cliente: o marcador é removido de utm_source/utm_medium antes da persistência e a plataforma é detectada separadamente.

### Cenários resultantes

| Jornada | First touch | Signup touch | Plataforma do cadastro |
| --- | --- | --- | --- |
| Meta A → PWA | Meta A | Meta A | PWA |
| Google A → PWA | Google A | Google A | PWA |
| Meta A → Google B | Meta A | Google B | plataforma atual |
| Google A → Meta B | Google A | Meta B | plataforma atual |
| Meta A → Meta B | Meta A | Meta B | plataforma atual |
| Google A → Google B | Google A | Google B | plataforma atual |
| Direto → PWA | Direto | Direto | PWA |
| Meta/Google → OAuth/reload | origem inicial preservada | última origem real preservada | plataforma atual |

## Android e Google Play

O bridge nativo e o parâmetro native_version identificam o aplicativo Android. O modo standalone identifica PWA; fora desses sinais, o contexto é web.

Android não implica Google Play. A distribuição só é marcada como google_play quando há resposta do serviço oficial Install Referrer. Sem essa resposta não é tecnicamente possível distinguir instalação pela Play Store de outro pacote Android, e a distribuição permanece não informada.

Google Play e Google Ads continuam independentes. Uma combinação válida é origem Google Ads, platform android e distribution google_play.

O Install Referrer google-play/organic é tratado como contexto técnico, não como Google Organic. Um gclid ou UTMs publicitárias reais continuam preservados.

## Interface administrativa

Os dois painéis administrativos agora recalculam o canal para não repetir o rótulo histórico Aplicativo PWA / Android e exibem separadamente:

- canal de aquisição;
- UTM source e medium;
- campanha;
- termo;
- criativo;
- FBCLID capturado/não capturado;
- GCLID capturado/não capturado;
- plataforma;
- distribuição;
- landing page, referrer, método e data.

Registros históricos contendo somente utm_source=pwa aparecem como Origem não informada, com plataforma PWA. O banco não é reescrito sem uma origem real.

## Arquivos alterados

- src/utils/acquisitionAttribution.ts
- src/utils/acquisitionTracking.ts
- src/components/admin/ProfessionalDetailsModal.tsx
- src/pages/AdminPanel.tsx
- server.ts
- twa-manifest.json
- app/build.gradle
- app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java
- app/src/main/res/raw/web_app_manifest.json
- tests/acquisition-attribution.test.ts
- src/components/layout/AppVersion.tsx

Não foi criada migration. PLAY_STORE_VERSION, versionCode e versionName não foram alterados e nenhum AAB foi gerado.

## Validação automatizada

Resultados locais antes da publicação:

- test:acquisition: aprovado;
- test:analytics: aprovado;
- test:meta-registration: aprovado;
- test:meta-capi: aprovado;
- test:security-policy: aprovado;
- test:payment-confirmation: aprovado;
- test:google-auth: aprovado;
- test:cookie-consent: aprovado;
- lint: aprovado;
- build: aprovado;
- git diff --check: aprovado.

Build web: v1.10.834. App Google Play mantido em 1.0.86.
