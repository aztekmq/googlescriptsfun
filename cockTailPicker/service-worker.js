/**
 * @fileoverview Service worker enabling offline-first behavior and installation support
 * for the Mythic Mixology Lab progressive web application with verbose diagnostics.
 */
const CACHE_NAME = 'mythic-mixology-v1';
const PRECACHE_URLS = ['./', 'Index.html', 'manifest.json'];

self.addEventListener('install', (event) => {
  console.info('[ServiceWorker] Install event received.');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.info('[ServiceWorker] Precaching core assets.', { assets: PRECACHE_URLS });
        return cache.addAll(PRECACHE_URLS);
      })
      .catch((error) => {
        console.error('[ServiceWorker] Precaching failed.', {
          message: error && error.message ? error.message : 'Unknown error',
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  console.info('[ServiceWorker] Activate event received.');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.info('[ServiceWorker] Removing outdated cache.', { key });
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch((error) => {
              console.warn('[ServiceWorker] Failed to cache response.', {
                url: event.request.url,
                message: error && error.message ? error.message : 'Unknown error',
              });
            });
          });

          return response;
        })
        .catch((error) => {
          console.error('[ServiceWorker] Network request failed; serving fallback if available.', {
            url: event.request.url,
            message: error && error.message ? error.message : 'Unknown error',
          });
          if (event.request.mode === 'navigate') {
            return caches.match('Index.html');
          }
          throw error;
        });
    })
  );
});
