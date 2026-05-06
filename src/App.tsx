import { useState, useEffect } from 'react';
import { Sun, Moon, LayoutDashboard, SlidersHorizontal, FileBarChart2, Bot, Menu, X } from 'lucide-react';
import type { AppSettings, PortfolioPosition, StockResult } from '@/lib/types';
import { MOCK_STOCKS, MOCK_INDICES } from '@/lib/mockData';
import { LIVE_STOCKS, LIVE_INDICES, LIVE_FETCH_TIME } from '@/lib/liveData';
import MarketBar from '@/components/MarketBar';
import Sidebar from '@/components/Sidebar';
import OverviewTab from '@/components/tabs/OverviewTab';
import ScreenerTab from '@/components/tabs/ScreenerTab';
import TearSheetTab from '@/components/tabs/TearSheetTab';
import AICopilotTab from '@/components/tabs/AICopilotTab';
import KiteLoginBanner from '@/components/KiteLoginBanner';
import { useKiteData } from '@/hooks/useKiteData';

type Tab = 'overview' | 'screener' | 'tearsheet' | 'ai';

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview',   label: 'Overview',    icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'screener',   label: 'Screener',    icon: <SlidersHorizontal className="w-4 h-4" /> },
  { key: 'tearsheet',  label: 'Tear Sheet',  icon: <FileBarChart2 className="w-4 h-4" /> },
  { key: 'ai',         label: 'AI Co-Pilot', icon: <Bot className="w-4 h-4" /> },
];

