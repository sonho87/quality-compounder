import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'light' | 'dark';
  height?: number;
}

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => void;
    };
  }
}

export default function TradingViewChart({ symbol, theme = 'light', height = 480 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<unknown>(null);

  useEffect(() => {
    const containerId = `tv_chart_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (!containerRef.current) return;

    const loadWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = `<div id="${containerId}" style="height:${height}px;width:100%;"></div>`;
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: `NSE:${symbol}`,
        interval: 'D',
        timezone: 'Asia/Kolkata',
        theme,
        style: '1',
        locale: 'in',
        toolbar_bg: theme === 'dark' ? '#1e293b' : '#f8fafc',
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        studies: [
          'RSI@tv-basicstudies',
          { id: 'MASimple@tv-basicstudies', inputs: { length: 50 } },
          { id: 'MASimple@tv-basicstudies', inputs: { length: 200 } },
        ],
        container_id: containerId,
        hide_top_toolbar: false,
        save_image: false,
        withdateranges: true,
        range: '12M',
      });
    };

    if (window.TradingView) {
      loadWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = loadWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol, theme, height]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
      style={{ height }}
    />
  );
}
