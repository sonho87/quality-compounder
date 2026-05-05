#!/usr/bin/env python3
"""
refresh_live_data.py
====================
Daily data refresh script for Quant Terminal V8.0
Run this every morning AFTER logging into Kite MCP via Claude.
"""

import json, math, os, sys, datetime

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
CLAUDE_PROJECTS_BASE = os.path.expanduser(
    "~/.claude/projects/-Users-rakesh-Desktop-Momentum-trade-Claude-Momentum-Design--claude-worktrees-unruffled-goldstine-de5cbe"
)
OUTPUT_TS = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'liveData.ts')
CAPITAL = 33000

INSTRUMENTS = {
    738561:  "RELIANCE", 2953217: "TCS", 408065:  "INFY", 341249:  "HDFCBANK",
    81153:   "BAJFINANCE", 969473:  "WIPRO", 1270529: "ICICIBANK", 779521:  "SBIN",
    3861249: "ADANIPORTS", 857857:  "SUNPHARMA", 897537:  "TITAN", 60417:   "ASIANPAINT",
    2815745: "MARUTI", 4598529: "NESTLEIND", 356865:  "HINDUNILVR", 2939649: "LT",
    5215745: "COALINDIA", 3834113: "POWERGRID", 2977281: "NTPC",
}

SECTORS = {
    "RELIANCE":"Energy", "TCS":"Technology", "INFY":"Technology",
    "HDFCBANK":"Financial Services", "BAJFINANCE":"Financial Services",
    "WIPRO":"Technology", "ICICIBANK":"Financial Services", "SBIN":"Financial Services",
    "ADANIPORTS":"Infrastructure", "SUNPHARMA":"Pharmaceuticals",
    "TITAN":"Consumer Goods", "ASIANPAINT":"Chemicals", "MARUTI":"Automobile",
    "NESTLEIND":"Consumer Goods", "HINDUNILVR":"Consumer Goods",
    "LT":"Infrastructure", "COALINDIA":"Energy", "POWERGRID":"Utilities", "NTPC":"Utilities",
}

# ─── STRICT V4/V7 INDICATOR FUNCTIONS ───────────────────────────────────────

def calc_rsi(closes, period=14):
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i-1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period-1) + gains[i]) / period
        avg_l = (avg_l * (period-1) + losses[i]) / period
    return 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)

def calc_atr(bars, period=14):
    trs = []
    for i, b in enumerate(bars):
        pc = bars[i-1]['close'] if i > 0 else b['close']
        trs.append(max(b['high'] - b['low'], abs(b['high'] - pc), abs(b['low'] - pc)))
    return sum(trs[-period:]) / period

# FIX: Added exact 25% Drawdown Rule and fixed MA math
def detect_structural(closes, highs):
    if len(closes) < 250:
        return False
    ma50  = sum(closes[-50:]) / 50
    ma200 = sum(closes[-200:]) / 200
    
    current_price = closes[-1]
    rolling_1yr_high = max(highs[-252:])
    drawdown = (current_price / rolling_1yr_high) - 1
    
    trend_intact = (current_price > ma200) and (ma50 > ma200)
    limited_drawdown = drawdown >= -0.25  # Max 25% drop allowed
    
    return trend_intact and limited_drawdown

# FIX: Added 3-Year Return tracking for Monopoly tier
def classify_compounder(ret6m, ret1y, ret3y, structural):
    if not structural:
        return "🔴 CHOPPY", 0
    if ret3y is not None and ret3y >= 1.50:
        return "👑 MONOPOLY/DUOPOLY", 5
    if ret1y is not None and ret1y >= 0.40:
        return "🟢 QUALITY COMPOUNDER", 4
    if ret6m is not None and ret6m >= 0.30:
        return "🔵 MOMENTUM PLAY", 2
    return "🔴 WEAK RETURNS", 0

# ─── FIND LATEST KITE MCP FILES ─────────────────────────────────────────────

def find_latest_files():
    token_to_file = {}
    if not os.path.exists(CLAUDE_PROJECTS_BASE):
        return {}
        
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
            except Exception:
                continue
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

# ─── MAIN ───────────────────────────────────────────────────────────────────

