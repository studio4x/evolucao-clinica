// Evolução Clínica - Service Worker
// Versão: 1.2.3

const CACHE_NAME = 'evolucao-clinica-v1.2.3';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.png',
  '/logo.svg',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v1.2.3');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch((err) => {
        console.warn('[SW] Some files failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v1.2.3');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for navigation, cache-first for assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip external APIs
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('apis.google.com')
  ) {
    return;
  }

  // Navigation: Network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Static assets: Cache-first
  if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|webp)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Evolução Clínica', body: 'Nova notificação!' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: new URL('/icon-192x192.png', self.location.origin).href,
      badge: new URL('/favicon.png', self.location.origin).href,
      data: data.link || '/',
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
