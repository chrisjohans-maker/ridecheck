// Proxies USDA FoodData Central search so the API key stays server-side.
// Key lives in the USDA_API_KEY Netlify env var (free from api.data.gov/signup).
// Returns the best generic match's macros (per 100 g) for our scoreFood() heuristic.
const WANTED = { 208: 'cal', 205: 'carbs', 203: 'protein', 204: 'fat', 291: 'fiber', 269: 'sugar', 307: 'sodium', 221: 'alcohol' };

// Pick the most generic/on-topic match: reward exact/prefix/word matches, prefer
// Foundation/SR Legacy (clean whole foods) and concise descriptions over composite items.
function pickBest(foods, q) {
  const ql = (q || '').toLowerCase().trim();
  let best = null, bestScore = -Infinity;
  for (const f of foods || []) {
    const d = (f.description || '').toLowerCase();
    const first = d.split(/[\s,]+/)[0] || '';
    let s = 0;
    if (d === ql) s += 100;                                            // exact
    else if (first === ql || (ql && first.startsWith(ql)) || (ql && first.length >= 3 && ql.startsWith(first))) s += 35; // first word (handles plurals)
    else if (ql && d.split(/[\s,]+/).includes(ql)) s += 20;            // word anywhere
    else if (ql && d.includes(ql)) s += 8;                             // substring
    // Strongly prefer clean generic whole foods over composite/prepared items.
    if (f.dataType === 'Foundation') s += 25;
    else if (f.dataType === 'SR Legacy') s += 20;
    s -= d.length * 0.03; // mild concision tiebreak
    if (s > bestScore) { bestScore = s; best = f; }
  }
  return best;
}

// Flatten a USDA food's foodNutrients (by nutrient number) into our macro fields.
function extractMacros(food) {
  const macros = {};
  for (const n of (food?.foodNutrients || [])) {
    const num = parseInt(n.nutrientNumber ?? n.nutrient?.number, 10);
    if (WANTED[num] != null && n.value != null) macros[WANTED[num]] = n.value;
  }
  return macros;
}

exports.pickBest = pickBest;
exports.extractMacros = extractMacros;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400', // food macros don't change — cache a day
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const q = (event.queryStringParameters?.q || '').trim();
  if (!q) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing q' }) };

  const key = process.env.USDA_API_KEY || 'DEMO_KEY';
  try {
    // dataType must be REPEATED params, not comma-joined (comma → HTTP 400).
    const types = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
    const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(key) +
      '&query=' + encodeURIComponent(q) + '&pageSize=8' +
      types.map(t => '&dataType=' + encodeURIComponent(t)).join('');
    const r = await fetch(url);
    if (!r.ok) return { statusCode: r.status, headers, body: JSON.stringify({ error: 'USDA HTTP ' + r.status }) };
    const data = await r.json();
    const food = pickBest(data.foods, q);
    if (!food) return { statusCode: 200, headers, body: JSON.stringify({ found: false }) };
    return { statusCode: 200, headers, body: JSON.stringify({ found: true, name: food.description, macros: extractMacros(food), serving: '100 g' }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
