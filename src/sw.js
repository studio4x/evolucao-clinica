import { precacheAndRoute } from 'workbox-precaching';

// Inject precache manifest from vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
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
