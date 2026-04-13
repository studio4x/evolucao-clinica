# ESPECIFICAÇÕES PWA - HomeCare Match

## Visão Geral

Este documento detalha as configurações e especificações utilizadas para otimizar a plataforma **HomeCare Match** como uma **Progressive Web App (PWA)** totalmente funcional. A implementação garante:

- ✅ Funcionamento offline
- ✅ Instalação em tela inicial (mobile)
- ✅ Experiência nativa similar à de apps
- ✅ Push notifications
- ✅ Cache inteligente
- ✅ Suporte em múltiplos dispositivos
- ✅ Compatibilidade com iOS e Android

---

## 1. MANIFEST WEBMANIFEST

### Localização
- **Arquivo**: `public/manifest.webmanifest`
- **Referência no HTML**: `<link rel="manifest" href="/manifest.webmanifest" />`

### Configurações Principais

| Campo | Valor | Descrição |
|-------|-------|-----------|
| `id` | `/` | Identificador único da aplicação |
| `name` | `HomeCare Match` | Nome completo do app |
| `short_name` | `HomeCare` | Nome curto (máx 12 caracteres) |
| `description` | `Conectando profissionais de saúde às melhores oportunidades em Home Care.` | Descrição breve |
| `lang` | `pt-BR` | Idioma principal |
| `start_url` | `/` | URL inicial ao abrir o app |
| `scope` | `/` | Escopo de navegação do app |
| `display` | `standalone` | Modo de exibição (sem barra de navegador) |
| `orientation` | `portrait` | Orientação padrão |
| `theme_color` | `#0f172a` | Cor da barra de status/navegação |
| `background_color` | `#ffffff` | Cor de fundo durante carregamento |

### Icons

O manifest inclui três variantes de ícones:

```json
{
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512x512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Nota sobre Maskable Icons**: O ícone maskable permite que o sistema operacional aplique sua própria forma (circular, quadrada, etc.) mantendo a marca visível dentro do contorno.

---

## 2. SERVICE WORKER

### Localização
- **Arquivo**: `public/sw.js`
- **Registro**: `src/main.tsx`

### Configuração de Registro

```typescript
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("[PWA] Falha ao registrar service worker:", error);
    });
  });
}
```

O service worker é registrado após o carregamento completo do DOM com escopo raiz.

### Versioning do Cache

```javascript
const CACHE_VERSION = "hcm-pwa-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
```

### Estratégia de Cache

#### URLs Pré-cacheadas (Shell Cache)

```javascript
const PRECACHE_URLS = ["/", "/offline.html", "/favicon.png", "/placeholder.svg"];
```

Estas URLs são cacheadas no evento `install` do service worker, garantindo disponibilidade imediata offline.

#### Estratégias por Tipo de Recurso

| Tipo de Requisição | Estratégia | Descrição |
|-------------------|-----------|-----------|
| **Navegação** | Network-first com fallback | Tenta rede primeiro; fallback: cache → offline.html |
| **Assets** | Network-first | Busca atualização online; usa cache como fallback |
| **Mesmo domínio** | Stale-while-revalidate | Serve cache imediatamente; actualiza em background |
| **Cross-origin** | Não cacheado | Sem cache para recursos de terceiros |

#### Validação de Conteúdo

- ✅ Apenas respostas com `response.ok` são cacheadas
- ✅ Validação de `content-type` por destino (`script`, `style`, `image`, `font`)
- ✅ Rejeição automática de respostas HTML não esperadas
- ✅ Rejeição de requisições que não sejam GET

### Lifecycle do Service Worker

#### Install Event
```javascript
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
      .finally(() => self.skipWaiting())
  );
});
```

#### Activate Event
```javascript
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .finally(() => clients.claim())
  );
});
```

---

## 3. META TAGS HTML

### Localização
- **Arquivo**: `index.html`

### Meta Tags Obrigatórias para PWA

```html
<!-- Tema da aplicação -->
<meta name="theme-color" content="#0f172a" />

