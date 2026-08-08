// Fueling + recovery-nutrition plans (pure).
import { estimateDuration, elevationCalorieMult, elevationHydrationMult } from './duration.js';

export function buildFuelingPlan(current, distanceMi, rideType, weightKg, intensity, bikeType, elevationM = 0) {
  if (!distanceMi) return null;

  const fl      = current.apparent_temperature;
  const humid   = current.relative_humidity_2m;
  const isHot   = fl > 82;
  const isWarm  = fl > 68;
  const isCold  = fl < 45;
  const durationMins = estimateDuration(distanceMi, rideType, elevationM);
  const hrs     = durationMins / 60;
  const intensityMult = intensity === 'easy' ? 0.75 : intensity === 'hard' ? 1.3 : 1.0;

  // Sweat rate ml/hr
  const sweatRate = Math.round((isHot ? 1050 : isWarm ? 800 : humid > 75 ? 700 : 500) * (weightKg / 70) * intensityMult * elevationHydrationMult(elevationM));
  const totalSweatMl = Math.round(sweatRate * hrs);

  // Water needs: replace 80% of sweat loss (can\u0027t fully replace during effort)
  const waterMl = Math.round(totalSweatMl * 0.8);
  const waterOz = Math.round(waterMl * 0.0338);
  const bottles = Math.ceil(waterMl / 500); // 500ml per bottle

  // Carb needs during ride: 30-90g/hr depending on intensity + duration
  const ebikeAdjFuel = bikeType === 'ebike' ? 0.55 : 1.0;
  const baseCarbs = rideType === 'mtb' ? 60 : rideType === 'gravel' ? 55 : 60;
  const carbsPerHr = hrs < 1 ? 0 : Math.round(baseCarbs * intensityMult * ebikeAdjFuel);
  const totalCarbsDuring = hrs < 1 ? 0 : Math.round(carbsPerHr * Math.max(0, hrs - 0.75)); // start fueling at 45min
  const sodiumMg = Math.round(totalSweatMl * 0.9);

  // Build timeline events
  const events = [];

  // Pre-ride
  events.push({
    when: 'Before you start',
    dot: 'water',
    what: distanceMi > 25
      ? '500ml water + carb-rich meal 2–3 hrs before'
      : '250–500ml water',
    why: distanceMi > 25
      ? 'Start fully fueled and hydrated for long efforts'
      : 'Arrive at the start line hydrated',
  });

  // During ride — only if over 45 min
  if (durationMins >= 45) {
    // Hydration checkpoints
    const hydrationInterval = isHot ? 15 : 20; // minutes between sips
    events.push({
      when: `Every ${hydrationInterval} min`,
      dot: 'water',
      what: `${isHot ? '200–250' : '150–200'}ml water (sip, don\u0027t chug)`,
      why: isHot
        ? `Hot conditions — you're sweating ~${sweatRate}ml/hr, stay ahead of it`
        : 'Consistent sipping prevents dehydration without GI upset',
    });

    // Electrolytes
    if (durationMins >= 75 || isHot) {
      events.push({
        when: durationMins >= 90 ? 'Every 45–60 min' : 'After 45 min',
        dot: 'warn',
        what: 'Electrolyte tab or sports drink (one bottle worth)',
        why: `Estimated sodium loss: ~${sodiumMg}mg — plain water alone causes hyponatremia on long rides`,
      });
    }
  }

  // Carb fueling — only for rides over 45 min
  if (durationMins >= 45 && totalCarbsDuring > 0) {
    const gelsNeeded = Math.ceil(totalCarbsDuring / 22); // ~22g per gel
    const barsNeeded = Math.ceil(totalCarbsDuring / 35); // ~35g per bar

    events.push({
      when: `At 40–45 min, then every ${distanceMi > 50 ? '30' : '40'} min`,
      dot: null,
      what: `${gelsNeeded} gel${gelsNeeded > 1 ? 's' : ''} or ${barsNeeded} energy bar${barsNeeded > 1 ? 's' : ''} (${totalCarbsDuring}g carbs total)`,
      why: `Glycogen runs low after ~45 min — fueling before you feel hungry prevents the bonk`,
    });

    if (distanceMi > 60) {
      events.push({
        when: `Every ${distanceMi > 80 ? '60–90' : '90'} min`,
        dot: null,
        what: 'Real food stop: banana, rice cake, PB sandwich, or dates',
        why: 'Gels only become nauseating on very long rides — solid food helps gut comfort',
      });
    }
  }

  // Caffeine
  if (durationMins >= 90) {
    events.push({
      when: `~${Math.round(durationMins * 0.6)} min in (final third)`,
      dot: 'warn',
      what: 'Caffeine gel or espresso shot (50–100mg)',
      why: 'Caffeine boosts performance by 3–5% and delays perceived fatigue — timing it late avoids early burnout',
    });
  }

  return {
    durationMins, distanceMi, waterMl, waterOz, bottles,
    totalCarbsDuring, sodiumMg, isHot, events,
  };
}

