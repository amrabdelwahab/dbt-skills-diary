/* Daily reminder sender — runs on GitHub Actions cron.
   Pulls subscriptions from the Cloudflare Worker, sends a push to each user
   whose local time is at/after their chosen reminder time (once per local day). */
const webpush = require('web-push');

const PUB = 'BHw5X_AeAf4KDA1ylK313KCurAAMsyfXhX5XDh-C73sOUqDHumfL6xyYY-IUwH_PC6taW5gGRDqMfw4EBya_rkA';
const PRIV = process.env.VAPID_PRIVATE;
const SECRET = process.env.LIST_SECRET;
const WORKER = 'https://dbt-diary-reminder.amrabdelwahab.workers.dev';
const APP = 'https://amrabdelwahab.github.io/dbt-skills-diary/';
const WINDOW = 60; // minutes after the chosen time we still consider "due" (absorbs cron jitter)

if (!PRIV || !SECRET) { console.error('Missing VAPID_PRIVATE or LIST_SECRET'); process.exit(1); }
webpush.setVapidDetails('mailto:amr@teamalfred.ai', PUB, PRIV);

function payload(lang) {
  const m = lang === 'ar'
    ? { title: 'مذكرة DBT 🌙', body: 'وقت مذكرة النهارده — افتحها وابعتها للمعالج', url: APP }
    : { title: 'DBT Diary 🌙', body: 'Time for today’s diary — open and send to your therapist', url: APP };
  return JSON.stringify(m);
}

(async () => {
  const res = await fetch(`${WORKER}/list?key=${SECRET}`);
  if (!res.ok) { console.error('list failed', res.status); process.exit(1); }
  const list = await res.json();
  const now = Date.now();
  let sent = 0, due = 0;

  for (const item of list) {
    const rec = item.sub || {};
    const sub = rec.sub || rec;
    if (!sub || !sub.endpoint) continue;
    const tz = Number.isInteger(rec.tz) ? rec.tz : 0;
    const local = new Date(now + tz * 60000);
    const lm = local.getUTCHours() * 60 + local.getUTCMinutes();
    const dateStr = local.toISOString().slice(0, 10);
    const [th, tmm] = String(rec.time || '09:00').split(':').map(Number);
    const target = th * 60 + tmm;

    if (rec.lastSent === dateStr) continue;            // already sent today (user-local)
    if (lm < target || lm >= target + WINDOW) continue; // not in the due window
    due++;
    try {
      await webpush.sendNotification(sub, payload(rec.lang));
      await fetch(`${WORKER}/sent?key=${SECRET}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, date: dateStr }),
      });
      sent++;
    } catch (e) {
      console.error('send fail', e.statusCode);
      if (e.statusCode === 404 || e.statusCode === 410) {  // expired/gone — clean up
        await fetch(`${WORKER}/remove?key=${SECRET}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        });
      }
    }
  }
  console.log(`subscriptions=${list.length} due=${due} sent=${sent}`);
})();
