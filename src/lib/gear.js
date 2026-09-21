// Gear recommendation engine (pure — weather/ride state passed explicitly).
import { WMO_SHORT } from './weather-codes.js';
import { toDisplay, toWindDisplay, unitLabel } from './units.js';

export function buildGearList(current, hourly, rideType, duration, bikeType, intensity, tempUnit) {
  if (rideType === 'stationary' || bikeType === 'stationary') return buildIndoorGearList(duration);

  const gear = [];
  const fl    = current.apparent_temperature ?? current.temperature_2m ?? 65;
  const wind  = current.wind_speed_10m ?? 0;
  const gusts = current.wind_gusts_10m;
  const uv    = current.uv_index ?? 0;
  const wmo   = current.weather_code;

  const isRaining = [51,53,55,61,63,65,80,81,82,95,96,99].includes(wmo);
  const isSnowing = [71,73,75].includes(wmo);
  const isFoggy   = [45,48].includes(wmo);

  // Intensity shifts the effective temperature felt by the body
  // Hard effort generates more heat — dress as if it's warmer
  // Easy effort generates less heat — dress as if it's cooler
  const intensityOffset = intensity === 'hard' ? 8
                        : intensity === 'easy' ? -6
                        : 0;
  const flEff = fl + intensityOffset; // effective feels-like for clothing decisions

  // Look 4 hours ahead from NOW (not from start of array)
  const now4h     = new Date();
  const hourlyTimes = hourly?.time || [];
  const nowIdx    = hourlyTimes.findIndex(t => new Date(t) >= now4h);
  const startIdx  = nowIdx >= 0 ? nowIdx : 0;
  const nextPop   = (hourly?.precipitation_probability || []).slice(startIdx, startIdx + 4);
  const nextFL    = (hourly?.apparent_temperature || hourly?.temperature_2m || []).slice(startIdx, startIdx + 4);
  const maxPop4h  = Math.max(...nextPop, 0);
  const minFL4h   = nextFL.length ? Math.min(...nextFL) : fl;
  const rainLikely  = isRaining || maxPop4h > 50;
  const coldComing  = minFL4h < fl - 8;

  // BASE LAYER — uses intensity-adjusted effective temp
  const intensityNote = intensity === 'hard' ? ' (adjusted for hard effort heat)'
                      : intensity === 'easy' ? ' (adjusted for easy pace)'
                      : '';
  if (isSnowing || flEff < 32)    gear.push({ icon:'🧥', cat:'Clothing', name:'Thermal bib tights + long sleeve base layer', reason:`Freezing at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}${intensityNote} — full thermal coverage essential` });
  else if (flEff < 45)            gear.push({ icon:'🧥', cat:'Clothing', name:'Bib tights + thermal jersey', reason:`Cold at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}${intensityNote} — keep legs and core warm` });
  else if (flEff < 58)            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + thermal jersey', reason:`Cool at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}${intensityNote} — light warmth on the bike` });
  else if (flEff < 75)            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + short sleeve jersey', reason:`Perfect temp at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}${intensityNote}` });
  else                            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + lightweight jersey', reason:`Warm at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}${intensityNote} — go light and breathe` });

  // MID / WIND LAYER — also intensity-adjusted
  if (flEff < 45 || (wind > 18 && flEff < 65))
    gear.push({ icon:'🦺', cat:'Clothing', name:'Wind vest / gilet', reason: flEff < 45 ? 'Insulates core without overheating arms' : `${toWindDisplay(wind, tempUnit)} wind — protect your chest` });

  // GLOVES — hands don't generate much heat, less intensity adjustment (halved)
  const flGloves = fl + intensityOffset * 0.5;
  if (fl < 32 || isSnowing)         gear.push({ icon:'🧤', cat:'Clothing', name:'Insulated full-finger gloves', reason:'Below freezing — bare hands lose grip and dexterity fast' });
  else if (flGloves < 52 || gusts > 22) gear.push({ icon:'🧤', cat:'Clothing', name:'Light cycling gloves', reason: flGloves < 52 ? `${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)} — fingers will numb without protection` : `Gusts to ${toWindDisplay(gusts, tempUnit)} adds wind chill to hands` });

  // NECK / EARS
  if (flEff < 45)               gear.push({ icon:'🧣', cat:'Clothing', name:'Neck gaiter + ear covers', reason:'Seals the cold gap between collar and helmet' });

  // RAIN GEAR
  if (isRaining)               gear.push({ icon:'🌧️', cat:'Rain gear', name:'Waterproof cycling jacket', reason:`${WMO_SHORT[wmo] || 'Rain'} right now — stay dry or you'll get cold fast` });
  else if (rainLikely)         gear.push({ icon:'🌂', cat:'Rain gear', name:'Packable rain cape', reason:`${Math.round(maxPop4h)}% chance of rain in the next 4 hours` });
  if (isRaining || (rainLikely && duration !== 'short')) {
    const shoeType = bikeType === 'mtb' ? 'Waterproof MTB shoe covers' : 'Shoe covers / overshoes';
    gear.push({ icon:'👟', cat:'Rain gear', name:shoeType, reason:'Wet feet destroy comfort within 20 minutes' });
  }
  // Tyre advice for wet conditions by bike type
  if (isRaining && bikeType === 'road') gear.push({ icon:'🔧', cat:'Pre-ride checks', name:'Drop tyre pressure 5–10 psi', reason:'Lower pressure improves wet grip on road tyres significantly' });
  if (isRaining && bikeType === 'gravel') gear.push({ icon:'🔧', cat:'Pre-ride checks', name:'Mudguards / fenders if fitted', reason:'Gravel + rain = rooster tail up your back without coverage' });

  if (coldComing)              gear.push({ icon:'🧥', cat:'Clothing', name:'Extra layer in jersey pocket', reason:`Feels like temp drops ${Math.round(Math.abs(fl - minFL4h))}${unitLabel(tempUnit)} in the next few hours` });

  // EYEWEAR + SUN
  if (uv >= 6)                 gear.push({ icon:'🕶️', cat:'Sun & visibility', name:'Sunglasses + SPF 50 sunscreen', reason:`UV index ${Math.round(uv)} — high burn risk on exposed skin` });
  else if (uv >= 3 || isFoggy) gear.push({ icon:'🕶️', cat:'Sun & visibility', name:'Sunglasses / clear lenses', reason: isFoggy ? 'Clear lenses improve contrast in fog' : `UV ${Math.round(uv)} — protect your eyes` });
  if (isFoggy)                 gear.push({ icon:'🔦', cat:'Sun & visibility', name:'Front + rear lights (flashing)', reason:'Fog cuts driver visibility dramatically — be seen' });

  // HELMET — always
  gear.push({ icon:'⛑️', cat:'Safety', name:'Helmet', reason:'Always.' });

  // HYDRATION & FUEL — what to WEAR/CARRY on the bike
  const hotThresh = 82 - intensityOffset;
  const isHot  = fl > hotThresh;
  const isWarm = fl > 68 - intensityOffset;
  const humid  = current.relative_humidity_2m ?? 60;
  const isLong = duration === 'long' || duration === 'epic';
  const isMed  = duration === 'medium';

  // BOTTLES
  if (duration === 'short') {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'1 water bottle', reason:'One bottle is plenty' + (isHot ? ` — sip every 10 min at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}` : ' for a short ride') });
  } else if (isHot || isLong) {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'2 water bottles + electrolyte tabs', reason: isHot ? `High sweat rate at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)} — salts prevent cramps` : 'Long ride — two bottles minimum, electrolytes prevent bonking' });
    if (isLong) gear.push({ icon:'💧', cat:'Hydration & fuel', name:'Plan water refill points', reason:'Know where to top up on route — carry enough or plan refills' });
  } else {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'2 water bottles', reason:`Standard setup for this distance at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)}` });
  }

  // HYDRATION PACK/VEST for longer or hot off-road rides
  if (isLong && (rideType === 'mtb' || rideType === 'gravel')) {
    gear.push({ icon:'🎒', cat:'Hydration & fuel', name:'Hydration vest or pack', reason:'Off-road long ride — a vest carries 1.5–2L without stopping to refill' });
  } else if (isLong && isHot) {
    gear.push({ icon:'🎒', cat:'Hydration & fuel', name:'Consider a hydration vest', reason:'Hot long ride — a vest lets you carry more water than two bottles' });
  }

  // ON-BIKE FUEL STORAGE
  if (duration !== 'short') {
    if (isMed) {
      gear.push({ icon:'⚡', cat:'Hydration & fuel', name:'2 gels or bars in back jersey pocket', reason:'Fuel every 30–45 min — pocket keeps it accessible without stopping' });
    } else {
      gear.push({ icon:'🍱', cat:'Hydration & fuel', name:'Bento box or top-tube bag', reason:'Long ride needs frequent fuelling — bento box keeps food reachable without unzipping' });
      gear.push({ icon:'🥙', cat:'Hydration & fuel', name:'Gels, bars + real food (banana, rice cake)', reason:'3h+ ride — mix formats to avoid flavour fatigue and gut issues' });
    }
  }

  // ELECTROLYTES for heat or humidity
  if ((isHot || humid > 75) && duration !== 'short') {
    gear.push({ icon:'🧂', cat:'Hydration & fuel', name:'Electrolyte capsules in pocket', reason: isHot ? `Carry salt caps — heavy sweating at ${toDisplay(fl, tempUnit)}${unitLabel(tempUnit)} depletes sodium fast` : 'High humidity = high sweat rate even when it feels cool' });
  }
  // NUTRITION
  if (duration === 'medium')   gear.push({ icon:'⚡', cat:'Hydration & fuel', name:'1–2 energy gels or bars', reason:'Fuel at 45–60 min to avoid the bonk' });
  else if (duration === 'long') gear.push({ icon:'🥙', cat:'Hydration & fuel', name:'3+ gels/bars + real food', reason:'Fuel every 30–45 min — more on hot days' });

  // RIDE-TYPE EXTRAS
  if (rideType === 'commute') {
    gear.push({ icon:'💼', cat:'Commute essentials', name:'Pannier or dry bag', reason:'Keep work clothes and laptop dry and crumple-free' });
    if (rainLikely) gear.push({ icon:'🔒', cat:'Commute essentials', name:'D-lock or chain lock', reason:'Leaving your bike outside while you work' });
  }
  if (rideType === 'mtb') {
    gear.push({ icon:'🛡️', cat:'MTB extras', name:'Knee & elbow pads', reason:'Trail riding — protection matters more than weight' });
    gear.push({ icon:'🧰', cat:'MTB extras', name:'Tube, tyre levers, mini pump', reason:'Remote trails — flats happen and help is far away' });
  }
  if (rideType === 'gravel') {
    gear.push({ icon:'🧰', cat:'Gravel extras', name:'Saddle bag: tube, CO₂, tyre plugs, multi-tool', reason:'Gravel roads eat tyres — carry more than you think you need' });
    gear.push({ icon:'📱', cat:'Gravel extras', name:'Phone with offline maps downloaded', reason:'Gravel routes often have no signal' });
  }
  if (rideType === 'road' && duration !== 'short') {
    gear.push({ icon:'🧰', cat:'Road essentials', name:'Saddle bag: tube, CO₂, tyre levers', reason:'Road tyres flat without warning — be self-sufficient' });
  }

  return gear;
}

