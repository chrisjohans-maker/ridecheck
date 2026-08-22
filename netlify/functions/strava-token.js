// Strava OAuth token broker. Keeps STRAVA_CLIENT_SECRET server-side so it
// never touches the browser.
//
//   GET                          → { client_id }   (public app id, needed to build the authorize URL)
//   POST { code }                → exchange an authorization code for tokens (initial connect)
//   POST { refresh_token }       → refresh an expired access token
//
// Env (Netlify → Site config → Environment variables):
//   STRAVA_CLIENT_ID     the app's numeric Client ID  (public)
//   STRAVA_CLIENT_SECRET the app's Client Secret       (secret)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Strava not configured' }) };
  }

  // The frontend needs the (public) client_id to build the authorize URL.
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ client_id: clientId }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { code, refresh_token } = JSON.parse(event.body || '{}');

  // Build the grant-specific payload. Initial connect uses an authorization
  // code; everything after that uses the stored refresh token.
  let payload;
  if (code) {
    payload = { code, grant_type: 'authorization_code' };
  } else if (refresh_token) {
    payload = { refresh_token, grant_type: 'refresh_token' };
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing code or refresh_token' }) };
  }

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...payload }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify(data) };
    }

    // Only hand the browser what it needs — never the client secret, and no
    // athlete PII beyond the tokens themselves.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
