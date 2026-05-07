import { useState, useMemo } from 'react';
import { Search, Filter, Zap, LayoutList } from 'lucide-react';
import type { StockResult, PortfolioPosition } from '@/lib/types';
import { fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';
import { getTierStyle, cleanTierText } from './OverviewTab';

interface ScreenerTabProps {
  stocks: StockResult[];
  portfolio: PortfolioPosition[];
  onAddToPortfolio: (stock: StockResult) => void;
  onSelectTicker: (ticker: string) => void;
  onNavigateToTearSheet: () => void;
}

export default function ScreenerTab({ stocks, onSelectTicker, onNavigateToTearSheet }: ScreenerTabProps) {
  const [filterTier, setFilterTier] = useState<string>('All Tiers');
  const [search, setSearch] = useState('');
  const [v4Only, setV4Only] = useState(false);

  // ─── FILTER LOGIC ───
  const filtered = useMemo(() => {
    return stocks.filter(s => {
      // 1. V4 Toggle
      if (v4Only && !s.v4Signal) return false;
      // 2. Tier Dropdown
      if (filterTier !== 'All Tiers' && !s.rating.includes(filterTier)) return false;
      // 3. Search Bar
      if (search && !s.ticker.toLowerCase().includes(search.toLowerCase())) return false;
      
      return true;
    });
  }, [stocks, v4Only, filterTier, search]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* ─── FILTER TOOLBAR ─── */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-4 h-4"/> Tier Filter
          </span>
          <select 
            className="text-sm bg-white border border-slate-300 text-slate-700 font-medium rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
          >
            <option value="All Tiers">All Master Tiers</option>
            <option value="TIER 1">Tier 1: Monopoly</option>
            <option value="QUALITY">Tier 2: Quality</option>
            <option value="PROVISIONAL">Tier 2: Provisional (Missing Data)</option>
            <option value="EMERGING">Tier 3: Emerging</option>
            <option value="MOMENTUM">Tier 4: Momentum</option>
          </select>
        </div>

        <div className="flex items-center gap-4">
          <button 
            className={`flex items-center gap-2 h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all border ${v4Only ? 'bg-green-500 text-white border-green-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
            onClick={() => setV4Only(!v4Only)}
          >
            <Zap className={`w-4 h-4 ${v4Only ? 'fill-white' : ''}`} /> 
            {v4Only ? 'V4 Signals Only' : 'Show All Signals'}
          </button>
          
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search ticker..." 
              className="w-full pl-9 h-9 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
        <LayoutList className="w-4 h-4" /> {filtered.length} STOCKS MATCHING CRITERIA
      </div>

      {/* ─── ANTI-SQUISH MASTER TABLE ─── */}
      <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-sm flex-1">
        <table className="w-full text-sm text-left min-w-[1000px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase font-bold tracking-wider sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Ticker</th>
              <th className="px-4 py-3 whitespace-nowrap">Sector</th>
              <th className="px-4 py-3 whitespace-nowrap">System Rating</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">V4 Signal</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">Price (₹)</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">RSI (14D)</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">1Y Return</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">3Y Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((stock) => (
              <tr 
                key={stock.ticker} 
                className={`transition-colors cursor-pointer ${stock.v4Signal ? 'bg-green-50/30 hover:bg-green-50' : 'hover:bg-slate-50/70'}`}
                onClick={() => { onSelectTicker(stock.ticker); onNavigateToTearSheet(); }}
              >
                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{stock.ticker}</td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{stock.sector}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${getTierStyle(stock.rating)}`}>
                    {cleanTierText(stock.rating)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  {stock.v4Signal ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded border border-green-200">
                      <Zap className="w-3 h-3 fill-green-600" /> PASS
                    </span>
                  ) : (<span className="text-slate-300">—</span>)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium text-slate-700 whitespace-nowrap">{fmtINRDecimals(stock.price)}</td>
                <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${stock.rsi >= 70 ? 'text-red-500' : stock.rsi <= 40 ? 'text-blue-500' : 'text-slate-600'}`}>
                  {fmtNum(stock.rsi, 1)}
                </td>
                <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${stock.ret1y >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stock.ret1y ? (stock.ret1y > 0 ? '+' : '') + fmtPct(stock.ret1y) : 'N/A'}
                </td>
                <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${stock.ret3y >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                   {stock.ret3y ? (stock.ret3y > 0 ? '+' : '') + fmtPct(stock.ret3y) : 'N/A'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No stocks match the current database filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
