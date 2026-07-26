// sw.js — Service Worker de TomaYa
// Se encarga de: cachear la app para uso offline y mostrar notificaciones locales.

const CACHE_NAME = 'tomaya-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icono.png'
];

// --- Instalación: cachea el app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// --- Activación: limpia cachés antiguas ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch: sirve desde caché, si falla va a la red (offline-first) ---
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Guarda una copia en caché para próximas veces
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

// --- Mostrar notificación cuando la página lo solicita ---
// app.js llama a registration.showNotification(...) directamente,
// pero dejamos este listener por si se añade un push server en el futuro.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TomaYa';
  const options = {
    body: data.body || 'Es hora de tomar tu pastilla 💊',
    icon: './icono.png',
    badge: './icono.png',
    tag: 'tomaya-recordatorio',
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// --- Al pulsar la notificación, abre/enfoca la app ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes('index.html') || c.url.endsWith('/'));
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});

// --- Periodic Background Sync (soporte limitado, solo Chrome/Android instalado) ---
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tomaya-check-pill') {
    event.waitUntil(
      self.registration.showNotification('TomaYa', {
        body: 'No olvides comprobar si ya tomaste tu pastilla hoy 💊',
        icon: './icono.png',
        badge: './icono.png',
        tag: 'tomaya-recordatorio'
      })
    );
  }
});
