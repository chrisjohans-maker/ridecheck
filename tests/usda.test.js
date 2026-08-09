import { describe, it, expect } from 'vitest';
import { pickBest, extractMacros } from '../netlify/functions/usda.js';

describe('pickBest', () => {
  const foods = [
    { description: 'Avocado dressing', dataType: 'Survey (FNDDS)' },
    { description: 'Avocados, raw, all commercial varieties', dataType: 'SR Legacy' },
    { description: 'Guacamole', dataType: 'Survey (FNDDS)' },
  ];
  it('prefers the clean generic whole-food over composite items', () => {
    expect(pickBest(foods, 'avocado').description).toMatch(/Avocados, raw/);
  });
  it('exact match wins outright', () => {
    const r = pickBest([{ description: 'Pizza, cheese', dataType: 'SR Legacy' }, { description: 'Pizza', dataType: 'Survey (FNDDS)' }], 'pizza');
    expect(r.description).toBe('Pizza');
  });
  it('returns null for no foods', () => {
    expect(pickBest([], 'x')).toBeNull();
    expect(pickBest(undefined, 'x')).toBeNull();
  });
});

describe('extractMacros', () => {
  it('maps USDA nutrient numbers to macro fields', () => {
    const food = { foodNutrients: [
      { nutrientNumber: '208', value: 89 },   // energy
      { nutrientNumber: '205', value: 23 },   // carbs
      { nutrientNumber: '203', value: 1.1 },  // protein
      { nutrientNumber: '204', value: 0.3 },  // fat
      { nutrientNumber: '291', value: 2.6 },  // fiber
      { nutrientNumber: '999', value: 5 },    // ignored
    ] };
    expect(extractMacros(food)).toEqual({ cal: 89, carbs: 23, protein: 1.1, fat: 0.3, fiber: 2.6 });
  });
  it('handles the nested nutrient.number shape and missing values', () => {
    const food = { foodNutrients: [
      { nutrient: { number: '203' }, value: 31 },
      { nutrient: { number: '208' } }, // no value -> skipped
    ] };
    expect(extractMacros(food)).toEqual({ protein: 31 });
  });
  it('handles missing foodNutrients', () => {
    expect(extractMacros({})).toEqual({});
    expect(extractMacros(null)).toEqual({});
  });
});
