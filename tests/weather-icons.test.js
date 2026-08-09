import { describe, it, expect } from 'vitest';
import { weatherType, weatherSvg, uiIcon } from '../src/lib/weather-icons.js';

describe('weatherType (WMO code → icon type)', () => {
  it('maps codes to the right icon family', () => {
    expect(weatherType(0)).toBe('sun');
    expect(weatherType(1)).toBe('sun');
    expect(weatherType(2)).toBe('partly');
    expect(weatherType(3)).toBe('cloud');
    expect(weatherType(45)).toBe('fog');
    expect(weatherType(63)).toBe('rain');
    expect(weatherType(80)).toBe('rain');
    expect(weatherType(71)).toBe('snow');
    expect(weatherType(66)).toBe('snow');   // freezing → snow glyph
    expect(weatherType(95)).toBe('thunder');
    expect(weatherType(999)).toBe('sun');    // unknown fallback
  });
});

describe('weatherSvg / uiIcon', () => {
  it('return inline SVG at the requested size', () => {
    const s = weatherSvg(63, 24);
    expect(s).toMatch(/^<svg/);
    expect(s).toContain('width="24"');
    expect(s).toContain('currentColor');
  });
  it('uiIcon returns a known icon or empty string', () => {
    expect(uiIcon('thermometer', 20)).toMatch(/^<svg/);
    expect(uiIcon('droplet')).toMatch(/^<svg/);
    expect(uiIcon('nope')).toBe('');
  });
  it('is decorative (aria-hidden) without a label, announced (role=img) with one', () => {
    expect(weatherSvg(63, 20)).toContain('aria-hidden="true"');
    const labeled = weatherSvg(63, 20, 'Rain');
    expect(labeled).toContain('role="img"');
    expect(labeled).toContain('aria-label="Rain"');
    expect(labeled).not.toContain('aria-hidden');
  });
});
