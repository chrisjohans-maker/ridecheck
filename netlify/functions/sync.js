// Ride-log cloud sync + magic-link auth. Keeps a user's ride log server-side so
// an iOS PWA uninstall (which wipes all local storage) can't destroy it — the
// log auto-restores on sign-in.
//
//   POST { action:'request', email }            → email a one-time magic link
//   POST { action:'verify',  token }            → exchange link token for a session → { sessionId, email }
//   POST { action:'push',    sessionId, rides } → store the log           → { ok, updatedAt }
//   POST { action:'pull',    sessionId }        → fetch the stored log     → { rides, updatedAt }
//
// Only the owner's own data is reachable, and only with a valid session. The
// log is the sole thing stored; no weather, no device info.
//
// Env (Netlify → Site config → Environment variables):
//   RESEND_API_KEY     send the magic-link email (resend.com, free tier)
//   SYNC_ALLOWED_EMAIL (optional) lock sync to a single address — set to your
//                      email while scope is "just me"; unset to open to all.
//   SYNC_BASE_URL      (optional) override the link origin (defaults to the
//                      request's own origin).

const TOKEN_TTL_MS = 15 * 60 * 1000;            // magic links die fast
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // a device stays signed in ~1yr
const MAX_RIDES = 5000;                           // matches the client log cap

// Netlify Blobs is zero-config in the runtime; loaded lazily so tests inject a
// fake store. One store, prefixed keys: token:* / sess:* / log:*.
async function syncStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore('ridecheck-sync');
}

// Core logic, decoupled from Netlify's event shape, Blobs, crypto, and fetch so
// it's fully unit-testable with fakes.
async function handle(deps) {
  const { method, body, store, doFetch, env, now, randomKey, hashEmail } = deps;
  if (method === 'OPTIONS') return { statusCode: 200, body: '' };
  if (method !== 'POST') return { statusCode: 405, body: { error: 'Method not allowed' } };

  const { action } = body || {};

  if (action === 'request') {
    const email = (body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { statusCode: 400, body: { error: 'Invalid email' } };
    const allowed = (env.SYNC_ALLOWED_EMAIL || '').trim().toLowerCase();
    if (allowed && email !== allowed) {
      // Don't reveal the allow-list; behave like success so we don't leak who's allowed.
      return { statusCode: 200, body: { ok: true } };
    }
    const token = randomKey();
    await store.set('token:' + token, JSON.stringify({ email, ts: now() }));
    const base = (env.SYNC_BASE_URL || deps.origin || '').replace(/\/$/, '');
    const link = `${base}/?synctoken=${token}`;
    if (!env.RESEND_API_KEY) {
      // No mail provider configured. Surface the link so setup/testing isn't blocked,
      // but never in production-with-allow-list (that would be an open bypass).
      if (allowed) return { statusCode: 500, body: { error: 'Email not configured' } };
      return { statusCode: 200, body: { ok: true, devLink: link } };
    }
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY },
      body: JSON.stringify({
        from: env.SYNC_FROM || 'RideCheck <onboarding@resend.dev>',
        to: email,
        subject: 'Your RideCheck sign-in link',
        html: `<p>Tap to turn on RideCheck auto-sync on this device:</p>
               <p><a href="${link}">Sign in to RideCheck</a></p>
               <p style="color:#888;font-size:13px">This link works once and expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      let detail = ''; try { detail = JSON.stringify(await res.json()); } catch {}
      return { statusCode: 502, body: { error: 'Could not send email', detail } };
    }
    return { statusCode: 200, body: { ok: true } };
  }

  if (action === 'verify') {
    const token = body.token;
    if (!token) return { statusCode: 400, body: { error: 'Missing token' } };
    const raw = await store.get('token:' + token);
    if (!raw) return { statusCode: 400, body: { error: 'Link expired or already used' } };
    await store.delete('token:' + token); // single-use
    let entry; try { entry = JSON.parse(raw); } catch { return { statusCode: 400, body: { error: 'Bad token' } }; }
    if (!entry || (now() - (entry.ts || 0)) > TOKEN_TTL_MS) return { statusCode: 400, body: { error: 'Link expired' } };
    const sessionId = randomKey();
    await store.set('sess:' + sessionId, JSON.stringify({ email: entry.email, ts: now() }));
    return { statusCode: 200, body: { sessionId, email: entry.email } };
  }

  // push / pull both need a live session.
  if (action === 'push' || action === 'pull') {
    const sessionId = body.sessionId;
    if (!sessionId) return { statusCode: 401, body: { error: 'Not signed in' } };
    const sraw = await store.get('sess:' + sessionId);
    if (!sraw) return { statusCode: 401, body: { error: 'Session expired' } };
    let sess; try { sess = JSON.parse(sraw); } catch { return { statusCode: 401, body: { error: 'Bad session' } }; }
    if (!sess || (now() - (sess.ts || 0)) > SESSION_TTL_MS) {
      await store.delete('sess:' + sessionId);
      return { statusCode: 401, body: { error: 'Session expired' } };
    }
    const logKey = 'log:' + hashEmail(sess.email);

    if (action === 'pull') {
      const lraw = await store.get(logKey);
      if (!lraw) return { statusCode: 200, body: { rides: [], updatedAt: 0 } };
      let log; try { log = JSON.parse(lraw); } catch { log = { rides: [], updatedAt: 0 }; }
      return { statusCode: 200, body: { rides: log.rides || [], updatedAt: log.updatedAt || 0 } };
    }

    // push
    let rides = Array.isArray(body.rides) ? body.rides : null;
    if (!rides) return { statusCode: 400, body: { error: 'No rides' } };
    rides = rides.filter(r => r && typeof r === 'object' && r.date).slice(0, MAX_RIDES);
    const updatedAt = now();
    await store.set(logKey, JSON.stringify({ rides, updatedAt }));
    return { statusCode: 200, body: { ok: true, updatedAt, count: rides.length } };
  }

  return { statusCode: 400, body: { error: 'Unknown action' } };
}

// Netlify entrypoint: wire the event shape, Blobs, crypto, and fetch into handle().
async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const crypto = await import('node:crypto');
    const store = await syncStore();
    const proto = event.headers?.['x-forwarded-proto'] || 'https';
    const host = event.headers?.host || '';
    const res = await handle({
      method: event.httpMethod,
      body: JSON.parse(event.body || '{}'),
      store,
      doFetch: fetch,
      env: process.env,
      now: () => Date.now(),
      randomKey: () => crypto.randomBytes(24).toString('base64url'),
      hashEmail: (e) => crypto.createHash('sha256').update(String(e)).digest('hex').slice(0, 32),
      origin: host ? `${proto}://${host}` : '',
    });
    return { statusCode: res.statusCode, headers, body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {}) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}

module.exports = { handle, handler };
