import { describe, it, expect } from 'vitest';
import { calcStreak } from '../src/lib/streak.js';

const now = new Date(2026, 7, 12, 12, 0); // Wed Aug 12 2026, midday (local)
const daysAgo = n => new Date(now.getTime() - n * 864e5).toISOString();

describe('calcStreak (Monday-based weeks)', () => {
  it('is 0 for an empty log', () => {
    expect(calcStreak([], now)).toBe(0);
  });

  // Regression: a rider with prior-week rides but none yet THIS (partial) week
  // used to see the streak reset to 0. The current week gets grace.
  it('does not break the streak for an empty current week', () => {
    const log = [{ date: daysAgo(7) }, { date: daysAgo(14) }];
    expect(calcStreak(log, now)).toBe(2);
  });

  it('counts the current week when it has a ride', () => {
    const log = [{ date: daysAgo(0) }, { date: daysAgo(7) }];
    expect(calcStreak(log, now)).toBe(2);
  });

  it('stops at a gap two weeks back', () => {
    // grace skips the empty current week, previous week is also empty -> stop
    const log = [{ date: daysAgo(14) }];
    expect(calcStreak(log, now)).toBe(0);
  });
});
