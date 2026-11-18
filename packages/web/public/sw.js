self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// A push: shown with the phone's own notification sound and a vibration. When the app is open
// and visible, the page rings its bell instead of a second pop-up.
self.addEventListener('push', (event) => {
  let data = { title: 'Tour d’avant-garde', body: '', url: '/', tag: undefined, sound: false };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.find((c) => c.visibilityState === 'visible');
      if (visible) {
        visible.postMessage({ type: 'push-received', ...data });
        if (!data.sound) return;
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag,
        renotify: Boolean(data.tag),
        requireInteraction: Boolean(data.sound),
        vibrate: data.sound ? [300, 150, 300, 150, 600] : [200, 100, 200],
        silent: false,
        data: { url: data.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
