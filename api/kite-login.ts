// api/kite-login.ts
// Vercel serverless function — redirects user to Kite OAuth login page.
// Set KITE_API_KEY in Vercel dashboard → Settings → Environment Variables.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'KITE_API_KEY environment variable is not set. Add it in Vercel dashboard.',
    });
  }
  // Kite Connect v3 login URL
  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;
  res.redirect(302, loginUrl);
}
