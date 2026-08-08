import { describe, it, expect } from 'vitest';
import { buildNutritionPlan, buildFuelingPlan } from '../src/lib/fueling.js';

const current = { apparent_temperature: 75, relative_humidity_2m: 50 };
// (current, distanceMi, rideType, weightKg, intensity, bikeType, elevationM)
const plan = (w, intensity, bike) => buildNutritionPlan(current, 40, 'road', w, intensity, bike, 0);

describe('buildNutritionPlan — recovery hydration', () => {
  // Regression: recovery sweat/fluid ignored weight and intensity (fixed at ~70kg/moderate),
  // contradicting the fueling panel. It must now scale with both.
  it('scales sweat loss with rider weight', () => {
    const light = plan(55, 'moderate', 'road');
    const heavy = plan(100, 'moderate', 'road');
    expect(heavy.sweatLossMl).toBeGreaterThan(light.sweatLossMl);
    expect(heavy.fluidOz).toBeGreaterThan(light.fluidOz);
    // ratio tracks weight ratio (100/55)
    expect(heavy.sweatLossMl / light.sweatLossMl).toBeCloseTo(100 / 55, 1);
  });

  it('scales sweat loss with intensity', () => {
    const easy = plan(70, 'easy', 'road');
    const hard = plan(70, 'hard', 'road');
    expect(hard.sweatLossMl).toBeGreaterThan(easy.sweatLossMl);
  });

  // Regression: e-bike reduction was applied to fueling but not to recovery nutrition.
  it('applies the e-bike reduction to recovery calories (~55%)', () => {
    const road = plan(70, 'moderate', 'road');
    const ebike = plan(70, 'moderate', 'ebike');
    expect(ebike.caloriesBurned / road.caloriesBurned).toBeCloseTo(0.55, 2);
    expect(ebike.carbsG).toBeLessThan(road.carbsG);
  });
});

describe('buildFuelingPlan', () => {
  it('reduces during-ride carbs for e-bikes', () => {
    const road = buildFuelingPlan(current, 40, 'road', 70, 'moderate', 'road', 0);
    const ebike = buildFuelingPlan(current, 40, 'road', 70, 'moderate', 'ebike', 0);
    expect(ebike.totalCarbsDuring).toBeLessThan(road.totalCarbsDuring);
  });
  it('returns null when no distance', () => {
    expect(buildFuelingPlan(current, 0, 'road', 70, 'moderate', 'road', 0)).toBeNull();
  });
});
