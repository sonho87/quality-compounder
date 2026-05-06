// indicators.ts
// STRICT port of V8.4 Quant Terminal (momentum_app_v2.py from quality-compounder-main).
// DO NOT change any periods, thresholds, or logic without explicit instruction.

import type { OHLCV, StockResult, Rating } from './types';

// ─── 1. RSI — Simple Rolling Mean (V8.4 calc_rsi) ─────────────────────────
// V8.4 uses: gain.rolling(period).mean() / loss.rolling(period).mean()
// This is SMA-based RSI, NOT Wilder exponential smoothing.
export function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  const deltas = closes.map((v, i) => (i === 0 ? 0 : v - closes[i - 1]));
  const gains  = deltas.map(d => (d > 0 ? d : 0));
  const losses = deltas.map(d => (d < 0 ? -d : 0));

  // Simple rolling mean (SMA) over the period window — NOT Wilder smoothing
  for (let i = period; i < closes.length; i++) {
    const windowGains  = gains.slice(i - period + 1, i + 1);
    const windowLosses = losses.slice(i - period + 1, i + 1);
    const avgGain = windowGains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = windowLosses.reduce((a, b) => a + b, 0) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return rsi;
}

// ─── 2. ATR — Simple Rolling Mean (V8.4 calc_atr) ─────────────────────────
// V8.4 uses: tr.rolling(period).mean() — simple average, not EMA
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

// ─── 3. STRUCTURAL STRENGTH — V8.4 detect_structural_strength() ────────────
// Two conditions must BOTH pass (over last 250 trading days = 1 year):
//
//   (a) TREND INTACT: MA50 > MA200  AND  current close > MA200
//       Uses simple moving averages computed over the 1-year window.
//
//   (b) LIMITED DRAWDOWN: max drawdown from expanding max (closes only) > -25%.
//
// This is the V8.4 formula — uses MA crossovers, NOT quarterly rising highs.
export function detectStructuralStrength(closes: number[], _highs?: number[]): boolean {
  if (closes.length < 250) return false;

  const oneYear = closes.slice(-250);

  // (a) Trend intact: MA50 > MA200 AND current close > MA200
  // MA50 = average of last 50 bars of the 1-year window
  // MA200 = average of last 200 bars of the 1-year window
  const ma50 = oneYear.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const ma200 = oneYear.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const currentClose = oneYear[oneYear.length - 1];

  const trendIntact = (currentClose > ma200) && (ma50 > ma200);
  if (!trendIntact) return false;

  // (b) Max drawdown from expanding max (rolling high) must be > -25%
  let rollingMax = -Infinity;
  let maxDrawdown = 0;
  for (const price of oneYear) {
    if (price > rollingMax) rollingMax = price;
    const dd = price / rollingMax - 1;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown > -0.25;
}

// ─── 4. CLASSIFICATION — V8.4 classify_compounder() ───────────────────────
// missingFundamentals: true → PROVISIONAL score 4 (so pure technical breakouts aren't hidden)
// consistentGrowth: pass null to bypass (when quarterly income data unavailable)
// roe: pass null to bypass (when fundamental data unavailable)
export function classifyCompounder(
  ret6m: number,
  ret1y: number,
  ret3y: number,
  structural: boolean,
  consistentGrowth: boolean | null = null,
  roe: number | null = null,
  missingFundamentals: boolean = false
): { rating: Rating; score: number } {
  if (!structural) return { rating: '🔴 TIER 5: CHOPPY', score: 0 };

  // PROVISIONAL: missing fundamentals get score 4 so they can pass V4 quality check
  if (missingFundamentals) return { rating: '⚠️ TIER 2: PROVISIONAL (Missing Data)', score: 4 };

  // When data is unavailable (null), bypass the condition (treat as satisfied)
  const growthOk = consistentGrowth === null || consistentGrowth === true;
  const roeOk    = roe === null || roe > 0.15;

  // Tier 1: Monopoly (V8.4: roe > 0.15 since yfinance returns fraction)
  if (!isNaN(ret3y) && ret3y >= 1.50 && growthOk && roeOk)
    return { rating: '👑 TIER 1: MONOPOLY', score: 5 };

  // Tier 2: Quality
  if (!isNaN(ret1y) && ret1y >= 0.40 && growthOk)
    return { rating: '🟢 TIER 2: QUALITY', score: 4 };

  // Tier 3: Emerging
  if (!isNaN(ret6m) && ret6m >= 0.30 && growthOk)
    return { rating: '🟡 TIER 3: EMERGING', score: 3 };

  // Tier 4: Momentum (ignores growth/fundamentals)
  if (!isNaN(ret6m) && ret6m >= 0.30)
    return { rating: '🔵 TIER 4: MOMENTUM', score: 2 };

  return { rating: '🔴 TIER 5: WEAK', score: 0 };
}

// ─── 5. V4 BREAKOUT SIGNAL — V8.4 logic, all 5 rules must pass ────────────
// Rule 1 — Liquidity:    tradedVal >= ₹50 Lakhs (or min_trade_val)
// Rule 2 — Proximity:    price >= 52wHigh * 0.95
// Rule 3 — Volume Surge: max(vol last 3d) >= 1.5 × avg(vol 20d)
// Rule 4 — Momentum:     50 <= RSI <= 75  (INCLUSIVE — V8.4 uses <=)
// Rule 5 — Quality:      score >= 4 (includes PROVISIONAL with score 4)
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

  // Rule 4: RSI INCLUSIVE between 50 and 75 (V8.4: 50 <= rsi <= 75)
  if (rsi < 50 || rsi > 75) return false;

  // Rule 5: Quality — must be score >= 4 (Tier 1, Tier 2, or PROVISIONAL)
  if (score !== null && score < 4) return false;

  return true;
}

// ─── 6. FULL STOCK EVALUATOR ────────────────────────────────────────────────
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

  // Structural strength (V8.4: MA crossovers + drawdown)
  const structural = detectStructuralStrength(closes, highs);

  // Returns: 6M (130d), 1Y (250d), 3Y (700d)
  const ret6m = currentPrice / closes[closes.length - 130] - 1;
  const ret1y = currentPrice / closes[closes.length - 250] - 1;
  const ret3y = bars.length >= 700
    ? currentPrice / closes[closes.length - 700] - 1
    : NaN;

  // V8.4: When using OHLCV-only data (no Yahoo fundamentals), treat as missing_fundamentals=true
  // This gives PROVISIONAL score 4 if structural passes, allowing V4 signal detection
  const missingFundamentals = true; // OHLCV-only mode = always missing
  const { rating, score } = classifyCompounder(
    ret6m, ret1y, ret3y, structural, null, null, missingFundamentals
  );

  // V4 Signal (all 5 rules, RSI inclusive)
  const v4Signal = calcV4Signal(currentPrice, high52w, volumes, currentRSI, tradedVal, score);

  // Risk management (V8.4: same formula)
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
