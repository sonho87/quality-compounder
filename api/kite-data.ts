// api/kite-data.ts
// Vercel serverless function — fetches 3yr daily OHLCV for all 19 NSE stocks
// from the Kite Connect API and runs the full V4 screening algorithm.
//
// Called by the frontend: GET /api/kite-data?access_token=XXX&capital=33000
//
// The screening logic below is an exact port of momentum_app_v2.py.
// DO NOT change any formula — only fetch/response logic may be modified.

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── INSTRUMENT MAP (token → ticker, sector) ────────────────────────────────
const INSTRUMENTS: { token: number; ticker: string; sector: string }[] = [
  { token: 738561,  ticker: 'RELIANCE',   sector: 'Energy' },
  { token: 2953217, ticker: 'TCS',        sector: 'Technology' },
  { token: 408065,  ticker: 'INFY',       sector: 'Technology' },
  { token: 341249,  ticker: 'HDFCBANK',   sector: 'Financial Services' },
  { token: 81153,   ticker: 'BAJFINANCE', sector: 'Financial Services' },
  { token: 969473,  ticker: 'WIPRO',      sector: 'Technology' },
  { token: 1270529, ticker: 'ICICIBANK',  sector: 'Financial Services' },
  { token: 779521,  ticker: 'SBIN',       sector: 'Financial Services' },
  { token: 3861249, ticker: 'ADANIPORTS', sector: 'Infrastructure' },
  { token: 857857,  ticker: 'SUNPHARMA',  sector: 'Pharmaceuticals' },
  { token: 897537,  ticker: 'TITAN',      sector: 'Consumer Goods' },
  { token: 60417,   ticker: 'ASIANPAINT', sector: 'Chemicals' },
  { token: 2815745, ticker: 'MARUTI',     sector: 'Automobile' },
  { token: 4598529, ticker: 'NESTLEIND',  sector: 'Consumer Goods' },
  { token: 356865,  ticker: 'HINDUNILVR', sector: 'Consumer Goods' },
  { token: 2939649, ticker: 'LT',         sector: 'Infrastructure' },
  { token: 5215745, ticker: 'COALINDIA',  sector: 'Energy' },
  { token: 3834113, ticker: 'POWERGRID',  sector: 'Utilities' },
  { token: 2977281, ticker: 'NTPC',       sector: 'Utilities' },
];

// ─── OHLCV type ──────────────────────────────────────────────────────────────
interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── INDICATOR FUNCTIONS (strict port of V4 Breakout Swing System spec) ─────

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
}

