import { precacheAndRoute } from 'workbox-precaching';

// Injection point for vite-plugin-pwa assets
// @ts-ignore
precacheAndRoute(self.__WB_MANIFEST || []);

const CACHE_VERSION = "hcm-pwa-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// URLs para pré-cache (App Shell)
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/favicon.png",
  "/logo.svg",
  "/icon-192x192.png"
];

// Helper para verificar se é um asset estático
const isAssetPath = (url) => {
  const assets = [".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".woff2", ".ico"];
  return assets.some(ext => url.toLowerCase().endsWith(ext));
};

// Evento de Instalação: Salva o App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => {
        console.log("[SW] Pré-cacheando App Shell");
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Erro no install:", err))
  );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== SHELL_CACHE && cacheName !== RUNTIME_CACHE)
          .map((cacheName) => {
            console.log("[SW] Removendo cache antigo:", cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch: Network-First com Fallback para Cache
self.addEventListener("fetch", (event) => {
  // Apenas métodos GET
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Ignorar requisições para Supabase/API (Network Only)
  if (url.hostname.includes("supabase.co") || url.hostname.includes("googleapis.com")) {
    return;
  }

  // Estratégia para Documentos (Navegação)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Salva no runtime cache para uso offline
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          // Se falhar a rede, tenta o cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Se não houver no cache, retorna a página offline
            return caches.match("/offline.html");
          });
        })
    );
    return;
  }

  // Estratégia para Assets (Stale-While-Revalidate)
  if (isAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => null);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Padrão: Network First
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

// Push Notifications
self.addEventListener("push", (event) => {
  let data = { title: "HomeCare Match", body: "Nova notificação!" };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { ...data, body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192x192.png",
    badge: "/favicon.png",
    data: data.link || "/",
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "Ver Detalhes" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Clique na Notificação
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  const targetUrl = event.notification.data || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Se já houver uma janela aberta, foca nela e navega
      for (const client of clientList) {
        if (client.url.includes(new URL(targetUrl, self.location.origin).pathname) && "focus" in client) {
          return client.focus();
        }
      }
      // Se não, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
