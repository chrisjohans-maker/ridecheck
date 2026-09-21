// Merge NWS hourly onto Open-Meteo hourly by matching the location-local time
// string. Both series use naive location-local timestamps ("YYYY-MM-DDTHH:00:00"),
// so we key on the shared hour.
//
// Why not a plain {...om, ...nws} spread: NWS hourly starts at the CURRENT hour,
// so a spread (a) drops today's earlier hours — tapping "Today" then showed a
// partial day — and (b) leaves uv_index on OM's midnight-based axis, misaligned
// with every NWS array. Here OM's axis is kept (full day from midnight, and it
// carries uv_index, which NWS lacks); NWS values overwrite OM where they overlap
// because NWS is more accurate for US locations. The result stays index-aligned
// across every array, so callers can read hourly.X[i] alongside hourly.time[i].

// apparent_temperature is deliberately excluded: fetchNWSForecast() has no real
// feels-like from NWS, so it fills that field with a copy of temperature_2m.
// Overlaying it here would clobber Open-Meteo's real wind/humidity-adjusted
// feels-like with plain air temp. Keep Open-Meteo's apparent_temperature.
const OVERLAY = [
  'temperature_2m', 'weather_code',
  'precipitation_probability', 'wind_speed_10m', 'wind_direction_10m',
  'relative_humidity_2m',
];

export function mergeHourlyNWS(om, nws) {
  if (!om?.time?.length) return nws;
  if (!nws?.time?.length) return om;
  const nwsIdx = new Map(nws.time.map((t, i) => [t, i]));
  const out = {};
  for (const k of Object.keys(om)) out[k] = Array.isArray(om[k]) ? om[k].slice() : om[k];
  om.time.forEach((t, i) => {
    const j = nwsIdx.get(t);
    if (j == null) return;
    for (const k of OVERLAY) {
      if (nws[k]?.[j] != null) {
        if (!Array.isArray(out[k])) out[k] = om.time.map(() => null);
        out[k][i] = nws[k][j];
      }
    }
  });
  return out;
}
