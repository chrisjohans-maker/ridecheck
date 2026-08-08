import { describe, it, expect } from 'vitest';
import { summarizeNowcast } from '../src/lib/nowcast.js';

// Fixed "now"; build 15-min buckets relative to it. Times are naive-local ISO
// strings, matching Open-Meteo timezone=auto output and locationNow().wall.
const now = new Date(2026, 7, 8, 12, 0, 0);
const nowMs = now.getTime();
const iso = mins => {
  const d = new Date(nowMs + mins * 60000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// 8 buckets at 0,15,...,105 min with the given mm values.
const build = mm => ({ time: mm.map((_, i) => iso(i * 15)), precipitation: mm });

describe('summarizeNowcast', () => {
  it('reports no rain when dry throughout', () => {
    const s = summarizeNowcast(build([0, 0, 0, 0, 0, 0, 0, 0]), nowMs);
    expect(s.hasData).toBe(true);
    expect(s.state).toBe('dry');
    expect(s.text).toMatch(/no rain/i);
    expect(s.peakMm).toBe(0);
  });

  it('detects onset and reports minutes until rain', () => {
    const s = summarizeNowcast(build([0, 0, 1.2, 2.0, 1.0, 0, 0, 0]), nowMs); // rain at +30
    expect(s.state).toBe('starting');
    expect(s.minutesUntilChange).toBe(30);
    expect(s.text).toMatch(/starting in ~30 min/i);
    expect(s.peakMm).toBeCloseTo(2.0, 5);
  });

  it('detects cessation when raining now', () => {
    const s = summarizeNowcast(build([1.5, 1.0, 0.5, 0, 0, 0, 0, 0]), nowMs); // stops at +45
    expect(s.state).toBe('stopping');
    expect(s.minutesUntilChange).toBe(45);
    expect(s.text).toMatch(/clearing in ~45 min/i);
  });

  it('reports ongoing rain when wet throughout', () => {
    const s = summarizeNowcast(build([1, 1, 1, 1, 1, 1, 1, 1]), nowMs);
    expect(s.state).toBe('ongoing');
    expect(s.text).toMatch(/continuing/i);
  });

  it('rounds onset to the nearest 5 minutes', () => {
    // rain first appears in the bucket at +60 min
    const s = summarizeNowcast(build([0, 0, 0, 0, 0.4, 0, 0, 0]), nowMs);
    expect(s.minutesUntilChange % 5).toBe(0);
    expect(s.minutesUntilChange).toBe(60);
  });

  it('ignores trace precip below threshold', () => {
    const s = summarizeNowcast(build([0.05, 0.02, 0, 0, 0, 0, 0, 0]), nowMs);
    expect(s.state).toBe('dry');
  });

  it('returns hasData:false for empty or missing input', () => {
    expect(summarizeNowcast(null, nowMs).hasData).toBe(false);
    expect(summarizeNowcast({}, nowMs).hasData).toBe(false);
    expect(summarizeNowcast({ time: [], precipitation: [] }, nowMs).hasData).toBe(false);
  });
});
