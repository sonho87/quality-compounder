import type { OHLCV, NewsItem } from './types';

// --- CSV Parser: reads SYMBOL column, returns NSE tickers ---
export function parseCSVSymbols(csvText: string): string[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
  const symbolIdx = headers.indexOf('SYMBOL');
  if (symbolIdx === -1) throw new Error("CSV must have a 'SYMBOL' column");
  return lines
    .slice(1)
    .map(line => {
      const cols = line.split(',');
      const sym = cols[symbolIdx]?.trim();
      if (!sym || sym.includes(' ')) return null;
      return sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
    })
    .filter(Boolean) as string[];
}

// --- Dhan Historical Data Fetcher ---
// Dhan API: POST https://api.dhan.co/v2/charts/historical
// CORS note: Dhan allows browser requests with proper headers
export async function fetchDhanHistorical(
  securityId: string,
  clientId: string,
  accessToken: string,
  fromDate: string,
  toDate: string
): Promise<OHLCV[]> {
  const res = await fetch('https://api.dhan.co/v2/charts/historical', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-id': clientId,
      'access-token': accessToken,
    },
    body: JSON.stringify({
      securityId,
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
      expiryCode: 0,
      oi: false,
      fromDate,
      toDate,
      interval: '1',
    }),
  });
  if (!res.ok) throw new Error(`Dhan API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // Dhan response shape: { open: [], high: [], low: [], close: [], volume: [], timestamp: [] }
  const { open, high, low, close, volume, timestamp } = data;
  return (timestamp as number[]).map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: open[i],
    high: high[i],
    low: low[i],
    close: close[i],
    volume: volume[i],
  }));
}

// --- Kite (Zerodha) Historical Data via backend proxy ---
// Kite API is CORS-blocked — requires a backend proxy
// Proxy endpoint: GET /api/kite/historical?symbol=RELIANCE&interval=day&from=2022-01-01&to=2025-01-01
export async function fetchKiteHistorical(
  symbol: string,
  proxyUrl: string,
  from: string,
  to: string
): Promise<OHLCV[]> {
  const url = `${proxyUrl}/api/kite/historical?symbol=${symbol}&interval=day&from=${from}&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kite proxy error: ${res.status}`);
  const data = await res.json();
  // Expected response: { data: { candles: [[date, open, high, low, close, volume]] } }
  return (data.data.candles as [string, number, number, number, number, number][]).map(
    ([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume })
  );
}

// --- Google News RSS (proxied via allorigins to avoid CORS) ---
export async function fetchNews(query: string): Promise<NewsItem[]> {
  try {
    const safeQuery = encodeURIComponent(`${query} NSE stock India news when:7d`);
    const rssUrl = `https://news.google.com/rss/search?q=${safeQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 5);
    return items.map(item => {
      const rawTitle = item.querySelector('title')?.textContent ?? '';
      const link = item.querySelector('link')?.textContent ?? '#';
      const pubDate = item.querySelector('pubDate')?.textContent ?? '';
      const parts = rawTitle.split(' - ');
      const title = parts.length > 1 ? parts.slice(0, -1).join(' - ') : rawTitle;
      const publisher = parts[parts.length - 1] || 'News';
      return { title, link, publisher, date: pubDate.slice(0, 16) };
    });
  } catch {
    return [];
  }
}