<!-- iOS Support -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="HomeCare" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />

<!-- Android Support -->
<meta name="mobile-web-app-capable" content="yes" />

<!-- Manifest -->
<link rel="manifest" href="/manifest.webmanifest" />

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />

<!-- Favicon -->
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
```

### Meta Tags OG (Open Graph)

```html
<meta property="og:type" content="website" />
<meta property="og:image" content="[URL da imagem OG]" />
<meta property="og:title" content="HomeCare Match" />
<meta property="og:description" content="Conectando profissionais de saúde às melhores oportunidades em Home Care." />
```

### Meta Tags Twitter

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="HomeCare Match" />
<meta name="twitter:description" content="Conectando profissionais de saúde às melhores oportunidades em Home Care." />
<meta name="twitter:image" content="[URL da imagem Twitter]" />
```

---

## 4. GERENCIAMENTO DINÂMICO DE META TAGS

### Componente: PwaMetaManager

**Localização**: `src/components/layout/PwaMetaManager.tsx`

Este componente gerencia dinamicamente:

- 📋 **Manifest** gerado em tempo de execução (Blob URL)
- 🎨 **Meta tags de tema**
- 🏷️ **Nomes da aplicação** (application-name, apple-mobile-web-app-title)
- 🔧 **Configurações específicas** carregadas do `useSiteConfig()`
- 📱 **Ícones Apple** em múltiplas resoluções
- 💾 **Splash screens** (imagens de inicialização) para iOS

#### Configurações Gerenciáveis via `site_config`

| Campo | Default | Descrição |
|-------|---------|-----------|
| `pwa_app_name` | HomeCare Match | Nome completo |
| `pwa_short_name` | HomeCare | Nome curto |
| `pwa_description` | [vide supra] | Descrição |
| `pwa_theme_color` | #0f172a | Cor do tema |
| `pwa_background_color` | #ffffff | Cor de fundo |
| `pwa_icon_192_url` | /icon-192x192.png | Ícone 192x192 |
| `pwa_icon_512_url` | /icon-512x512.png | Ícone 512x512 |
| `pwa_maskable_icon_url` | /icon-512x512-maskable.png | Ícone maskable |
| `pwa_assets_json` | {} | Assets adicionais (JSON) |
| `pwa_screenshots_json` | [] | Screenshots para instalação |

#### Splash Screens iOS Suportadas

O componente configura automaticamente splash screens para:
- iPhone SE (640x1136, 750x1334)
- iPhone 8-13 (828x1792, 1125x2436)
- iPhone 14+ (1170x2532, 1284x2778)
- iPad (1536x2048, 1668x2224, 1668x2388, 2048x2732)

---

## 5. PROMPT DE INSTALAÇÃO

### Componente: PwaInstallPrompt

**Localização**: `src/components/PwaInstallPrompt.tsx`

#### Funcionalidades

✅ **Detecção de Ambiente Standalone**: Não exibe prompt se app já instalado
✅ **beforeinstallprompt Event**: Captura deferred prompt nativo
✅ **Persistência**: Armazena estado de dismiss em localStorage
✅ **UI Customizável**: Título, descrição e imagem via `site_config`
✅ **Animação**: Slide-up com transição suave
✅ **Status de Instalação**: Feedback visual durante processo

#### Local Storage Keys

| Chave | Valor | Propósito |
|-------|-------|----------|
| `hcm-pwa-dismissed` | "true" | Usuário rejeitou instalação |
| `hcm-pwa-prompt-handled` | "true" | Prompt foi mostrado/tratado |
| `hcm-pwa-prompt-active` | "true" | Prompt está visível |

#### Events Customizados

```javascript
window.dispatchEvent(new Event("hcm-pwa-prompt-visible"));    // Prompt apareceu
window.dispatchEvent(new Event("hcm-pwa-prompt-handled"));    // Prompt foi tratado
```

