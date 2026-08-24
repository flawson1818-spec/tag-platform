self.addEventListener('push', (event) => {
  let data = { title: 'TAG', body: '' };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(self.registration.showNotification(data.title || 'TAG', { body: data.body || '' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
