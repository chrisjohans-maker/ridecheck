import { describe, it, expect } from 'vitest';
import { parseSyncToken, isValidEmail, normalizeEmail, unionRides, reconcile } from '../src/lib/sync.js';
import { handle } from '../netlify/functions/sync.js';

describe('parseSyncToken', () => {
  it('extracts a valid token', () => {
    expect(parseSyncToken('https://ridecheck.app/?synctoken=abc123XYZ_-')).toBe('abc123XYZ_-');
  });
  it('returns null when absent or malformed', () => {
    expect(parseSyncToken('https://ridecheck.app/')).toBe(null);
    expect(parseSyncToken('https://ridecheck.app/?synctoken=short')).toBe(null); // < 8 chars
    expect(parseSyncToken('https://ridecheck.app/?synctoken=has spaces!')).toBe(null);
    expect(parseSyncToken('not a url')).toBe(null);
  });
});

describe('email helpers', () => {
  it('validates real-ish addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail(' A@B.CO ')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
  it('normalizes case/whitespace', () => {
    expect(normalizeEmail('  Chris@Example.COM ')).toBe('chris@example.com');
  });
});

describe('unionRides', () => {
  const a = [{ id: 1, date: '2026-06-02T08:00:00', distanceMi: 20 }];
  const b = [
    { id: 1, date: '2026-06-02T08:00:00', distanceMi: 20 }, // dupe by id
    { id: 2, date: '2026-06-03T08:00:00', distanceMi: 30 },
  ];
  it('de-dupes by id and keeps newest first', () => {
    const { merged, addedFromB } = unionRides(a, b);
    expect(merged).toHaveLength(2);
    expect(addedFromB).toBe(1);
    expect(merged[0].id).toBe(2); // newest date first
  });
  it('de-dupes by date+distance+duration when id is absent', () => {
    const x = [{ date: '2026-06-02T08:00:00', distanceMi: 20, durationMins: 60 }];
    const y = [{ date: '2026-06-02T08:00:00', distanceMi: 20, durationMins: 60 }];
    expect(unionRides(x, y).merged).toHaveLength(1);
  });
  it('ignores junk entries without a date', () => {
    expect(unionRides([], [null, { id: 9 }, { id: 8, date: 'd' }]).merged).toHaveLength(1);
  });
  it('does not mutate inputs', () => {
    const left = [{ id: 1, date: 'd' }];
    unionRides(left, [{ id: 2, date: 'e' }]);
    expect(left).toHaveLength(1);
  });
});

describe('reconcile', () => {
  it('flags local growth when server has extra rides', () => {
    const r = reconcile([], [{ id: 1, date: 'd' }]);
    expect(r.changedLocally).toBe(true);
    expect(r.merged).toHaveLength(1);
  });
  it('flags pushNeeded when server is missing local rides', () => {
    const r = reconcile([{ id: 1, date: 'd' }], []);
    expect(r.pushNeeded).toBe(true);
    expect(r.changedLocally).toBe(false);
  });
  it('no change when both sides match', () => {
    const same = [{ id: 1, date: 'd' }];
    const r = reconcile(same, same);
    expect(r.changedLocally).toBe(false);
    expect(r.pushNeeded).toBe(false);
  });
});

// ─── Backend handle() with fakes ─────────────────────────────
function fakeStore() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
  };
}
let _n = 0;
const baseDeps = (over = {}) => ({
  method: 'POST',
  store: fakeStore(),
  doFetch: async () => ({ ok: true, json: async () => ({ id: 'email_1' }) }),
  env: {},
  now: () => 1_000_000,
  randomKey: () => 'key' + (++_n),
  hashEmail: (e) => 'h(' + e + ')',
  origin: 'https://ridecheck.app',
  ...over,
});

