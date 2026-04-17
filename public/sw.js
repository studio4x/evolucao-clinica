const CACHE_VERSION = "evolucao-clinica-pwa-v1.6.0";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/logo.svg",
  "/icon-192x192.png",
  "/icon-512x512.png"
];

// Install: precache app shell
self.addEventListener("install", (event) => {
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
  const url = new URL(event.request.url);

  // --- SHARE TARGET INTERCEPTION ---
  if (event.request.method === "POST" && url.pathname.includes("/share-target")) {
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

          // Redirect to the React route
          return Response.redirect("/share-target", 303);
        } catch (error) {
          console.error("[PWA] Erro ao processar Share Target:", error);
          return Response.redirect("/", 303);
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
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // Outros assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});
