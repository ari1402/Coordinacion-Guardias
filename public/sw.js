// Service worker de la app: muestra las notificaciones push (recordatorio de
// feedback) y al tocarlas abre la app en la pantalla indicada. No usa el SDK
// de Firebase: el script de GitHub Actions manda mensajes FCM "solo datos"
// ({ title, body, url }) y acá se arma la notificación.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const data = { ...(payload.notification || {}), ...(payload.data || {}) };
  const title = data.title || 'Guardias R1';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: data.tag || undefined,
      data: { url: data.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          try {
            await client.focus();
            await client.navigate(target);
            return;
          } catch {
            break; // pestaña que el SW no controla: se abre una nueva
          }
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
