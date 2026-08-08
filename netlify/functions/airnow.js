// Proxies AirNow current-observation requests so the API key stays server-side.
// The key lives in the AIRNOW_API_KEY Netlify env var (Site config → Environment variables).
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const lat = parseFloat(event.queryStringParameters?.lat);
  const lon = parseFloat(event.queryStringParameters?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid lat/lon' }) };
  }

  const key = process.env.AIRNOW_API_KEY;
  if (!key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AIRNOW_API_KEY not configured' }) };
  }

  try {
    const url = 'https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json' +
      '&latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&distance=50&API_KEY=' + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) {
      return { statusCode: r.status, headers, body: JSON.stringify({ error: 'AirNow HTTP ' + r.status }) };
    }
    const data = await r.json();
    // Cache at the edge for 10 min — AQI updates hourly, so this cuts AirNow calls hard.
    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=600' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
