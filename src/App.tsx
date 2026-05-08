import { useState, useCallback, useRef } from 'react';
import { Zap, Printer, Upload, Trash2, IndianRupee, ChevronDown, ChevronRight, BarChart2 } from 'lucide-react';
import type { StockResult, PortfolioPosition } from '@/lib/types';
import { parseCSVSymbols } from '@/lib/api';
import OverviewTab from '@/components/tabs/OverviewTab';
import ScreenerTab from '@/components/tabs/ScreenerTab';
import TearSheetTab from '@/components/tabs/TearSheetTab';

// ─── DEFAULT SETTINGS ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  capitalPerTrade: 33000,
  minTradeValLakhs: 50,
};

type TabId = 'overview' | 'screener' | 'tearsheet';

export default function App() {
  // ─── STATE ────────────────────────────────────────────────────────────────────
  const [stocks, setStocks] = useState<StockResult[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedTicker, setSelectedTicker] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [screening, setScreening] = useState(false);
  const [screenProgress, setScreenProgress] = useState({ done: 0, total: 0 });
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvError, setCsvError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── SIDEBAR SECTIONS ─────────────────────────────────────────────────────────
  const [sectionsOpen, setSectionsOpen] = useState({ stockList: true, risk: true, integrations: false });
  const toggleSection = (key: keyof typeof sectionsOpen) =>
    setSectionsOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── SCREENING PIPELINE ───────────────────────────────────────────────────────
  const screenSymbols = useCallback(async (symbols: string[]) => {
    setScreening(true);
    setScreenProgress({ done: 0, total: symbols.length });
    setStocks([]);
    setCsvError('');

    const BATCH_SIZE = 10;
    const allResults: StockResult[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch('/api/yahoo-screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: batch, capital: settings.capitalPerTrade }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            allResults.push(...data.results);
            setStocks([...allResults]);
          }
        }
      } catch (err) {
        console.error('Batch error:', err);
      }
      setScreenProgress({ done: Math.min(i + BATCH_SIZE, symbols.length), total: symbols.length });
    }

    setScreening(false);
    setCsvLoaded(true);
    if (allResults.length > 0 && !selectedTicker) {
      setSelectedTicker(allResults[0].ticker);
    }
  }, [settings.capitalPerTrade, selectedTicker]);

  // ─── CSV UPLOAD ───────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const symbols = parseCSVSymbols(ev.target?.result as string);
        if (symbols.length === 0) throw new Error('No valid symbols found');
        screenSymbols(symbols);
      } catch (err) {
        setCsvError((err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── PORTFOLIO ────────────────────────────────────────────────────────────────
  const addToPortfolio = (stock: StockResult) => {
    if (portfolio.some(p => p.ticker === stock.ticker)) return;
    setPortfolio(prev => [...prev, {
      ticker: stock.ticker,
      entryPrice: stock.price,
      shares: stock.shares,
      investment: stock.investment,
      currentPrice: stock.price,
      target1: stock.target1,
      target2: stock.target2,
      stop: stock.stop,
      addedAt: new Date().toISOString(),
    }]);
  };

  // ─── CLEAR / RESET ────────────────────────────────────────────────────────────
  const handleClear = () => {
    setStocks([]);
    setPortfolio([]);
    setCsvLoaded(false);
    setCsvError('');
    setSelectedTicker('');
    setScreenProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── PRINT / EXPORT ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  // ─── NAVIGATION ───────────────────────────────────────────────────────────────
  const navigateToTearSheet = () => setActiveTab('tearsheet');

  const v4Count = stocks.filter(s => s.v4Signal).length;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'screener', label: 'Full Screener' },
    { id: 'tearsheet', label: 'Tear Sheet' },
  ];

  return (
    <div className="flex h-screen w-full bg-white text-slate-900 overflow-hidden print:overflow-visible print:h-auto">

      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full overflow-y-auto print:hidden">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
            <div>
              <p className="font-bold text-slate-900 leading-tight">Quant Terminal</p>
              <p className="text-xs text-slate-400 font-mono">V8.4 Premium</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {/* ── Stock List Upload ── */}
          <div className="border-b border-slate-200 pb-4 mb-4">
            <button onClick={() => toggleSection('stockList')} className="flex items-center justify-between w-full mb-3 text-left">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Upload className="w-3.5 h-3.5" /> Stock List
              </span>
              {sectionsOpen.stockList ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {sectionsOpen.stockList && (
              <>
                <label className="flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <div className="text-center">
                    <p className="text-xs font-semibold text-slate-600">Upload NSE CSV</p>
                    <p className="text-xs text-slate-400">Requires SYMBOL column</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
                {screening && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-blue-600 font-semibold">
                        Screening {screenProgress.done}/{screenProgress.total}...
                      </p>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: screenProgress.total > 0 ? `${(screenProgress.done / screenProgress.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
                {!screening && csvLoaded && stocks.length > 0 && (
                  <p className="mt-2 text-xs text-emerald-600 font-semibold text-center">
                    ✓ {stocks.length} stocks screened · {v4Count} V4 signals
                  </p>
                )}
                {csvError && <p className="mt-2 text-xs text-red-500 font-medium">{csvError}</p>}
                {!csvLoaded && !screening && (
                  <p className="mt-2 text-xs text-slate-400 text-center">
                    Upload NSE CSV to start screening
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Risk Settings ── */}
          <div className="border-b border-slate-200 pb-4 mb-4">
            <button onClick={() => toggleSection('risk')} className="flex items-center justify-between w-full mb-3 text-left">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <IndianRupee className="w-3.5 h-3.5" /> Risk Settings
              </span>
              {sectionsOpen.risk ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {sectionsOpen.risk && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-medium">Capital Per Trade (₹)</label>
                  <input
                    type="number"
                    value={settings.capitalPerTrade}
                    onChange={e => setSettings(s => ({ ...s, capitalPerTrade: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-medium">Min Daily Traded Val (₹L)</label>
                  <input
                    type="number"
                    value={settings.minTradeValLakhs}
                    onChange={e => setSettings(s => ({ ...s, minTradeValLakhs: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Integrations Info ── */}
          <div className="pb-4 mb-4">
            <button onClick={() => toggleSection('integrations')} className="flex items-center justify-between w-full mb-3 text-left">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <BarChart2 className="w-3.5 h-3.5" /> Data Sources
              </span>
              {sectionsOpen.integrations ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {sectionsOpen.integrations && (
              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span><b>Yahoo Finance</b> — OHLCV + RSI + ATR</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span><b>Screener.in</b> — PE, ROE, MCap, Growth</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span><b>TradingView</b> — Charts on Tear Sheet</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 space-y-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Cache & Reset
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 flex flex-col h-full bg-white relative overflow-hidden print:overflow-visible">
        {/* ── TOP BAR: badges + tabs ── */}
        <div className="border-b border-slate-200 px-6 pt-3 pb-0 flex flex-col print:hidden">
          {/* Status badges */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
              {stocks.length} Stocks
            </span>
            {v4Count > 0 && (
              <span className="text-xs font-bold text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-md flex items-center gap-1">
                <Zap className="w-3 h-3 fill-green-600" /> {v4Count} V4 Signals
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-100 text-slate-900 border border-b-0 border-slate-200 -mb-px'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Print Header (only visible when printing) ── */}
        <div className="hidden print:block px-6 py-4 border-b border-slate-200">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5" /> Quant Terminal V8.4 — Screening Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {stocks.length} stocks · {v4Count} V4 signals · Printed {new Date().toLocaleDateString('en-IN')}
          </p>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              stocks={stocks}
              portfolio={portfolio}
              onSelectTicker={setSelectedTicker}
              onNavigateToTearSheet={navigateToTearSheet}
            />
          )}
          {activeTab === 'screener' && (
            <ScreenerTab
              stocks={stocks}
              portfolio={portfolio}
              onAddToPortfolio={addToPortfolio}
              onSelectTicker={setSelectedTicker}
              onNavigateToTearSheet={navigateToTearSheet}
            />
          )}
          {activeTab === 'tearsheet' && (
            <TearSheetTab
              stocks={stocks}
              selectedTicker={selectedTicker || (stocks[0]?.ticker ?? '')}
              onSelectTicker={setSelectedTicker}
              portfolio={portfolio}
              onAddToPortfolio={addToPortfolio}
              isDark={false}
              capitalPerTrade={settings.capitalPerTrade}
            />
          )}
        </div>
      </main>
    </div>
  );
}
