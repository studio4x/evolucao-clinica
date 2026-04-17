// Evolução Clínica - Service Worker
// Baseado na SPEC_PWA.md v1.0

const CACHE_VERSION = "ec-pwa-v1.2.4";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/favicon.png",
  "/logo.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/manifest.webmanifest"
];

// Helper to check if URL is an asset
const isAssetPath = (url) => {
  return /\.(js|css|png|jpg|jpeg|svg|woff2?|ico|webp)$/i.test(url.pathname);
};

// Install: precache app shell
self.addEventListener("install", (event) => {
  console.log("[PWA] Instalando Service Worker:", CACHE_VERSION);
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn("[PWA] Falha no precache:", err))
      .finally(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener("activate", (event) => {
  console.log("[PWA] Ativando Service Worker:", CACHE_VERSION);
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
      .finally(() => self.clients.claim())
  );
});

// Fetch Strategy
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip external APIs e Auth flows (Firebase/Google/Supabase)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("accounts.google.com") ||
    url.hostname.includes("apis.google.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebase.googleapis.com") ||
    url.hostname.includes("firebaseinstallations.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com")
  ) {
    return;
  }

  // 1. Navigation: Network-first com fallback offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // 2. Assets: Stale-while-revalidate para assets do projeto
  if (isAssetPath(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Default: Network-first com fallback para cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push Notifications
self.addEventListener("push", (event) => {
  let data = { title: "Evolução Clínica", body: "Nova atualização disponível!" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192x192.png",
    badge: "/favicon.png",
    data: data.link || "/",
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "Abrir App" },
      { action: "close", title: "Fechar" }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data || "/";

  if (event.action === "close") return;

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
