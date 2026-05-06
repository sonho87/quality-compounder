// TradingViewChart.tsx
// Uses TradingView's official external embed widget (embed-widget-advanced-chart.js).
// This is the only embed method that works on ALL domains without whitelisting.
// The legacy widgetembed iframe shows a "login required" popup on external domains.

import { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous widget completely
    container.innerHTML = '';

    // TradingView Advanced Chart — official external embed
    // Config is passed as JSON inside the script's innerHTML.
    // Docs: https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
    const script = document.createElement('script');
    script.src = 'https://s.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    // NOTE: config must be set as textContent BEFORE appending to DOM
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: `NSE:${symbol}`,
      interval: 'D',
      timezone: 'Asia/Kolkata',
      theme,
      style: '1',          // candles
      locale: 'in',
      withdateranges: true,
      range: '12M',
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      studies: [
        'RSI@tv-basicstudies',
        'MASimple@tv-basicstudies',
        'MASimple@tv-basicstudies',
      ],
      show_popup_button: false,
      popup_width: '1000',
      popup_height: '650',
      support_host: 'https://www.tradingview.com',
    });

    container.appendChild(script);

    return () => {
      // Clean up on unmount or symbol/theme change
      if (container) container.innerHTML = '';
    };
  }, [symbol, theme]);

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col"
      style={{ height }}
    >
      {/* Widget container — TradingView injects an iframe here */}
      <div
        ref={containerRef}
        className="tradingview-widget-container flex-1"
        style={{ minHeight: 0 }}
      />

      {/* Footer: attribution + direct TradingView link */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Chart powered by TradingView · RSI, MA50, MA200 · <span className="font-mono">NSE:{symbol}</span>
        </span>
        <a
          href={`https://www.tradingview.com/chart/?symbol=NSE:${symbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Full chart
        </a>
      </div>
    </div>
  );
}