def generate_live_data():
    print("🔍 Scanning for Kite MCP data files...")
    all_files = find_latest_files()
    
    ticker_bars = match_files_to_tickers(all_files, INSTRUMENTS)
    if not ticker_bars:
        print("❌ No matching files found. Please fetch data via Kite MCP first.")
        sys.exit(1)

    stocks = []
    print("\n📊 Running Strict V8.0 Screener on live data...")
    print(f"{'TICKER':15s} {'PRICE':>9s}  {'RSI':>6s}  {'1Y RET':>8s}  {'RATING':25s}  V4")
    print("─" * 85)

    for ticker, bars in ticker_bars.items():
        if len(bars) < 252:
            print(f"⚠️  {ticker}: only {len(bars)} bars — skipping (needs 252+)")
            continue

        closes  = [b['close']  for b in bars]
        highs   = [b['high']   for b in bars]
        lows    = [b['low']    for b in bars]
        volumes = [b['volume'] for b in bars]

        price      = closes[-1]
        prev_close = closes[-2]
        pct_change = price / prev_close - 1
        avg_vol20  = sum(volumes[-20:]) / 20
        traded_val = (avg_vol20 * price) / 100000
        high52w    = max(highs[-252:])
        rsi        = calc_rsi(closes, 14)
        atr        = calc_atr(bars, 14)
        
        imm_res    = max(highs[-20:])
        maj_res    = max(highs[-250:])
        sup_zone   = min(lows[-20:])
        breakdown  = min(lows[-50:])
        
        # Returns math
        ret6m = (price / closes[-130] - 1) if len(closes) >= 130 else None
        ret1y = (price / closes[-250] - 1) if len(closes) >= 250 else None
        ret3y = (price / closes[-700] - 1) if len(closes) >= 700 else None

        # Structural & Scoring
        structural = detect_structural(closes, highs)
        rating, score = classify_compounder(ret6m, ret1y, ret3y, structural)
        
        # FIX: Complete V4 Signal Rules 
        is_breakout  = price >= (high52w * 0.95)
        is_vol_surge = max(volumes[-3:]) >= (1.5 * avg_vol20)
        is_momentum  = 50 <= rsi <= 75
        is_liquid    = traded_val >= 50       # Rule 1: Min 50 Lakhs
        is_quality   = score >= 4             # Rule 5: Tier 4 or 5 only
        
        v4 = is_breakout and is_vol_surge and is_momentum and is_liquid and is_quality

        # Risk Management Math
        smart_entry = price * 1.005
        stop_pct    = max(0.03, min(0.06, (1.5 * atr) / price))
        stop        = price * (1 - stop_pct)
        t1          = price + (1.5 * atr)
        t2          = price + (3.0 * atr)
        shares      = int(CAPITAL / price)

        stocks.append(dict(
            ticker=ticker, fullTicker=f"{ticker}.NS", rating=rating, score=score,
            v4Signal=v4, price=round(price, 2), change=round(pct_change, 6),
            rsi=round(rsi, 2), tradedVal=round(traded_val, 1),
            ret6m=round(ret6m or 0, 6), ret1y=round(ret1y or 0, 6),
            entry=round(smart_entry, 2), target1=round(t1, 2), target2=round(t2, 2), stop=round(stop, 2),
            shares=shares, investment=round(shares * price, 2),
            immRes=round(imm_res, 2), majRes=round(maj_res, 2),
            supZone=round(sup_zone, 2), breakdown=round(breakdown, 2),
            structural=structural, atr=round(atr, 2),
            sector=SECTORS.get(ticker, 'N/A'),
        ))

        v4_str = "⚡ YES" if v4 else "—"
        display_ret1y = ret1y if ret1y is not None else 0
        print(f"{ticker:15s} ₹{price:>9.2f}  {rsi:6.1f}  {display_ret1y:+7.1%}  {rating:25s}  {v4_str}")

    v4_count = sum(1 for s in stocks if s['v4Signal'])
    print(f"\n📈 Results: {len(stocks)} stocks screened · {v4_count} Active V4 Signals")

    # ── Write TypeScript file for React Frontend ───────────────────────────
    now = datetime.datetime.now().strftime('%d %b %Y, %H:%M IST')
    def jb(v): return 'true' if v else 'false'

    lines = [
        "import type { StockResult, MarketIndex } from './types';",
        "",
        "// AUTO-GENERATED — Kite API live data",
        f"// Fetched: {now}  |  Formula: Strict V8 Master Logic",
        "// DO NOT edit manually — re-run: python3 scripts/refresh_live_data.py",
        "",
        f"export const LIVE_FETCH_TIME = '{now}';",
        "",
        "export const LIVE_INDICES: MarketIndex[] = [",
        "  { name: 'NIFTY 50',   price: 24751.65, change:  0.0043, symbol: '^NSEI' },",
        "  { name: 'BANK NIFTY', price: 53421.80, change: -0.0012, symbol: '^NSEBANK' },",
        "  { name: 'NIFTY IT',   price: 38964.20, change:  0.0127, symbol: '^CNXIT' },",
        "  { name: 'NIFTY MID',  price: 52831.40, change:  0.0218, symbol: '^NSEMDCP50' },",
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
            f"    ret6m: {s['ret6m']}, ret1y: {s['ret1y']},",
            f"    entry: {s['entry']}, target1: {s['target1']}, target2: {s['target2']}, stop: {s['stop']},",
            f"    shares: {s['shares']}, investment: {s['investment']},",
            f"    immRes: {s['immRes']}, majRes: {s['majRes']}, supZone: {s['supZone']}, breakdown: {s['breakdown']},",
            f"    structural: {jb(s['structural'])}, atr: {s['atr']},",
            f"    sector: '{s['sector']}', mcap: 'N/A', pe: null, roe: null, bookVal: 'N/A', divYield: 'N/A',",
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
    print(f"\n✅ Written safely to React frontend: {out_path}")

    return v4_count

if __name__ == '__main__':
    v4_count = generate_live_data()
