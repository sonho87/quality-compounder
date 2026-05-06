// indicators.ts
// STRICT port of the V4 Breakout Swing System specification.
// DO NOT change any periods, thresholds, or logic without explicit instruction.

import type { OHLCV, StockResult, Rating } from './types';

// ─── 1. RSI — 14-period Wilder smoothing ────────────────────────────────────
export function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  const deltas = closes.map((v, i) => (i === 0 ? 0 : v - closes[i - 1]));
  const gains  = deltas.map(d => (d > 0 ? d : 0));
  const losses = deltas.map(d => (d < 0 ? -d : 0));

  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < closes.length; i++) {
    if (i === period) {
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    } else {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

// ─── 2. ATR — 14-period average true range ──────────────────────────────────
export function calcATR(bars: OHLCV[], period = 14): number[] {
  const atr: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < period + 1) return atr;

  const tr = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const pc = bars[i - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - pc),
      Math.abs(bar.low - pc)
    );
  });

  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  for (let i = period; i < bars.length; i++) {
    sum = sum - tr[i - period] + tr[i];
    atr[i] = sum / period;
  }
  return atr;
}

// ─── 3. STRUCTURAL STRENGTH — exact port of momentum_app_v2.py ──────────────
// Two conditions must BOTH pass (over last 250 trading days = 1 year):
//
//   (a) QUARTERLY RISING HIGHS: split 250 bars into 4 quarters (~62 bars each).
//       Each quarter's max close must be >= the prior quarter's max close.
//       Confirms a sustained, consistently-rising price structure.
//
//   (b) LIMITED DRAWDOWN: max drawdown from rolling high (closes only) > -25%.
//       Confirms no catastrophic peak-to-trough collapse within the year.
//
// NOTE: The original formula uses CLOSES for both quarterly highs and drawdown.
//       The `highs` parameter is kept for API compatibility but is NOT used.
export function detectStructuralStrength(closes: number[], _highs?: number[]): boolean {
  if (closes.length < 250) return false;

  const oneYear = closes.slice(-250);

  // (a) Quarterly rising highs — 4 quarters × ~62 bars each
  const q1 = Math.max(...oneYear.slice(0, 62));
  const q2 = Math.max(...oneYear.slice(62, 125));
  const q3 = Math.max(...oneYear.slice(125, 187));
  const q4 = Math.max(...oneYear.slice(187));
  if (!(q2 >= q1 && q3 >= q2 && q4 >= q3)) return false;

  // (b) Max drawdown from rolling high must be > -25%
  let rollingMax = -Infinity;
  let maxDrawdown = 0;
  for (const price of oneYear) {
    if (price > rollingMax) rollingMax = price;
    const dd = price / rollingMax - 1;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown > -0.25;
}

// ─── 4. CLASSIFICATION — 5-tier system ─────────────────────────────────────
// consistentGrowth: pass null to bypass (when quarterly income data unavailable)
// roe:             pass null to bypass (when fundamental data unavailable)
// Returns { rating, score } where score: 5=Monopoly, 4=Quality, 3=Emerging, 2=Momentum, 0=Weak
export function classifyCompounder(
  ret6m: number,
  ret1y: number,
  ret3y: number,
  structural: boolean,
  consistentGrowth: boolean | null = null,
  roe: number | null = null
): { rating: Rating; score: number } {
  if (!structural) return { rating: '🔴 CHOPPY', score: 0 };

  // When data is unavailable, bypass the condition (treat as satisfied)
  const growthOk = consistentGrowth === null || consistentGrowth === true;
  const roeOk    = roe === null || roe > 15;

  // Tier 5: Monopoly / Duopoly
  if (!isNaN(ret3y) && ret3y >= 1.50 && growthOk && roeOk)
    return { rating: '🏆 MONOPOLY/DUOPOLY', score: 5 };

  // Tier 4: Quality Compounder
  if (!isNaN(ret1y) && ret1y >= 0.40 && growthOk)
    return { rating: '🟢 QUALITY COMPOUNDER', score: 4 };

  // Tier 3: Emerging Winner
  if (!isNaN(ret6m) && ret6m >= 0.30 && growthOk)
    return { rating: '🌱 EMERGING WINNER', score: 3 };

  // Tier 2: Momentum Play (ignores growth/fundamentals)
  if (!isNaN(ret6m) && ret6m >= 0.30)
    return { rating: '🔵 MOMENTUM PLAY', score: 2 };

  return { rating: '🔴 WEAK RETURNS', score: 0 };
}

// ─── 5. V4 BREAKOUT SIGNAL — all 5 rules must pass ──────────────────────────
// Rule 1 — Liquidity:    tradedVal >= ₹50 Lakhs
// Rule 2 — Proximity:    price >= 52wHigh * 0.95
// Rule 3 — Volume Surge: max(vol last 3d) >= 1.5 × avg(vol 20d)
// Rule 4 — Momentum:     RSI strictly > 50 AND strictly < 75
// Rule 5 — Quality:      score >= 4 (Tier 4+5)
//                        BYPASS this rule if score is null/undefined (no fundamental data)
export function calcV4Signal(
  price: number,
  high52w: number,
  volumes: number[],
  rsi: number,
  tradedVal: number,
  score: number | null = null
): boolean {
  // Rule 1: Liquidity — traded value ≥ ₹50 Lakhs
  if (tradedVal < 50) return false;

  // Rule 2: Within 5% of 52-week high
  if (price < high52w * 0.95) return false;

  // Rule 3: Volume surge
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const maxVol3d = Math.max(...volumes.slice(-3));
  if (maxVol3d < 1.5 * avgVol20) return false;

  // Rule 4: RSI strictly between 50 and 75 (not 50, not 75)
  if (rsi <= 50 || rsi >= 75) return false;

  // Rule 5: Quality — must be Tier 4 or Tier 5
  // Bypass if score is null (fundamental data unavailable)
  if (score !== null && score < 4) return false;

  return true;
}

// ─── 6. FULL STOCK EVALUATOR ────────────────────────────────────────────────
// minTradeVal is kept for backward-compat but Liquidity Rule is enforced inside V4 signal.
// All stocks are returned regardless; v4Signal=false if tradedVal < 50 Lakhs.
export function evaluateStock(
  ticker: string,
  bars: OHLCV[],
  capital: number,
  _minTradeVal = 0
): StockResult | null {
  if (bars.length < 252) return null;

  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const currentPrice = closes[closes.length - 1];
  const prevClose    = closes[closes.length - 2];
  const pctChange    = currentPrice / prevClose - 1;

  // Traded Value in ₹ Lakhs
  const avgVol20    = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const tradedVal   = (avgVol20 * currentPrice) / 100000;

  const high52w = Math.max(...highs.slice(-252));

  const rsiArr     = calcRSI(closes, 14);
  const currentRSI = rsiArr[rsiArr.length - 1];

  const atrArr     = calcATR(bars, 14);
  const currentATR = atrArr[atrArr.length - 1];

  // Key price levels
  const immRes   = Math.max(...highs.slice(-20));
  const majRes   = Math.max(...highs.slice(-250));
  const supZone  = Math.min(...lows.slice(-20));
  const breakdown = Math.min(...lows.slice(-50));

  // Structural strength (all 3 conditions)
  const structural = detectStructuralStrength(closes, highs);

  // Returns: 6M (130d), 1Y (250d), 3Y (700d)
  const ret6m = currentPrice / closes[closes.length - 130] - 1;
  const ret1y = currentPrice / closes[closes.length - 250] - 1;
  const ret3y = bars.length >= 700
    ? currentPrice / closes[closes.length - 700] - 1
    : NaN;

  // 5-tier classification (bypass consistency/ROE — no fundamental data from OHLCV)
  const { rating, score } = classifyCompounder(ret6m, ret1y, ret3y, structural, null, null);

  // V4 Signal (all 5 rules)
  const v4Signal = calcV4Signal(currentPrice, high52w, volumes, currentRSI, tradedVal, score);

  // Risk management
  const stopPct  = Math.max(0.03, Math.min(0.06, (1.5 * currentATR) / currentPrice));
  const stopPrice = currentPrice * (1 - stopPct);
  const target1  = currentPrice + 1.5 * currentATR;
  const target2  = currentPrice + 3.0 * currentATR;
  const shares   = Math.floor(capital / currentPrice);

  return {
    ticker:    ticker.replace('.NS', '').replace('.BO', ''),
    fullTicker: ticker,
    rating,
    score,
    v4Signal,
    price:     currentPrice,
    change:    pctChange,
    rsi:       currentRSI,
    tradedVal,
    ret6m,
    ret1y,
    ret3y,
    target1,
    target2,
    stop:      stopPrice,
    shares,
    investment: shares * currentPrice,
    immRes,
    majRes,
    supZone,
    breakdown,
    structural,
    atr:       currentATR,
    entryLimit: +(currentPrice * 1.005).toFixed(2),
    sector:    'N/A',
    mcap:      'N/A',
    pe:        null,
    roe:       null,
    bookVal:   'N/A',
    divYield:  'N/A',
  };
}
