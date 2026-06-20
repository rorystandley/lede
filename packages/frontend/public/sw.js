// lede service worker
// Handles offline caching of static assets and incoming push notifications

const CACHE_NAME = 'lede-v4';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // API and MCP requests always go to network
  if (req.url.includes('/api/') || req.url.includes('/mcp')) return;
  if (req.method !== 'GET') return;

  // HTML / navigations: network-first so a fresh deploy is picked up immediately
  // when online, falling back to the cached shell offline. Cache-first here would
  // pin an old index.html that references stale, fingerprinted JS bundles — which
  // is why new deploys didn't show up until the cache was cleared.
  const isNavigation =
    req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && req.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // Fingerprinted static assets (hashed JS/CSS, icons): cache-first is safe
  // because a changed asset gets a new URL, so the cache can never go stale.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached),
    ),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'lede', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'lede', {
      body: payload.body || '',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: payload.tag,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
