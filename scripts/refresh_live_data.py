#!/usr/bin/env python3
"""
refresh_live_data.py (React Backend Generator)
==============================================
100% Parity with momentum_app_v2.py
- Uses Kite for fast historical price data.
- Uses yfinance + curl_cffi for Fundamental data (ROE, Profit Growth, P/E).
- Uses pure Pandas for exact RSI, ATR, and Drawdown calculations.
"""

import json, math, os, sys, datetime
import pandas as pd
import numpy as np
import yfinance as yf
from curl_cffi import requests as curl_requests

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
CLAUDE_PROJECTS_BASE = os.path.expanduser(
    "~/.claude/projects/-Users-rakesh-Desktop-Momentum-trade-Claude-Momentum-Design--claude-worktrees-unruffled-goldstine-de5cbe"
)
OUTPUT_TS = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'liveData.ts')
CAPITAL = 33000

INSTRUMENTS = {
    738561: "RELIANCE", 2953217: "TCS", 408065: "INFY", 341249: "HDFCBANK",
    81153: "BAJFINANCE", 969473: "WIPRO", 1270529: "ICICIBANK", 779521: "SBIN",
    3861249: "ADANIPORTS", 857857: "SUNPHARMA", 897537: "TITAN", 60417: "ASIANPAINT",
    2815745: "MARUTI", 4598529: "NESTLEIND", 356865: "HINDUNILVR", 2939649: "LT",
    5215745: "COALINDIA", 3834113: "POWERGRID", 2977281: "NTPC",
}

# --- ANTI-BLOCKING BROWSER SPOOFER (From V4) ---
yf_session = curl_requests.Session(impersonate="chrome")

# ─── EXACT V4 PANDAS INDICATOR MATH ─────────────────────────────────────────

def calc_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def calc_atr(df_ticker, period=14):
    tr = np.maximum(df_ticker['High'] - df_ticker['Low'],
         np.maximum(abs(df_ticker['High'] - df_ticker['Close'].shift()),
                    abs(df_ticker['Low'] - df_ticker['Close'].shift())))
    return tr.rolling(period).mean()

def detect_structural_strength(close_series):
    if len(close_series) < 250:
        return False
    
    one_year = close_series.tail(250)
    ma_50 = one_year.rolling(50).mean().iloc[-1]
    ma_200 = one_year.rolling(200).mean().iloc[-1]
    current_close = one_year.iloc[-1]
    
    trend_intact = (current_close > ma_200) and (ma_50 > ma_200)
    
    rolling_max = one_year.expanding().max()
    drawdown = (one_year / rolling_max) - 1
    max_dd = drawdown.min()
    limited_drawdown = max_dd > -0.25  
    
    return trend_intact and limited_drawdown

# ─── EXACT V4 FUNDAMENTALS LOGIC ────────────────────────────────────────────

def safe_get_fundamentals(full_ticker):
    fundamentals = {"pe": None, "roe": None, "profit_growth": None, "consistent_growth": False, "missing": True, "mcap": "N/A"}
    try:
        tkr = yf.Ticker(full_ticker, session=yf_session)
        info = tkr.info
        if info:
            if 'trailingPE' in info: fundamentals["pe"] = info['trailingPE']
            if 'returnOnEquity' in info: fundamentals["roe"] = info['returnOnEquity']
            mcap = info.get('marketCap', 0)
            if mcap > 0: fundamentals["mcap"] = f"₹{mcap / 10000000:.0f} Cr"
                
        q_fin = tkr.quarterly_financials
        if q_fin is not None and not q_fin.empty:
            target_row = None
            for alias in ['Net Income', 'Net Income Common Stockholders', 'Net Income Continuous Operations']:
                if alias in q_fin.index:
                    target_row = alias
                    break
            
            if target_row:
                ni = q_fin.loc[target_row].dropna()
                if len(ni) >= 3:
                    growth_rates = [(ni.iloc[j] / ni.iloc[j+1]) - 1 for j in range(min(3, len(ni)-1)) if ni.iloc[j+1] != 0]
                    if len(growth_rates) >= 2:
                        fundamentals["profit_growth"] = growth_rates[0]
                        fundamentals["consistent_growth"] = sum(1 for g in growth_rates if g > 0) >= 2
                        
        fundamentals["missing"] = False
    except Exception:
        pass
    return fundamentals

