// TradingViewChart.tsx
// Uses the TradingView iframe embed — works on ALL domains, no API key needed.
// The script-based widget only works on whitelisted domains (causes the Apple fallback bug).

interface TradingViewChartProps {
  symbol: string;       // e.g. "RELIANCE"
  theme?: 'light' | 'dark';
  height?: number;
}

export default function TradingViewChart({
  symbol,
  theme = 'light',
  height = 480,
}: TradingViewChartProps) {
  // Studies: RSI + 2 simple MAs (50 & 200)
  const studies = [
    'RSI@tv-basicstudies',
    'MASimple@tv-basicstudies',
    'MASimple@tv-basicstudies',
  ].join('%1F');

  const params = new URLSearchParams({
    symbol: `NSE:${symbol}`,
    interval: 'D',
    timezone: 'Asia/Kolkata',
    theme,
    style: '1',
    locale: 'in',
    toolbar_bg: theme === 'dark' ? '#1e293b' : '#f8fafc',
    enable_publishing: 'false',
    hide_side_toolbar: 'false',
    allow_symbol_change: 'false',
    withdateranges: 'true',
    range: '12M',
    hide_top_toolbar: 'false',
    saveimage: 'false',
    studies,
  });

  const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_${symbol}&${params.toString()}`;

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      style={{ height }}
    >
      <iframe
        key={`${symbol}-${theme}`}   // force re-mount on symbol or theme change
        src={src}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allowFullScreen
        title={`TradingView chart — NSE:${symbol}`}
      />
    </div>
  );
}
