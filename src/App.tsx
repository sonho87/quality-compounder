import { useState, useEffect, useCallback, useRef } from 'react';
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
  dataSource: 'csv',
  dhanClientId: '',
  dhanAccessToken: '',
  kiteApiKey: '',
  kiteApiSecret: '',
  kiteAccessToken: '',
  kiteProxyUrl: '',
  geminiApiKey: '',
};

// Batch size for Yahoo Finance API calls
const YAHOO_BATCH_SIZE = 10;

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

  const [stocks, setStocks] = useState<StockResult[]>([]);  // Start empty
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');

  // Screening progress state
  const [screening, setScreening] = useState(false);
  const [screenProgress, setScreenProgress] = useState({ done: 0, total: 0, errors: 0 });
  const abortRef = useRef(false);

  // When Kite OAuth finishes loading, adopt live data
  useEffect(() => {
    if (kiteStocks && kiteStocks.length > 0) {
      setStocks(kiteStocks);
      setSelectedTicker(kiteStocks[0].ticker);
    }
  }, [kiteStocks]);

  // When user switches data source radio button, reset stocks accordingly
  useEffect(() => {
    if (kiteStocks && kiteStocks.length > 0) return;
    if (settings.dataSource === 'mock') {
      setStocks(MOCK_STOCKS);
      setSelectedTicker(MOCK_STOCKS[0]?.ticker ?? '');
    } else if (settings.dataSource === 'kite' || settings.dataSource === 'dhan') {
      if (LIVE_STOCKS.length > 0) {
        setStocks(LIVE_STOCKS);
        setSelectedTicker(LIVE_STOCKS[0]?.ticker ?? '');
      }
    }
    // 'csv' mode: stocks are set by screenSymbols, don't reset here
  }, [settings.dataSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLiveData = (kiteStocks && kiteStocks.length > 0) || sessionState.status === 'ready';

  // Dark mode sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('qt-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleSettingsChange = (patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  // ─── CSV UPLOAD → Yahoo Finance Screening Pipeline ─────────────────────────
  // Sends symbols in batches of 10 to /api/yahoo-screen, accumulates results
  const screenSymbols = useCallback(async (symbols: string[]) => {
    setScreening(true);
    setScreenProgress({ done: 0, total: symbols.length, errors: 0 });
    setStocks([]);
    abortRef.current = false;

    const allResults: StockResult[] = [];
    let errorCount = 0;

    for (let i = 0; i < symbols.length; i += YAHOO_BATCH_SIZE) {
      if (abortRef.current) break;

      const batch = symbols.slice(i, i + YAHOO_BATCH_SIZE);

      try {
        const res = await fetch('/api/yahoo-screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: batch,
            capital: settings.capitalPerTrade,
          }),
        });

        if (!res.ok) {
          errorCount += batch.length;
          setScreenProgress(p => ({ ...p, done: p.done + batch.length, errors: p.errors + batch.length }));
          continue;
        }

        const data = await res.json() as {
          results: StockResult[];
          errors?: string[];
        };

        if (data.results?.length > 0) {
          allResults.push(...data.results);
          // Progressively update the UI — show results as they come in
          setStocks(prev => [...prev, ...data.results]);
          if (!selectedTicker && data.results[0]) {
            setSelectedTicker(data.results[0].ticker);
          }
        }

        errorCount += data.errors?.length ?? 0;
      } catch (err) {
        console.error('Screening batch error:', err);
        errorCount += batch.length;
      }

      setScreenProgress({
        done: Math.min(i + YAHOO_BATCH_SIZE, symbols.length),
        total: symbols.length,
        errors: errorCount,
      });
    }

    setScreening(false);
  }, [settings.capitalPerTrade]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSymbolsLoaded = (symbols: string[]) => {
    // CSV uploaded — kick off the Yahoo Finance screening pipeline
    screenSymbols(symbols);
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

  const [resetKey, setResetKey] = useState(0);

  const handleClearCache = () => {
    abortRef.current = true; // Stop any in-progress screening
    setStocks([]);
    setPortfolio([]);
    setSettings(DEFAULT_SETTINGS);
    setSelectedTicker('');
    setActiveTab('overview');
    setScreening(false);
    setScreenProgress({ done: 0, total: 0, errors: 0 });
    setResetKey(k => k + 1);
  };

  const navigateToTearSheet = () => setActiveTab('tearsheet');

  const v4Count = stocks.filter(s => s.v4Signal).length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <div className={`flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <Sidebar
          key={resetKey}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onSymbolsLoaded={handleSymbolsLoaded}
          symbolCount={stocks.length}
          onClearCache={handleClearCache}
          screening={screening}
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
              <span className="badge-slate font-mono text-xs">V8.4</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {stocks.length > 0 && <span className="badge-green">{stocks.length} Stocks</span>}
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

            {/* Screening progress banner */}
            {screening && (
              <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Screening {screenProgress.done}/{screenProgress.total} stocks via Yahoo Finance...
                  </span>
                  {screenProgress.errors > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      ({screenProgress.errors} errors)
                    </span>
                  )}
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${screenProgress.total > 0 ? (screenProgress.done / screenProgress.total * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">
                  Fetching 3yr OHLCV + fundamentals → running V8.4 screener (RSI, structural strength, V4 signals)
                </p>
              </div>
            )}

            {/* Screening complete banner */}
            {!screening && screenProgress.total > 0 && stocks.length > 0 && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Screening complete — {stocks.length} stocks processed · {v4Count} V4 signals found
                </span>
                {screenProgress.errors > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    · {screenProgress.errors} failed (insufficient data or API error)
                  </span>
                )}
              </div>
            )}

            {/* Snapshot banner for Kite/Dhan API modes */}
            {sessionState.status === 'none' && LIVE_FETCH_TIME && stocks.length > 0 && settings.dataSource !== 'csv' && settings.dataSource !== 'mock' && (
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
