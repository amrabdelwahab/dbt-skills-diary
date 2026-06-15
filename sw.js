/* DBT Diary service worker — web push reminders */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Empty fetch handler — required for the install prompt to be offered.
self.addEventListener('fetch', () => {});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    // The app stores its current language in the Cache so the SW can match it.
    let lang = 'en';
    try { const c = await caches.open('dbt-cfg'); const r = await c.match('/lang'); if (r) lang = (await r.text()) || 'en'; } catch (_) {}
    let d = null;
    if (event.data) { try { d = event.data.json(); } catch (_) { d = { body: event.data.text() }; } }
    if (!d) {
      d = lang === 'ar'
        ? { title: 'مذكرة DBT 🌙', body: 'وقت مذكرتك النهارده — افتحها وابعتها للمعالج' }
        : { title: 'DBT Diary 🌙', body: 'Time for today’s diary — open it and send to your therapist' };
    }
    await self.registration.showNotification(d.title || 'DBT Diary', {
      body: d.body || '', dir: 'auto', tag: 'dbt-daily', renotify: true, data: { url: d.url || './' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
