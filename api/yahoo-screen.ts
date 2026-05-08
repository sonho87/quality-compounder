// api/yahoo-screen.ts
// Vercel serverless function — fetches 3yr daily OHLCV from Yahoo Finance
// for a batch of stock symbols, runs the full V8.4 screening algorithm,
// and returns results.
//
// Called by the frontend:
//   POST /api/yahoo-screen
//   Body: { symbols: ["RELIANCE.NS", "TCS.NS", ...], capital: 33000 }
//
// Processes up to 10 symbols per call (frontend sends multiple batches).

import type { VercelRequest, VercelResponse } from '@vercel/node';

const MAX_BATCH = 10;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Rating =
  | '👑 TIER 1: MONOPOLY'
  | '🟢 TIER 2: QUALITY'
  | '⚠️ TIER 2: PROVISIONAL (Missing Data)'
  | '🟡 TIER 3: EMERGING'
  | '🔵 TIER 4: MOMENTUM'
  | '🔴 TIER 5: CHOPPY'
  | '🔴 TIER 5: WEAK';

interface Fundamentals {
  sector: string;
  mcap: string;
  pe: number | null;
  roe: number | null;
  bookVal: string;
  divYield: string;
  consistentGrowth: boolean | null;
  missing: boolean;
}

// ─── V8.4 INDICATOR FUNCTIONS ────────────────────────────────────────────────

// V8.4 RSI: Simple rolling mean (SMA), NOT Wilder smoothing
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  const len = closes.length;
  let gains = 0, losses = 0;
  for (let i = len - period; i < len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  return avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
}

