export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Tier 5 = Monopoly/Duopoly, Tier 4 = Quality Compounder,
// Tier 3 = Emerging Winner, Tier 2 = Momentum Play, Tier 0 = Choppy/Weak
export type Rating =
  | '🏆 MONOPOLY/DUOPOLY'   // Tier 5: 3Y ≥ 150% + Structural + ROE > 15%
  | '🟢 QUALITY COMPOUNDER' // Tier 4: 1Y ≥ 40% + Structural
  | '🌱 EMERGING WINNER'    // Tier 3: 6M ≥ 30% + Structural
  | '🔵 MOMENTUM PLAY'      // Tier 2: 6M ≥ 30% (no structural req)
  | '🔴 CHOPPY'             // Tier 0: fails structural strength filter
  | '🔴 WEAK RETURNS';      // Tier 0: structural OK but returns too low

export interface StockResult {
  ticker: string;
  fullTicker: string;
  rating: Rating;
  score: number;      // 5=Monopoly, 4=Quality, 3=Emerging, 2=Momentum, 0=Choppy/Weak
  v4Signal: boolean;
  price: number;
  change: number;
  rsi: number;
  tradedVal: number;  // in ₹ Lakhs
  ret6m: number;
  ret1y: number;
  ret3y: number;      // 3-year return (NaN if < 700 bars)
  target1: number;
  target2: number;
  stop: number;
  shares: number;
  investment: number;
  immRes: number;
  majRes: number;
  supZone: number;
  breakdown: number;
  structural: boolean;
  atr: number;
  entryLimit: number;   // Smart Entry = price × 1.005 (limit order price)
  sector: string;
  mcap: string;
  pe: number | null;
  roe: number | null;
  bookVal: string;
  divYield: string;
}

export interface PortfolioPosition {
  ticker: string;
  entryPrice: number;
  shares: number;
  investment: number;
  currentPrice: number;
  target1: number;
  target2: number;
  stop: number;
  addedAt: string;
}

export interface MarketIndex {
  name: string;
  price: number;
  change: number;
  symbol: string;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  date: string;
}

export type DataSource = 'mock' | 'csv' | 'dhan' | 'kite';

export interface AppSettings {
  capitalPerTrade: number;
  minTradeValLakhs: number;
  dataSource: DataSource;
  dhanClientId: string;
  dhanAccessToken: string;
  kiteApiKey: string;
  kiteApiSecret: string;
  kiteAccessToken: string;
  kiteProxyUrl: string;
  geminiApiKey: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
