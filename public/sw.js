const CACHE_NAME = 'evolucao-cache-v1';

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
          // Save to IndexedDB
          await saveSharedFile(audioFile);
        }

        // Redirect to the frontend route to handle the UI
        return Response.redirect('/share-target', 303);
      } catch (error) {
        console.error('Error processing share target:', error);
        return Response.redirect('/?error=share_failed', 303);
      }
    })());
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
      
      // We store it under a fixed key 'shared-audio'
      const putRequest = store.put(file, 'shared-audio');
      
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}
