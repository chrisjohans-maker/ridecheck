import { describe, it, expect } from 'vitest';
import { locationNow } from '../src/lib/time.js';

describe('locationNow', () => {
  const instant = new Date('2026-08-08T18:00:00Z'); // fixed absolute moment

  // Regression: forecast times are location-local; "now" must be computed in the
  // location's timezone from utc_offset_seconds, not the device's.
  it('computes London wall clock (+3600s)', () => {
    const ln = locationNow(3600, instant);
    expect(ln.hour).toBe(19);
    expect(ln.date).toBe('2026-08-08');
  });

  it('computes New York wall clock (-14400s)', () => {
    const ln = locationNow(-14400, instant);
    expect(ln.hour).toBe(14);
    expect(ln.date).toBe('2026-08-08');
  });

  it('rolls the date backward across midnight', () => {
    const early = new Date('2026-08-08T02:00:00Z');
    const ln = locationNow(-18000, early); // -5h -> 21:00 previous day
    expect(ln.hour).toBe(21);
    expect(ln.date).toBe('2026-08-07');
  });

  it('falls back to local fields without throwing when offset is unknown', () => {
    const ln = locationNow(undefined, instant);
    expect(typeof ln.hour).toBe('number');
    expect(ln.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
