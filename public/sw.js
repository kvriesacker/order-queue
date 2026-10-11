// Keeps the app itself (page, scripts, styles, icons) on the device so it opens without a
// connection. Orders never go through here: they travel over the encrypted MQTT connection.
const CACHE = 'pizza-queue-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // The built file names change on every release, so read them from the page.
      const html = await (await cache.match('./')).text();
      const files = [...html.matchAll(/(?:src|href)="([^":?#]+\.(?:js|css))"/g)].map((m) => m[1]);
      // Each file once: the same name twice makes the whole step fail.
      await cache.addAll([...new Set(files)]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    // The page: the newest one when online, the saved one when not.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('./')) ?? Response.error()),
    );
    return;
  }

  // Scripts, styles and icons: saved copy first (their names change with every release).
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// Tapping an order alert brings the order page back.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const page = open.find((c) => c.url.includes('#/track/')) ?? open[0];
      if (page) return page.focus();
      return self.clients.openWindow('./');
    })(),
  );
});
