// KiteLoginBanner.tsx
// Shown at the top of the app when no Kite session is active.
// "Login with Kite" → /api/kite-login → Kite OAuth → /api/kite-callback → back here.

import { LogIn, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export type KiteSessionState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; fetchTime: string; stockCount: number }
  | { status: 'error'; message: string };

interface Props {
  sessionState: KiteSessionState;
  userName: string;
  onRefresh: () => void;
  onLogout: () => void;
}

export default function KiteLoginBanner({ sessionState, userName, onRefresh, onLogout }: Props) {
  const handleLogin = () => {
    window.location.href = '/api/kite-login';
  };

  /* ── No session ── */
  if (sessionState.status === 'none') {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            No live data — showing last saved snapshot.
          </span>
          <span className="hidden sm:inline text-xs text-amber-700 dark:text-amber-400">
            Login with Kite daily to refresh real-time NSE data.
          </span>
        </div>
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 px-4 py-2 bg-[#387ED1] hover:bg-[#2E6AB5] active:bg-[#265A9E] text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0 shadow-sm"
        >
          <LogIn className="w-4 h-4" />
          Login with Kite
        </button>
      </div>
    );
  }

  /* ── Loading / fetching data ── */
  if (sessionState.status === 'loading') {
    return (
      <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl">
        <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          Fetching live NSE data from Kite…
        </span>
        <span className="text-xs text-blue-600 dark:text-blue-400">
          Downloading 3yr OHLCV for 19 stocks & running V4 screener
        </span>
      </div>
    );
  }

  /* ── Error ── */
  if (sessionState.status === 'error') {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-800 dark:text-red-300 truncate">
            Kite fetch failed: {sessionState.message}
          </span>
        </div>
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 px-4 py-2 bg-[#387ED1] hover:bg-[#2E6AB5] text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0"
        >
          <LogIn className="w-4 h-4" />
          Re-login
        </button>
      </div>
    );
  }

  /* ── Ready — live data loaded ── */
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          Live Kite data · {sessionState.fetchTime} · {sessionState.stockCount} stocks
          {userName && (
            <span className="ml-2 text-emerald-600 dark:text-emerald-500 font-normal">
              · {userName}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          title="Refresh data"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button
          onClick={onLogout}
          title="Clear session"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>
    </div>
  );
}
