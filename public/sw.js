const CACHE_NAME = 'evolucao-cache-v3';
const URLS_TO_CACHE = [
  '/',
  '/?mode=standalone',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept POST requests to /share-target
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const audioFile = formData.get('audio');

        if (audioFile) {
          await saveSharedFile(audioFile);
        }
        return Response.redirect('/share-target', 303);
      } catch (error) {
        console.error('Error processing share target:', error);
        return Response.redirect('/?error=share_failed', 303);
      }
    })());
    return;
  }

  // Offline fallback for GET requests
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          // If it's a navigation request, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
  }
});

function saveSharedFile(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SharedFilesDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction('files', 'readwrite');
      const store = transaction.objectStore('files');
      
      const putRequest = store.put(file, 'shared-audio');
      
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}
