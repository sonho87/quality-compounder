import type { OHLCV, StockResult, Rating } from './types';

// --- RSI (exact port of Python calc_rsi) ---
export function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  const deltas = closes.map((v, i) => (i === 0 ? 0 : v - closes[i - 1]));
  const gains = deltas.map(d => (d > 0 ? d : 0));
  const losses = deltas.map(d => (d < 0 ? -d : 0));

  // Initial simple averages for first period
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

// --- ATR (exact port of Python calc_atr) ---
export function calcATR(bars: OHLCV[], period = 14): number[] {
  const atr: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < period + 1) return atr;

  const tr = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    );
  });

  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  for (let i = period; i < bars.length; i++) {
    sum = sum - tr[i - period] + tr[i];
    atr[i] = sum / period;
  }
  return atr;
}

// --- Structural Strength (exact port of Python detect_structural_strength) ---
export function detectStructuralStrength(closes: number[]): boolean {
  if (closes.length < 250) return false;
  const oneYear = closes.slice(-250);
  const lastPrice = oneYear[oneYear.length - 1];

  const ma50arr = oneYear.slice(-50);
  const ma50 = ma50arr.reduce((a, b) => a + b, 0) / 50;
  const ma200 = oneYear.reduce((a, b) => a + b, 0) / 200;

  return lastPrice > ma200 && ma50 > ma200;
}

// --- Classify Compounder (exact port of Python classify_compounder) ---
export function classifyCompounder(
  ret6m: number,
  ret1y: number,
  structural: boolean
): { rating: Rating; score: number } {
  if (!structural) return { rating: '🔴 CHOPPY', score: 0 };
  if (!isNaN(ret1y) && ret1y >= 0.40) return { rating: '🟢 QUALITY COMPOUNDER', score: 4 };
  if (!isNaN(ret6m) && ret6m >= 0.30) return { rating: '🔵 MOMENTUM PLAY', score: 2 };
  return { rating: '🔴 WEAK RETURNS', score: 0 };
}

// --- V4 Signal (exact port) ---
export function calcV4Signal(
  price: number,
  high52w: number,
  volumes: number[],
  rsi: number
): boolean {
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const maxVol3d = Math.max(...volumes.slice(-3));
  return price >= high52w * 0.95 && maxVol3d >= 1.5 * avgVol20 && rsi >= 50 && rsi <= 75;
}

// --- Main evaluator: mirrors evaluate_single_stock ---
export function evaluateStock(
  ticker: string,
  bars: OHLCV[],
  capital: number,
  minTradeVal: number
): StockResult | null {
  if (bars.length < 252) return null;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const currentPrice = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const pctChange = currentPrice / prevClose - 1;

  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const tradedValLakhs = (avgVol20 * currentPrice) / 100000;
  if (tradedValLakhs < minTradeVal) return null;

  const high52w = Math.max(...highs.slice(-252));
  const rsiArr = calcRSI(closes, 14);
  const currentRSI = rsiArr[rsiArr.length - 1];
  const atrArr = calcATR(bars, 14);
  const currentATR = atrArr[atrArr.length - 1];

  // Key levels (exact port)
  const immRes = Math.max(...highs.slice(-20));
  const majRes = Math.max(...highs.slice(-250));
  const supZone = Math.min(...lows.slice(-20));
  const breakdown = Math.min(...lows.slice(-50));

  const structural = detectStructuralStrength(closes);

  const ret6m = currentPrice / closes[closes.length - 130] - 1;
  const ret1y = currentPrice / closes[closes.length - 250] - 1;
  const { rating, score } = classifyCompounder(ret6m, ret1y, structural);

  const v4Signal = calcV4Signal(currentPrice, high52w, volumes, currentRSI);

  // Trade plan (exact port)
  const stopPct = Math.max(0.03, Math.min(0.06, (1.5 * currentATR) / currentPrice));
  const stopPrice = currentPrice * (1 - stopPct);
  const target1 = currentPrice + 1.5 * currentATR;
  const target2 = currentPrice + 3.0 * currentATR;
  const shares = Math.floor(capital / currentPrice);

  return {
    ticker: ticker.replace('.NS', ''),
    fullTicker: ticker,
    rating,
    score,
    v4Signal,
    price: currentPrice,
    change: pctChange,
    rsi: currentRSI,
    tradedVal: tradedValLakhs,
    ret6m,
    ret1y,
    target1,
    target2,
    stop: stopPrice,
    shares,
    investment: shares * currentPrice,
    immRes,
    majRes,
    supZone,
    breakdown,
    structural,
    atr: currentATR,
    sector: 'N/A',
    mcap: 'N/A',
    pe: null,
    roe: null,
    bookVal: 'N/A',
    divYield: '0.00%',
  };
}
