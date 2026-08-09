import { describe, it, expect } from 'vitest';
import { scoreFood } from '../src/lib/food-score.js';

// Representative per-serving macro profiles (roughly USDA per-100g).
const F = {
  banana:   { cal: 89,  carbs: 23,  protein: 1.1, fat: 0.3, fiber: 2.6 },
  oatmeal:  { cal: 71,  carbs: 12,  protein: 2.4, fat: 1.4, fiber: 1.7 },
  whiteRice:{ cal: 130, carbs: 28,  protein: 2.7, fat: 0.3, fiber: 0.4 },
  chicken:  { cal: 165, carbs: 0,   protein: 31,  fat: 3.6, fiber: 0 },
  almonds:  { cal: 579, carbs: 22,  protein: 21,  fat: 49,  fiber: 12 },
  soda:     { cal: 42,  carbs: 10.6,protein: 0,   fat: 0,   fiber: 0, sugar: 10.6 },
  beer:     { cal: 43,  carbs: 3.6, protein: 0.5, fat: 0,   fiber: 0, alcohol: 3.9 },
  friedJunk:{ cal: 312, carbs: 15,  protein: 4,   fat: 27,  fiber: 0.5 }, // e.g. chips/fries
  water:    { cal: 0,   carbs: 0,   protein: 0,   fat: 0,   fiber: 0 },
};

describe('scoreFood — everything is flagged as estimated', () => {
  it('marks results estimated', () => {
    expect(scoreFood(F.banana).estimated).toBe(true);
  });
});

describe('scoreFood — fuel foods score high, timed for the ride', () => {
  it('carb-rich whole foods (banana, oatmeal, rice) score well and suit pre/during', () => {
    for (const k of ['banana', 'oatmeal', 'whiteRice']) {
      const r = scoreFood(F[k]);
      expect(r.score).toBeGreaterThanOrEqual(75);
      expect(r.when).toMatch(/pre|during/);
    }
  });
});

describe('scoreFood — protein foods route to recovery', () => {
  it('chicken breast is post-ride', () => {
    const r = scoreFood(F.chicken);
    expect(r.when).toBe('post');
    expect(r.why).toMatch(/recovery/i);
  });
});

describe('scoreFood — fat & alcohol', () => {
  it('nuts are a snack (fatty but nutritious), not "avoid"', () => {
    const r = scoreFood(F.almonds);
    expect(r.when).not.toBe('avoid');
    expect(r.when).toMatch(/pre|post/);
  });
  it('fried junk is "avoid"', () => {
    expect(scoreFood(F.friedJunk).when).toBe('avoid');
  });
  it('alcohol is "avoid" and scores low', () => {
    const r = scoreFood(F.beer);
    expect(r.when).toBe('avoid');
    expect(r.score).toBeLessThan(30);
    expect(r.why).toMatch(/alcohol/i);
  });
});

describe('scoreFood — edge cases', () => {
  it('empty-carb drinks read as fast fuel but flagged light on nutrition', () => {
    const r = scoreFood(F.soda);
    expect(r.why).toMatch(/light on nutrition|fast carbs/i);
  });
  it('nutrient-dense but low-calorie foods (greens) are capped — not top fuel', () => {
    const kale = scoreFood({ cal: 49, carbs: 9, protein: 4.3, fat: 0.9, fiber: 3.6 });
    expect(kale.score).toBeLessThanOrEqual(72);
    expect(kale.when).not.toBe('avoid');
  });

  it('water/negligible energy is neutral, not fuel', () => {
    const r = scoreFood(F.water);
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThan(70);
    expect(r.why).toMatch(/light/i);
  });
  it('handles missing/empty macros without throwing', () => {
    expect(() => scoreFood({})).not.toThrow();
    expect(() => scoreFood()).not.toThrow();
  });
});
