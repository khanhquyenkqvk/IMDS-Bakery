// Simple Service Worker - Prevent infinite reload loop
const CACHE_NAME = 'imds-bakery-v1';

self.addEventListener('fetch', (event) => {
  // Don't intercept requests - let browser handle them normally
  // This prevents the reload loop
  return;
});

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  // Don't claim clients - this causes reload loops
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});



