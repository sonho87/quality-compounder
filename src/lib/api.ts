import type { NewsItem } from './types';

// --- CSV Parser: reads SYMBOL column, returns NSE tickers ---
// Handles NSE MarketWatch CSV format:
//   - UTF-8 BOM (﻿) prepended to file
//   - Headers wrapped in quotes with embedded \n, e.g. "SYMBOL \n"
//   - Windows or Unix line endings
export function parseCSVSymbols(csvText: string): string[] {
  // 1. Strip UTF-8 BOM and normalise line endings
  const cleaned = csvText
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 2. Collapse multi-line quoted fields by removing embedded newlines inside quotes
  //    NSE headers look like: "SYMBOL \n","SERIES \n",...
  //    We strip the embedded whitespace+newline from inside quotes.
  const collapsed = cleaned.replace(/"([^"]*)"/g, (_match, inner) =>
    inner.replace(/[\r\n]+/g, '').trim()
  );

  const lines = collapsed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // 3. Parse headers — strip any remaining quotes, whitespace, control chars
  const headers = lines[0].split(',').map(h =>
    h.replace(/^["'\s]+|["'\s]+$/g, '').replace(/[\r\n\t]/g, '').trim().toUpperCase()
  );

  let symbolIdx = headers.indexOf('SYMBOL');
  if (symbolIdx === -1) {
    // Fallback: partial match (e.g. "SYMBOL" buried in a longer string)
    symbolIdx = headers.findIndex(h => h.includes('SYMBOL'));
  }
  if (symbolIdx === -1) {
    throw new Error(
      `No SYMBOL column found. Columns detected: ${headers.slice(0, 6).join(', ')} — ` +
      `make sure you're uploading the NSE MarketWatch CSV (MW-NIFTY-*.csv)`
    );
  }

  return lines
    .slice(1)
    .map(line => {
      const cols = line.split(',');
      const sym = cols[symbolIdx]?.replace(/^["'\s]+|["'\s]+$/g, '').trim();
      if (!sym || sym === '') return null;
      // Skip header repeat rows, total rows, etc.
      if (sym === 'SYMBOL' || sym.startsWith('Total') || /[^A-Z0-9&\-.]/.test(sym)) return null;
      return sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
    })
    .filter(Boolean) as string[];
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