const DEFAULT_SETTINGS: AppSettings = {
  capitalPerTrade: 33000,
  minTradeValLakhs: 50,
  dataSource: 'mock',
  dhanClientId: '',
  dhanAccessToken: '',
  kiteApiKey: '',
  kiteApiSecret: '',
  kiteAccessToken: '',
  kiteProxyUrl: '',
  geminiApiKey: '',
};

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('qt-theme') === 'dark' ||
      (!localStorage.getItem('qt-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Kite OAuth live data hook
  const { sessionState, userName, stocks: kiteStocks, refresh: kiteRefresh, logout: kiteLogout }
    = useKiteData(settings.capitalPerTrade);

  // Resolve which stock list to show based on data source priority:
  //   Kite OAuth (fresh) → Demo (mock) → CSV → LIVE snapshot → mock fallback
  const getBaseStocks = (): StockResult[] => {
    if (kiteStocks && kiteStocks.length > 0) return kiteStocks;
    if (settings.dataSource === 'mock') return MOCK_STOCKS;
    if (LIVE_STOCKS.length > 0) return LIVE_STOCKS;
    return MOCK_STOCKS;
  };

  const [stocks, setStocks] = useState<StockResult[]>(getBaseStocks);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [selectedTicker, setSelectedTicker] = useState(() => getBaseStocks()[0]?.ticker ?? '');

  // When Kite OAuth finishes loading, adopt live data
  useEffect(() => {
    if (kiteStocks && kiteStocks.length > 0) {
      setStocks(kiteStocks);
      setSelectedTicker(kiteStocks[0].ticker);
    }
  }, [kiteStocks]);

  // When user switches data source radio button, reset stocks accordingly
  useEffect(() => {
    if (kiteStocks && kiteStocks.length > 0) return; // Kite live data always wins
    if (settings.dataSource === 'mock') {
      setStocks(MOCK_STOCKS);
      setSelectedTicker(MOCK_STOCKS[0]?.ticker ?? '');
    } else if (settings.dataSource === 'kite' || settings.dataSource === 'dhan') {
      // For API modes, reset to LIVE snapshot while user logs in
      const base = LIVE_STOCKS.length > 0 ? LIVE_STOCKS : MOCK_STOCKS;
      setStocks(base);
      setSelectedTicker(base[0]?.ticker ?? '');
    }
    // 'csv' mode: stocks are set by handleSymbolsLoaded, don't reset here
  }, [settings.dataSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLiveData = LIVE_STOCKS.length > 0 || sessionState.status === 'ready';

  // Dark mode sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('qt-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleSettingsChange = (patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const handleSymbolsLoaded = (symbols: string[]) => {
    // When CSV is uploaded, generate placeholder stock results using mock data as a base
    // In production these would be fetched from Dhan/Kite and evaluated by indicators.ts
    const symbolSet = new Set(symbols.map(s => s.replace('.NS', '').replace('.BO', '')));
    // Always match CSV symbols against MOCK_STOCKS (curated, correct tier data)
    // LIVE_STOCKS has outdated prices and all show CHOPPY — not useful for matching
    const dataSource = kiteStocks ?? MOCK_STOCKS;
    const matched = dataSource.filter(s => symbolSet.has(s.ticker));
    // For symbols with no data, create placeholder entries
    // No slice limit — show ALL symbols from the CSV
    const unmatched = symbols
      .map(s => s.replace('.NS', '').replace('.BO', ''))
      .filter(s => !dataSource.find(m => m.ticker === s))
      .map((ticker): StockResult => ({
        ticker, fullTicker: `${ticker}.NS`,
        rating: '🔴 TIER 5: CHOPPY', score: 0, v4Signal: false,
        price: 0, change: 0, rsi: 50, tradedVal: 0,
        ret6m: 0, ret1y: 0, ret3y: 0, target1: 0, target2: 0, stop: 0,
        shares: 0, investment: 0, immRes: 0, majRes: 0, supZone: 0, breakdown: 0,
        structural: false, atr: 0, entryLimit: 0,
        sector: 'N/A', mcap: 'N/A', pe: null, roe: null, bookVal: 'N/A', divYield: 'N/A',
      }));
    setStocks([...matched, ...unmatched]);
    if (matched.length > 0) setSelectedTicker(matched[0].ticker);
  };

  const handleAddToPortfolio = (stock: StockResult) => {
    if (portfolio.find(p => p.ticker === stock.ticker)) return;
    const position: PortfolioPosition = {
      ticker: stock.ticker,
      entryPrice: stock.price * 1.005,
      shares: stock.shares,
      investment: stock.investment,
      currentPrice: stock.price,
      target1: stock.target1,
      target2: stock.target2,
      stop: stock.stop,
      addedAt: new Date().toLocaleDateString('en-IN'),
    };
    setPortfolio(prev => [...prev, position]);
  };

  const handleClearCache = () => {
    setStocks(LIVE_STOCKS.length > 0 ? LIVE_STOCKS : MOCK_STOCKS);
    setPortfolio([]);
    setSettings(DEFAULT_SETTINGS);
    setSelectedTicker((LIVE_STOCKS[0] ?? MOCK_STOCKS[0])?.ticker ?? '');
    setActiveTab('overview');
  };

  const navigateToTearSheet = () => setActiveTab('tearsheet');

  const v4Count = stocks.filter(s => s.v4Signal).length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <div className={`flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <Sidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onSymbolsLoaded={handleSymbolsLoaded}
          symbolCount={stocks.length}
          onClearCache={handleClearCache}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between gap-4 z-10">
          {/* Left: toggle + branding */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <span className="font-black text-slate-900 dark:text-slate-100 text-lg tracking-tight">Quant Terminal</span>
              <span className="badge-slate font-mono text-xs">V7.0</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="badge-green">{stocks.length} Stocks</span>
              {v4Count > 0 && (
                <span className="badge-amber">{v4Count} V4 Signals</span>
              )}
              {portfolio.length > 0 && (
                <span className="badge-blue">{portfolio.length} Positions</span>
              )}
            </div>
          </div>

          {/* Right: tabs + dark mode */}
          <div className="flex items-center gap-1">
            {/* Tab nav in header for wide screens */}
            <nav className="hidden md:flex items-center gap-0.5 mr-3">
              {TAB_CONFIG.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === tab.key
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.key === 'ai' && settings.geminiApiKey && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  )}
                </button>
              ))}
            </nav>

            <button
              onClick={() => setIsDark(d => !d)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="md:hidden flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto flex-shrink-0">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
            {/* Kite login / live data banner */}
            <KiteLoginBanner
              sessionState={sessionState}
              userName={userName}
              onRefresh={kiteRefresh}
              onLogout={kiteLogout}
              kiteApiKey={settings.kiteApiKey}
              kiteApiSecret={settings.kiteApiSecret}
            />

            {/* Fallback: show last-saved data timestamp if no fresh Kite session */}
            {sessionState.status === 'none' && LIVE_FETCH_TIME && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-500 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                Showing snapshot from {LIVE_FETCH_TIME}
                <span className="ml-auto text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ Login with Kite above to get today's data
                </span>
              </div>
            )}

            {/* Market Bar — shown on overview + screener */}
            {(activeTab === 'overview' || activeTab === 'screener') && (
              <MarketBar indices={isLiveData ? LIVE_INDICES : MOCK_INDICES} />
            )}

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
                onAddToPortfolio={handleAddToPortfolio}
                onSelectTicker={setSelectedTicker}
                onNavigateToTearSheet={navigateToTearSheet}
              />
            )}
            {activeTab === 'tearsheet' && (
              <TearSheetTab
                stocks={stocks}
                selectedTicker={selectedTicker}
                onSelectTicker={setSelectedTicker}
                portfolio={portfolio}
                onAddToPortfolio={handleAddToPortfolio}
                isDark={isDark}
                capitalPerTrade={settings.capitalPerTrade}
              />
            )}
            {activeTab === 'ai' && (
              <AICopilotTab
                stocks={stocks}
                geminiApiKey={settings.geminiApiKey}
                onGeminiKeyChange={v => handleSettingsChange({ geminiApiKey: v })}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
