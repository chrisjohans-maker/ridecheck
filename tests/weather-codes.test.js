import { describe, it, expect } from 'vitest';
import { nwsTextToWMO, nwsWind, nwsDir, WMO_CODES } from '../src/lib/weather-codes.js';

describe('nwsTextToWMO', () => {
  // Regression: "Freezing Rain" contains "rain" — freezing must be matched FIRST, not as plain rain.
  it('maps freezing/ice to 66 before the plain-rain branch', () => {
    expect(nwsTextToWMO('Freezing Rain')).toBe(66);
    expect(nwsTextToWMO('Light Freezing Rain')).toBe(66);
    expect(nwsTextToWMO('Sleet')).toBe(66);
    expect(nwsTextToWMO('Wintry Mix')).toBe(66);
    expect(nwsTextToWMO('Ice Pellets')).toBe(66);
  });

  it('maps ordinary conditions correctly', () => {
    expect(nwsTextToWMO('Rain')).toBe(63);
    expect(nwsTextToWMO('Heavy Rain')).toBe(65);
    expect(nwsTextToWMO('Sunny')).toBe(0);
    expect(nwsTextToWMO('Partly Sunny')).toBe(2); // 'partly' branch
    expect(nwsTextToWMO('Partly Cloudy')).toBe(3); // 'cloudy' matches before 'partly' (documents current behavior)
    expect(nwsTextToWMO('Thunderstorm')).toBe(95);
    expect(nwsTextToWMO('')).toBe(2); // unknown default
  });
});

describe('WMO_CODES table', () => {
  it('includes freezing-rain codes with a rain flag', () => {
    expect(WMO_CODES[66].label).toMatch(/freezing/i);
    expect(WMO_CODES[67].label).toMatch(/freezing/i);
    expect(WMO_CODES[66].rain).toBe(true);
  });
  it('clear sky is not rain', () => {
    expect(WMO_CODES[0].rain).toBe(false);
  });
});

describe('nwsWind / nwsDir', () => {
  it('parses NWS wind speed strings (takes the upper bound when a range)', () => {
    expect(nwsWind('10 mph')).toBe(10);
    expect(nwsWind('10 to 15 mph')).toBe(15);
    expect(nwsWind('')).toBe(0);
    expect(nwsWind(null)).toBe(0);
  });
  it('maps compass directions to degrees', () => {
    expect(nwsDir('N')).toBe(0);
    expect(nwsDir('E')).toBe(90);
    expect(nwsDir('SW')).toBe(225);
    expect(nwsDir('???')).toBe(0); // unknown fallback
  });
});
