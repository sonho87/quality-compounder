// api/kite-callback.ts
// Vercel serverless function — Kite OAuth callback.
// After login Kite redirects to: /api/kite-callback?request_token=XXX&action=login&status=success&state=BASE64
// This function:
//  1. Decodes the state parameter to recover api_key and api_secret
//  2. Exchanges the request_token for an access_token (server-side — secret never in browser)
//  3. Redirects to / with the token in the URL fragment (#kt=...)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { request_token, status, state } = req.query;

  if (status !== 'success' || !request_token || typeof request_token !== 'string') {
    const msg = encodeURIComponent('Kite login failed or was cancelled. Please try again.');
    return res.redirect(302, `/?kite_error=${msg}`);
  }

  // Decode credentials from OAuth state (set by kite-login.ts)
  let apiKey    = process.env.KITE_API_KEY    ?? '';
  let apiSecret = process.env.KITE_API_SECRET ?? '';

  if (state && typeof state === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString());
      if (decoded.k) apiKey    = decoded.k;
      if (decoded.s) apiSecret = decoded.s;
    } catch {
      // ignore decode errors — fall back to env vars
    }
  }

  if (!apiKey || !apiSecret) {
    const msg = encodeURIComponent('API Key or Secret missing. Enter them in the sidebar and try again.');
    return res.redirect(302, `/?kite_error=${msg}`);
  }

  try {
    // Checksum = SHA-256(api_key + request_token + api_secret)
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + request_token + apiSecret)
      .digest('hex');

    const tokenRes = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ api_key: apiKey, request_token, checksum }).toString(),
    });

    const json = await tokenRes.json() as {
      status: string;
      data?: { access_token: string; user_name?: string };
      message?: string;
    };

    if (json.status !== 'success' || !json.data?.access_token) {
      const msg = encodeURIComponent(json.message ?? 'Token exchange failed');
      return res.redirect(302, `/?kite_error=${msg}`);
    }

    const accessToken = json.data.access_token;
    const userName    = encodeURIComponent(json.data.user_name ?? 'Trader');

    // Pass token via URL fragment (never sent to server) — stored in localStorage by the frontend
    return res.redirect(302, `/#kt=${accessToken}&kn=${userName}`);

  } catch (err: unknown) {
    const msg = encodeURIComponent((err as Error).message ?? 'Unknown error during token exchange');
    return res.redirect(302, `/?kite_error=${msg}`);
  }
}
