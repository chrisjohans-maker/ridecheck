// Unit conversion + formatting (pure — tempUnit passed explicitly).

// Temperature: °F stored internally; display in F or C.
export function toDisplay(tempF, tempUnit) {
  if (tempUnit === 'C') return Math.round((tempF - 32) * 5 / 9);
  return Math.round(tempF);
}

export function unitLabel(tempUnit) { return `°${tempUnit}`; }

// Wind speed: mph when °F, km/h when °C.
export function toWindDisplay(mph, tempUnit) {
  if (tempUnit === 'C') return `${Math.round(mph * 1.60934)} km/h`;
  return `${Math.round(mph)} mph`;
}

// Wind direction degrees → compass label + degrees (for arrow rotation).
export function windDir(deg) {
  if (deg == null) return null;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const label = dirs[Math.round(deg / 45) % 8];
  return { label, deg };
}
