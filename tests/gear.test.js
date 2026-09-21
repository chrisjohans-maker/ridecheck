import { describe, it, expect } from 'vitest';
import { buildGearList, buildIndoorGearList } from '../src/lib/gear.js';

const emptyHourly = { time: [], precipitation_probability: [], apparent_temperature: [] };
const names = (gear) => gear.map(g => g.name);
const cats  = (gear) => gear.map(g => g.cat);

describe('buildGearList — clothing by temperature', () => {
  it('recommends thermal layers when freezing', () => {
    const current = { apparent_temperature: 20, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };
    const gear = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    expect(names(gear)).toContain('Thermal bib tights + long sleeve base layer');
  });

  it('recommends lightweight kit when warm', () => {
    const current = { apparent_temperature: 80, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };
    const gear = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    expect(names(gear)).toContain('Bib shorts + lightweight jersey');
  });

  // Regression: intensity must shift the *effective* temperature bracket, not
  // just annotate the reason text — hard effort at 50°F should dress like ~58°F.
  it('shifts the clothing bracket warmer for hard effort', () => {
    const current = { apparent_temperature: 50, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };
    const moderate = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    const hard = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'hard', 'F');
    expect(names(moderate)).toContain('Bib shorts + thermal jersey');
    expect(names(hard)).toContain('Bib shorts + short sleeve jersey');
  });

  it('formats reasons in the requested temp unit', () => {
    const current = { apparent_temperature: 32, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };
    const fahrenheit = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    const celsius = buildGearList(current, emptyHourly, 'road', 'medium', 'road', 'moderate', 'C');
    const base = fahrenheit.find(g => g.name.includes('Bib tights') || g.name.includes('Thermal'));
    const baseC = celsius.find(g => g.name.includes('Bib tights') || g.name.includes('Thermal'));
    expect(base.reason).toContain('°F');
    expect(baseC.reason).toContain('°C');
  });
});

describe('buildGearList — weather hazards', () => {
  const rainy = { apparent_temperature: 60, wind_speed_10m: 5, uv_index: 1, weather_code: 61 };

  it('adds a waterproof jacket when currently raining', () => {
    const gear = buildGearList(rainy, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    expect(names(gear)).toContain('Waterproof cycling jacket');
    expect(names(gear)).toContain('Shoe covers / overshoes');
  });

  it('gives road-specific tyre advice in the rain, gravel-specific otherwise', () => {
    const road = buildGearList(rainy, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    const gravel = buildGearList(rainy, emptyHourly, 'gravel', 'medium', 'gravel', 'moderate', 'F');
    expect(names(road)).toContain('Drop tyre pressure 5–10 psi');
    expect(names(gravel)).toContain('Mudguards / fenders if fitted');
  });

  it('recommends MTB-specific shoe covers over generic overshoes', () => {
    const gear = buildGearList(rainy, emptyHourly, 'mtb', 'medium', 'mtb', 'moderate', 'F');
    expect(names(gear)).toContain('Waterproof MTB shoe covers');
  });

  it('adds sun protection at high UV', () => {
    const sunny = { apparent_temperature: 75, wind_speed_10m: 5, uv_index: 8, weather_code: 0 };
    const gear = buildGearList(sunny, emptyHourly, 'road', 'medium', 'road', 'moderate', 'F');
    expect(names(gear)).toContain('Sunglasses + SPF 50 sunscreen');
  });

  it('always includes a helmet', () => {
    const current = { apparent_temperature: 65, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };
    const gear = buildGearList(current, emptyHourly, 'road', 'short', 'road', 'moderate', 'F');
    expect(names(gear)).toContain('Helmet');
  });
});

describe('buildGearList — ride-type extras', () => {
  const mild = { apparent_temperature: 65, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };

  it('adds MTB protection and repair kit', () => {
    const gear = buildGearList(mild, emptyHourly, 'mtb', 'medium', 'mtb', 'moderate', 'F');
    expect(names(gear)).toContain('Knee & elbow pads');
    expect(names(gear)).toContain('Tube, tyre levers, mini pump');
  });

  it('adds a commute pannier', () => {
    const gear = buildGearList(mild, emptyHourly, 'commute', 'medium', 'commuter', 'moderate', 'F');
    expect(names(gear)).toContain('Pannier or dry bag');
  });

  it('adds a road saddle bag for non-short rides only', () => {
    const long = buildGearList(mild, emptyHourly, 'road', 'long', 'road', 'moderate', 'F');
    const short = buildGearList(mild, emptyHourly, 'road', 'short', 'road', 'moderate', 'F');
    expect(names(long)).toContain('Saddle bag: tube, CO₂, tyre levers');
    expect(names(short)).not.toContain('Saddle bag: tube, CO₂, tyre levers');
  });

  it('adds a hydration vest for long off-road rides', () => {
    const gear = buildGearList(mild, emptyHourly, 'gravel', 'long', 'gravel', 'moderate', 'F');
    expect(names(gear)).toContain('Hydration vest or pack');
  });
});

describe('buildGearList — stationary routes to the indoor list', () => {
  const mild = { apparent_temperature: 65, wind_speed_10m: 5, uv_index: 1, weather_code: 0 };

  it('routes on rideType === stationary', () => {
    const gear = buildGearList(mild, emptyHourly, 'stationary', 'medium', 'road', 'moderate', 'F');
    expect(cats(gear)).toContain('Indoor setup');
    expect(cats(gear)).not.toContain('Rain gear');
    expect(names(gear)).not.toContain('Helmet');
  });

  it('routes on bikeType === stationary even if rideType differs', () => {
    const gear = buildGearList(mild, emptyHourly, 'road', 'medium', 'stationary', 'moderate', 'F');
    expect(cats(gear)).toContain('Indoor setup');
  });
});

describe('buildIndoorGearList', () => {
  it('always recommends a fan and electrolytes', () => {
    const gear = buildIndoorGearList('medium');
    expect(names(gear)).toContain('High-volume fan (or two)');
    expect(gear.some(g => g.name.toLowerCase().includes('electrolyte'))).toBe(true);
  });

  it('scales fueling by duration bucket', () => {
    const short = buildIndoorGearList('short');
    const long = buildIndoorGearList('long');
    expect(names(short)).not.toContain('Gels/bars + real food within reach');
    expect(names(long)).toContain('Gels/bars + real food within reach');
  });
});
