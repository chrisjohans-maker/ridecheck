import { describe, it, expect } from 'vitest';
import { estimateDuration, getDurationBucket, elevationCalorieMult, elevationHydrationMult } from '../src/lib/duration.js';

describe('estimateDuration', () => {
  it('uses per-ride-type average speeds', () => {
    expect(estimateDuration(40, 'road', 0)).toBe(150); // 40mi / 16mph * 60
    expect(estimateDuration(null, 'road', 0)).toBeNull();
  });
  it('slows down at high elevation', () => {
    expect(estimateDuration(40, 'road', 3000)).toBeGreaterThan(estimateDuration(40, 'road', 0));
  });
});

describe('getDurationBucket', () => {
  it('buckets by minutes', () => {
    expect(getDurationBucket(30)).toBe('short');
    expect(getDurationBucket(120)).toBe('medium');
    expect(getDurationBucket(200)).toBe('long');
    expect(getDurationBucket(null)).toBe('short');
  });
});

describe('elevation multipliers', () => {
  it('increase with altitude and default to 1.0 at sea level', () => {
    expect(elevationCalorieMult(0)).toBe(1.0);
    expect(elevationCalorieMult(3000)).toBeGreaterThan(1.0);
    expect(elevationHydrationMult(0)).toBe(1.0);
    expect(elevationHydrationMult(3000)).toBeGreaterThan(elevationHydrationMult(0));
  });
});
