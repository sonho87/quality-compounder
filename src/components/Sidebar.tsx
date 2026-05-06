import { useState } from 'react';
import { Upload, Database, Key, Trash2, ChevronDown, ChevronRight, IndianRupee, BarChart2 } from 'lucide-react';
import type { AppSettings, DataSource } from '@/lib/types';
import { parseCSVSymbols } from '@/lib/api';

interface SidebarProps {
  settings: AppSettings;
  onSettingsChange: (s: Partial<AppSettings>) => void;
  onSymbolsLoaded: (symbols: string[]) => void;
  symbolCount: number;
  onClearCache: () => void;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full mb-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {icon} {title}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && children}
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="mb-2.5">
      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder:text-slate-400"
      />
    </div>
  );
}

export default function Sidebar({ settings, onSettingsChange, onSymbolsLoaded, symbolCount, onClearCache }: SidebarProps) {
  const [csvError, setCsvError] = useState('');
  const [csvLoaded, setCsvLoaded] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const symbols = parseCSVSymbols(ev.target?.result as string);
        if (symbols.length === 0) throw new Error('No valid symbols found');
        onSymbolsLoaded(symbols);
        setCsvLoaded(true);
        onSettingsChange({ dataSource: 'csv' });
      } catch (err) {
        setCsvError((err as Error).message);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-uploaded after clear cache
    e.target.value = '';
  };

  return (
    <aside className="w-72 min-h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">Quant Terminal</p>
            <p className="text-xs text-slate-400 font-mono">V7.0 Premium</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {/* CSV Upload */}
        <Section title="Stock List" icon={<Upload className="w-3.5 h-3.5" />}>
          <label className="flex flex-col items-center gap-2 cursor-pointer border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors">
            <Upload className="w-5 h-5 text-slate-400" />
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Upload NSE CSV</p>
              <p className="text-xs text-slate-400">Requires SYMBOL column</p>
            </div>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          {csvLoaded && (
            <p className="mt-2 text-xs text-emerald-600 font-semibold text-center">
              ✓ {symbolCount} stocks loaded
            </p>
          )}
          {csvError && <p className="mt-2 text-xs text-red-500 font-medium">{csvError}</p>}
          {!csvLoaded && (
            <p className="mt-2 text-xs text-slate-400 text-center">
              Upload NSE CSV to start screening
            </p>
          )}
        </Section>

        {/* Trade Settings */}
        <Section title="Risk Settings" icon={<IndianRupee className="w-3.5 h-3.5" />}>
          <InputField
            label="Capital Per Trade (₹)"
            type="number"
            value={settings.capitalPerTrade}
            onChange={v => onSettingsChange({ capitalPerTrade: Number(v) })}
          />
          <InputField
            label="Min Daily Traded Val (Lakhs)"
            type="number"
            value={settings.minTradeValLakhs}
            onChange={v => onSettingsChange({ minTradeValLakhs: Number(v) })}
          />
        </Section>

        {/* Data Source */}
        <Section title="Data Source" icon={<Database className="w-3.5 h-3.5" />}>
          {(['mock', 'csv', 'dhan', 'kite'] as DataSource[]).map(src => (
            <label key={src} className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="radio"
                name="datasource"
                value={src}
                checked={settings.dataSource === src}
                onChange={() => onSettingsChange({ dataSource: src })}
                className="accent-emerald-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                {src === 'mock' ? 'Demo Data' : src === 'csv' ? 'CSV Upload' : src === 'dhan' ? 'Dhan API' : 'Kite API'}
              </span>
            </label>
          ))}

          {settings.dataSource === 'dhan' && (
            <div className="mt-3 space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-400">Dhan API Config</p>
              <InputField label="Client ID" value={settings.dhanClientId} onChange={v => onSettingsChange({ dhanClientId: v })} placeholder="Enter Client ID" />
              <InputField label="Access Token" type="password" value={settings.dhanAccessToken} onChange={v => onSettingsChange({ dhanAccessToken: v })} placeholder="Enter Access Token" />
            </div>
          )}

          {settings.dataSource === 'kite' && (
            <div className="mt-3 space-y-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-100 dark:border-amber-900">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Kite Connect OAuth</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Enter your Zerodha app credentials, then click <b>Login with Kite</b> above.</p>
              <InputField label="API Key" value={settings.kiteApiKey} onChange={v => onSettingsChange({ kiteApiKey: v })} placeholder="abcdefghij" />
              <InputField label="API Secret" type="password" value={settings.kiteApiSecret ?? ''} onChange={v => onSettingsChange({ kiteApiSecret: v })} placeholder="Enter API Secret" />
              <p className="text-xs text-amber-500 dark:text-amber-600 pt-1">Get credentials at <span className="font-semibold">kite.zerodha.com/developers</span></p>
            </div>
          )}
        </Section>

        {/* AI Co-Pilot */}
        <Section title="AI Co-Pilot" icon={<Key className="w-3.5 h-3.5" />}>
          <InputField
            label="Gemini API Key"
            type="password"
            value={settings.geminiApiKey}
            onChange={v => onSettingsChange({ geminiApiKey: v })}
            placeholder="Enter Gemini API key"
          />
          <p className="text-xs text-slate-400 mt-1">
            Get a free key at{' '}
            <span className="text-blue-500 font-medium">aistudio.google.com</span>
          </p>
        </Section>

        {/* TradingView & Screener info */}
        <Section title="Integrations" icon={<BarChart2 className="w-3.5 h-3.5" />}>
          <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
              <span><b>TradingView</b> — Free widget, live on Tear Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
              <span><b>Screener.in</b> — Deep-link per stock, no official API</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
              <span><b>Dhan API</b> — Direct browser fetch supported</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0"></span>
              <span><b>Kite API</b> — Needs proxy (CORS policy)</span>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={onClearCache}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Cache & Reset
        </button>
      </div>
    </aside>
  );
}
