/* DBT Diary service worker — web push reminders */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Empty fetch handler — required for the install prompt to be offered.
self.addEventListener('fetch', () => {});

self.addEventListener('push', event => {
  let d = { title: 'DBT Diary · مذكرة 🌙', body: 'وقت مذكرتك النهارده — time for your diary', url: './' };
  try { if (event.data) Object.assign(d, event.data.json()); }
  catch (_) { if (event.data) d.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, dir: 'auto', tag: 'dbt-daily', renotify: true,
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