def classify_compounder(ret_6m, ret_1y, ret_3y, structural, consistent_growth, roe, missing_fundamentals):
    if not structural: return "🔴 CHOPPY", 0
    if missing_fundamentals: return "⚠️ DATA BLOCKED (Manual Verify)", 3 
    if (pd.notna(ret_3y) and ret_3y >= 1.50 and consistent_growth and pd.notna(roe) and roe > 0.15): return "👑 MONOPOLY/DUOPOLY", 5
    if (pd.notna(ret_1y) and ret_1y >= 0.40 and consistent_growth): return "🟢 QUALITY COMPOUNDER", 4
    if (pd.notna(ret_6m) and ret_6m >= 0.30 and consistent_growth): return "🟡 EMERGING WINNER", 3
    if pd.notna(ret_6m) and ret_6m >= 0.30: return "🔵 MOMENTUM PLAY", 2
    return "🔴 WEAK RETURNS", 0

# ─── DATA FETCHING ──────────────────────────────────────────────────────────

def find_latest_files():
    token_to_file = {}
    if not os.path.exists(CLAUDE_PROJECTS_BASE): return {}
    for session_dir in os.listdir(CLAUDE_PROJECTS_BASE):
        tool_dir = os.path.join(CLAUDE_PROJECTS_BASE, session_dir, 'tool-results')
        if not os.path.isdir(tool_dir): continue
        for fname in os.listdir(tool_dir):
            if not fname.startswith('mcp-kite-get_historical_data-'): continue
            fpath = os.path.join(tool_dir, fname)
            try:
                raw = json.load(open(fpath))
                bars = json.loads(raw[0]['text'])
                if not bars: continue
                mtime = os.path.getmtime(fpath)
                token_to_file[fpath] = (mtime, bars)
            except Exception: continue
    return token_to_file

def match_files_to_tickers(all_files, instruments):
    matched = {}
    sorted_files = sorted(all_files.items(), key=lambda x: x[1][0], reverse=True)
    sessions = {}
    for fpath, (mtime, bars) in sorted_files:
        session = os.path.dirname(fpath)
        sessions.setdefault(session, []).append((mtime, fpath, bars))
    for session, files in sorted(sessions.items(), key=lambda x: max(f[0] for f in x[1]), reverse=True):
        files_sorted = sorted(files, key=lambda x: x[0]) 
        ticker_list = list(instruments.values())
        if len(files_sorted) >= len(ticker_list):
            for i, ticker in enumerate(ticker_list):
                if i < len(files_sorted):
                    matched[ticker] = files_sorted[i][2]
            if matched: return matched
    return matched

# ─── MAIN ENGINE ────────────────────────────────────────────────────────────

