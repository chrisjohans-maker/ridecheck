import { describe, it, expect } from 'vitest';
import { weatherPenalty } from '../src/lib/scoring.js';

describe('weatherPenalty — golden values', () => {
  it('perfect conditions deduct nothing', () => {
    // 68°F, dry, calm, mainly-clear (code 1, so no clear-sky bonus), low UV
    expect(weatherPenalty({ fl: 68, humid: 40, wind: 5, code: 1, pop: 0, uv: 2 })).toBe(0);
  });

  it('clear sky (code 0) gives the +2 bonus', () => {
    expect(weatherPenalty({ fl: 68, humid: 40, wind: 5, code: 0, pop: 0, uv: 2 })).toBe(2);
  });

  it('hot + humid + breezy + high UV stacks penalties', () => {
    // temp -32, humidity -5, humidity×heat -15, wind -3, pop>10 -3, UV -8 = -66
    expect(weatherPenalty({ fl: 92, humid: 70, wind: 10, code: 1, pop: 20, uv: 9 })).toBe(-66);
  });

  it('a full winter storm case', () => {
    // fl<32 -40, humidity>85 -12, wind 20 -25, freezing precip -50 = -127
    expect(weatherPenalty({ fl: 30, humid: 90, wind: 20, code: 66, pop: 0, uv: 0 })).toBe(-127);
  });
});

describe('weatherPenalty — freezing rain regression', () => {
  // Locks the OTHER half of the freezing-rain fix: 66/67 must incur the heavy
  // precip penalty, not be treated like plain rain.
  it('freezing rain/ice (56/57/66/67) is a -50 precip hit', () => {
    for (const code of [56, 57, 66, 67]) {
      expect(weatherPenalty({ code })).toBe(-50);
    }
  });
  it('thunderstorms are also -50', () => {
    expect(weatherPenalty({ code: 95 })).toBe(-50);
  });
  it('plain rain (63) is only -25 — proving 66 is not treated as plain rain', () => {
    expect(weatherPenalty({ code: 63 })).toBe(-25);
  });
  it('rain-probability is skipped when a precip code is already set', () => {
    // code 66 is in the exclusion list, so pop must not add on top
    expect(weatherPenalty({ code: 66, pop: 90 })).toBe(-50);
  });
});
