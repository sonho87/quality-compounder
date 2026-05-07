import React, { useState } from 'react';
import { 
  Zap, Database, Settings2, Key, ChevronRight, Upload, 
  Search, TrendingUp, TrendingDown, Filter, BarChart2 
} from 'lucide-react';

// Import your data (make sure the paths match your project)
import { LIVE_STOCKS, LIVE_INDICES, LIVE_FETCH_TIME } from '@/lib/liveData';

// If you are using Shadcn UI, ensure these imports work, otherwise replace with standard div/button tags
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Screener State
  const [screenerSearch, setScreenerSearch] = useState('');
  const [screenerTier, setScreenerTier] = useState('All Tiers');
  const [screenerV4Only, setScreenerV4Only] = useState(false);

  // Overview State
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewFilter, setOverviewFilter] = useState('V4 Signals');

  // --- FILTER LOGIC ---
  const overviewStocks = LIVE_STOCKS.filter((stock) => {
    if (overviewSearch && !stock.ticker.toLowerCase().includes(overviewSearch.toLowerCase())) return false;
    if (overviewFilter === 'V4 Signals') return stock.v4Signal;
    if (overviewFilter === 'Quality') return stock.rating.includes('TIER 2') || stock.rating.includes('QUALITY');
    if (overviewFilter === 'Monopoly') return stock.rating.includes('TIER 1');
    if (overviewFilter === 'Emerging') return stock.rating.includes('TIER 3');
    if (overviewFilter === 'Momentum') return stock.rating.includes('TIER 4');
    return true;
  });

  const screenerStocks = LIVE_STOCKS.filter((stock) => {
    if (screenerSearch && !stock.ticker.toLowerCase().includes(screenerSearch.toLowerCase())) return false;
    if (screenerTier !== 'All Tiers' && stock.rating !== screenerTier) return false;
    if (screenerV4Only && !stock.v4Signal) return false;
    return true;
  });

  // Helper to colorize badges based on Tier
  const getBadgeStyle = (rating: string) => {
    if (rating.includes('TIER 1')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (rating.includes('TIER 2')) return 'bg-green-100 text-green-800 border-green-200';
    if (rating.includes('PROVISIONAL')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (rating.includes('TIER 3')) return 'bg-yellow-50 text-yellow-700 border-yellow-100';
    if (rating.includes('TIER 4')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="flex h-screen w-full bg-white font-sans text-slate-900 overflow-hidden">
      
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="w-80 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col h-full overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Zap className="text-amber-500 w-5 h-5 fill-amber-500" /> Quant Terminal
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 ml-7">V8.4 Premium</p>
        </div>

        <div className="p-6 border-b border-slate-200 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-3 h-3" /> Stock List
          </h2>
          <Button variant="outline" className="w-full justify-start gap-2 bg-white text-slate-600">
            <Upload className="w-4 h-4 text-slate-400" /> Upload NSE CSV
          </Button>
          <p className="text-sm font-medium text-slate-700 pt-2">{LIVE_STOCKS.length} stocks loaded</p>
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 mt-2">
            <p className="text-sm text-slate-700 mb-3 leading-snug">
              Login with Kite daily to refresh real-time NSE data.
            </p>
            <Button className="w-full bg-[#FF5722] hover:bg-[#E64A19] text-white shadow-sm">
              Login with Kite <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>

        <div className="p-6 border-b border-slate-200 space-y-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Settings2 className="w-3 h-3" /> Risk Settings
          </h2>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Capital Per Trade (₹)</label>
            <Input defaultValue="33000" className="h-8 bg-white" />
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 flex flex-col h-full bg-white relative">
        <div className="absolute top-4 left-6 flex gap-3 z-10">
          <Badge variant="outline" className="bg-slate-50 text-slate-600">{LIVE_STOCKS.length} Stocks</Badge>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
            {LIVE_STOCKS.filter(s => s.v4Signal).length} V4 Signals
          </Badge>
          <Badge variant="outline" className="bg-slate-50 text-slate-500">Data: {LIVE_FETCH_TIME}</Badge>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col h-full" onValueChange={setActiveTab}>
          <div className="border-b border-slate-200 pt-3 px-6 flex justify-center">
            <TabsList className="bg-transparent border-none w-full max-w-md justify-between">
              <TabsTrigger value="overview" className="data-[state=active]:bg-slate-100 data-[state=active]:shadow-none rounded-t-lg rounded-b-none px-6">Overview</TabsTrigger>
              <TabsTrigger value="screener" className="data-[state=active]:bg-slate-100 data-[state=active]:shadow-none rounded-t-lg rounded-b-none px-6">Full Screener</TabsTrigger>
              <TabsTrigger value="tearsheet" className="data-[state=active]:bg-slate-100 data-[state=active]:shadow-none rounded-t-lg rounded-b-none px-6">Tear Sheet</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── OVERVIEW TAB ─── */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto p-8 m-0 outline-none">
            {/* Market Indices */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {LIVE_INDICES.map((idx) => (
                <Card key={idx.name} className="shadow-none border-slate-200 bg-slate-50/50">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{idx.name}</p>
                    <div className="flex items-baseline justify-between">
                      <p className="text-xl font-bold text-slate-800">{idx.price.toLocaleString()}</p>
                      <p className={`text-sm font-medium flex items-center ${idx.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {idx.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1"/> : <TrendingDown className="w-3 h-3 mr-1"/>}
                        {(idx.change * 100).toFixed(2)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
              <div className="flex flex-wrap gap-2">
                {['V4 Signals', 'Quality', 'Monopoly', 'Emerging', 'Momentum'].map((filterName) => (
                  <Badge 
                    key={filterName} 
                    variant={overviewFilter === filterName ? 'default' : 'secondary'}
                    className={`cursor-pointer px-3 py-1 text-xs font-medium transition-colors ${overviewFilter === filterName ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    onClick={() => setOverviewFilter(filterName)}
                  >
                    {filterName}
                  </Badge>
                ))}
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Quick search..." 
                  className="pl-9 h-9 bg-slate-50"
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Anti-Squish Table Container */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Ticker</th>
                    <th className="px-4 py-3 whitespace-nowrap">Rating</th>
                    <th className="px-4 py-3 whitespace-nowrap">V4 Signal</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Price (₹)</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {overviewStocks.slice(0, 50).map((stock) => (
                    <tr key={stock.ticker} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{stock.ticker}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge className={`font-medium shadow-none ${getBadgeStyle(stock.rating)}`}>
                          {stock.rating.replace(/['"🔴🟢🟡🔵👑⚠️]/g, '').trim()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {stock.v4Signal ? (
                          <span className="text-green-600 font-bold flex items-center gap-1.5 text-xs bg-green-50 px-2 py-1 rounded-md w-fit border border-green-100">
                            <Zap className="w-3 h-3 fill-green-600" /> PASS
                          </span>
                        ) : (<span className="text-slate-300">—</span>)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-700 whitespace-nowrap">
                        {stock.price.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.change > 0 ? '+' : ''}{(stock.change * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  {overviewStocks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No stocks match the current filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ─── SCREENER TAB ─── */}
          <TabsContent value="screener" className="flex-1 flex flex-col p-8 m-0 outline-none overflow-hidden h-full">
            <div className="flex flex-col gap-4 mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-500" /> Master Database Screener
              </h2>
              
              <div className="flex flex-wrap items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider">Tier:</span>
                  <select 
                    className="text-sm bg-white border border-slate-200 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
                    value={screenerTier}
                    onChange={(e) => setScreenerTier(e.target.value)}
                  >
                    <option value="All Tiers">All Tiers</option>
                    <option value="👑 TIER 1: MONOPOLY">Tier 1: Monopoly</option>
                    <option value="🟢 TIER 2: QUALITY">Tier 2: Quality</option>
                    <option value="⚠️ TIER 2: PROVISIONAL (Missing Data)">Tier 2: Provisional</option>
                    <option value="🟡 TIER 3: EMERGING">Tier 3: Emerging</option>
                    <option value="🔵 TIER 4: MOMENTUM">Tier 4: Momentum</option>
                  </select>
                </div>

                <div className="flex items-center gap-4">
                  <Button 
                    variant={screenerV4Only ? "default" : "outline"}
                    className={`h-8 px-3 text-xs gap-1.5 transition-all ${screenerV4Only ? 'bg-green-500 hover:bg-green-600 text-white border-green-500' : 'bg-white text-slate-600'}`}
                    onClick={() => setScreenerV4Only(!screenerV4Only)}
                  >
                    <Zap className={`w-3.5 h-3.5 ${screenerV4Only ? 'fill-white' : ''}`} /> 
                    {screenerV4Only ? 'V4 Signals Only' : 'Show All'}
                  </Button>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search ticker..." 
                      className="pl-9 h-8 bg-white"
                      value={screenerSearch}
                      onChange={(e) => setScreenerSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-2">{screenerStocks.length} records found</p>

            <div className="flex-1 border border-slate-200 rounded-lg overflow-auto">
              <table className="w-full text-sm text-left min-w-[1000px]">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs text-slate-500 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Ticker</th>
                    <th className="px-4 py-3 whitespace-nowrap">Sector</th>
                    <th className="px-4 py-3 whitespace-nowrap">Rating</th>
                    <th className="px-4 py-3 whitespace-nowrap">V4 Signal</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Price (₹)</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">RSI</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">1Y Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {screenerStocks.map((stock) => (
                    <tr key={stock.ticker} className={`transition-colors ${stock.v4Signal ? "bg-green-50/40 hover:bg-green-50" : "hover:bg-slate-50/50"}`}>
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{stock.ticker}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{stock.sector}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge className={`font-medium text-[11px] shadow-none ${getBadgeStyle(stock.rating)}`}>
                          {stock.rating.replace(/['"🔴🟢🟡🔵👑⚠️]/g, '').trim()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {stock.v4Signal ? (
                          <span className="text-green-600 font-bold flex items-center gap-1 text-[11px] bg-green-100 px-2 py-0.5 rounded border border-green-200 w-fit">
                            <Zap className="w-3 h-3 fill-green-600" /> PASS
                          </span>
                        ) : (<span className="text-slate-300">—</span>)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-700 whitespace-nowrap">
                        {stock.price.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${stock.rsi >= 70 ? 'text-red-500' : stock.rsi <= 40 ? 'text-blue-500' : 'text-slate-600'}`}>
                        {stock.rsi.toFixed(1)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${stock.ret1y >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.ret1y > 0 ? '+' : ''}{(stock.ret1y * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {screenerStocks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">No stocks match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ─── TEAR SHEET TAB (Placeholder) ─── */}
          <TabsContent value="tearsheet" className="p-8 flex items-center justify-center h-full">
            <div className="text-center text-slate-400">
               <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
               <p>Tear Sheet Component goes here.</p>
            </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
