// Cycling ride-advice helpers (pure).
import { windDir } from './units.js';

// Wind is stored meteorologically: wind_direction_10m = the direction the wind blows FROM.
// Best strategy is to ride OUT into the headwind so the return leg is a tailwind — i.e. head
// toward the direction the wind is coming from.
export function windStrategy(windMph, windFromDeg) {
  if (windMph == null || windMph < 8) {
    return { level: 'calm', text: 'Light wind — direction won’t matter much', outLabel: null };
  }
  const w = windDir(windFromDeg);
  if (!w) return { level: 'calm', text: 'Light wind — direction won’t matter much', outLabel: null };
  const speed = Math.round(windMph);
  const strong = windMph >= 20;
  const text = strong
    ? `${speed} mph ${w.label} wind — strong. Head out into it (toward the ${w.label}) so the tailwind’s there when you’re tired`
    : `${speed} mph wind from the ${w.label} — head out toward the ${w.label}, finish with the tailwind`;
  return { level: strong ? 'strong' : 'moderate', text, outLabel: w.label };
}

// Latest clock time you can start and still finish before dark (with a safety margin).
// All times are location wall-clock decimal hours (e.g. 17.5 = 5:30 PM).
export function latestSafeStart(durationMins, sunsetHourF, nowHourF, marginMin = 15) {
  if (!durationMins || sunsetHourF == null) return null;
  const latest = sunsetHourF - (durationMins + marginMin) / 60;
  if (nowHourF != null && nowHourF > latest) {
    return { feasible: false, latestStartHourF: latest, text: 'Not enough daylight left for this ride — shorten it or bring lights' };
  }
  return { feasible: true, latestStartHourF: latest, text: `Latest start ${fmtHour(latest)} to finish before dark` };
}

// decimal hour -> "5:10 PM"
export function fmtHour(hourF) {
  let h = Math.floor(hourF);
  let m = Math.round((hourF - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}
