// Cloud log-sync: pure helpers. All DOM/network/storage lives in main.js and
// the Netlify function; this module is just the logic that's worth testing.
import { rideKey } from './backup.js';

// Pull a one-time magic-link token out of a callback URL (?synctoken=...).
// Returns the token string, or null if absent/garbage.
export function parseSyncToken(urlStr) {
  try {
    const u = new URL(urlStr);
    const t = u.searchParams.get('synctoken');
    return t && /^[A-Za-z0-9_-]{8,128}$/.test(t) ? t : null;
  } catch { return null; }
}

// Lenient-but-real email check. We're not validating deliverability, just
// rejecting obvious junk before we bother the server.
export function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function normalizeEmail(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

// Union two ride lists, de-duping by the same stable identity backup uses
// (id, else date+distance+duration). Newest-first by date. Pure — no mutation
// of the inputs. Returns { merged, addedFromB } so callers can tell whether a
// side gained anything and needs to be written back.
export function unionRides(a, b) {
  const base = Array.isArray(a) ? a.slice() : [];
  const seen = new Set(base.map(rideKey));
  let addedFromB = 0;
  for (const r of (Array.isArray(b) ? b : [])) {
    if (!r || typeof r !== 'object' || !r.date) continue;
    const k = rideKey(r);
    if (!seen.has(k)) { seen.add(k); base.push(r); addedFromB++; }
  }
  base.sort((x, y) => new Date(y.date) - new Date(x.date));
  return { merged: base, addedFromB };
}

// Decide what to do after a pull: reconcile local + server into one set, and
// report which sides changed so main.js knows whether to re-render (local grew)
// and whether to push back (server was missing some local rides).
export function reconcile(local, server) {
  const { merged, addedFromB: gainedFromServer } = unionRides(local, server);
  // Did the server lack anything we have locally?
  const serverKeys = new Set((Array.isArray(server) ? server : []).map(rideKey));
  const serverMissing = merged.some(r => !serverKeys.has(rideKey(r)));
  return {
    merged,
    changedLocally: gainedFromServer > 0,   // local gained rides → re-render + save
    pushNeeded: serverMissing,              // server is behind → push merged back
  };
}
