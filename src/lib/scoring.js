// Shared weather-penalty brackets used by the best-window and week-forecast scorers.
// Returns the NET delta applied to a base score of 100 (negative for penalties,
// +2 for clear sky). calcConfidence intentionally keeps its own inline copy because
// it also builds the human-readable `factors` list and feeds a wind-chill-adjusted
// temperature — extracting those would risk changing that UI. This function must
// stay byte-equivalent to those brackets; the golden tests lock that.
export function weatherPenalty({ fl = 65, humid = 50, wind = 0, code = 0, pop = 0, uv = 0 } = {}) {
  let d = 0;

  // Temperature (feels-like)
  if (fl >= 62 && fl <= 72) {}
  else if (fl > 72 && fl <= 78) d -= 3;
  else if (fl >= 55 && fl < 62) d -= 3;
  else if (fl > 78 && fl <= 85) d -= 8;
  else if (fl >= 45 && fl < 55) d -= 8;
  else if (fl > 85 && fl <= 90) d -= 20;
  else if (fl >= 32 && fl < 45) d -= 20;
  else if (fl > 90 && fl <= 95) d -= 32;
  else if (fl > 95) d -= 45;
  else if (fl < 32) d -= 40;

  // Humidity (standalone)
  if (humid > 85) d -= 12;
  else if (humid > 75) d -= 8;
  else if (humid > 65) d -= 5;
  else if (humid > 50) d -= 2;

  // Humidity x heat
  if (fl > 90 && humid > 50) d -= 15;
  else if (fl > 85 && humid > 60) d -= 10;
  else if (fl > 80 && humid > 70) d -= 8;

  // Wind
  if (wind < 8) {}
  else if (wind < 12) d -= 3;
  else if (wind < 16) d -= 8;
  else if (wind < 20) d -= 15;
  else if (wind < 25) d -= 25;
  else d -= 40;

  // Precipitation
  if ([95,96,99].includes(code)) d -= 50;
  else if ([56,57,66,67].includes(code)) d -= 50; // freezing rain/ice — dangerous
  else if ([65,82].includes(code)) d -= 35;
  else if ([63,81].includes(code)) d -= 25;
  else if ([55].includes(code)) d -= 18;
  else if ([51,53,61,80].includes(code)) d -= 12;
  else if ([71,73,75].includes(code)) d -= 45;
  else if ([45,48].includes(code)) d -= 12;

  // Rain probability (only when not already precipitating)
  if (![51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99,71,73,75].includes(code)) {
    if (pop > 70) d -= 22;
    else if (pop > 50) d -= 15;
    else if (pop > 30) d -= 8;
    else if (pop > 10) d -= 3;
  }

  // Sky
  if (code === 0) d += 2;
  else if (code === 3) d -= 3;

  // UV
  if (uv >= 8) d -= 8;
  else if (uv >= 6) d -= 3;

  return d;
}
