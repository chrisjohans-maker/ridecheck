// Ride-log cloud sync + magic-link auth. Keeps a user's ride log server-side so
// an iOS PWA uninstall (which wipes all local storage) can't destroy it — the
// log auto-restores on sign-in.
//
//   POST { action:'request', email }            → email a one-time 6-digit code
//   POST { action:'verify',  email, code }      → exchange the code for a session → { sessionId, email }
//   POST { action:'push',    sessionId, rides } → store the log           → { ok, updatedAt }
//   POST { action:'pull',    sessionId }        → fetch the stored log     → { rides, updatedAt }
//
// A 6-digit code (not a magic link) is used because tapping a link on iOS opens
// Safari, whose storage is walled off from an installed home-screen PWA — the
// session would land in the wrong place. The code is typed into the app itself.
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

const CODE_TTL_MS = 15 * 60 * 1000;             // sign-in codes die fast
const MAX_CODE_ATTEMPTS = 5;                     // lock a code after this many wrong tries
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
  const { method, body, store, doFetch, env, now, randomKey, randomCode, hashEmail } = deps;
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
    // Fail closed when truly unconfigured: no allow-list, no mail provider, and
    // not in explicit dev mode means there's no legitimate way to sign anyone in,
    // so grant nothing (a deploy before env setup stays inert rather than open).
    if (!allowed && !env.RESEND_API_KEY && !env.SYNC_DEV) return { statusCode: 503, body: { error: 'Sync not configured' } };
    const code = randomCode();
    await store.set('code:' + hashEmail(email), JSON.stringify({ code, ts: now(), attempts: 0 }));
    if (!env.RESEND_API_KEY) {
      // No mail provider: in explicit dev mode, surface the code so local testing
      // isn't blocked; with an allow-list set, this is a real config error.
      if (allowed) return { statusCode: 500, body: { error: 'Email not configured' } };
      return { statusCode: 200, body: { ok: true, devCode: code } }; // env.SYNC_DEV only, from the guard above
    }
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_API_KEY },
      body: JSON.stringify({
        from: env.SYNC_FROM || 'RideCheck <onboarding@resend.dev>',
        to: email,
        subject: `${code} is your RideCheck sign-in code`,
        html: `<p>Your RideCheck sign-in code:</p>
               <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
               <p style="color:#888;font-size:13px">Enter it in the app to turn on auto-sync. It expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      let detail = ''; try { detail = JSON.stringify(await res.json()); } catch {}
      return { statusCode: 502, body: { error: 'Could not send email', detail } };
    }
    return { statusCode: 200, body: { ok: true } };
  }

  if (action === 'verify') {
    const email = (body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    if (!email || !/^\d{6}$/.test(code)) return { statusCode: 400, body: { error: 'Enter the 6-digit code' } };
    const key = 'code:' + hashEmail(email);
    const raw = await store.get(key);
    if (!raw) return { statusCode: 400, body: { error: 'Code expired — request a new one' } };
    let entry; try { entry = JSON.parse(raw); } catch { await store.delete(key); return { statusCode: 400, body: { error: 'Bad code' } }; }
    if (!entry || (now() - (entry.ts || 0)) > CODE_TTL_MS) { await store.delete(key); return { statusCode: 400, body: { error: 'Code expired — request a new one' } }; }
    if ((entry.attempts || 0) >= MAX_CODE_ATTEMPTS) { await store.delete(key); return { statusCode: 429, body: { error: 'Too many tries — request a new code' } }; }
    if (code !== entry.code) {
      entry.attempts = (entry.attempts || 0) + 1;
      await store.set(key, JSON.stringify(entry));
      return { statusCode: 400, body: { error: 'Wrong code' } };
    }
    await store.delete(key); // single-use
    const sessionId = randomKey();
    await store.set('sess:' + sessionId, JSON.stringify({ email, ts: now() }));
    return { statusCode: 200, body: { sessionId, email } };
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
      randomCode: () => String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
      hashEmail: (e) => crypto.createHash('sha256').update(String(e)).digest('hex').slice(0, 32),
      origin: host ? `${proto}://${host}` : '',
    });
    return { statusCode: res.statusCode, headers, body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {}) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}

module.exports = { handle, handler };
