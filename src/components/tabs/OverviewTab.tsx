import { Zap, TrendingUp, TrendingDown, Briefcase, AlertCircle } from 'lucide-react';
import type { StockResult, PortfolioPosition } from '@/lib/types';
import { fmtINR, fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';

interface OverviewTabProps {
  stocks: StockResult[];
  portfolio: PortfolioPosition[];
  onSelectTicker: (ticker: string) => void;
  onNavigateToTearSheet: () => void;
}

// ─── V8.4 TIER COLOR ENGINE ───
export const getTierStyle = (rating: string) => {
  if (rating.includes('TIER 1')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (rating.includes('QUALITY')) return 'bg-green-100 text-green-800 border-green-200';
  if (rating.includes('PROVISIONAL')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (rating.includes('EMERGING')) return 'bg-yellow-50 text-yellow-700 border-yellow-100';
  if (rating.includes('MOMENTUM')) return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-red-50 text-red-700 border-red-100';
};

export const cleanTierText = (rating: string) => rating.replace(/['"🔴🟢🟡🔵👑⚠️]/g, '').trim();

export default function OverviewTab({ stocks, portfolio, onSelectTicker, onNavigateToTearSheet }: OverviewTabProps) {
  const v4Signals = stocks.filter(s => s.v4Signal);
  const totalInvested = portfolio.reduce((a, p) => a + p.investment, 0);
  const currentValue = portfolio.reduce((a, p) => a + p.currentPrice * p.shares, 0);
  const pnl = currentValue - totalInvested;

  return (
    <div className="space-y-6">
      {/* ─── PORTFOLIO SUMMARY METRICS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Briefcase className="w-3.5 h-3.5"/> Active Positions</p>
          <p className="font-mono text-3xl font-bold text-slate-900">{portfolio.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-500">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Capital Deployed</p>
          <p className="font-mono text-3xl font-bold text-slate-900">{fmtINR(totalInvested)}</p>
        </div>
        <div className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 ${pnl >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unrealized P&L</p>
          <div className="flex items-baseline gap-2">
             <p className={`font-mono text-3xl font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pnl > 0 ? '+' : ''}{fmtINR(pnl)}</p>
             <p className={`text-sm font-medium ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalInvested > 0 ? ((pnl / totalInvested) * 100).toFixed(2) + '%' : '0.00%'}
             </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Zap className="w-3.5 h-3.5"/> V4 Action Required</p>
          <p className="font-mono text-3xl font-bold text-amber-600">{v4Signals.length}</p>
          <p className="text-xs text-slate-500 mt-1">Breakouts detected today</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
        <h2 className="text-lg font-bold text-slate-800">Today's V4 Breakouts</h2>
      </div>

      {/* ─── ANTI-SQUISH TABLE CONTAINER ─── */}
      <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-sm">
        <table className="w-full text-sm text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-bold tracking-wider">
            <tr>
              <th className="px-5 py-4 whitespace-nowrap">Ticker</th>
              <th className="px-5 py-4 whitespace-nowrap">V8.4 Rating</th>
              <th className="px-5 py-4 whitespace-nowrap text-right">Price</th>
              <th className="px-5 py-4 whitespace-nowrap text-right">Change</th>
              <th className="px-5 py-4 whitespace-nowrap text-right">14D RSI</th>
              <th className="px-5 py-4 whitespace-nowrap text-right">Smart Entry</th>
              <th className="px-5 py-4 whitespace-nowrap text-right">Stop Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {v4Signals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p>No strict V4 technical breakouts passed today.</p>
                </td>
              </tr>
            ) : (
              v4Signals.map((s) => (
                <tr 
                  key={s.ticker} 
                  className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  onClick={() => { onSelectTicker(s.ticker); onNavigateToTearSheet(); }}
                >
                  <td className="px-5 py-3 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                    {s.ticker} <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded border border-green-200">PASS</span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${getTierStyle(s.rating)}`}>
                      {cleanTierText(s.rating)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">{fmtINRDecimals(s.price)}</td>
                  <td className={`px-5 py-3 text-right font-mono font-bold whitespace-nowrap ${s.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {s.change > 0 ? '+' : ''}{fmtPct(s.change)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-600 whitespace-nowrap">{fmtNum(s.rsi, 1)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-blue-600 whitespace-nowrap">{fmtINRDecimals(s.entryLimit)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-red-500 whitespace-nowrap">{fmtINRDecimals(s.stop)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
