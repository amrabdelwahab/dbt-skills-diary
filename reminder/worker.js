/* DBT Diary reminder Worker
   - Stores push subscriptions in KV (per device): {sub,time,tz,tzName,lang,lastSent}
   - Cloudflare Cron Trigger fires the daily push itself (punctual), sending a
     payload-less Web Push (VAPID only) — the service worker shows the default text.
   Routes:
     POST /subscribe                 save (public)
     POST /unsubscribe {endpoint}    delete your own (public)
     GET  /list?key=                 list all (secret)
     POST /sent?key= {id,date}       mark sent (secret)
     POST /remove?key= {id}          delete (secret)
     POST /run?key=&force=1          run the daily send now (secret, for testing)
*/
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/subscribe' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { return j({ error: 'bad json' }, 400); }
      const sub = body.sub || body;
      if (!sub || !sub.endpoint) return j({ error: 'no endpoint' }, 400);
      const rec = {
        sub,
        time: typeof body.time === 'string' ? body.time : '09:00',
        tz: Number.isInteger(body.tz) ? body.tz : 0,
        tzName: typeof body.tzName === 'string' ? body.tzName : '',
        lang: body.lang === 'ar' ? 'ar' : 'en',
      };
      await env.SUBS.put(await sha(sub.endpoint), JSON.stringify(rec));
      return j({ ok: true });
    }

    if (url.pathname === '/unsubscribe' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { body = {}; }
      const ep = body.endpoint || (body.sub && body.sub.endpoint);
      if (ep) await env.SUBS.delete(await sha(ep));
      return j({ ok: true });
    }

    if (url.pathname === '/list' && req.method === 'GET') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      const out = [];
      for await (const { name, value } of iterate(env)) out.push({ id: name, sub: value });
      return j(out);
    }

    if (url.pathname === '/sent' && req.method === 'POST') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      let b; try { b = await req.json(); } catch { b = {}; }
      if (b.id) { const v = await env.SUBS.get(b.id); if (v) { const r = JSON.parse(v); r.lastSent = b.date; await env.SUBS.put(b.id, JSON.stringify(r)); } }
      return j({ ok: true });
    }

    if (url.pathname === '/remove' && req.method === 'POST') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      let b; try { b = await req.json(); } catch { b = {}; }
      if (b.id) await env.SUBS.delete(b.id);
      return j({ ok: true });
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      const force = url.searchParams.get('force') === '1';
      const r = await runDaily(env, force);
      return j(r);
    }

    return new Response('DBT reminder worker', { headers: CORS });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env, false));
  },
};

/* ---------- daily send ---------- */
async function runDaily(env, force) {
  const key = await importVapidKey(env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  let total = 0, due = 0, sent = 0;
  for await (const { name, value: rec } of iterate(env)) {
    total++;
    const sub = rec.sub || rec;
    if (!sub || !sub.endpoint) continue;
    const { minutes: lm, date: ds } = localParts(rec);
    const [th, tm] = String(rec.time || '09:00').split(':').map(Number);
    const target = th * 60 + tm;
    if (!force) {
      if (rec.lastSent === ds) continue;
      if (lm < target) continue;
    }
    due++;
    try {
      const res = await sendPush(sub.endpoint, key, env);
      if (res.status === 201 || res.status === 200) {
        if (!force) { rec.lastSent = ds; await env.SUBS.put(name, JSON.stringify(rec)); }
        sent++;
      } else if (res.status === 404 || res.status === 410) {
        await env.SUBS.delete(name);
      }
    } catch (_) { /* skip */ }
  }
  return { total, due, sent };
}

async function* iterate(env) {
  let cursor;
  do {
    const r = await env.SUBS.list({ cursor });
    for (const k of r.keys) { const v = await env.SUBS.get(k.name); if (v) yield { name: k.name, value: JSON.parse(v) }; }
    cursor = r.cursor;
    if (r.list_complete) break;
  } while (cursor);
}

// Local minutes-since-midnight + YYYY-MM-DD in the user's zone (DST/travel-proof).
function localParts(rec) {
  if (rec.tzName) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: rec.tzName, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date()).map(x => [x.type, x.value]));
      return { minutes: (Number(p.hour) % 24) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
    } catch (_) {}
  }
  const tz = Number.isInteger(rec.tz) ? rec.tz : 0;
  const d = new Date(Date.now() + tz * 60000);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) };
}

/* ---------- web push (payload-less, VAPID only) ---------- */
async function sendPush(endpoint, key, env) {
  const jwt = await vapidJWT(endpoint, key, env.VAPID_SUBJECT || 'mailto:amr@teamalfred.ai');
  return fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}` },
  });
}

async function importVapidKey(pubB64, privB64) {
  const pub = b64uToU8(pubB64); // 0x04 || X(32) || Y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: u8ToB64u(pub.slice(1, 33)),
    y: u8ToB64u(pub.slice(33, 65)),
    d: privB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidJWT(endpoint, key, subject) {
  const aud = new URL(endpoint).origin;
  const enc = o => u8ToB64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject });
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data));
  return `${data}.${u8ToB64u(new Uint8Array(sig))}`;
}

/* ---------- helpers ---------- */
function j(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } }); }
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function b64uToU8(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
function u8ToB64u(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