def generate_live_data():
    all_files = find_latest_files()
    ticker_bars = match_files_to_tickers(all_files, INSTRUMENTS)
    if not ticker_bars:
        print("❌ No matching Kite data found.")
        sys.exit(1)

    stocks = []
    print("\n📊 Running 100% Parity V4 Screener on live data...")

    for ticker, bars in ticker_bars.items():
        if len(bars) < 252: continue
        
        # 1. Convert Kite JSON to Pandas DataFrame for exact math matching
        df = pd.DataFrame(bars)
        
        current_price = df['close'].iloc[-1]
        prev_close = df['close'].iloc[-2]
        pct_change = (current_price / prev_close) - 1
        
        avg_vol_20 = df['volume'].tail(20).mean()
        traded_val_lakhs = (avg_vol_20 * current_price) / 100000
        
        high52 = df['high'].tail(252).max()
        rsi = calc_rsi(df['close'], 14).iloc[-1]
        current_atr = calc_atr(df, 14).iloc[-1]
        
        ret_6m = (current_price / df['close'].iloc[-130] - 1) if len(df) >= 130 else None
        ret_1y = (current_price / df['close'].iloc[-250] - 1) if len(df) >= 250 else None
        ret_3y = (current_price / df['close'].iloc[0] - 1) if len(df) >= 700 else None
        
        # 2. Get Fundamentals from Yahoo via Stealth Session
        fund = safe_get_fundamentals(f"{ticker}.NS")
        structural = detect_structural_strength(df['close'])
        
        # 3. Exact Classifier from V4
        rating, score = classify_compounder(ret_6m, ret_1y, ret_3y, structural, fund['consistent_growth'], fund['roe'], fund['missing'])
        
        # 4. Strict V4 Signal Rules
        is_breakout = current_price >= (high52 * 0.95)
        is_vol_surge = df['volume'].tail(3).max() >= (1.5 * avg_vol_20)
        is_rsi_valid = 50 <= rsi <= 75
        is_liquid = traded_val_lakhs >= 50
        is_quality = (score >= 4) or fund['missing']
        
        v4_signal = is_breakout and is_vol_surge and is_rsi_valid and is_liquid and is_quality

        # 5. Position Sizing
        smart_entry = current_price * 1.005
        stop_pct = max(0.03, min(0.06, (1.5 * current_atr) / current_price))
        stop = current_price * (1 - stop_pct)
        t1 = current_price + (1.5 * current_atr)
        t2 = current_price + (3.0 * current_atr)
        shares = int(CAPITAL / current_price)

        stocks.append({
            "ticker": ticker, "fullTicker": f"{ticker}.NS", "rating": rating, "score": score,
            "v4Signal": v4_signal, "price": round(current_price, 2), "change": round(pct_change, 6),
            "rsi": round(rsi, 2), "tradedVal": round(traded_val_lakhs, 1),
            "ret6m": round(ret_6m or 0, 6), "ret1y": round(ret_1y or 0, 6),
            "entry": round(smart_entry, 2), "target1": round(t1, 2), "target2": round(t2, 2), "stop": round(stop, 2),
            "shares": shares, "investment": round(shares * current_price, 2),
            "immRes": round(df['high'].tail(20).max(), 2), "majRes": round(df['high'].tail(250).max(), 2),
            "supZone": round(df['low'].tail(20).min(), 2), "breakdown": round(df['low'].tail(50).min(), 2),
            "structural": structural, "atr": round(current_atr, 2),
            "mcap": fund['mcap'], "pe": fund['pe'], "roe": fund['roe']
        })

    # ── Write TypeScript file for React Frontend ───────────────────────────
    now = datetime.datetime.now().strftime('%d %b %Y, %H:%M IST')
    def jb(v): return 'true' if v else 'false'

    lines = [
        "import type { StockResult, MarketIndex } from './types';",
        "",
        "// AUTO-GENERATED — Kite API + yFinance Fundamentals",
        f"// Fetched: {now}  |  Formula: 100% Parity V4 Master Logic",
        "// DO NOT edit manually — re-run: python3 scripts/refresh_live_data.py",
        "",
        f"export const LIVE_FETCH_TIME = '{now}';",
        "",
        "export const LIVE_STOCKS: StockResult[] = [",
    ]

    for s in stocks:
        r = s['rating'].replace("'", "\\'")
        pe_val = s['pe'] if pd.notna(s['pe']) else "null"
        roe_val = s['roe'] if pd.notna(s['roe']) else "null"
        
        lines += [
            "  {",
            f"    ticker: '{s['ticker']}', fullTicker: '{s['fullTicker']}',",
            f"    rating: '{r}' as const, score: {s['score']},",
            f"    v4Signal: {jb(s['v4Signal'])}, price: {s['price']}, change: {s['change']},",
            f"    rsi: {s['rsi']}, tradedVal: {s['tradedVal']},",
            f"    ret6m: {s['ret6m']}, ret1y: {s['ret1y']},",
            f"    entry: {s['entry']}, target1: {s['target1']}, target2: {s['target2']}, stop: {s['stop']},",
            f"    shares: {s['shares']}, investment: {s['investment']},",
            f"    immRes: {s['immRes']}, majRes: {s['majRes']}, supZone: {s['supZone']}, breakdown: {s['breakdown']},",
            f"    structural: {jb(s['structural'])}, atr: {s['atr']},",
            f"    sector: 'N/A', mcap: '{s['mcap']}', pe: {pe_val}, roe: {roe_val}, bookVal: 'N/A', divYield: 'N/A',",
            "  },",
        ]

    lines += [
        "];",
        "",
        "export const LIVE_V4_SIGNALS = LIVE_STOCKS.filter(s => s.v4Signal);",
    ]

    out_path = os.path.abspath(OUTPUT_TS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"\n✅ Data generated and written safely to React frontend: {out_path}")

if __name__ == '__main__':
    generate_live_data()