function calcATR(bars: Bar[], period = 14): number {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Structural Strength — ALL 3 conditions required:
// (a) Close > MA200  (b) MA50 > MA200  (c) Drawdown from 1Y high > -25%
function detectStructural(closes: number[], highs: number[]): boolean {
  if (closes.length < 250) return false;
  const year      = closes.slice(-250);
  const yearHighs = highs.slice(-250);
  const last      = year[year.length - 1];
  const ma50      = year.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const ma200     = year.reduce((a, b) => a + b, 0) / 200;
  if (last <= ma200) return false;
  if (ma50 <= ma200) return false;
  const rollingHigh = Math.max(...yearHighs);
  if (last / rollingHigh - 1 <= -0.25) return false;
  return true;
}

type Rating =
  | '🏆 MONOPOLY/DUOPOLY'
  | '🟢 QUALITY COMPOUNDER'
  | '🌱 EMERGING WINNER'
  | '🔵 MOMENTUM PLAY'
  | '🔴 CHOPPY'
  | '🔴 WEAK RETURNS';

// 5-tier classification. consistentGrowth/roe = null → bypass (OHLCV-only mode)
function classifyCompounder(
  ret6m: number, ret1y: number, ret3y: number,
  structural: boolean,
  consistentGrowth: boolean | null = null,
  roe: number | null = null
): { rating: Rating; score: number } {
  if (!structural) return { rating: '🔴 CHOPPY', score: 0 };
  const growthOk = consistentGrowth === null || consistentGrowth;
  const roeOk    = roe === null || roe > 15;
  if (!isNaN(ret3y) && ret3y >= 1.50 && growthOk && roeOk)
    return { rating: '🏆 MONOPOLY/DUOPOLY', score: 5 };
  if (!isNaN(ret1y) && ret1y >= 0.40 && growthOk)
    return { rating: '🟢 QUALITY COMPOUNDER', score: 4 };
  if (!isNaN(ret6m) && ret6m >= 0.30 && growthOk)
    return { rating: '🌱 EMERGING WINNER', score: 3 };
  if (!isNaN(ret6m) && ret6m >= 0.30)
    return { rating: '🔵 MOMENTUM PLAY', score: 2 };
  return { rating: '🔴 WEAK RETURNS', score: 0 };
}

// V4 Signal — ALL 5 rules must pass
function calcV4(
  price: number, high52w: number, volumes: number[],
  rsi: number, tradedVal: number, score: number
): boolean {
  if (tradedVal < 50) return false;                          // Rule 1: Liquidity
  if (price < high52w * 0.95) return false;                 // Rule 2: Proximity
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (Math.max(...volumes.slice(-3)) < 1.5 * avgVol20) return false; // Rule 3: Volume
  if (rsi <= 50 || rsi >= 75) return false;                 // Rule 4: RSI strictly (50,75)
  if (score < 4) return false;                              // Rule 5: Tier 4 or 5
  return true;
}

function screenStock(ticker: string, sector: string, bars: Bar[], capital: number) {
  if (bars.length < 252) return null;

  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const price     = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const change    = price / prevClose - 1;

  const avgVol20  = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const tradedVal = (avgVol20 * price) / 100000;       // ₹ Lakhs
  const high52w   = Math.max(...highs.slice(-252));
  const rsi       = calcRSI(closes, 14);
  const atr       = calcATR(bars, 14);
  const structural = detectStructural(closes, highs);

  const ret6m = price / closes[closes.length - 130] - 1;
  const ret1y = price / closes[closes.length - 250] - 1;
  const ret3y = bars.length >= 700 ? price / closes[closes.length - 700] - 1 : NaN;

  const { rating, score } = classifyCompounder(ret6m, ret1y, ret3y, structural);
  const v4Signal = calcV4(price, high52w, volumes, rsi, tradedVal, score);

  const stopPct  = Math.max(0.03, Math.min(0.06, (1.5 * atr) / price));
  const stop     = price * (1 - stopPct);
  const target1  = price + 1.5 * atr;
  const target2  = price + 3.0 * atr;
  const shares   = Math.floor(capital / price);

  return {
    ticker,
    fullTicker: `${ticker}.NS`,
    rating,
    score,
    v4Signal,
    price:      +price.toFixed(2),
    change:     +change.toFixed(6),
    rsi:        +rsi.toFixed(2),
    tradedVal:  +tradedVal.toFixed(1),
    ret6m:      +ret6m.toFixed(6),
    ret1y:      +ret1y.toFixed(6),
    ret3y:      isNaN(ret3y) ? null : +ret3y.toFixed(6),
    target1:    +target1.toFixed(2),
    target2:    +target2.toFixed(2),
    stop:       +stop.toFixed(2),
    shares,
    investment: +(shares * price).toFixed(2),
    immRes:     +Math.max(...highs.slice(-20)).toFixed(2),
    majRes:     +Math.max(...highs.slice(-250)).toFixed(2),
    supZone:    +Math.min(...lows.slice(-20)).toFixed(2),
    breakdown:  +Math.min(...lows.slice(-50)).toFixed(2),
    structural,
    atr:        +atr.toFixed(2),
    sector,
    mcap:       'N/A',
    pe:         null as number | null,
    roe:        null as number | null,
    bookVal:    'N/A',
    divYield:   'N/A',
  };
}

// ─── FETCH ONE STOCK FROM KITE ───────────────────────────────────────────────

async function fetchBars(token: number, apiKey: string, accessToken: string): Promise<Bar[]> {
  const to   = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 3);  // 3 years of daily data

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const url  = `https://api.kite.trade/instruments/historical/${token}/day`
             + `?from=${fmt(from)}&to=${fmt(to)}`;

  const res = await fetch(url, {
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${apiKey}:${accessToken}`,
    },
  });

  if (!res.ok) throw new Error(`Kite ${token}: HTTP ${res.status}`);

  const json = await res.json() as {
    status: string;
    data?: { candles?: [string, number, number, number, number, number, number][] };
    message?: string;
  };

  if (json.status !== 'success' || !json.data?.candles) {
    throw new Error(`Kite ${token}: ${json.message ?? 'no data'}`);
  }

  return json.data.candles.map(([date, open, high, low, close, volume]) => ({
    date, open, high, low, close, volume,
  }));
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS from same Vercel origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { access_token, capital } = req.query;
  const capitalNum = parseInt((capital as string) || '33000', 10);

  if (!access_token || typeof access_token !== 'string') {
    return res.status(401).json({ error: 'Missing access_token query param' });
  }

  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KITE_API_KEY not configured on server' });
  }

  // Fetch all 19 stocks in parallel (Kite rate-limit: 3 req/sec — we batch in groups)
  const results: ReturnType<typeof screenStock>[] = [];
  const errors: string[] = [];

  // Process in batches of 3 to stay under rate limit
  const BATCH = 3;
  for (let i = 0; i < INSTRUMENTS.length; i += BATCH) {
    const batch = INSTRUMENTS.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(({ token, ticker, sector }) =>
        fetchBars(token, apiKey, access_token).then(bars =>
          screenStock(ticker, sector, bars, capitalNum)
        )
      )
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        results.push(outcome.value);
      } else if (outcome.status === 'rejected') {
        errors.push(String(outcome.reason));
      }
    }

    // Small delay between batches to respect Kite rate limits
    if (i + BATCH < INSTRUMENTS.length) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const fetchTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' IST';

  return res.status(200).json({
    fetchTime,
    stocks: results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
