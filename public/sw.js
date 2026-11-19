// Service worker: cache do app (funciona com conexão instável) e notificações push
const VERSAO = 'tocatas-v1';
const APP_SHELL = [
  '/', '/index.html', '/css/app.css', '/js/app.js', '/js/api.js', '/js/util.js', '/js/icons.js', '/js/push.js',
  '/vendor/fullcalendar.js', '/vendor/fullcalendar-pt-br.js', '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSAO).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // API: sempre na rede (dados atualizados e protegidos; nada é guardado em cache)
  if (url.pathname.startsWith('/api/')) return;
  // Arquivos do app: rede primeiro, cache como reserva quando offline
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSAO).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html'))),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Tocatas BM', body: event.data && event.data.text() }; }
  const title = data.title || 'Tocatas BM';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag ? `${data.tag}-${data.kind || ''}` : undefined,
    data: { url: data.url || '/#/painel' },
    vibrate: [200, 100, 200],
    requireInteraction: data.kind === '2h',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#/painel';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) return c.navigate(url);
        return undefined;
      }
    }
    return self.clients.openWindow(url);
  })());
});