// V8.4 ATR: Simple rolling mean
function calcATR(bars: Bar[], period = 14): number {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// V8.4 Structural Strength: MA crossovers + drawdown
function detectStructural(closes: number[]): boolean {
  if (closes.length < 250) return false;
  const oneYear = closes.slice(-250);

  const ma50 = oneYear.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const ma200 = oneYear.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const currentClose = oneYear[oneYear.length - 1];

  if (!(currentClose > ma200 && ma50 > ma200)) return false;

  let rollingMax = -Infinity;
  let maxDrawdown = 0;
  for (const price of oneYear) {
    if (price > rollingMax) rollingMax = price;
    const dd = price / rollingMax - 1;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown > -0.25;
}

// V8.4 classify_compounder with missing_fundamentals → PROVISIONAL
function classifyCompounder(
  ret6m: number, ret1y: number, ret3y: number,
  structural: boolean,
  consistentGrowth: boolean | null,
  roe: number | null,
  missingFundamentals: boolean
): { rating: Rating; score: number } {
  if (!structural) return { rating: '🔴 TIER 5: CHOPPY', score: 0 };
  if (missingFundamentals) return { rating: '⚠️ TIER 2: PROVISIONAL (Missing Data)', score: 4 };

  const growthOk = consistentGrowth === null || consistentGrowth;
  const roeOk = roe === null || roe > 0.15;

  if (!isNaN(ret3y) && ret3y >= 1.50 && growthOk && roeOk)
    return { rating: '👑 TIER 1: MONOPOLY', score: 5 };
  if (!isNaN(ret1y) && ret1y >= 0.40 && growthOk)
    return { rating: '🟢 TIER 2: QUALITY', score: 4 };
  if (!isNaN(ret6m) && ret6m >= 0.30 && growthOk)
    return { rating: '🟡 TIER 3: EMERGING', score: 3 };
  if (!isNaN(ret6m) && ret6m >= 0.30)
    return { rating: '🔵 TIER 4: MOMENTUM', score: 2 };
  return { rating: '🔴 TIER 5: WEAK', score: 0 };
}

// V8.4 V4 Signal — RSI STRICT (50 < rsi < 75)
function calcV4(
  price: number, high52w: number, volumes: number[],
  rsi: number, tradedVal: number, score: number
): boolean {
  if (tradedVal < 50) return false;
  if (price < high52w * 0.95) return false;
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (Math.max(...volumes.slice(-3)) < 1.5 * avgVol20) return false;
  if (rsi <= 50 || rsi >= 75) return false;
  if (score < 4) return false;
  return true;
}

// ─── YAHOO FINANCE FETCH ─────────────────────────────────────────────────────

async function fetchYahooOHLCV(symbol: string): Promise<Bar[]> {
  // Yahoo Finance v8 chart API — 3 years of daily data
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?range=3y&interval=1d&events=history`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);

  const json = await res.json() as {
    chart?: {
      result?: [{
        timestamp?: number[];
        indicators?: {
          quote?: [{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }];
        };
      }];
      error?: { description?: string };
    };
  };

  if (json.chart?.error) {
    throw new Error(`Yahoo ${symbol}: ${json.chart.error.description}`);
  }

  const result = json.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`Yahoo ${symbol}: no data`);
  }

  const { timestamp } = result;
  const q = result.indicators.quote[0];
  const bars: Bar[] = [];

  for (let i = 0; i < timestamp.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue; // skip null bars
    bars.push({
      date: new Date(timestamp[i] * 1000).toISOString().split('T')[0],
      open: o, high: h, low: l, close: c, volume: v ?? 0,
    });
  }

  return bars;
}

// Fetch fundamentals from Screener.in (scraping HTML)
// Screener.in doesn't block server IPs like Yahoo Finance does
async function fetchScreenerFundamentals(ticker: string): Promise<Fundamentals> {
  const defaults: Fundamentals = {
    sector: 'N/A', mcap: 'N/A', pe: null, roe: null,
    bookVal: 'N/A', divYield: 'N/A', consistentGrowth: null, missing: true,
  };

  try {
    // Strip .NS/.BO suffix for Screener.in URL
    const cleanTicker = ticker.replace(/\.(NS|BO)$/i, '');
    const url = `https://www.screener.in/company/${cleanTicker}/consolidated/`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    // Try standalone if consolidated 404s
    if (res.status === 404) {
      const res2 = await fetch(`https://www.screener.in/company/${cleanTicker}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      });
      if (!res2.ok) return defaults;
      return parseScreenerHTML(await res2.text());
    }

    if (!res.ok) return defaults;
    return parseScreenerHTML(await res.text());
  } catch {
    return defaults;
  }
}

function parseScreenerHTML(html: string): Fundamentals {
  const defaults: Fundamentals = {
    sector: 'N/A', mcap: 'N/A', pe: null, roe: null,
    bookVal: 'N/A', divYield: 'N/A', consistentGrowth: null, missing: true,
  };

  try {
    // Helper: extract a number after a label in the "Company Ratios" / top section
    const extractNum = (label: string): number | null => {
      // Screener uses: <span class="name">Stock P/E</span>\n<span class="number">25.6</span>
      const regex = new RegExp(label + '[\\s\\S]*?<span[^>]*class="number"[^>]*>([\\d,.]+)', 'i');
      const m = html.match(regex);
      if (!m) return null;
      const val = parseFloat(m[1].replace(/,/g, ''));
      return isNaN(val) ? null : val;
    };

    // Extract sector from Screener.in breadcrumb: title="Broad Sector">Energy</a>
    const sectorMatch = html.match(/title="Broad Sector">([^<]+)/i);
    const sector = sectorMatch ? sectorMatch[1].trim() : 'N/A';

    // Market Cap (in Cr) — Screener shows Indian-format number e.g. "19,42,866"
    const mcapNum = extractNum('Market Cap');
    let mcap = 'N/A';
    if (mcapNum !== null) {
      mcap = `₹${mcapNum.toLocaleString('en-IN')} Cr`;
    }

    const pe = extractNum('Stock P/E');
    const roe = extractNum('ROE');
    const roeDecimal = roe !== null ? roe / 100 : null; // Screener shows % value, convert to fraction

    // Book Value
    const bvNum = extractNum('Book Value');
    const bookVal = bvNum !== null ? `₹${Math.round(bvNum)}` : 'N/A';

    // Dividend Yield
    const dyNum = extractNum('Dividend Yield');
    const divYield = dyNum !== null ? `${dyNum.toFixed(2)}%` : '0.00%';

    // Consistent Growth: check if 3-year profit CAGR is positive
    const profitGrowthMatch = html.match(/Profit\s*Growth[^<]*(?:3\s*Years?|CAGR)[^<]*<[^>]*>[\s\S]*?<span[^>]*class="number"[^>]*>([-\d,.]+)/i);
    let consistentGrowth: boolean | null = null;
    if (profitGrowthMatch) {
      const pg = parseFloat(profitGrowthMatch[1].replace(/,/g, ''));
      consistentGrowth = !isNaN(pg) ? pg > 0 : null;
    }

    const hasSomeData = pe !== null || roeDecimal !== null || mcap !== 'N/A';

    return {
      sector, mcap, pe, roe: roeDecimal, bookVal, divYield,
      consistentGrowth,
      missing: !hasSomeData,
    };
  } catch {
    return defaults;
  }
}

// ─── SCREEN ONE STOCK ────────────────────────────────────────────────────────

function screenStock(
  symbol: string,
  bars: Bar[],
  fund: Fundamentals,
  capital: number
) {
  if (bars.length < 252) return null;

  const ticker = symbol.replace('.NS', '').replace('.BO', '');
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const price = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const change = price / prevClose - 1;

  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const tradedVal = (avgVol20 * price) / 100000;
  const high52w = Math.max(...highs.slice(-252));
  const rsi = calcRSI(closes, 14);
  const atr = calcATR(bars, 14);
  const structural = detectStructural(closes);

  const ret6m = closes.length >= 130 ? price / closes[closes.length - 130] - 1 : NaN;
  const ret1y = closes.length >= 250 ? price / closes[closes.length - 250] - 1 : NaN;
  const ret3y = bars.length >= 700 ? price / closes[closes.length - 700] - 1 : NaN;

  const { rating, score } = classifyCompounder(
    ret6m, ret1y, ret3y, structural,
    fund.consistentGrowth, fund.roe, fund.missing
  );

  const v4Signal = calcV4(price, high52w, volumes, rsi, tradedVal, score);

  const stopPct = Math.max(0.03, Math.min(0.06, (1.5 * atr) / price));
  const stop = price * (1 - stopPct);
  const target1 = price + 1.5 * atr;
  const target2 = price + 3.0 * atr;
  const shares = Math.floor(capital / price);

  return {
    ticker,
    fullTicker: symbol,
    rating,
    score,
    v4Signal,
    price: +price.toFixed(2),
    change: +change.toFixed(6),
    rsi: +rsi.toFixed(2),
    tradedVal: +tradedVal.toFixed(1),
    ret6m: isNaN(ret6m) ? 0 : +ret6m.toFixed(6),
    ret1y: isNaN(ret1y) ? 0 : +ret1y.toFixed(6),
    ret3y: isNaN(ret3y) ? null : +ret3y.toFixed(6),
    target1: +target1.toFixed(2),
    target2: +target2.toFixed(2),
    stop: +stop.toFixed(2),
    shares,
    investment: +(shares * price).toFixed(2),
    immRes: +Math.max(...highs.slice(-20)).toFixed(2),
    majRes: +Math.max(...highs.slice(-250)).toFixed(2),
    supZone: +Math.min(...lows.slice(-20)).toFixed(2),
    breakdown: +Math.min(...lows.slice(-50)).toFixed(2),
    structural,
    atr: +atr.toFixed(2),
    entryLimit: +(price * 1.005).toFixed(2),
    sector: fund.sector,
    mcap: fund.mcap,
    pe: fund.pe ? +fund.pe.toFixed(1) : null,
    roe: fund.roe ? +fund.roe.toFixed(4) : null,
    bookVal: fund.bookVal,
    divYield: fund.divYield,
  };
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { symbols, capital = 33000 } = req.body as {
    symbols: string[];
    capital?: number;
  };

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array required' });
  }

  // Limit batch size
  const batch = symbols.slice(0, MAX_BATCH);
  const results: ReturnType<typeof screenStock>[] = [];
  const errors: string[] = [];

  // Process each symbol: fetch OHLCV + fundamentals, then screen
  const settled = await Promise.allSettled(
    batch.map(async (sym) => {
      const fullSymbol = sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
      const [bars, fund] = await Promise.all([
        fetchYahooOHLCV(fullSymbol),
        fetchScreenerFundamentals(fullSymbol),
      ]);
      return screenStock(fullSymbol, bars, fund, capital);
    })
  );

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value) {
      results.push(outcome.value);
    } else if (outcome.status === 'rejected') {
      errors.push(String(outcome.reason));
    }
  }

  return res.status(200).json({
    results,
    processed: batch.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
