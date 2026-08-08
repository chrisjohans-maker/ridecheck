import { describe, it, expect } from 'vitest';
import { parseBackup, mergeRides, rideKey } from '../src/lib/backup.js';

describe('parseBackup', () => {
  it('accepts a raw array of rides', () => {
    const r = parseBackup(JSON.stringify([{ id: 1, date: '2026-08-08T09:00:00', distanceMi: 40 }]));
    expect(r.ok).toBe(true);
    expect(r.rides).toHaveLength(1);
  });
  it('accepts a { rides: [...] } wrapper', () => {
    const r = parseBackup(JSON.stringify({ app: 'ridecheck', rides: [{ id: 1, date: 'x' }] }));
    expect(r.ok).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(parseBackup('not json').ok).toBe(false);
  });
  it('rejects when there are no rides', () => {
    expect(parseBackup(JSON.stringify({ rides: [] })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });
  it('drops entries without a date', () => {
    const r = parseBackup(JSON.stringify([{ id: 1, date: 'ok' }, { id: 2 }, null]));
    expect(r.ok).toBe(true);
    expect(r.rides).toHaveLength(1);
  });
});

describe('mergeRides', () => {
  it('adds only rides not already present (by id)', () => {
    const existing = [{ id: 1, date: 'a' }];
    const incoming = [{ id: 1, date: 'a' }, { id: 2, date: 'b' }];
    const { merged, added } = mergeRides(existing, incoming);
    expect(added).toBe(1);
    expect(merged).toHaveLength(2);
  });
  it('dedupes id-less rides by date+distance+duration', () => {
    const existing = [{ date: '2026-08-08', distanceMi: 40, durationMins: 150 }];
    const incoming = [{ date: '2026-08-08', distanceMi: 40, durationMins: 150 }];
    expect(mergeRides(existing, incoming).added).toBe(0);
  });
  it('handles empty/missing inputs', () => {
    expect(mergeRides(null, [{ id: 1, date: 'a' }]).added).toBe(1);
    expect(mergeRides([{ id: 1, date: 'a' }], null).added).toBe(0);
  });
});
