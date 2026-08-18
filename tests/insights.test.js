import { describe, it, expect } from 'vitest';
import { computeInsights } from '../src/lib/insights.js';

const now = new Date(2026, 7, 12, 12, 0); // Wed Aug 12 2026
const daysAgo = n => {
  const d = new Date(now.getTime() - n * 864e5);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00:00`;
};

describe('computeInsights', () => {
  it('handles an empty log', () => {
    const r = computeInsights([], now);
    expect(r.totalRides).toBe(0);
    expect(r.totalMi).toBe(0);
    expect(r.avgMi).toBe(0);
    expect(r.longestMi).toBe(0);
    expect(r.weeks).toHaveLength(8);
    expect(r.weeks.every(w => w.mi === 0)).toBe(true);
    expect(r.weeks[7].isCurrent).toBe(true);
  });

  it('totals distance and averages only over rides that have a distance', () => {
    const log = [
      { date: daysAgo(1), distanceMi: 20, feel: 'good' },
      { date: daysAgo(2), distanceMi: 40, feel: 'great' },
      { date: daysAgo(3), distanceMi: null, feel: 'tough' }, // no distance
    ];
    const r = computeInsights(log, now);
    expect(r.totalRides).toBe(3);
    expect(r.totalMi).toBe(60);
    expect(r.avgMi).toBe(30); // 60 / 2 with-distance rides
    expect(r.longestMi).toBe(40);
  });

  it('buckets distance into the correct Monday-weeks', () => {
    const log = [
      { date: daysAgo(0), distanceMi: 10 },   // current week
      { date: daysAgo(1), distanceMi: 5 },    // current week
      { date: daysAgo(9), distanceMi: 30 },   // previous week
    ];
    const r = computeInsights(log, now);
    expect(r.weeks[7].mi).toBe(15); // current week
    expect(r.weeks[6].mi).toBe(30); // previous week
  });

  it('buckets distance by month, starting at the first logged month (no empty leading bars)', () => {
    const log = [
      { date: daysAgo(0), distanceMi: 20 },   // this month (Aug)
      { date: daysAgo(2), distanceMi: 30 },   // this month (Aug)
      { date: '2026-07-15T09:00:00', distanceMi: 40 }, // last month (July)
    ];
    const r = computeInsights(log, now); // now = Aug 12 2026; first ride = Jul
    // Only Jul + Aug — the four months before the first ride are not rendered.
    expect(r.months).toHaveLength(2);
    expect(r.months.map(m => m.label)).toEqual(['Jul', 'Aug']);
    expect(r.months[1].isCurrent).toBe(true);
    expect(r.months[1].mi).toBe(50);       // this month (Aug)
    expect(r.thisMonthMi).toBe(50);
    expect(r.months[0].label).toBe('Jul');
    expect(r.months[0].mi).toBe(40);       // last month
  });

  it('caps at the last 6 months even when the first ride is older', () => {
    const log = [
      { date: '2026-01-10T09:00:00', distanceMi: 100 }, // Jan — outside the 6-month window
      { date: '2026-03-10T09:00:00', distanceMi: 50 },  // Mar — oldest visible month
      { date: daysAgo(0), distanceMi: 20 },              // Aug
    ];
    const r = computeInsights(log, now); // now = Aug 12 2026
    // Window is Mar..Aug (6). Jan's 100mi is not shown, but still counts in totals.
    expect(r.months).toHaveLength(6);
    expect(r.months[0].label).toBe('Mar');
    expect(r.months[5].label).toBe('Aug');
    expect(r.totalMi).toBe(170); // totals are unaffected by the month window
  });

  it('keeps interior zero months but drops leading ones', () => {
    const log = [
      { date: '2026-06-10T09:00:00', distanceMi: 10 }, // Jun (first ride)
      { date: daysAgo(0), distanceMi: 15 },             // Aug — July is an honest gap
    ];
    const r = computeInsights(log, now); // now = Aug 12 2026
    expect(r.months.map(m => m.label)).toEqual(['Jun', 'Jul', 'Aug']);
    expect(r.months[1].mi).toBe(0); // July gap preserved
  });

  it('counts rides by feel', () => {
    const log = [
      { date: daysAgo(1), feel: 'good' },
      { date: daysAgo(2), feel: 'good' },
      { date: daysAgo(3), feel: 'great' },
      { date: daysAgo(4), feel: 'bad' },
    ];
    const r = computeInsights(log, now);
    expect(r.byFeel).toEqual({ great: 1, good: 2, tough: 0, bad: 1 });
  });
});
