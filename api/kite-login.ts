// api/kite-login.ts
// Vercel serverless function — redirects user to Kite OAuth login page.
//
// Credentials priority: query params (from user's sidebar settings) → env vars
// Both api_key and api_secret are encoded as base64 JSON in the OAuth `state`
// parameter so kite-callback.ts can use them for the token exchange.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Accept credentials from query params (personal terminal flow) OR env vars
  const apiKey    = (req.query.api_key    as string | undefined) || process.env.KITE_API_KEY;
  const apiSecret = (req.query.api_secret as string | undefined) || process.env.KITE_API_SECRET;

  if (!apiKey) {
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:600px">
        <h2>⚠️ Kite API Key missing</h2>
        <p>Enter your <b>Kite API Key</b> and <b>API Secret</b> in the sidebar under
        <em>Data Source → Kite Connect</em>, then click <b>Login with Kite</b> again.</p>
        <p style="color:#666;font-size:0.85rem">Or set <code>KITE_API_KEY</code> /
        <code>KITE_API_SECRET</code> in Vercel Environment Variables.</p>
        <a href="/">← Back to dashboard</a>
      </body></html>
    `);
  }

  // Encode {k: apiKey, s: apiSecret} in state so kite-callback can reconstruct them
  const statePayload = Buffer.from(JSON.stringify({ k: apiKey, s: apiSecret ?? '' })).toString('base64');
  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&state=${encodeURIComponent(statePayload)}`;
  return res.redirect(302, loginUrl);
}
