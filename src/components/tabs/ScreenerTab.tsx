import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Plus, Zap } from 'lucide-react';
import type { StockResult, PortfolioPosition } from '@/lib/types';
import { fmtINR, fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';
import RatingBadge from '@/components/RatingBadge';

type FilterMode = 'all' | 'v4' | 'quality' | 'momentum';
type SortKey = keyof StockResult;
type SortDir = 'asc' | 'desc';

interface ScreenerTabProps {
  stocks: StockResult[];
  portfolio: PortfolioPosition[];
  onAddToPortfolio: (stock: StockResult) => void;
  onSelectTicker: (ticker: string) => void;
  onNavigateToTearSheet: () => void;
}

export default function ScreenerTab({ stocks, portfolio, onAddToPortfolio, onSelectTicker, onNavigateToTearSheet }: ScreenerTabProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const inPortfolio = new Set(portfolio.map(p => p.ticker));

  const filtered = useMemo(() => {
    let list = [...stocks];
    if (filter === 'v4') list = list.filter(s => s.v4Signal);
    else if (filter === 'quality') list = list.filter(s => s.rating === '🟢 QUALITY COMPOUNDER');
    else if (filter === 'momentum') list = list.filter(s => s.rating === '🔵 MOMENTUM PLAY');
    if (search) list = list.filter(s => s.ticker.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      const av = a[sortKey] as number | string | boolean;
      const bv = b[sortKey] as number | string | boolean;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return list;
  }, [stocks, filter, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-emerald-500" />
      : <ArrowDown className="w-3 h-3 text-emerald-500" />;
  };

  const FILTERS: { key: FilterMode; label: string; count: number }[] = [
    { key: 'all', label: 'All Stocks', count: stocks.length },
    { key: 'v4', label: '⚡ V4 Signals', count: stocks.filter(s => s.v4Signal).length },
    { key: 'quality', label: '🟢 Quality', count: stocks.filter(s => s.rating === '🟢 QUALITY COMPOUNDER').length },
    { key: 'momentum', label: '🔵 Momentum', count: stocks.filter(s => s.rating === '🔵 MOMENTUM PLAY').length },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="metric-card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filter === f.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {f.label} <span className="opacity-70">({f.count})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search ticker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-48"
          />
        </div>
      </div>

      <p className="text-xs text-slate-400 px-1">{filtered.length} stocks shown</p>

      {/* Table */}
      <div className="metric-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {[
                  { key: 'ticker' as SortKey, label: 'Ticker' },
                  { key: 'rating' as SortKey, label: 'Rating' },
                  { key: 'v4Signal' as SortKey, label: 'V4 Signal' },
                  { key: 'price' as SortKey, label: 'Price' },
                  { key: 'change' as SortKey, label: 'Day %' },
                  { key: 'rsi' as SortKey, label: 'RSI' },
                  { key: 'ret6m' as SortKey, label: '6M Ret' },
                  { key: 'ret1y' as SortKey, label: '1Y Ret' },
                  { key: 'stop' as SortKey, label: 'Stop' },
                  { key: 'target1' as SortKey, label: 'T1' },
                  { key: 'sector' as SortKey, label: 'Sector' },
                  { key: 'mcap' as SortKey, label: 'MCap' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">
                      {col.label} <SortIcon col={col.key} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map(s => (
                <tr key={s.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { onSelectTicker(s.ticker); onNavigateToTearSheet(); }}
                      className="font-bold font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {s.ticker}
                    </button>
                  </td>
                  <td className="px-4 py-3"><RatingBadge rating={s.rating} /></td>
                  <td className="px-4 py-3">
                    {s.v4Signal
                      ? <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-xs"><Zap className="w-3 h-3" /> SIGNAL</span>
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">{fmtINRDecimals(s.price)}</td>
                  <td className={`px-4 py-3 font-mono font-bold ${s.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtPct(s.change)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-bold text-sm ${s.rsi > 70 ? 'text-amber-600 dark:text-amber-400' : s.rsi > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                      {fmtNum(s.rsi, 1)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-mono font-bold ${s.ret6m >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtPct(s.ret6m)}
                  </td>
                  <td className={`px-4 py-3 font-mono font-bold ${s.ret1y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtPct(s.ret1y)}
                  </td>
                  <td className="px-4 py-3 font-mono text-red-600 dark:text-red-400">{fmtINRDecimals(s.stop)}</td>
                  <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">{fmtINRDecimals(s.target1)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{s.sector}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{s.mcap}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { onSelectTicker(s.ticker); onNavigateToTearSheet(); }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                      >
                        Sheet
                      </button>
                      {!inPortfolio.has(s.ticker) ? (
                        <button
                          onClick={() => onAddToPortfolio(s)}
                          className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-2 py-1 rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      ) : (
                        <span className="text-xs badge-green">In Portfolio</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Search className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium">No stocks match your filter</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="metric-card p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Screening Legend</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900">
            <p className="font-bold text-amber-700 dark:text-amber-400 mb-1">⚡ V4 Signal</p>
            <p className="text-amber-600 dark:text-amber-500">Price ≥ 95% of 52w High + Volume 1.5× 20d avg + RSI 50–75</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900">
            <p className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">🟢 Quality Compounder</p>
            <p className="text-emerald-600 dark:text-emerald-500">Structural strength (MA50 &gt; MA200) + 1Y return ≥ 40%</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-100 dark:border-blue-900">
            <p className="font-bold text-blue-700 dark:text-blue-400 mb-1">🔵 Momentum Play</p>
            <p className="text-blue-600 dark:text-blue-500">Structural strength + 6M return ≥ 30%</p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900">
            <p className="font-bold text-red-700 dark:text-red-400 mb-1">🔴 Avoid</p>
            <p className="text-red-600 dark:text-red-500">No structural strength or weak returns — skip</p>
          </div>
        </div>
      </div>
    </div>
  );
}
