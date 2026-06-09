/* DBT Diary reminder Worker — stores push subscriptions in KV.
   Routes:
     POST /subscribe   { ...PushSubscription }      → save (public)
     GET  /list?key=…                               → list all (secret)
     POST /remove?key=…  { id }                     → delete one (secret, for expired subs)
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
      let body;
      try { body = await req.json(); } catch { return j({ error: 'bad json' }, 400); }
      const sub = body.sub || body;                 // accept {sub,time,tz,lang} or a raw subscription
      if (!sub || !sub.endpoint) return j({ error: 'no endpoint' }, 400);
      const rec = {
        sub,
        time: typeof body.time === 'string' ? body.time : '09:00',  // HH:MM, user's local time
        tz: Number.isInteger(body.tz) ? body.tz : 0,                // minutes offset from UTC (e.g. +180 for Cairo)
        lang: body.lang === 'ar' ? 'ar' : 'en',
      };
      const id = await sha(sub.endpoint);
      await env.SUBS.put(id, JSON.stringify(rec));
      return j({ ok: true, id });
    }

    if (url.pathname === '/list' && req.method === 'GET') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      const out = [];
      let cursor;
      do {
        const r = await env.SUBS.list({ cursor });
        for (const k of r.keys) {
          const v = await env.SUBS.get(k.name);
          if (v) out.push({ id: k.name, sub: JSON.parse(v) });
        }
        cursor = r.cursor;
        if (r.list_complete) break;
      } while (cursor);
      return j(out);
    }

    if (url.pathname === '/remove' && req.method === 'POST') {
      if (url.searchParams.get('key') !== env.LIST_SECRET) return j({ error: 'forbidden' }, 403);
      let body; try { body = await req.json(); } catch { body = {}; }
      if (body.id) await env.SUBS.delete(body.id);
      return j({ ok: true });
    }

    return new Response('DBT reminder worker', { headers: CORS });
  },
};

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