// Indoor/stationary rides skip weather entirely — no wind, sun, rain, or
// road hazards. The dominant factor indoors is the lack of airflow, which
// drives sweat rate and fluid needs far higher than an equivalent outdoor ride.
export function buildIndoorGearList(duration) {
  const gear = [];
  const isLong = duration === 'long' || duration === 'epic';
  const isMed  = duration === 'medium';

  gear.push({ icon:'🌀', cat:'Indoor setup', name:'High-volume fan (or two)', reason:'No airflow indoors — without a fan, sweat rate and core temp run much higher than outdoors at the same effort' });
  gear.push({ icon:'🧺', cat:'Indoor setup', name:'Sweat towel + trainer mat', reason:'Indoor sweat volume drips straight onto the frame and floor — protect both' });
  gear.push({ icon:'👕', cat:'Clothing', name:'Lightweight bib shorts + breathable/mesh jersey', reason:'Dress cooler than you would outside — there’s no wind to help you shed heat' });
  gear.push({ icon:'🧴', cat:'Clothing', name:'Chamois cream', reason:'Longer time in the saddle with no coasting or terrain breaks increases friction' });

  if (duration === 'short') {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'1–2 bottles + electrolyte mix', reason:'Indoor sweat rate is high even for a short session — start with electrolytes, not just water' });
  } else {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'2+ bottles or a jug within reach + electrolyte tabs', reason:'No evaporative cooling indoors means significantly higher fluid and sodium loss than the same ride outside' });
  }
  if (isMed)  gear.push({ icon:'⚡', cat:'Hydration & fuel', name:'1–2 gels or bars', reason:'Fuel at 45–60 min to avoid the bonk, same as outdoors' });
  else if (isLong) gear.push({ icon:'🥙', cat:'Hydration & fuel', name:'Gels/bars + real food within reach', reason:'Long indoor session — fuel every 30–45 min since there’s no coasting to recover on' });

  gear.push({ icon:'🔧', cat:'Pre-ride checks', name:'Trainer calibration / spin-down (or tyre pressure if wheel-on)', reason:'Indoor setups drift out of calibration — a quick spin-down keeps power and resistance accurate' });
  gear.push({ icon:'📺', cat:'Indoor setup', name:'Zwift / TrainerRoad / entertainment queued up', reason:'Indoor sessions live and die on distraction — queue it before you clip in' });

  return gear;
}
