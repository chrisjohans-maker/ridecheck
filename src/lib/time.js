// Current wall-clock time at the searched location, from Open-Meteo's utc_offset_seconds.
// Pure — offset and `now` passed explicitly. Falls back to local fields when offset is unknown.
export function locationNow(offsetSeconds, now = new Date()) {
  let y, mo, d, h, mi;
  if (typeof offsetSeconds === 'number') {
    const s = new Date(now.getTime() + offsetSeconds * 1000); // this Date's UTC fields == location wall clock
    y = s.getUTCFullYear(); mo = s.getUTCMonth(); d = s.getUTCDate(); h = s.getUTCHours(); mi = s.getUTCMinutes();
  } else {
    y = now.getFullYear(); mo = now.getMonth(); d = now.getDate(); h = now.getHours(); mi = now.getMinutes();
  }
  const pad = n => String(n).padStart(2, '0');
  return {
    date: y + '-' + pad(mo + 1) + '-' + pad(d), // "2026-08-08" in location time
    hour: h,
    hourF: h + mi / 60,
    wall: new Date(y, mo, d, h, mi), // local Date, comparable to new Date(naiveForecastString)
  };
}
