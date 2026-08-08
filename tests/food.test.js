import { describe, it, expect } from 'vitest';
import { matchFood, FOOD_DB } from '../src/lib/food.js';

describe('FOOD_DB', () => {
  it('is a non-empty list of scored foods', () => {
    expect(Array.isArray(FOOD_DB)).toBe(true);
    expect(FOOD_DB.length).toBeGreaterThan(50);
    for (const f of FOOD_DB) {
      expect(typeof f.name).toBe('string');
      expect(typeof f.score).toBe('number');
    }
  });

  it('every food has merged macros (cal/carbs/protein/serving)', () => {
    for (const f of FOOD_DB) {
      expect(typeof f.cal).toBe('number');
      expect(typeof f.carbs).toBe('number');
      expect(typeof f.protein).toBe('number');
      expect(typeof f.serving).toBe('string');
    }
  });

  it('has sensible macros for known foods', () => {
    const banana = FOOD_DB.find(f => f.name === 'Banana');
    expect(banana.carbs).toBe(27);
    expect(banana.cal).toBe(105);
    const water = FOOD_DB.find(f => f.name === 'Water');
    expect(water.cal).toBe(0);
  });
});

describe('matchFood', () => {
  it('returns null for empty/blank queries', () => {
    expect(matchFood('')).toBeNull();
    expect(matchFood('   ')).toBeNull();
  });
  it('returns null for nonsense', () => {
    expect(matchFood('zxqwv-not-a-food')).toBeNull();
  });
  it('finds a real food by name', () => {
    const banana = matchFood('banana');
    expect(banana).not.toBeNull();
    expect(banana.name).toBe('Banana');
  });

  it('matches whole words, not substrings ("ice" is not "rice")', () => {
    expect(matchFood('ice cream').name).toBe('Ice cream');
    // "ice" alone should not resolve to Rice / Rice cakes via substring
    const ice = matchFood('ice');
    expect(ice === null || ice.name === 'Ice cream').toBe(true);
  });

  it('"protein bar" resolves to Protein bar, not Energy bar', () => {
    expect(matchFood('protein bar').name).toBe('Protein bar');
  });

  it('finds a food embedded in a natural-language query', () => {
    expect(matchFood('is pizza ok before a ride').name).toBe('Pizza');
  });

  it('matches keyword synonyms', () => {
    expect(matchFood('yoghurt').name).toBe('Greek yogurt');
  });
});
