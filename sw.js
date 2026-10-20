// Offline: every app file is cached when the app is installed, and served from the cache after
// that, so check-in works with no data. A changed sw.js is fetched in the background whenever
// there's a connection: change VERSION with every release, or phones keep the old files.
const VERSION = 'gym-access-0.1.0';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './gymcrypto.js',
  './store.js',
  './strings.js',
  './gym.js',
  './manifest.webmanifest',
  './vendor/noble.js',
  './vendor/qrcodegen.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './img/byte_10_kettlebell_carry.webp',
  './img/byte_11_jump_rope.webp',
  './img/byte_12_batido.webp',
  './img/byte_13_champion_podium.webp',
  './img/byte_14_banana_power.webp',
  './img/byte_15_climbing_wall.webp',
  './img/byte_16_sprint.webp',
  './img/byte_17_cardio_heart.webp',
  './img/byte_18_battle_ropes.webp'
];

self.addEventListener('install', (e) => {
  // 'reload' skips the HTTP cache, so a new version never caches an old file.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Only our own old caches: other sites under the same github.io address share this origin.
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gym-access-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // The clock check is a HEAD request and goes straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: VERSION }).then((hit) => hit || fetch(req)));
});
