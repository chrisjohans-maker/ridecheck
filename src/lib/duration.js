// Duration + elevation multipliers (pure; take elevationM explicitly).
export function estimateDuration(distanceMi, rideType, elevationM = 0) {
  if (!distanceMi) return null;
  // avg speeds mph: road 16, gravel 13, mtb 10, commute 12
  // Reduce speed at high elevation (>1500m): thinner air, likely hillier terrain
  const speeds = { road:16, gravel:13, mtb:10, commute:12 };
  let speed = speeds[rideType] || 14;
  const elev = elevationM || 0;
  if (elev > 2500) speed *= 0.8;
  else if (elev > 1500) speed *= 0.9;
  return Math.round((distanceMi / speed) * 60);
}

// Elevation calorie multiplier — climbing burns significantly more
export function elevationCalorieMult(elevationM = 0) {
  const elev = elevationM || 0;
  // High altitude = more effort + thinner air = ~10-20% more calorie burn
  if (elev > 2500) return 1.2;
  if (elev > 1500) return 1.12;
  if (elev > 800)  return 1.06;
  return 1.0;
}

// Elevation hydration multiplier — altitude dehydrates faster (drier air, higher respiration)
export function elevationHydrationMult(elevationM = 0) {
  const elev = elevationM || 0;
  if (elev > 2500) return 1.25;
  if (elev > 1500) return 1.15;
  if (elev > 800)  return 1.08;
  return 1.0;
}

// Determine duration bucket for gear/nutrition logic
export function getDurationBucket(durationMins) {
  if (!durationMins || durationMins < 60) return 'short';
  if (durationMins <= 180) return 'medium';
  return 'long';
}
