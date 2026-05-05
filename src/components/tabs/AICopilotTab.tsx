import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertCircle, Sparkles } from 'lucide-react';
import type { StockResult, ChatMessage } from '@/lib/types';
import { fmtINRDecimals, fmtPct, fmtNum } from '@/lib/utils';

interface AICopilotTabProps {
  stocks: StockResult[];
  geminiApiKey: string;
  onGeminiKeyChange: (k: string) => void;
}

const SUGGESTED_PROMPTS = [
  'Summarize the recent news impact on this stock',
  'Why did this stock fail the V4 signal criteria?',
  'Given the ATR, are the price targets realistic?',
  'Compare the risk/reward ratio to a safer investment',
  'What sector tailwinds or headwinds apply here?',
];

export default function AICopilotTab({ stocks, geminiApiKey, onGeminiKeyChange }: AICopilotTabProps) {
  const [selectedTicker, setSelectedTicker] = useState(stocks[0]?.ticker ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const stock = stocks.find(s => s.ticker === selectedTicker) ?? stocks[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset chat when stock changes
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [selectedTicker]);

  const buildSystemContext = (s: StockResult) => `
You are a quantitative swing trading assistant for Indian NSE stocks.
Analyze the following stock data and answer the user's question directly, concisely, and in plain English.
Use ₹ for prices. Be specific to the numbers provided.

=== STOCK DATA: ${s.ticker} ===
Rating: ${s.rating}
Current Price: ₹${fmtINRDecimals(s.price)}
Day Change: ${fmtPct(s.change)}
RSI (14-day): ${fmtNum(s.rsi, 1)}
V4 Signal: ${s.v4Signal ? 'PASS (Near 52w high + volume surge + RSI 50-75)' : 'FAIL'}
6M Return: ${fmtPct(s.ret6m)}
1Y Return: ${fmtPct(s.ret1y)}
ATR: ₹${fmtNum(s.atr)}
Structural Strength: ${s.structural ? 'YES (MA50 > MA200, price > MA200 — bullish)' : 'NO (bearish structure)'}

Trade Plan:
- Entry: ₹${fmtINRDecimals(s.price * 1.005)}
- Stop Loss: ₹${fmtINRDecimals(s.stop)} (${fmtPct(s.stop / s.price - 1, false)} from CMP)
- Target 1 (+1.5 ATR): ₹${fmtINRDecimals(s.target1)}
- Target 2 (+3.0 ATR): ₹${fmtINRDecimals(s.target2)}
- Shares: ${s.shares}

Key Levels:
- Imm. Resistance: ₹${fmtINRDecimals(s.immRes)}
- Major Resistance: ₹${fmtINRDecimals(s.majRes)}
- Support Zone: ₹${fmtINRDecimals(s.supZone)}
- Breakdown Level: ₹${fmtINRDecimals(s.breakdown)}

Fundamentals:
- Sector: ${s.sector}
- MCap: ${s.mcap}
- P/E: ${s.pe ?? 'N/A'}
- ROE: ${s.roe != null ? fmtPct(s.roe, false) : 'N/A'}
`;

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || !geminiApiKey || !stock) return;
    setError('');
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: buildSystemContext(stock) + '\n\nUser question: ' + prompt }],
              },
            ],
            generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message ?? `API error ${res.status}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response received.';
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-full">
      {/* Left: Context Panel */}
      <div className="space-y-4">
        <div className="panel-card">
          <p className="panel-title">🤖 AI Context</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Stock Context</label>
              <select
                value={selectedTicker}
                onChange={e => setSelectedTicker(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {stocks.map(s => (
                  <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.score > 0 ? '✓' : '—'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Gemini API Key</label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={e => onGeminiKeyChange(e.target.value)}
                placeholder="AIza..."
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-slate-400"
              />
              {!geminiApiKey && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  Get a free key at aistudio.google.com
                </p>
              )}
            </div>
          </div>
        </div>

        {stock && (
          <div className="panel-card">
            <p className="panel-title">📊 Loaded Context</p>
            <div className="space-y-1.5 text-xs">
              {[
                ['Ticker', stock.ticker],
                ['Rating', stock.rating],
                ['Price', fmtINRDecimals(stock.price)],
                ['RSI', fmtNum(stock.rsi, 1)],
                ['V4 Signal', stock.v4Signal ? '✓ PASS' : '✗ FAIL'],
                ['1Y Return', fmtPct(stock.ret1y)],
                ['Stop', fmtINRDecimals(stock.stop)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">{k}</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="panel-card">
          <p className="panel-title">💡 Suggested Prompts</p>
          <div className="space-y-2">
            {SUGGESTED_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={!geminiApiKey || loading}
                className="w-full text-left text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Chat */}
      <div className="lg:col-span-2 flex flex-col">
        <div className="panel-card flex-1 flex flex-col min-h-0" style={{ height: '70vh' }}>
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              AI Co-Pilot — {stock?.ticker ?? 'Select a stock'}
            </h3>
            <span className="badge-slate text-xs">Gemini 1.5 Pro</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <Bot className="w-12 h-12" />
                <div className="text-center">
                  <p className="font-semibold text-slate-500 dark:text-slate-400">Ready to analyse</p>
                  <p className="text-sm mt-1">
                    {geminiApiKey ? `Stock context for ${stock?.ticker} is loaded. Ask anything!` : 'Enter your Gemini API key to begin.'}
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}
                <div className={`max-w-xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={geminiApiKey ? `Ask about ${stock?.ticker}...` : 'Enter API key to enable AI...'}
                disabled={!geminiApiKey || loading}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 placeholder:text-slate-400"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!geminiApiKey || loading || !input.trim()}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
