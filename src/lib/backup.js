// Ride-log backup: parse an imported file and merge rides without duplicating (pure).

// Accepts either a raw array of rides or a { rides: [...] } wrapper.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'Not a valid backup file' }; }
  const rides = Array.isArray(data) ? data : (data && Array.isArray(data.rides) ? data.rides : null);
  if (!rides) return { ok: false, error: 'No rides found in file' };
  const clean = rides.filter(r => r && typeof r === 'object' && r.date);
  if (!clean.length) return { ok: false, error: 'No valid rides in file' };
  return { ok: true, rides: clean };
}

// Stable identity for dedupe: prefer id, else date + distance + duration.
export function rideKey(r) {
  return r.id != null ? 'id:' + r.id : `${r.date}|${r.distanceMi ?? ''}|${r.durationMins ?? ''}`;
}

// Merge incoming into existing, skipping rides already present. Returns {merged, added}.
export function mergeRides(existing, incoming) {
  const base = Array.isArray(existing) ? existing : [];
  const seen = new Set(base.map(rideKey));
  const merged = [...base];
  let added = 0;
  for (const r of (Array.isArray(incoming) ? incoming : [])) {
    const k = rideKey(r);
    if (!seen.has(k)) { seen.add(k); merged.push(r); added++; }
  }
  return { merged, added };
}