export function buildNutritionPlan(current, distanceMi, rideType, weightKg, intensity, bikeType, elevationM = 0) {
  const fl     = current.apparent_temperature;
  const humid  = current.relative_humidity_2m;
  const isHot  = fl > 82;
  const isWarm = fl > 68;
  const isCold = fl < 45;

  const durationMins = distanceMi ? estimateDuration(distanceMi, rideType, elevationM) : 60;
  const hrs = durationMins / 60;
  const metValues = { road:8.0, gravel:7.5, mtb:8.5, commute:5.5 };
  const intensityMult = intensity === 'easy' ? 0.78 : intensity === 'hard' ? 1.25 : 1.0;
  const met = (metValues[rideType] || 7) * intensityMult;
  const ebikeAdj = bikeType === 'ebike' ? 0.55 : 1.0; // assisted effort burns/uses ~half

  const caloriesBurned = Math.round(met * weightKg * hrs * elevationCalorieMult(elevationM) * ebikeAdj);
  // Scale sweat by rider weight and intensity to match buildFuelingPlan (was fixed at ~70kg/moderate)
  const sweatRatePerHour = Math.round((isHot ? 1050 : isWarm ? 750 : humid > 75 ? 700 : 500) * (weightKg / 70) * intensityMult * elevationHydrationMult(elevationM));
  const sweatLossMl = Math.round(sweatRatePerHour * hrs);
  const fluidOz = Math.round(sweatLossMl * 0.0338);
  const carbsG = Math.round((caloriesBurned * 0.55) / 4);
  const proteinG = durationMins < 60 ? 20 : durationMins < 120 ? 30 : durationMins < 180 ? 35 : 40;
  const sodiumMg = Math.round(sweatLossMl * 0.9);

  const immediate = [];
  const meal = [];

  // Immediate window — within 30 min
  if (durationMins < 60) {
    immediate.push({ icon:'🍌', name:'Banana',preTiming:'30-60 min before', detail:'Quick carbs to start glycogen rebuild' });
    immediate.push({ icon:'🥛', name:'Chocolate milk (250ml)', detail:`~${Math.round(proteinG*0.8)}g protein + carbs in one drink` });
  } else if (durationMins < 120) {
    immediate.push({ icon:'🍫', name:'Chocolate milk or whey shake', detail:`Hit ${proteinG}g protein within 30 mins for muscle repair` });
    immediate.push({ icon:'🍌', name:'Banana or 2–3 medjool dates', detail:`~${Math.round(carbsG * 0.35)}g fast carbs to start recovery` });
    if (isHot || sodiumMg > 800) immediate.push({ icon:'🧂', name:'Electrolyte drink (500ml)', detail:`Lost ~${sodiumMg}mg sodium — don\u0027t just drink plain water` });
  } else {
    immediate.push({ icon:'🍫', name:`Recovery shake (${proteinG}g protein)`, detail:'Protein synthesis window is open — hit it within 30 mins' });
    immediate.push({ icon:'🍚', name:'Rice cakes or banana + honey', detail:`${Math.round(carbsG * 0.4)}g fast carbs — depleted muscles absorb them quickly` });
    immediate.push({ icon:'🧂', name:'Electrolyte drink (500–750ml)', detail:`Sweated ~${sweatLossMl}ml — sodium helps retain the fluid you're drinking` });
  }

  // Meal 1–2 hours after
  if (rideType === 'mtb' || rideType === 'gravel') {
    meal.push({ icon:'🍗', name:`${rideType === 'mtb' ? 'Chicken' : 'Salmon'} + rice or roast veg`, detail:`${proteinG}g protein + ${Math.round(carbsG * 0.65)}g carbs — full recovery meal` });
    meal.push({ icon:'🫐', name:'Berries or tart cherry juice', detail:'Anti-inflammatory — reduces next-day muscle soreness' });
  } else if (rideType === 'commute') {
    meal.push({ icon:'🥚', name:'Eggs + whole grain toast or grain bowl', detail:'Practical, filling, and hits both protein and carb targets' });
  } else {
    meal.push({ icon:'🍽️', name:'Pasta, rice or potato with lean protein', detail:`${Math.round(carbsG * 0.65)}g carbs + ${proteinG}g protein — the classic recovery meal` });
    meal.push({ icon:'🥦', name:'Vegetables + olive oil or avocado', detail:'Micronutrients and healthy fats support muscle repair' });
  }

  if (isCold) meal.push({ icon:'🍲', name:'Warm soup or stew', detail:'Cold rides raise calorie burn — warm food also helps core temp recovery' });
  if (isHot)  meal.push({ icon:'🍉', name:'Watermelon, cucumber or coconut water', detail:'High water content + natural electrolytes speed rehydration' });
  if (caloriesBurned > 800) meal.push({ icon:'🌙', name:'Pre-sleep protein snack (20g)', detail:`Big ride = elevated muscle protein synthesis for 24–36 hrs — a casein snack before bed helps` });

  return { caloriesBurned, sweatLossMl, fluidOz, carbsG, proteinG, sodiumMg, durationMins, isHot, isWarm, isCold, immediate, meal };
}
