#!/usr/bin/env python3
"""
refresh_live_data.py (React Backend Generator)
==============================================
100% Parity with momentum_app_v2.py
- Uses Kite MCP data files for historical price data.
- Uses yfinance + curl_cffi for Fundamental data (ROE, Profit Growth, P/E).
- Uses pure Pandas for exact RSI, ATR, and Drawdown calculations.

MA200 NOTE: SMA-200 uses the last 200 closes ONLY. Pandas rolling(200).mean()
naturally does this — it does NOT sum 250 items and divide by 200.
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

SECTORS = {
    "RELIANCE": "Energy", "TCS": "Technology", "INFY": "Technology",
    "HDFCBANK": "Financial Services", "BAJFINANCE": "Financial Services",
    "WIPRO": "Technology", "ICICIBANK": "Financial Services", "SBIN": "Financial Services",
    "ADANIPORTS": "Infrastructure", "SUNPHARMA": "Pharmaceuticals",
    "TITAN": "Consumer Goods", "ASIANPAINT": "Chemicals", "MARUTI": "Automobile",
    "NESTLEIND": "Consumer Goods", "HINDUNILVR": "Consumer Goods",
    "LT": "Infrastructure", "COALINDIA": "Energy", "POWERGRID": "Utilities", "NTPC": "Utilities",
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
    tr = np.maximum(df_ticker['high'] - df_ticker['low'],
         np.maximum(abs(df_ticker['high'] - df_ticker['close'].shift()),
                    abs(df_ticker['low'] - df_ticker['close'].shift())))
    return tr.rolling(period).mean()

def detect_structural_strength(df):
    """Structural Strength — exact port of momentum_app_v2.py detect_structural_strength().

    TWO conditions must BOTH pass (over last 250 trading days = 1 year):

    (a) QUARTERLY RISING HIGHS: split 250 bars into 4 quarters (~62 bars each).
        Each quarter's max close must be >= the prior quarter's max close.
        Confirms a sustained, consistently-rising price structure.

    (b) LIMITED DRAWDOWN: max drawdown from rolling high (closes only) > -25%.
        Confirms no catastrophic peak-to-trough collapse within the year.

    Uses close prices for both checks — matches the original formula exactly.
    """
    if len(df) < 250:
        return False

    one_year = df['close'].tail(250)

    # (a) Quarterly rising highs — 4 quarters x ~62 bars each
    q1 = one_year.iloc[:62].max()
    q2 = one_year.iloc[62:125].max()
    q3 = one_year.iloc[125:187].max()
    q4 = one_year.iloc[187:].max()
    quarters_rising = (q2 >= q1) and (q3 >= q2) and (q4 >= q3)
    if not quarters_rising:
        return False

    # (b) Max drawdown from rolling high (closes only)
    rolling_max = one_year.expanding().max()
    drawdown    = (one_year / rolling_max) - 1
    max_dd      = drawdown.min()
    return max_dd > -0.25

# ─── EXACT V4 FUNDAMENTALS LOGIC ────────────────────────────────────────────

def safe_get_fundamentals(full_ticker):
    fundamentals = {
        "pe": None, "roe": None, "profit_growth": None,
        "consistent_growth": None,   # None = bypass (OHLCV-only mode)
        "missing": True, "mcap": "N/A"
    }
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
                    growth_rates = [
                        (ni.iloc[j] / ni.iloc[j+1]) - 1
                        for j in range(min(3, len(ni)-1))
                        if ni.iloc[j+1] != 0
                    ]
                    if len(growth_rates) >= 2:
                        fundamentals["profit_growth"] = growth_rates[0]
                        fundamentals["consistent_growth"] = sum(1 for g in growth_rates if g > 0) >= 2

        fundamentals["missing"] = False
    except Exception:
        pass
    return fundamentals

def classify_compounder(ret_6m, ret_1y, ret_3y, structural,
                        consistent_growth=None, roe=None):
    """5-tier classification (V4 spec §4).
    consistent_growth / roe = None → bypass (OHLCV-only mode).
    ROE from yfinance is a fraction (e.g. 0.213), spec threshold is >15% = 0.15."""
    if not structural:
        return "🔴 CHOPPY", 0

    # When data is unavailable, bypass the condition (treat as satisfied)
    growth_ok = consistent_growth is None or consistent_growth
    roe_ok    = roe is None or (pd.notna(roe) and roe > 0.15)

    # Tier 5: Monopoly / Duopoly
    if pd.notna(ret_3y) and ret_3y >= 1.50 and growth_ok and roe_ok:
        return "🏆 MONOPOLY/DUOPOLY", 5

    # Tier 4: Quality Compounder
    if pd.notna(ret_1y) and ret_1y >= 0.40 and growth_ok:
        return "🟢 QUALITY COMPOUNDER", 4

    # Tier 3: Emerging Winner
    if pd.notna(ret_6m) and ret_6m >= 0.30 and growth_ok:
        return "🌱 EMERGING WINNER", 3

    # Tier 2: Momentum Play (ignores growth/fundamentals)
    if pd.notna(ret_6m) and ret_6m >= 0.30:
        return "🔵 MOMENTUM PLAY", 2

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
                raw  = json.load(open(fpath))
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
            if matched:
                print(f"✓ Found {len(matched)} stocks in session: {os.path.basename(session)}")
                return matched
    return matched

# ─── MAIN ENGINE ────────────────────────────────────────────────────────────

def generate_live_data():
    print("🔍 Scanning for Kite MCP data files...")
    all_files = find_latest_files()
    print(f"   Found {len(all_files)} total historical data files across all sessions")

    ticker_bars = match_files_to_tickers(all_files, INSTRUMENTS)
    if not ticker_bars:
        print("❌ No matching Kite data found. Please fetch data via Kite MCP first.")
        sys.exit(1)

    stocks = []
    print("\n📊 Running 100% Parity V4 Screener on live data...")
    print(f"{'TICKER':15s} {'PRICE':>9s}  {'RSI':>6s}  {'1Y RET':>8s}  {'RATING':25s}  V4")
    print("─" * 85)

    for ticker, bars in ticker_bars.items():
        if len(bars) < 252:
            print(f"⚠️  {ticker}: only {len(bars)} bars — skip")
            continue

        # Convert Kite JSON to Pandas DataFrame
        df = pd.DataFrame(bars)

        current_price = df['close'].iloc[-1]
        prev_close    = df['close'].iloc[-2]
        pct_change    = (current_price / prev_close) - 1

        avg_vol_20       = df['volume'].tail(20).mean()
        traded_val_lakhs = (avg_vol_20 * current_price) / 100000
        high52           = df['high'].tail(252).max()

        rsi         = calc_rsi(df['close'], 14).iloc[-1]
        current_atr = calc_atr(df, 14).iloc[-1]

        ret_6m = (current_price / df['close'].iloc[-130] - 1) if len(df) >= 130 else float('nan')
        ret_1y = (current_price / df['close'].iloc[-250] - 1) if len(df) >= 250 else float('nan')
        ret_3y = (current_price / df['close'].iloc[-700] - 1) if len(df) >= 700 else float('nan')

        # Fundamentals from Yahoo via stealth session
        fund       = safe_get_fundamentals(f"{ticker}.NS")
        structural = detect_structural_strength(df)

        # 5-tier classification
        rating, score = classify_compounder(
            ret_6m, ret_1y, ret_3y, structural,
            fund['consistent_growth'], fund['roe']
        )

        # V4 Signal — ALL 5 rules must pass (spec §5)
        is_breakout  = current_price >= (high52 * 0.95)             # Rule 2: Proximity
        is_vol_surge = df['volume'].tail(3).max() >= (1.5 * avg_vol_20)  # Rule 3: Volume surge
        is_rsi_valid = 50 < rsi < 75                                # Rule 4: RSI strictly (50,75)
        is_liquid    = traded_val_lakhs >= 50                       # Rule 1: Liquidity
        is_quality   = score >= 4                                   # Rule 5: Tier 4 or 5

        v4_signal = is_breakout and is_vol_surge and is_rsi_valid and is_liquid and is_quality

        # Smart Entry limit order price (Bug 5 fix)
        entry_limit = round(current_price * 1.005, 2)

        # Risk management
        stop_pct = max(0.03, min(0.06, (1.5 * current_atr) / current_price))
        stop     = current_price * (1 - stop_pct)
        t1       = current_price + (1.5 * current_atr)
        t2       = current_price + (3.0 * current_atr)
        shares   = int(CAPITAL / current_price)

        ret3y_out = round(ret_3y, 6) if not math.isnan(ret_3y) else 0

        stocks.append({
            "ticker": ticker, "fullTicker": f"{ticker}.NS",
            "rating": rating, "score": score,
            "v4Signal": v4_signal,
            "price": round(current_price, 2), "change": round(pct_change, 6),
            "rsi": round(rsi, 2), "tradedVal": round(traded_val_lakhs, 1),
            "ret6m": round(ret_6m if not math.isnan(ret_6m) else 0, 6),
            "ret1y": round(ret_1y if not math.isnan(ret_1y) else 0, 6),
            "ret3y": ret3y_out,
            "entryLimit": entry_limit,
            "target1": round(t1, 2), "target2": round(t2, 2), "stop": round(stop, 2),
            "shares": shares, "investment": round(shares * current_price, 2),
            "immRes": round(df['high'].tail(20).max(), 2),
            "majRes": round(df['high'].tail(250).max(), 2),
            "supZone": round(df['low'].tail(20).min(), 2),
            "breakdown": round(df['low'].tail(50).min(), 2),
            "structural": structural, "atr": round(current_atr, 2),
            "sector": SECTORS.get(ticker, 'N/A'),
            "mcap": fund['mcap'],
            "pe": fund['pe'],
            "roe": fund['roe'],
        })

        v4_str = "⚡ YES" if v4_signal else "—"
        ret1_str = f"{ret_1y:+.1%}" if not math.isnan(ret_1y) else "  N/A"
        print(f"{ticker:15s} ₹{current_price:>9.2f}  {rsi:6.1f}  {ret1_str:>8s}  {rating:25s}  {v4_str}")

    v4_count = sum(1 for s in stocks if s['v4Signal'])
    monopoly = sum(1 for s in stocks if s['rating'] == '🏆 MONOPOLY/DUOPOLY')
    quality  = sum(1 for s in stocks if s['rating'] == '🟢 QUALITY COMPOUNDER')
    emerging = sum(1 for s in stocks if s['rating'] == '🌱 EMERGING WINNER')
    momentum = sum(1 for s in stocks if s['rating'] == '🔵 MOMENTUM PLAY')
    print(f"\n📈 Results: {len(stocks)} stocks · {monopoly} Monopoly · {quality} Quality · {emerging} Emerging · {momentum} Momentum · {v4_count} V4 signals")

    # ── Write TypeScript file for React Frontend ──────────────────────────
    now = datetime.datetime.now().strftime('%d %b %Y, %H:%M IST')
    def jb(v): return 'true' if v else 'false'
    def fmt_num(v): return str(v) if v is not None and not (isinstance(v, float) and math.isnan(v)) else 'null'

    lines = [
        "import type { StockResult, MarketIndex } from './types';",
        "",
        "// AUTO-GENERATED — Kite API + yFinance Fundamentals",
        f"// Fetched: {now}  |  V4 Breakout Swing System: 5-tier, drawdown filter, RSI strictly (50,75)",
        "// DO NOT edit manually — re-run: python3 scripts/refresh_live_data.py",
        "",
        f"export const LIVE_FETCH_TIME = '{now}';",
        "",
        "export const LIVE_INDICES: MarketIndex[] = [",
        "  { name: 'NIFTY 50',   price: 0, change: 0, symbol: '^NSEI' },",
        "  { name: 'BANK NIFTY', price: 0, change: 0, symbol: '^NSEBANK' },",
        "  { name: 'NIFTY IT',   price: 0, change: 0, symbol: '^CNXIT' },",
        "  { name: 'NIFTY MID',  price: 0, change: 0, symbol: '^NSEMDCP50' },",
        "];",
        "",
        "export const LIVE_STOCKS: StockResult[] = [",
    ]

    for s in stocks:
        r = s['rating'].replace("'", "\\'")
        lines += [
            "  {",
            f"    ticker: '{s['ticker']}', fullTicker: '{s['fullTicker']}',",
            f"    rating: '{r}' as const, score: {s['score']},",
            f"    v4Signal: {jb(s['v4Signal'])}, price: {s['price']}, change: {s['change']},",
            f"    rsi: {s['rsi']}, tradedVal: {s['tradedVal']},",
            f"    ret6m: {s['ret6m']}, ret1y: {s['ret1y']}, ret3y: {s['ret3y']},",
            f"    entryLimit: {s['entryLimit']},",
            f"    target1: {s['target1']}, target2: {s['target2']}, stop: {s['stop']},",
            f"    shares: {s['shares']}, investment: {s['investment']},",
            f"    immRes: {s['immRes']}, majRes: {s['majRes']}, supZone: {s['supZone']}, breakdown: {s['breakdown']},",
            f"    structural: {jb(s['structural'])}, atr: {s['atr']},",
            f"    sector: '{s['sector']}', mcap: '{s['mcap']}', pe: {fmt_num(s['pe'])}, roe: {fmt_num(s['roe'])}, bookVal: 'N/A', divYield: 'N/A',",
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
    print(f"\n✅ Written: {out_path}")

    return v4_count

if __name__ == '__main__':
    v4_count = generate_live_data()
    print("\n─────────────────────────────────────────")
    print("Next steps:")
    print("  git add src/lib/liveData.ts")
    print("  git commit -m 'chore: refresh live data'")
    print("  git push  ← triggers Vercel auto-deploy")
    if v4_count > 0:
        print(f"\n  🚨 {v4_count} V4 SIGNAL(S) ACTIVE — check the dashboard!")
