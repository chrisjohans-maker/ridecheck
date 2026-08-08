import { describe, it, expect } from 'vitest';
import { windStrategy, latestSafeStart, fmtHour } from '../src/lib/advice.js';

describe('windStrategy', () => {
  it('treats light wind as directionless', () => {
    expect(windStrategy(4, 270).level).toBe('calm');
    expect(windStrategy(4, 270).text).toMatch(/light wind/i);
  });
  it('advises heading out toward the wind source (headwind out, tailwind home)', () => {
    const s = windStrategy(14, 270); // wind FROM the west
    expect(s.level).toBe('moderate');
    expect(s.outLabel).toBe('W');
    expect(s.text).toMatch(/head out toward the W/i);
    expect(s.text).toMatch(/14 mph/);
  });
  it('flags strong wind', () => {
    const s = windStrategy(24, 0); // from the N
    expect(s.level).toBe('strong');
    expect(s.outLabel).toBe('N');
    expect(s.text).toMatch(/strong/i);
  });
  it('degrades gracefully when direction is missing', () => {
    expect(windStrategy(15, null).level).toBe('calm');
  });
});

describe('latestSafeStart', () => {
  it('computes the latest start with a margin', () => {
    // 90-min ride, sunset 20.0 (8 PM), now 15.0 (3 PM), 15-min margin
    const r = latestSafeStart(90, 20.0, 15.0);
    expect(r.feasible).toBe(true);
    expect(r.latestStartHourF).toBeCloseTo(20 - (90 + 15) / 60, 5); // 18.25
    expect(r.text).toMatch(/6:15 PM/);
  });
  it('flags when there is not enough daylight left', () => {
    const r = latestSafeStart(180, 20.0, 19.0); // 3-hr ride, 1 hr to sunset
    expect(r.feasible).toBe(false);
    expect(r.text).toMatch(/not enough daylight/i);
  });
  it('returns null without duration or sunset', () => {
    expect(latestSafeStart(null, 20, 15)).toBeNull();
    expect(latestSafeStart(90, null, 15)).toBeNull();
  });
});

describe('fmtHour', () => {
  it('formats decimal hours as 12-hour clock', () => {
    expect(fmtHour(17.5)).toBe('5:30 PM');
    expect(fmtHour(0)).toBe('12:00 AM');
    expect(fmtHour(12)).toBe('12:00 PM');
    expect(fmtHour(9.5)).toBe('9:30 AM');
    expect(fmtHour(18.999)).toBe('7:00 PM'); // 59.94m rounds to 60 -> carries the hour
  });
});
