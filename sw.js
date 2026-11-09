// Service worker: guarda la app en el teléfono para que abra sin conexión
// y avisa cuando hay una versión nueva. NO toca tus datos (están en IndexedDB).
//
// Cada vez que publiques una versión, cambia VERSION (scripts/release.sh lo hace).
// Si agregas un archivo nuevo a la app, súmalo a SHELL.
const VERSION = '1.1.1';
const CACHE = `logbuch-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/util.js',
  './js/version.js',
  './js/settings.js',
  './js/stats.js',
  './js/export.js',
  './js/plans.js',
  './js/plans-seed.js',
  './js/modules/hoy.js',
  './js/modules/cuerpo.js',
  './js/modules/idiomas.js',
  './js/modules/carrera.js',
  './js/modules/finanzas.js',
  './js/modules/datos.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita copiar archivos viejos de la caché HTTP
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  // No se activa solo: espera a que toques "Actualizar"
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('logbuch-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Primero la caché (rápido y sin conexión); si no está, la red.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(req); }
    catch { return req.mode === 'navigate' ? caches.match('./index.html') : Response.error(); }
  })());
});
