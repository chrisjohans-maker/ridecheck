// Next-hour precipitation nowcast (pure).
// Input: Open-Meteo minutely_15 = { time: [naive-local ISO strings], precipitation: [mm per 15-min] }.
// `nowMs` is the location's current wall-clock time in ms (from locationNow().wall.getTime()),
// which is in the same frame as new Date(naiveLocalString). Deterministic — no Date.now() inside.

const roundTo5 = m => Math.max(0, Math.round(m / 5) * 5);

export function summarizeNowcast(minutely15, nowMs, { windowMin = 120, threshold = 0.1 } = {}) {
  const times = minutely15?.time;
  const precip = minutely15?.precipitation;
  if (!Array.isArray(times) || !Array.isArray(precip) || times.length === 0) {
    return { hasData: false, series: [], peakMm: 0, state: 'dry', minutesUntilChange: null, text: '' };
  }

  // Buckets from the one covering "now" forward, within the window.
  const series = [];
  for (let i = 0; i < times.length; i++) {
    const start = new Date(times[i]).getTime();
    const minsFromNow = Math.round((start - nowMs) / 60000);
    if (minsFromNow < -15) continue;        // fully in the past
    if (minsFromNow > windowMin) break;     // beyond the window
    series.push({ minsFromNow: Math.max(0, minsFromNow), mm: Math.max(0, precip[i] ?? 0) });
  }

  if (series.length === 0) {
    return { hasData: false, series: [], peakMm: 0, state: 'dry', minutesUntilChange: null, text: '' };
  }

  const peakMm = series.reduce((m, b) => Math.max(m, b.mm), 0);
  const rainingNow = series[0].mm >= threshold;

  // First bucket whose wet/dry state differs from now.
  let changeIdx = -1;
  for (let i = 1; i < series.length; i++) {
    if ((series[i].mm >= threshold) !== rainingNow) { changeIdx = i; break; }
  }
  const minutesUntilChange = changeIdx >= 0 ? roundTo5(series[changeIdx].minsFromNow) : null;

  let state, text;
  if (!rainingNow && changeIdx < 0) {
    state = 'dry';
    text = 'No rain in the next hour';
  } else if (!rainingNow) {
    state = 'starting';
    text = `Rain starting in ~${minutesUntilChange} min`;
  } else if (changeIdx >= 0) {
    state = 'stopping';
    text = minutesUntilChange === 0 ? 'Rain clearing now' : `Clearing in ~${minutesUntilChange} min`;
  } else {
    state = 'ongoing';
    text = 'Rain continuing for the next hour';
  }

  return { hasData: true, series, peakMm, state, minutesUntilChange, text };
}
