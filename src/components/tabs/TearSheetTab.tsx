import { useState, useEffect } from 'react';
import { Download, ExternalLink, Zap, Plus, Check, Newspaper, RefreshCw } from 'lucide-react';
import type { StockResult, PortfolioPosition, NewsItem } from '@/lib/types';
import { fmtINR, fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';
import RatingBadge from '@/components/RatingBadge';
import TradingViewChart from '@/components/TradingViewChart';
import { fetchNews } from '@/lib/api';

interface TearSheetTabProps {
  stocks: StockResult[];
  selectedTicker: string;
  onSelectTicker: (t: string) => void;
  portfolio: PortfolioPosition[];
  onAddToPortfolio: (s: StockResult) => void;
  isDark: boolean;
  capitalPerTrade: number;
}

export default function TearSheetTab({
  stocks, selectedTicker, onSelectTicker, portfolio, onAddToPortfolio, isDark, capitalPerTrade
}: TearSheetTabProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const stock = stocks.find(s => s.ticker === selectedTicker) ?? stocks[0];
  const inPortfolio = portfolio.some(p => p.ticker === stock?.ticker);

  useEffect(() => {
    if (!stock) return;
    setNewsLoading(true);
    setNews([]);
    fetchNews(stock.ticker).then(n => { setNews(n); setNewsLoading(false); });
  }, [stock?.ticker]);

  if (!stock) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p>No stocks available. Upload a CSV or use demo data.</p>
      </div>
    );
  }

  const smartLimit = stock.price * 1.005;
  const upChange = stock.change >= 0;
  const changeSign = upChange ? '+' : '';

  const handleDownload = () => {
    const ticket = [
      `TRADE TICKET — ${stock.ticker}`,
      `Date: ${new Date().toLocaleDateString('en-IN')}`,
      `Entry (Limit): ₹${smartLimit.toFixed(2)}`,
      `Stop Loss: ₹${stock.stop.toFixed(2)}`,
      `Target 1: ₹${stock.target1.toFixed(2)}`,
      `Target 2: ₹${stock.target2.toFixed(2)}`,
      `Shares: ${stock.shares}`,
      `Capital at Risk: ₹${stock.investment.toFixed(0)}`,
      `ATR: ₹${stock.atr.toFixed(2)}`,
      `RSI: ${stock.rsi.toFixed(1)}`,
      `Rating: ${stock.rating}`,
      `V4 Signal: ${stock.v4Signal ? 'YES ⚡' : 'NO'}`,
    ].join('\n');
    const blob = new Blob([ticket], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${stock.ticker}_TradeTicket.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Stock Selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedTicker}
          onChange={e => onSelectTicker(e.target.value)}
          className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 flex-1 max-w-xs"
        >
          {stocks.map(s => (
            <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.rating}</option>
          ))}
        </select>
        <span className={`badge-${stock.v4Signal ? 'amber' : 'slate'} flex items-center gap-1`}>
          {stock.v4Signal && <Zap className="w-3 h-3" />}
          {stock.v4Signal ? 'V4 Signal Active' : 'No V4 Signal'}
        </span>
      </div>

      {/* Header */}
      <div className="metric-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">{stock.ticker}</h1>
              <span className="badge-blue">NSE: {stock.ticker}</span>
              <span className="badge-amber">{stock.sector.toUpperCase()}</span>
              <RatingBadge rating={stock.rating} />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>MCap: <b className="text-slate-700 dark:text-slate-300">{stock.mcap}</b></span>
              <span>ATR: <b className="font-mono text-slate-700 dark:text-slate-300">₹{fmtNum(stock.atr)}</b></span>
              <span>Structural: <b className={stock.structural ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                {stock.structural ? '✓ Strong' : '✗ Weak'}
              </b></span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">CMP</p>
            <p className={`font-mono text-4xl font-bold ${upChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {fmtINRDecimals(stock.price)}
            </p>
            <p className={`font-mono text-sm font-bold mt-0.5 ${upChange ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {changeSign}{fmtPct(stock.change)} today
            </p>
          </div>
        </div>
      </div>

      {/* TradingView Chart */}
      <div>
        <TradingViewChart symbol={stock.ticker} theme={isDark ? 'dark' : 'light'} height={480} />
        <p className="text-xs text-slate-400 mt-1.5 text-center">
          Chart powered by TradingView · Includes RSI, MA50, MA200 · Symbol: NSE:{stock.ticker}
        </p>
      </div>

      {/* 4-Panel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Panel A: Setup Analysis */}
        <div className="panel-card">
          <p className="panel-title">📈 Setup Analysis</p>
          <div className="space-y-2.5">
            {[
              { label: 'CMP', value: fmtINRDecimals(stock.price), color: 'text-slate-900 dark:text-slate-100' },
              { label: 'RSI (14)', value: fmtNum(stock.rsi, 1), color: stock.rsi > 70 ? 'text-amber-600' : stock.rsi > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
              { label: '6M Return', value: fmtPct(stock.ret6m), color: stock.ret6m >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
              { label: '1Y Return', value: fmtPct(stock.ret1y), color: stock.ret1y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
              { label: 'Structure', value: stock.structural ? 'Bullish (MA50 > MA200)' : 'Bearish', color: stock.structural ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
            ].map(item => (
              <div key={item.label} className="level-row">
                <span className="level-label">{item.label}</span>
                <span className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</span>
              </div>
            ))}
            {stock.v4Signal && (
              <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> V4 BREAKOUT DETECTED
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Near 52w high · Volume surge · RSI sweet spot</p>
              </div>
            )}
          </div>
        </div>

        {/* Panel B: Key Levels */}
        <div className="panel-card">
          <p className="panel-title">🎯 Key Levels</p>
          <div>
            {[
              { label: 'CMP', value: fmtINRDecimals(stock.price), cls: 'text-slate-900 dark:text-slate-100' },
              { label: 'Imm. Resistance', value: fmtINR(stock.immRes), cls: 'text-red-600 dark:text-red-400' },
              { label: 'Major Resistance', value: fmtINR(stock.majRes), cls: 'text-red-600 dark:text-red-400' },
              { label: 'Support Zone', value: fmtINR(stock.supZone), cls: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Breakdown Level', value: fmtINR(stock.breakdown), cls: 'text-red-700 dark:text-red-400 font-black' },
            ].map(item => (
              <div key={item.label} className="level-row">
                <span className="level-label">{item.label}</span>
                <span className={`font-mono font-bold text-sm ${item.cls}`}>{item.value}</span>
              </div>
            ))}
            <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
              Levels based on 20/50/250-day High/Low bands
            </div>
          </div>
        </div>

        {/* Panel C: Execution Strategy */}
        <div className="panel-card">
          <p className="panel-title">⚙️ Execution Plan</p>
          <div>
            {[
              { label: 'Entry (Limit)', value: fmtINRDecimals(smartLimit), cls: 'text-blue-600 dark:text-blue-400' },
              { label: 'Target 1 (+1.5 ATR)', value: fmtINRDecimals(stock.target1), cls: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Target 2 (+3.0 ATR)', value: fmtINRDecimals(stock.target2), cls: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Stop Loss', value: fmtINRDecimals(stock.stop), cls: 'text-red-600 dark:text-red-400' },
            ].map(item => (
              <div key={item.label} className="level-row">
                <span className="level-label">{item.label}</span>
                <span className={`font-mono font-bold text-sm ${item.cls}`}>{item.value}</span>
              </div>
            ))}
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900">
              <p className="font-mono font-bold text-blue-800 dark:text-blue-300 text-sm">
                {stock.shares} shares · {fmtINR(stock.investment)}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                Capital: {fmtINR(capitalPerTrade)} · ATR stop: {fmtPct(Math.max(0.03, Math.min(0.06, (1.5 * stock.atr) / stock.price)), false)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download Ticket
            </button>
            {!inPortfolio ? (
              <button
                onClick={() => onAddToPortfolio(stock)}
                className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add to Portfolio
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold">
                <Check className="w-3.5 h-3.5" /> In Portfolio
              </div>
            )}
          </div>
        </div>

        {/* Panel D: Fundamentals */}
        <div className="panel-card">
          <p className="panel-title">🏛️ Fundamentals</p>
          <div>
            {[
              { label: 'Market Cap', value: stock.mcap },
              { label: 'P/E Ratio', value: stock.pe != null ? fmtNum(stock.pe, 1) : 'N/A' },
              { label: 'Book Value', value: stock.bookVal },
              { label: 'ROE', value: stock.roe != null ? fmtPct(stock.roe, false) : 'N/A' },
              { label: 'Dividend Yield', value: stock.divYield },
            ].map(item => (
              <div key={item.label} className="level-row">
                <span className="level-label">{item.label}</span>
                <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <a
              href={`https://www.screener.in/company/${stock.ticker}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View on Screener.in
            </a>
            <p className="text-xs text-slate-400 text-center">
              Live fundamentals via Dhan/Kite API — connect in sidebar
            </p>
          </div>
        </div>
      </div>

      {/* News */}
      <div className="metric-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-900 dark:text-slate-100">Live News — {stock.ticker}</h3>
          <span className="badge-slate">7 days</span>
          {newsLoading && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
        </div>
        {news.length === 0 && !newsLoading && (
          <p className="text-sm text-slate-400 text-center py-6">No recent news found (Google RSS may be rate-limited)</p>
        )}
        {newsLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        )}
        <div className="space-y-3">
          {news.map((item, i) => (
            <div key={i} className="flex flex-col gap-1 pb-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 leading-snug"
              >
                {item.title}
              </a>
              <p className="text-xs text-slate-400">{item.publisher} · {item.date}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
