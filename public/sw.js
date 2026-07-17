const CACHE_VERSION = "evolucao-clinica-pwa-v1.10.483";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/api/apple-touch-icon",
  "/api/pwa-icon/192",
  "/api/pwa-icon/512",
  "/api/pwa-icon/maskable"
];

const isBrandAssetPath = (pathname) => {
  return [
    "/favicon.png",
    "/favicon.ico",
    "/api/favicon",
    "/apple-touch-icon.png",
    "/api/apple-touch-icon",
    "/logo.svg",
    "/logotipo-transparente-1024.png",
    "/icon-192x192.png",
    "/icon-512x512.png",
    "/icon-512x512-maskable.png",
    "/api/pwa-icon/"
  ].some((assetPath) => pathname.startsWith(assetPath));
};

const isApiNoCachePath = (pathname) => {
  return pathname.startsWith("/api/notifications/") || 
         pathname.startsWith("/api/pwa-install-icon") || 
         pathname.startsWith("/api/pwa-notification-icon") ||
         pathname.startsWith("/api/pwa-notification-badge") ||
         pathname.startsWith("/api/admin/") ||
         pathname.startsWith("/api/cron/");
};

const offlineResponse = async () => {
  const cachedOffline = await caches.match("/offline.html");
  return cachedOffline || new Response("Offline", {
    status: 503,
    statusText: "Offline"
  });
};

// Install: precache app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn("[PWA] Falha no precache:", err))
  );
});

// Activate: clear old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
    ])
  );
});

// Fetch Strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // --- SHARE TARGET INTERCEPTION ---
  const isShareTarget = event.request.method === "POST" && 
                       url.origin === self.location.origin && 
                       (url.pathname.includes("/share-target") || url.pathname.includes("/api/share-target"));

  if (isShareTarget) {
    console.log("[PWA] Interceptando Share Target POST:", url.pathname);
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const audioFile = formData.get("audio");

          if (audioFile) {
            // Save to IndexedDB so the React app can read it
            const idb = await new Promise((resolve, reject) => {
              const request = indexedDB.open('SharedFilesDB', 1);
              request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                  db.createObjectStore('files');
                }
              };
              request.onsuccess = (e) => resolve(e.target.result);
              request.onerror = () => reject(request.error);
            });

            await new Promise((resolve, reject) => {
              const transaction = idb.transaction('files', 'readwrite');
              const store = transaction.objectStore('files');
              store.put(audioFile, 'shared-audio');
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error);
            });
          }

          // Retorna o HTML principal do PWA diretamente do Cache para engolir o POST
          // Sem isso, a Vercel recebe um POST no index.html e retorna erro 405
          const cachedHtml = await caches.match('/') || await caches.match('/index.html');
          if (cachedHtml) {
            return cachedHtml;
          }
          
          return Response.redirect("/share-target", 303);
        } catch (error) {
          console.error("[PWA] Erro ao processar Share Target:", error);
          const fallback = await caches.match('/');
          return fallback || Response.redirect("/", 303);
        }
      })()
    );
    return;
  }

  // Se nao for GET, e nao for share_target, apenas passa direto
  if (event.request.method !== "GET") return;

  // Skip external APIs e Auth flows (Firebase/Google/Supabase)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("accounts.google.com") ||
    url.hostname.includes("apis.google.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebase.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("firebaseinstallations.googleapis.com")
  ) {
    // Exceção: permitir cache para os assets da marca (bucket brand)
    if (url.pathname.includes("/storage/v1/object/public/brand")) {
      // Deixa prosseguir para a estratégia de cache
    } else {
      return;
    }
  }

  if (isApiNoCachePath(url.pathname)) {
    return;
  }

  // Navegacao
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
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || offlineResponse();
        })
    );
    return;
  }

  // Outros assets
  if (isBrandAssetPath(url.pathname) || url.pathname.includes("/storage/v1/object/public/brand")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || offlineResponse();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) {
        return cached;
      }

      const fetchPromise = fetch(event.request)
        .then((response) => {
          const isSameOrigin = event.request.url.startsWith(self.location.origin);
          const isBrandAsset = event.request.url.includes("/storage/v1/object/public/brand");
          if (response.ok && (isSameOrigin || isBrandAsset)) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => offlineResponse());

      return fetchPromise;
    })
  );
});

// --- PUSH NOTIFICATIONS ---
self.addEventListener("push", (event) => {
  let data = { title: "Evolução Clínica", body: "Nova notificação!" };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { ...data, body: event.data.text() };
    }
  }

  const options = {
    body: data.body || data.message || "Nova notificação recebida.",
    icon: data.icon || new URL("/api/pwa-notification-icon", self.location.origin).href,
    badge: new URL("/api/pwa-notification-badge", self.location.origin).href,
    image: data.image || undefined,
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
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Se já houver uma janela aberta do app, foca nela e navega
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetPath = new URL(targetUrl, self.location.origin).pathname;
        if (clientUrl.pathname === targetPath && "focus" in client) {
          return client.focus();
        }
      }
      
      // Caso contrário, tenta focar em qualquer janela aberta do app e redirecionar
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }

      // Se não houver janelas abertas, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
