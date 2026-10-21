// Service worker : l'appli marche hors ligne (atelier sans reseau) et s'installe sur l'ecran d'accueil.
// Reseau d'abord (pour avoir la derniere version), cache en secours.
const CACHE = 'garage-v2';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'world.js', 'cars.js', 'people.js', 'toon.js', 'perf.js', 'icons.js', 'store.js',
  'data/seed.js', 'data/catalog.js', 'data/plate.js', 'site.json', 'manifest.json', 'icon.svg',
  'vendor/three.module.js', 'vendor/OrbitControls.js', 'vendor/GLTFLoader.js', 'vendor/BufferGeometryUtils.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
