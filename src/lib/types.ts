export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Rating = '🟢 QUALITY COMPOUNDER' | '🔵 MOMENTUM PLAY' | '🔴 CHOPPY' | '🔴 WEAK RETURNS';

export interface StockResult {
  ticker: string;
  fullTicker: string;
  rating: Rating;
  score: number;
  v4Signal: boolean;
  price: number;
  change: number;
  rsi: number;
  tradedVal: number;
  ret6m: number;
  ret1y: number;
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
  kiteAccessToken: string;
  kiteProxyUrl: string;
  geminiApiKey: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
