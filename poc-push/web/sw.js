// Service worker do teste: exibe a notificação mesmo com o app fechado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Necessário para o Chrome considerar o site instalável
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Tocatas BM', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Tocatas BM', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: `${d.tag || 'poc'}-${Date.now()}`,
    data: { url: d.url || '/' },
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow(event.notification.data.url || '/');
  })());
});
