import { describe, it, expect } from 'vitest';
import { mergeHourlyNWS } from '../src/lib/weather-merge.js';

// Open-Meteo: full day from midnight, carries uv_index (NWS has none).
function omDay() {
  return {
    time: ['2026-08-19T05:00:00', '2026-08-19T06:00:00', '2026-08-19T07:00:00', '2026-08-19T08:00:00'],
    temperature_2m: [60, 62, 64, 66],
    apparent_temperature: [59, 61, 63, 65],
    weather_code: [0, 0, 1, 2],
    precipitation_probability: [0, 0, 5, 10],
    wind_speed_10m: [3, 4, 5, 6],
    wind_direction_10m: [180, 185, 190, 200],
    relative_humidity_2m: [70, 68, 65, 60],
    uv_index: [0, 1, 2, 3],
  };
}

// NWS: more accurate, but starts at the CURRENT hour (07:00 here) — no earlier hours.
function nwsFromSeven() {
  return {
    time: ['2026-08-19T07:00:00', '2026-08-19T08:00:00'],
    temperature_2m: [72, 74],
    apparent_temperature: [72, 74],
    weather_code: [3, 3],
    precipitation_probability: [40, 45],
    wind_speed_10m: [15, 18],
    wind_direction_10m: [250, 255],
    relative_humidity_2m: [55, 50],
  };
}

describe('mergeHourlyNWS', () => {
  it('keeps Open-Meteo full-day axis so early hours survive (Today bug)', () => {
    const merged = mergeHourlyNWS(omDay(), nwsFromSeven());
    // All 4 OM hours remain, including the two before NWS begins.
    expect(merged.time).toEqual(omDay().time);
    expect(merged.time.length).toBe(4);
    // 05:00 / 06:00 keep Open-Meteo values (NWS had nothing to say).
    expect(merged.temperature_2m[0]).toBe(60);
    expect(merged.wind_speed_10m[1]).toBe(4);
  });

  it('overlays NWS values where the hour overlaps (NWS is more accurate)', () => {
    const merged = mergeHourlyNWS(omDay(), nwsFromSeven());
    // 07:00 / 08:00 take NWS temp, wind, code, pop.
    expect(merged.temperature_2m[2]).toBe(72);
    expect(merged.temperature_2m[3]).toBe(74);
    expect(merged.wind_speed_10m[2]).toBe(15);
    expect(merged.wind_direction_10m[3]).toBe(255);
    expect(merged.weather_code[2]).toBe(3);
    expect(merged.precipitation_probability[3]).toBe(45);
  });

  it('keeps uv_index index-aligned with time (the silent scoring bug)', () => {
    const merged = mergeHourlyNWS(omDay(), nwsFromSeven());
    // uv_index only exists on OM. It must stay on OM's axis, so uv_index[i]
    // still describes time[i] for every i.
    expect(merged.uv_index).toEqual([0, 1, 2, 3]);
    expect(merged.uv_index.length).toBe(merged.time.length);
    // The 08:00 hour: NWS temp but still OM's uv for that same hour.
    expect(merged.temperature_2m[3]).toBe(74); // from NWS
    expect(merged.uv_index[3]).toBe(3);        // from OM, same index
  });

  it('does not mutate the input arrays', () => {
    const om = omDay();
    mergeHourlyNWS(om, nwsFromSeven());
    expect(om.temperature_2m[2]).toBe(64); // unchanged despite NWS overlay
  });

  it('handles missing/empty series gracefully', () => {
    expect(mergeHourlyNWS(null, nwsFromSeven())).toEqual(nwsFromSeven());
    expect(mergeHourlyNWS(omDay(), null)).toEqual(omDay());
    expect(mergeHourlyNWS(omDay(), { time: [] })).toEqual(omDay());
  });

  it('skips null NWS readings so a gap does not blow away OM data', () => {
    const nws = nwsFromSeven();
    nws.wind_speed_10m[0] = null; // NWS reports no wind for 07:00
    const merged = mergeHourlyNWS(omDay(), nws);
    expect(merged.wind_speed_10m[2]).toBe(5); // falls back to OM's 07:00 value
  });
});
