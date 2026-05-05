import { Zap, TrendingUp, Briefcase, AlertCircle } from 'lucide-react';
import type { StockResult, PortfolioPosition } from '@/lib/types';
import { fmtINR, fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';
import RatingBadge from '@/components/RatingBadge';

interface OverviewTabProps {
  stocks: StockResult[];
  portfolio: PortfolioPosition[];
  onSelectTicker: (ticker: string) => void;
  onNavigateToTearSheet: () => void;
}

export default function OverviewTab({ stocks, portfolio, onSelectTicker, onNavigateToTearSheet }: OverviewTabProps) {
  const v4Signals = stocks.filter(s => s.v4Signal);
  const totalInvested = portfolio.reduce((a, p) => a + p.investment, 0);
  const currentValue = portfolio.reduce((a, p) => a + p.currentPrice * p.shares, 0);
  const pnl = currentValue - totalInvested;

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="metric-card p-4 border-l-4 border-l-emerald-500">
          <p className="metric-label">Positions</p>
          <p className="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">{portfolio.length}</p>
          <p className="text-xs text-slate-400 mt-1">Active holdings</p>
        </div>
        <div className="metric-card p-4 border-l-4 border-l-blue-500">
          <p className="metric-label">Invested</p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtINR(totalInvested)}</p>
          <p className="text-xs text-slate-400 mt-1">Total deployed</p>
        </div>
        <div className={`metric-card p-4 border-l-4 ${pnl >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <p className="metric-label">Unrealised P&L</p>
          <p className={`font-mono text-2xl font-bold ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{fmtINR(pnl)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {totalInvested > 0 ? fmtPct(pnl / totalInvested) : '0.00%'}
          </p>
        </div>
        <div className="metric-card p-4 border-l-4 border-l-amber-500">
          <p className="metric-label">V4 Signals</p>
          <p className="font-mono text-3xl font-bold text-amber-600 dark:text-amber-400">{v4Signals.length}</p>
          <p className="text-xs text-slate-400 mt-1">Action required</p>
        </div>
      </div>

      {/* V4 Breakout Signals */}
      <div className="metric-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h2 className="font-bold text-slate-900 dark:text-slate-100">V4 Breakout Signals</h2>
            <span className="badge-amber">{v4Signals.length} active</span>
          </div>
        </div>
        {v4Signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium">No V4 signals today</p>
            <p className="text-xs mt-1">Stocks must be near 52w high with volume surge + RSI 50–75</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Ticker', 'Rating', 'Price', 'Change', 'Stop', 'T1', 'T2', 'RSI', 'Sector', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {v4Signals.map(s => (
                  <tr key={s.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-bold font-mono text-slate-900 dark:text-slate-100">{s.ticker}</td>
                    <td className="px-4 py-3"><RatingBadge rating={s.rating} /></td>
                    <td className="px-4 py-3 font-mono font-bold">{fmtINRDecimals(s.price)}</td>
                    <td className={`px-4 py-3 font-mono font-bold ${s.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtPct(s.change)}
                    </td>
                    <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{fmtINRDecimals(s.stop)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">{fmtINRDecimals(s.target1)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">{fmtINRDecimals(s.target2)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold text-sm ${s.rsi > 70 ? 'text-amber-600' : s.rsi > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                        {fmtNum(s.rsi, 1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{s.sector}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { onSelectTicker(s.ticker); onNavigateToTearSheet(); }}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        Tear Sheet →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Portfolio Positions */}
      <div className="metric-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <Briefcase className="w-4 h-4 text-blue-500" />
          <h2 className="font-bold text-slate-900 dark:text-slate-100">Portfolio Positions</h2>
          <span className="badge-blue">{portfolio.length}</span>
        </div>
        {portfolio.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Briefcase className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium">No positions yet</p>
            <p className="text-xs mt-1">Add stocks from the Screener or Tear Sheet tab</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Ticker', 'Entry', 'CMP', 'Shares', 'Invested', 'P&L', 'P&L %', 'Stop', 'T1', 'Added'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {portfolio.map(pos => {
                  const pnlPos = (pos.currentPrice - pos.entryPrice) * pos.shares;
                  const pnlPct = pos.currentPrice / pos.entryPrice - 1;
                  return (
                    <tr key={pos.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-bold font-mono">{pos.ticker}</td>
                      <td className="px-4 py-3 font-mono">{fmtINRDecimals(pos.entryPrice)}</td>
                      <td className="px-4 py-3 font-mono font-bold">{fmtINRDecimals(pos.currentPrice)}</td>
                      <td className="px-4 py-3 font-mono">{pos.shares}</td>
                      <td className="px-4 py-3 font-mono">{fmtINR(pos.investment)}</td>
                      <td className={`px-4 py-3 font-mono font-bold ${pnlPos >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {pnlPos >= 0 ? '+' : ''}{fmtINR(pnlPos)}
                      </td>
                      <td className={`px-4 py-3 font-mono font-bold ${pnlPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmtPct(pnlPct)}
                      </td>
                      <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{fmtINRDecimals(pos.stop)}</td>
                      <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">{fmtINRDecimals(pos.target1)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{pos.addedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top Compounders — Tier 4 + Tier 5 */}
      {(() => {
        const topTier = stocks.filter(s => s.score >= 4).sort((a, b) => b.score - a.score || b.ret1y - a.ret1y);
        return (
          <div className="metric-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <h2 className="font-bold text-slate-900 dark:text-slate-100">Top Tier Compounders</h2>
              <span className="badge-green">{topTier.length}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">Tier 4 + 5</span>
            </div>
            {topTier.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <TrendingUp className="w-8 h-8 mb-2" />
                <p className="text-sm font-medium">No Tier 4+ stocks currently</p>
                <p className="text-xs mt-1">Market may be in correction — structural filters are strict</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {['Ticker', 'Tier', 'Price', '6M Ret', '1Y Ret', '3Y Ret', 'RSI', 'Sector'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {topTier.map(s => (
                      <tr key={s.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => { onSelectTicker(s.ticker); onNavigateToTearSheet(); }}>
                        <td className="px-4 py-3 font-bold font-mono">{s.ticker}</td>
                        <td className="px-4 py-3"><RatingBadge rating={s.rating} /></td>
                        <td className="px-4 py-3 font-mono">{fmtINRDecimals(s.price)}</td>
                        <td className={`px-4 py-3 font-mono font-bold ${s.ret6m >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmtPct(s.ret6m)}
                        </td>
                        <td className={`px-4 py-3 font-mono font-bold ${s.ret1y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmtPct(s.ret1y)}
                        </td>
                        <td className={`px-4 py-3 font-mono font-bold ${!isNaN(s.ret3y) && s.ret3y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {isNaN(s.ret3y) ? '—' : fmtPct(s.ret3y)}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{fmtNum(s.rsi, 1)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{s.sector}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
