/* DBT Diary service worker — web push reminders */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Empty fetch handler — required for the install prompt to be offered.
self.addEventListener('fetch', () => {});

self.addEventListener('push', event => {
  // Read the payload synchronously — event.data can become unavailable after an await.
  let payload = null;
  try { if (event.data) payload = event.data.json(); } catch (_) { try { payload = { body: event.data.text() }; } catch (_) {} }
  event.waitUntil((async () => {
    // The app stores its current language in the Cache so the SW can match it.
    let lang = 'en';
    try { const c = await caches.open('dbt-cfg'); const r = await c.match('/lang'); if (r) lang = (await r.text()) || 'en'; } catch (_) {}
    const def = lang === 'ar'
      ? { title: 'مذكرة DBT 🌙', body: 'وقت مذكرتك النهارده — افتحها وابعتها للمعالج' }
      : { title: 'DBT Diary 🌙', body: 'Time for today’s diary — open it and send to your therapist' };
    const d = payload || def;
    await self.registration.showNotification(d.title || def.title, {
      body: d.body || def.body, dir: 'auto', tag: 'dbt-daily', renotify: true, data: { url: d.url || './' },
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
