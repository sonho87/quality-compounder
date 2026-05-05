// api/kite-callback.ts
// Vercel serverless function — Kite OAuth callback.
// After login Kite redirects to: /api/kite-callback?request_token=XXX&action=login&status=success
// This function exchanges the request_token for an access_token (server-side — secret never exposed)
// then redirects the user to / with the token in the URL fragment (#kt=...).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { request_token, status } = req.query;

  if (status !== 'success' || !request_token || typeof request_token !== 'string') {
    const msg = encodeURIComponent('Kite login failed or was cancelled. Please try again.');
    return res.redirect(302, `/?kite_error=${msg}`);
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || !apiSecret) {
    const msg = encodeURIComponent('Server misconfiguration: KITE_API_KEY or KITE_API_SECRET missing.');
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
      body: new URLSearchParams({
        api_key: apiKey,
        request_token,
        checksum,
      }).toString(),
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
    const userName = encodeURIComponent(json.data.user_name ?? 'Trader');

    // Pass token via URL fragment (never sent to server) — stored in localStorage by the frontend
    return res.redirect(302, `/#kt=${accessToken}&kn=${userName}`);

  } catch (err: unknown) {
    const msg = encodeURIComponent((err as Error).message ?? 'Unknown error during token exchange');
    return res.redirect(302, `/?kite_error=${msg}`);
  }
}