describe('sync handle()', () => {
  it('OPTIONS preflight → 200', async () => {
    expect((await handle(baseDeps({ method: 'OPTIONS' }))).statusCode).toBe(200);
  });

  it('rejects non-POST', async () => {
    expect((await handle(baseDeps({ method: 'GET' }))).statusCode).toBe(405);
  });

  it('request: rejects bad email', async () => {
    const r = await handle(baseDeps({ body: { action: 'request', email: 'nope' } }));
    expect(r.statusCode).toBe(400);
  });

  it('request: returns devLink when no mail provider and no allow-list', async () => {
    const r = await handle(baseDeps({ body: { action: 'request', email: 'a@b.co' } }));
    expect(r.statusCode).toBe(200);
    expect(r.body.devLink).toContain('synctoken=');
  });

  it('request: allow-list mismatch looks like success but stores nothing', async () => {
    const store = fakeStore();
    const r = await handle(baseDeps({ store, env: { SYNC_ALLOWED_EMAIL: 'me@x.com' }, body: { action: 'request', email: 'stranger@x.com' } }));
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect([...store.m.keys()].some(k => k.startsWith('token:'))).toBe(false);
  });

  it('request: allow-listed email with no mail provider is a config error (no bypass)', async () => {
    const r = await handle(baseDeps({ env: { SYNC_ALLOWED_EMAIL: 'me@x.com' }, body: { action: 'request', email: 'me@x.com' } }));
    expect(r.statusCode).toBe(500);
  });

  it('request → verify → push → pull round-trip', async () => {
    const store = fakeStore();
    const req = await handle(baseDeps({ store, body: { action: 'request', email: 'me@x.com' } }));
    const token = req.body.devLink.split('synctoken=')[1];

    const ver = await handle(baseDeps({ store, body: { action: 'verify', token } }));
    expect(ver.statusCode).toBe(200);
    expect(ver.body.email).toBe('me@x.com');
    const { sessionId } = ver.body;

    const push = await handle(baseDeps({ store, body: { action: 'push', sessionId, rides: [{ id: 1, date: 'd', distanceMi: 40 }] } }));
    expect(push.statusCode).toBe(200);
    expect(push.body.count).toBe(1);

    const pull = await handle(baseDeps({ store, body: { action: 'pull', sessionId } }));
    expect(pull.statusCode).toBe(200);
    expect(pull.body.rides).toHaveLength(1);
    expect(pull.body.rides[0].distanceMi).toBe(40);
  });

  it('verify: a token works only once', async () => {
    const store = fakeStore();
    const req = await handle(baseDeps({ store, body: { action: 'request', email: 'me@x.com' } }));
    const token = req.body.devLink.split('synctoken=')[1];
    expect((await handle(baseDeps({ store, body: { action: 'verify', token } }))).statusCode).toBe(200);
    expect((await handle(baseDeps({ store, body: { action: 'verify', token } }))).statusCode).toBe(400); // reused
  });

  it('verify: expired token is rejected', async () => {
    const store = fakeStore();
    await handle(baseDeps({ store, now: () => 0, body: { action: 'request', email: 'me@x.com' } }));
    const token = [...store.m.keys()].find(k => k.startsWith('token:')).slice('token:'.length);
    const r = await handle(baseDeps({ store, now: () => 20 * 60 * 1000, body: { action: 'verify', token } }));
    expect(r.statusCode).toBe(400);
  });

  it('push/pull without a valid session → 401', async () => {
    expect((await handle(baseDeps({ body: { action: 'pull', sessionId: 'nope' } }))).statusCode).toBe(401);
    expect((await handle(baseDeps({ body: { action: 'push', sessionId: 'nope', rides: [] } }))).statusCode).toBe(401);
    expect((await handle(baseDeps({ body: { action: 'pull' } }))).statusCode).toBe(401); // missing id
  });

  it('pull of an untouched account returns an empty log', async () => {
    const store = fakeStore();
    const ver = await handle(baseDeps({ store, body: { action: 'verify', token: 't' }, now: () => 1 }));
    // manually seed a session to pull against
    await store.set('sess:S', JSON.stringify({ email: 'me@x.com', ts: 1_000_000 }));
    const pull = await handle(baseDeps({ store, body: { action: 'pull', sessionId: 'S' } }));
    expect(pull.statusCode).toBe(200);
    expect(pull.body.rides).toEqual([]);
    expect(pull.body.updatedAt).toBe(0);
  });

  it('request: sends via Resend when a key is present', async () => {
    let called = null;
    const doFetch = async (url, opts) => { called = { url, opts }; return { ok: true, json: async () => ({}) }; };
    const r = await handle(baseDeps({ doFetch, env: { RESEND_API_KEY: 'rk_test' }, body: { action: 'request', email: 'me@x.com' } }));
    expect(r.statusCode).toBe(200);
    expect(called.url).toBe('https://api.resend.com/emails');
    expect(called.opts.headers.Authorization).toBe('Bearer rk_test');
    expect(JSON.parse(called.opts.body).to).toBe('me@x.com');
    expect(r.body.devLink).toBeUndefined(); // never leak the link once real email is on
  });

  it('push drops junk entries and caps the list', async () => {
    const store = fakeStore();
    await store.set('sess:S', JSON.stringify({ email: 'me@x.com', ts: 1_000_000 }));
    const push = await handle(baseDeps({ store, body: { action: 'push', sessionId: 'S', rides: [{ id: 1, date: 'd' }, null, { id: 2 }] } }));
    expect(push.body.count).toBe(1); // null dropped, dateless dropped
  });
});