#### Configurações via `site_config`

| Campo | Default |
|-------|---------|
| `pwa_install_title` | Instale o app HomeCare Match |
| `pwa_install_description` | Acesse mais rápido pelo seu celular, direto da tela inicial. |
| `pwa_icon_192_url` | /icon-192x192.png |

---

## 6. PUSH NOTIFICATIONS

### Componente: PushManager

**Localização**: `src/components/PushManager.tsx`

#### Fluxo de Ativação

1. **Verificação de Consentimento**: Aguarda consentimento de cookies
2. **Requisição de Permissão**: Solicita permissão ao usuário após 3s
3. **Subscrição**: Cria subscription no serviço de push (Supabase)
4. **Sincronização Realtime**: Monitora mudanças em `push_notifications`

#### Requisitos

- ✅ Service Worker registrado
- ✅ Cookies consentidos (`cookie-consent = "true"`)
- ✅ Notificações habilitadas no perfil (`notifications_enabled`)
- ✅ Suporte da plataforma

#### Fluxo de Recebimento

```
Push Server → Service Worker → Notification Event → Show UI
                                                  → Navigate on Click
```

#### Integração com Banco de Dados

**Tabela**: `push_notifications`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `title` | text | Título da notificação |
| `body` | text | Corpo da mensagem |
| `image_url` | text | URL da imagem (opcional) |
| `link` | text | URL para navegação ao clicar |
| `target_role` | enum | Usuários alvo: 'all' ou role específico |
| `status` | enum | Status: 'draft', 'sent', 'failed' |

#### Listener Realtime

```typescript
const channel = supabase
  .channel('global-broadcast-monitor')
  .on(
    "postgres_changes", 
    { 
      event: "UPDATE", 
      schema: "public", 
      table: "push_notifications",
      filter: "status=eq.sent"
    }, 
    (payload) => {
      // Processa notificação
    }
  )
  .subscribe();
```

#### Permissões de Notificação

- `default`: Ainda não solicitado
- `granted`: Aceito pelo usuário
- `denied`: Recusado pelo usuário

---

## 7. PÁGINA OFFLINE

### Localização
- **Arquivo**: `public/offline.html`

Página estática (sem dependências) exibida quando:
- ❌ Navegação falha (sem cache e sem rede)
- ❌ Recurso não encontrado offline

#### Features

- Visual consistente com o design do app
- Mensagem clara em português
- Sem carregamento de assets externos
- CSS inline para total independência

---

## 8. CONSENTIMENTO DE COOKIES

### Componente: CookieConsent

**Localização**: `src/components/CookieConsent.tsx`

#### Integração com PWA

O componente sincroniza exibição com PWA Install Prompt:

```typescript
// Coordenação de eventos
window.addEventListener("hcm-pwa-prompt-visible", handlePwaPromptVisible);
window.addEventListener("hcm-pwa-prompt-handled", handlePwaPromptHandled);

// Dispara evento quando aceito
window.dispatchEvent(new Event("cookie-consent-accepted"));
```

#### Storage Keys

| Chave | Tipo |
|-------|------|
| `cookie-consent` | "true" / ausente |
| `hcm-pwa-*` | Sincronização com PWA |

---

## 9. ASSETS REQUERIDOS

### Ícones Necessários

#### SVG Source
- Arquivo fonte: Should be a clean SVG with transparent background (recomendado)
- Resolver: Convertem em PNG em múltiplas resoluções

#### Tamanhos de Ícones

| Tipo | Tamanho | Propósito | Formato |
|------|--------|----------|---------|
| favicon | 32x32 | Aba do navegador | PNG/ICO |
| apple-touch-icon | 180x180 | Shortcut iOS | PNG |
| apple-touch-icon | 167x167 | iPad mini | PNG |
| apple-touch-icon | 152x152 | iPad 3º gen | PNG |
| icon-192x192 | 192x192 | Tela initial Android | PNG |
| icon-512x512 | 512x512 | Splash Android | PNG |
| icon-512x512-maskable | 512x512 | Ícone com mask | PNG |
| mstile-144x144 | 144x144 | Windows tile | PNG |

