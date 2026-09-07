/**
 * Service worker: precaches the app shell so Pet Rock launches offline
 * once installed. Bump CACHE when shipping new files.
 */

const CACHE = 'pet-rock-v1.3.0';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/ui.js',
  './js/engine.js',
  './js/config.js',
  './js/render.js',
  './js/storage.js',
  './js/leaderboard.js',
  './js/online.js',
  './js/sfx.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Individually, so one missing file cannot fail the whole install.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isCode = (pathname, destination) =>
  destination === 'script' || destination === 'style' || destination === 'document' ||
  /\.(?:js|css|webmanifest|html)$/.test(pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: fresh when online, cached shell when not.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Code and markup: always prefer the network, fall back to the cache.
  //
  // Cache-first would hand back the previous release's JavaScript on the
  // first load after a deploy — so a freshly deployed change (new Supabase
  // keys, say) would look like it had not taken effect until the second
  // visit. These files are a few KB, so a round-trip is cheap, and the
  // cache still covers being offline entirely.
  if (isCode(url.pathname, request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(request)) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Icons and other static assets never change within a release: serve
  // them from the cache and refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
