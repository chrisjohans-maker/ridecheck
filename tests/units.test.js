import { describe, it, expect } from 'vitest';
import { toDisplay, toWindDisplay, unitLabel, windDir } from '../src/lib/units.js';

describe('toDisplay (temperature)', () => {
  it('converts F to C', () => {
    expect(toDisplay(32, 'C')).toBe(0);
    expect(toDisplay(212, 'C')).toBe(100);
    expect(toDisplay(50, 'C')).toBe(10);
  });
  it('leaves F as rounded F', () => {
    expect(toDisplay(70.4, 'F')).toBe(70);
  });
});

describe('toWindDisplay', () => {
  it('mph for F, km/h for C', () => {
    expect(toWindDisplay(10, 'F')).toBe('10 mph');
    expect(toWindDisplay(10, 'C')).toBe('16 km/h'); // round(10 * 1.60934)
  });
});

describe('unitLabel', () => {
  it('returns the degree label', () => {
    expect(unitLabel('C')).toBe('°C');
    expect(unitLabel('F')).toBe('°F');
  });
});

describe('windDir', () => {
  it('buckets degrees to 8-point compass and wraps', () => {
    expect(windDir(0)).toEqual({ label: 'N', deg: 0 });
    expect(windDir(90)).toEqual({ label: 'E', deg: 90 });
    expect(windDir(350)).toEqual({ label: 'N', deg: 350 }); // wraps via %8
  });
  it('returns null when direction missing', () => {
    expect(windDir(null)).toBeNull();
    expect(windDir(undefined)).toBeNull();
  });
});