### Splash Screens iOS

Imagens de inicialização para dispositivos iOS (vide PwaMetaManager).

### Localização de Assets

```
public/
├── favicon.png                (32x32)
├── apple-touch-icon.png       (180x180)
├── icon-192x192.png
├── icon-512x512.png
├── icon-512x512-maskable.png
├── manifest.webmanifest
├── offline.html
├── sw.js
└── robots.txt
```

---

## 10. CONFIGURAÇÃO DO VITE

### Localização
- **Arquivo**: `vite.config.ts`

```typescript
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false }
  },
  plugins: [react(), mode === "development" && componentTagger()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  }
}));
```

#### Notas PWA
- O build automático do Vite cria assets com hash (ex: `main.abc123.js`)
- Service Worker detecta alterações via `isAssetPath()` e `contentType`
- Assets hashed nunca expiram do cache

---

## 11. INTEGRAÇÃO COM SUPABASE

### Tabelas Necessárias

#### 1. `site_config` (Colunas PWA)

```sql
-- Configurações básicas
pwa_app_name TEXT
pwa_short_name TEXT
pwa_description TEXT
pwa_theme_color TEXT
pwa_background_color TEXT

-- URLs de assets
favicon_url TEXT
pwa_icon_192_url TEXT
pwa_icon_512_url TEXT
pwa_maskable_icon_url TEXT
pwa_install_image_url TEXT

-- Texto do prompt
pwa_install_title TEXT
pwa_install_description TEXT

-- JSON configurável
pwa_assets_json JSONB
pwa_screenshots_json JSONB
```

#### 2. `profiles` (Coluna de Notificações)

```sql
notifications_enabled BOOLEAN (default true)
```

#### 3. `push_notifications`

```sql
CREATE TABLE push_notifications (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  link TEXT DEFAULT '/',
  target_role TEXT DEFAULT 'all', -- 'all', 'professional', 'company', 'admin'
  status TEXT DEFAULT 'draft',     -- 'draft', 'sent', 'failed'
  created_at TIMESTAMP DEFAULT now(),
  sent_at TIMESTAMP,
  error_message TEXT
);
```

---

## 12. PÁGINA DE ADMIN - PWA Settings

### Localização
- **Rota**: `/admin/pwa`
- **Arquivo**: `src/pages/admin/PwaSettingsPage.tsx`

#### Funcionalidades

✅ **Editor de Configurações**: Form completo para todos os campos PWA
✅ **Upload de Ícones**: Gerenciamento de múltiplos ícones
✅ **Preview**: Visualização em tempo real
✅ **Geração Automática**: Auto-gera assets em outras resoluções
✅ **Screenshots**: CRUD para screenshots de instalação
✅ **JSON Editor**: Edição avançada de assets_json

#### Especificações de Assets Auto-Gerados

| Asset | Resolução | Gerado De |
|-------|-----------|-----------|
| 192x192 | 192x192 | icon_512x512 |
| 180x180 (apple) | 180x180 | icon_512x512 |
| 152x152 (apple) | 152x152 | icon_512x512 |
| 144x144 (mstile) | 144x144 | icon_512x512 |
| 16x16, 32x32 (favicon) | 16x16, 32x32 | favicon original |

---

## 13. BUILD E DEPLOY

### Comandos de Build

```bash
# Build com bump de versão
npm run build

# Build dev mode
npm run build:dev

# Preview local
npm run preview
```

### Build Version

O footer do app exibe: `Build vX.Y.Z`

**Fonte**: `src/components/layout/AppVersion.tsx`

**Atualização**: Script automático em `scripts/bump-build-version.mjs` incrementa a versão a cada build.

