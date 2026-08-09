// Estimate a cycling-suitability score (0-100) + timing + why from a food's macros.
// Used ONLY as a fallback for foods not in the curated FOOD_DB (e.g. scored from
// USDA data). Composition-based (energy ratios) so serving size doesn't distort.
// This scores fuel/recovery suitability from macros — it can't reproduce the
// editorial nuance of the curated list (macros alone can't tell soda from a gel),
// so results are labeled `estimated`.
export function scoreFood(m = {}) {
  const cal = Math.max(0, m.cal ?? 0);
  const carbs = Math.max(0, m.carbs ?? 0);
  const protein = Math.max(0, m.protein ?? 0);
  const fat = Math.max(0, m.fat ?? 0);
  const fiber = Math.max(0, m.fiber ?? 0);
  const alcohol = Math.max(0, m.alcohol ?? 0);

  // Negligible-energy foods (water, leafy greens) — hydration/neutral, not fuel.
  if (cal < 15 && carbs < 3 && protein < 2 && fat < 2) {
    return { score: 55, when: 'pre,post', why: 'Very light — fine anytime, but not real fuel.', estimated: true };
  }

  const carbCal = carbs * 4, proCal = protein * 4, fatCal = fat * 9, alcCal = alcohol * 7;
  const total = Math.max(cal, carbCal + proCal + fatCal + alcCal, 1);
  const carbPct = carbCal / total, proPct = proCal / total, fatPct = fatCal / total, alcPct = alcCal / total;
  const fiberRatio = fiber / Math.max(carbs, 1);

  let score = 50;
  score += Math.min(28, carbPct * 40);       // carbs = the primary fuel
  score += Math.min(16, proPct * 34);         // protein = recovery value
  score += Math.min(10, fiberRatio * 30);     // whole-food bonus
  score -= Math.max(0, fatPct - 0.35) * 55;   // high fat = heavy / slow to digest
  score -= alcPct * 120;                       // alcohol = avoid
  // Energy density matters for FUEL: nutrient-dense-but-low-calorie foods
  // (leafy greens, etc.) are healthy but aren't real ride fuel — soft-cap them.
  if (cal < 55) score = Math.min(score, 72);
  score = Math.round(Math.max(5, Math.min(98, score)));

  // Timing. "avoid" only for alcohol or high-fat-and-not-nutritious (fried junk);
  // nutritious fatty foods (nuts, avocado) are snacks, not "avoid".
  const junkyFat = fatPct > 0.5 && fiberRatio < 0.1 && proPct < 0.2;
  let when;
  if (alcPct > 0.08 || junkyFat) when = 'avoid';
  else if (fatPct > 0.5) when = proPct >= 0.2 ? 'post' : 'pre,post';
  else if (proPct >= 0.25 && carbPct < 0.55) when = 'post';
  else if (carbPct >= 0.6 && fatPct < 0.15) when = proPct >= 0.15 ? 'pre,during,post' : 'pre,during';
  else if (proPct >= 0.2) when = 'pre,post';
  else if (carbPct >= 0.4) when = 'pre';
  else when = 'post';

  let why;
  if (alcPct > 0.08) why = 'Contains alcohol — skip before or during a ride.';
  else if (junkyFat) why = 'Heavy and greasy — slow to digest, not ride fuel.';
  else if (fatPct > 0.5) why = 'Fat-heavy — better as a snack or meal than ride fuel.';
  else if (proPct >= 0.25 && carbPct < 0.55) why = 'Protein-rich — good for post-ride recovery.';
  else if (carbPct >= 0.6 && fatPct < 0.15) why = fiberRatio < 0.05 ? 'Fast carbs — handy mid-ride, but light on nutrition.' : 'Carb-rich and easy to digest — solid ride fuel.';
  else why = 'Balanced — reasonable before or after a ride.';

  return { score, when, why, estimated: true };
}
