// useKiteData.ts
// Manages the Kite OAuth session lifecycle and live data fetching.
//
// Flow:
//   1. On mount, checks localStorage for a saved kite_access_token.
//   2. Also checks URL fragment (#kt=TOKEN&kn=NAME) written by /api/kite-callback.
//   3. If a token exists, calls /api/kite-data to fetch + screen all 19 stocks.
//   4. Exposes sessionState, stocks, and helpers (refresh, logout).

import { useState, useEffect, useCallback } from 'react';
import type { StockResult } from '@/lib/types';
import type { KiteSessionState } from '@/components/KiteLoginBanner';

const STORAGE_KEY_TOKEN = 'qt_kite_token';
const STORAGE_KEY_NAME  = 'qt_kite_name';

interface KiteDataResult {
  sessionState: KiteSessionState;
  userName: string;
  stocks: StockResult[] | null;   // null = not yet loaded
  refresh: () => void;
  logout: () => void;
}

export function useKiteData(capital: number): KiteDataResult {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY_TOKEN)
  );
  const [userName, setUserName] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY_NAME) ?? ''
  );
  const [sessionState, setSessionState] = useState<KiteSessionState>(() =>
    localStorage.getItem(STORAGE_KEY_TOKEN) ? { status: 'loading' } : { status: 'none' }
  );
  const [stocks, setStocks] = useState<StockResult[] | null>(null);

  // ── Pick up token from URL fragment after OAuth redirect ──────────────────
  useEffect(() => {
    const hash = window.location.hash;          // "#kt=TOKEN&kn=NAME"
    if (!hash.includes('kt=')) return;

    const params = new URLSearchParams(hash.slice(1));   // strip leading #
    const kt = params.get('kt');
    const kn = decodeURIComponent(params.get('kn') ?? 'Trader');

    if (kt) {
      localStorage.setItem(STORAGE_KEY_TOKEN, kt);
      localStorage.setItem(STORAGE_KEY_NAME,  kn);
      setAccessToken(kt);
      setUserName(kn);
      setSessionState({ status: 'loading' });
      // Clean the fragment from the URL bar (no reload)
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // ── Pick up ?kite_error= if OAuth failed ─────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('kite_error');
    if (err) {
      setSessionState({ status: 'error', message: decodeURIComponent(err) });
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);

  // ── Fetch data whenever token changes ────────────────────────────────────
  const fetchData = useCallback(async (token: string) => {
    setSessionState({ status: 'loading' });
    try {
      const res = await fetch(`/api/kite-data?access_token=${token}&capital=${capital}`);
      if (res.status === 401) {
        // Token expired / invalid — clear session
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_NAME);
        setAccessToken(null);
        setSessionState({ status: 'error', message: 'Session expired — please login again' });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        fetchTime: string;
        stocks: StockResult[];
        errors?: string[];
      };

      setStocks(data.stocks);
      setSessionState({
        status: 'ready',
        fetchTime: data.fetchTime,
        stockCount: data.stocks.length,
      });
    } catch (err: unknown) {
      setSessionState({
        status: 'error',
        message: (err as Error).message ?? 'Unknown error',
      });
    }
  }, [capital]);

  useEffect(() => {
    if (accessToken && sessionState.status === 'loading') {
      fetchData(accessToken);
    }
  }, [accessToken, sessionState.status, fetchData]);

  const refresh = useCallback(() => {
    if (accessToken) fetchData(accessToken);
  }, [accessToken, fetchData]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_NAME);
    setAccessToken(null);
    setUserName('');
    setStocks(null);
    setSessionState({ status: 'none' });
  }, []);

  return { sessionState, userName, stocks, refresh, logout };
}