### Deployment

#### Vercel

- Configuração: `vercel.json`
- Env: Variables Supabase
- Cedênciação automática de certificado SSL de PWA

#### Pré-requisitos

- API key Supabase
- Web Push VAPID keys (gerados no admin Supabase)

#### Checklist de Deploy

- [ ] Service worker registrado em produção
- [ ] Manifest acessível em `/manifest.webmanifest`
- [ ] offline.html servido em fallback
- [ ] Meta tags presentes no index.html
- [ ] Ícones em alta resolução nos caminhos corretos
- [ ] HTTPS habilitado (obrigatório para PWA)
- [ ] Headers de cache configurados (assets com hash: longa duração; HTML: sem cache)

---

## 14. COMPATIBILIDADE

### Desktop Browsers

✅ Chrome / Chromium (88+)
✅ Edge (88+)
✅ Firefox (79+)
✅ Opera (76+)
❌ Safari (limitado; sem service worker pleno, mas suporta Web App)

### Mobile - Android

✅ Chrome (44+)
✅ Edge
✅ Firefox móvel
✅ Samsung Internet
✅ Opera móvel

### Mobile - iOS

⚠️ **Limitações**:
- Service Worker não suportado (iOS 16.3 em beta/limitado)
- Web App mode via meta tags ("apple-mobile-web-app-capable")
- Splash screens via apple-touch-startup-image
- Push Notifications: Via APNs (requer integração extra)

---

## 15. PERFORMANCE & OTIMIZAÇÕES

### Lighthouse PWA Audit

**Metas**:
- ✅ Score PWA: > 90
- ✅ Performance: > 85
- ✅ Accessibility: > 90
- ✅ Best Practices: > 90
- ✅ SEO: > 90

### Estratégias Aplicadas

1. **Precaching**: Shell cache com PRECACHE_URLS
2. **Network-First para Assets**: Sempre busca versão atualizada
3. **Stale-While-Revalidate**: Não bloqueia ui esperando rede
4. **Asset Validation**: Rejeita conteúdo inesperado
5. **Offline Fallback**: Página graceful quando offline
6. **Code Splitting**: Vite bundla by route
7. **Image Optimization**: Vite minifica automaticamente

### Monitoramento

Integração com Vercel Speed Insights:
```typescript
import { SpeedInsights } from "@vercel/speed-insights/react";
```

---

## 16. CHECKLIST DE IMPLEMENTAÇÃO

- [x] Manifest webmanifest criado
- [x] Service Worker implementado
- [x] Meta tags HTML adicionadas
- [x] PwaMetaManager configurado
- [x] PwaInstallPrompt funcional
- [x] PushManager implementado
- [x] Offline.html criado
- [x] CookieConsent integrado
- [x] Assets em múltiplas resoluções
- [x] Supabase `push_notifications` table criada
- [x] Admin PWA Settings page implementada
- [x] Build version sync automático
- [x] Deploy em produção testado
- [x] Lighthouse PWA audit passando

---

## 17. REFERÊNCIAS & DOCUMENTAÇÃO

### MDN Web Docs
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)

### W3C Standards
- [Web App Manifest Level](https://w3c.github.io/manifest/)
- [Service Worker Spec](https://w3c.github.io/ServiceWorker/)

### Ferramentas de Teste
- [Web.dev Lighthouse PWA](https://web.dev/lighthouse-pwa/)
- [PWA Builder](https://www.pwabuilder.com/)
- [Realtime Database Supabase](https://supabase.com/docs/guides/realtime)

---

## Versão do Documento

- **Data**: Abril 2026
- **Versão**: 1.0
- **Status**: ✅ Em Produção
- **Último Revisor**: AI Assistant
- **Próxima Revisão**: Conforme updates de tecnologia

---

**Perguntas ou sugestões?** Consulte o administrador do projeto ou abra uma issue no repositório.
