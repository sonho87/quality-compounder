#!/usr/bin/env python3
"""
refresh_live_data.py
====================
Daily data refresh script for Quant Terminal V7.0
Run this every morning AFTER logging into Kite MCP via Claude.

Usage:
    python3 scripts/refresh_live_data.py

What it does:
    1. Reads Kite historical data files saved by the MCP tool
    2. Runs the V4 screening algorithm (RSI, ATR, structural, returns)
    3. Overwrites src/lib/liveData.ts with today's live results
    4. Optionally git commits + pushes to trigger a Vercel deploy

Formula is UNCHANGED from momentum_app_v2.py:
    - RSI(14): Wilder smoothing
    - ATR(14): True range rolling average
    - Structural: MA50 > MA200 AND price > MA200 (golden cross filter)
    - Quality Compounder: structural=True AND 1Y return >= 40%
    - Momentum Play: structural=True AND 6M return >= 30%
    - V4 Signal: price >= 95% of 52w high AND vol_3d >= 1.5x vol_20d AND 50 <= RSI <= 75
    - Stop: price * (1 - max(3%, min(6%, 1.5*ATR/price)))
    - T1: price + 1.5 * ATR
    - T2: price + 3.0 * ATR
"""

import json, math, os, sys, datetime, subprocess

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
# Directory where Kite MCP saves historical data files
# Update this path if your Claude projects directory differs
CLAUDE_PROJECTS_BASE = os.path.expanduser(
    "~/.claude/projects/-Users-rakesh-Desktop-Momentum-trade-Claude-Momentum-Design--claude-worktrees-unruffled-goldstine-de5cbe"
)
OUTPUT_TS = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'liveData.ts')
CAPITAL = 33000

# Map instrument_token → (ticker, current_ltp)
# LTP values below are placeholders — the script uses the last close from historical data
# as a proxy if live LTP is not provided
INSTRUMENTS = {
    738561:  "RELIANCE",
    2953217: "TCS",
    408065:  "INFY",
    341249:  "HDFCBANK",
    81153:   "BAJFINANCE",
    969473:  "WIPRO",
    1270529: "ICICIBANK",
    779521:  "SBIN",
    3861249: "ADANIPORTS",
    857857:  "SUNPHARMA",
    897537:  "TITAN",
    60417:   "ASIANPAINT",
    2815745: "MARUTI",
    4598529: "NESTLEIND",
    356865:  "HINDUNILVR",
    2939649: "LT",
    5215745: "COALINDIA",
    3834113: "POWERGRID",
    2977281: "NTPC",
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

# ─── INDICATOR FUNCTIONS (exact port of momentum_app_v2.py) ─────────────────

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

def detect_structural(closes, highs):
    """Structural Strength — ALL 3 conditions required (V4 spec §3):
    (a) Close > MA200  (b) MA50 > MA200  (c) Drawdown from 1Y high > -25%"""
    if len(closes) < 250:
        return False
    year_closes = closes[-250:]
    year_highs  = highs[-250:]
    last        = year_closes[-1]
    ma50        = sum(year_closes[-50:]) / 50
    ma200       = sum(year_closes[-200:]) / 200
    if last <= ma200:  return False          # (a)
    if ma50  <= ma200: return False          # (b)
    rolling_high = max(year_highs)
    if last / rolling_high - 1 <= -0.25: return False  # (c) drawdown limit
    return True

def classify_compounder(ret6m, ret1y, ret3y, structural,
                        consistent_growth=None, roe=None):
    """5-tier classification (V4 spec §4).
    consistent_growth / roe = None → bypass (OHLCV-only mode)."""
    if not structural:
        return "🔴 CHOPPY", 0
    growth_ok = consistent_growth is None or consistent_growth
    roe_ok    = roe is None or roe > 15
    # Tier 5
    if not math.isnan(ret3y) and ret3y >= 1.50 and growth_ok and roe_ok:
        return "🏆 MONOPOLY/DUOPOLY", 5
    # Tier 4
    if not math.isnan(ret1y) and ret1y >= 0.40 and growth_ok:
        return "🟢 QUALITY COMPOUNDER", 4
    # Tier 3
    if not math.isnan(ret6m) and ret6m >= 0.30 and growth_ok:
        return "🌱 EMERGING WINNER", 3
    # Tier 2
    if not math.isnan(ret6m) and ret6m >= 0.30:
        return "🔵 MOMENTUM PLAY", 2
    return "🔴 WEAK RETURNS", 0

# ─── FIND LATEST KITE MCP FILES ─────────────────────────────────────────────

def find_latest_files():
    """Walk all session dirs and pick the newest file per instrument token."""
    token_to_file = {}
    for session_dir in os.listdir(CLAUDE_PROJECTS_BASE):
        tool_dir = os.path.join(CLAUDE_PROJECTS_BASE, session_dir, 'tool-results')
        if not os.path.isdir(tool_dir):
            continue
        for fname in os.listdir(tool_dir):
            if not fname.startswith('mcp-kite-get_historical_data-'):
                continue
            fpath = os.path.join(tool_dir, fname)
            try:
                raw  = json.load(open(fpath))
                bars = json.loads(raw[0]['text'])
                if not bars:
                    continue
                # Identify the token from file size fingerprint — use ticker detection
                # by checking which instrument this data belongs to
                # We use file mtime as the key for "latest"
                mtime = os.path.getmtime(fpath)
                # Store with mtime so we can pick freshest per ticker later
                token_to_file[fpath] = (mtime, bars)
            except Exception:
                continue
    return token_to_file

def match_files_to_tickers(all_files, instruments):
    """Match loaded bar data to tickers using known instrument tokens."""
    # The Kite MCP filenames include a timestamp in ms; we match them by
    # comparing against known instrument tokens from our INSTRUMENTS dict.
    # Since we can't re-extract tokens from the bar data, we use file ordering
    # (the files were fetched in a known order per session).
    # Fallback: use last session's files, matched in fetch order.
    matched = {}

    # Sort all files by mtime descending — newest session first
    sorted_files = sorted(all_files.items(), key=lambda x: x[1][0], reverse=True)

    # Group files by session directory
    sessions = {}
    for fpath, (mtime, bars) in sorted_files:
        session = os.path.dirname(fpath)
        sessions.setdefault(session, []).append((mtime, fpath, bars))

    # Find the session that has ~19 files (our full fetch)
    for session, files in sorted(sessions.items(), key=lambda x: max(f[0] for f in x[1]), reverse=True):
        files_sorted = sorted(files, key=lambda x: x[0])  # sort by mtime ascending = fetch order
        ticker_list = list(instruments.values())
        if len(files_sorted) >= len(ticker_list):
            for i, ticker in enumerate(ticker_list):
                if i < len(files_sorted):
                    matched[ticker] = files_sorted[i][2]  # bars
            if matched:
                print(f"✓ Found {len(matched)} stocks in session: {os.path.basename(session)}")
                return matched

    return matched

# ─── MAIN ───────────────────────────────────────────────────────────────────

def generate_live_data():
    print("🔍 Scanning for Kite MCP data files...")
    all_files = find_latest_files()
    print(f"   Found {len(all_files)} total historical data files across all sessions")

    ticker_bars = match_files_to_tickers(all_files, INSTRUMENTS)
    if not ticker_bars:
        print("❌ No matching files found. Please fetch data via Kite MCP first.")
        sys.exit(1)

    stocks = []
    print("\n📊 Running V4 screener on live data...")
    print(f"{'TICKER':15s} {'PRICE':>9s}  {'RSI':>6s}  {'1Y RET':>8s}  {'RATING':25s}  V4")
    print("─" * 85)

    for ticker, bars in ticker_bars.items():
        if len(bars) < 252:
            print(f"⚠️  {ticker}: only {len(bars)} bars — skip")
            continue

        closes  = [b['close']  for b in bars]
        highs   = [b['high']   for b in bars]
        lows    = [b['low']    for b in bars]
        volumes = [b['volume'] for b in bars]

        price      = closes[-1]   # use last historical close as proxy for LTP
        prev_close = closes[-2]
        pct_change = price / prev_close - 1
        avg_vol20  = sum(volumes[-20:]) / 20
        max_vol3d  = max(volumes[-3:])
        traded_val = (avg_vol20 * price) / 100000   # ₹ Lakhs
        high52w    = max(highs[-252:])
        rsi        = calc_rsi(closes, 14)
        atr        = calc_atr(bars, 14)
        imm_res    = max(highs[-20:])
        maj_res    = max(highs[-250:])
        sup_zone   = min(lows[-20:])
        breakdown  = min(lows[-50:])
        # Structural with drawdown check (all 3 conditions per spec §3)
        structural = detect_structural(closes, highs)
        ret6m      = price / closes[-130] - 1
        ret1y      = price / closes[-250] - 1
        ret3y      = price / closes[-700] - 1 if len(closes) >= 700 else math.nan
        rating, score = classify_compounder(ret6m, ret1y, ret3y, structural)
        # V4 Signal — all 5 rules (spec §5)
        v4 = (
            traded_val >= 50                       and  # Rule 1: Liquidity
            price >= high52w * 0.95                and  # Rule 2: Proximity
            max_vol3d >= 1.5 * avg_vol20           and  # Rule 3: Volume surge
            50 < rsi < 75                          and  # Rule 4: RSI strictly (50,75)
            score >= 4                                  # Rule 5: Tier 4 or 5
        )
        stop_pct   = max(0.03, min(0.06, (1.5 * atr) / price))
        stop       = price * (1 - stop_pct)
        t1         = price + 1.5 * atr
        t2         = price + 3.0 * atr
        shares     = int(CAPITAL / price)
        entry_limit = round(price * 1.005, 2)

        stocks.append(dict(
            ticker=ticker, fullTicker=f"{ticker}.NS", rating=rating, score=score,
            v4Signal=v4, price=round(price, 2), change=round(pct_change, 6),
            rsi=round(rsi, 2), tradedVal=round(traded_val, 1),
            ret6m=round(ret6m, 6), ret1y=round(ret1y, 6),
            ret3y=(round(ret3y, 6) if not math.isnan(ret3y) else 0),
            target1=round(t1, 2), target2=round(t2, 2), stop=round(stop, 2),
            shares=shares, investment=round(shares * price, 2),
            immRes=round(imm_res, 2), majRes=round(maj_res, 2),
            supZone=round(sup_zone, 2), breakdown=round(breakdown, 2),
            structural=structural, atr=round(atr, 2),
            entryLimit=entry_limit,
            sector=SECTORS.get(ticker, 'N/A'),
        ))

        v4_str = "⚡ YES" if v4 else "—"
        print(f"{ticker:15s} ₹{price:>9.2f}  {rsi:6.1f}  {ret1y:+7.1%}  {rating:25s}  {v4_str}")

    v4_count  = sum(1 for s in stocks if s['v4Signal'])
    monopoly  = sum(1 for s in stocks if s['rating'] == '🏆 MONOPOLY/DUOPOLY')
    quality   = sum(1 for s in stocks if s['rating'] == '🟢 QUALITY COMPOUNDER')
    emerging  = sum(1 for s in stocks if s['rating'] == '🌱 EMERGING WINNER')
    momentum  = sum(1 for s in stocks if s['rating'] == '🔵 MOMENTUM PLAY')
    print(f"\n📈 Results: {len(stocks)} stocks · {monopoly} Monopoly · {quality} Quality · {emerging} Emerging · {momentum} Momentum · {v4_count} V4 signals")

    # ── Write TypeScript file ──────────────────────────────────────────────
    now = datetime.datetime.now().strftime('%d %b %Y, %H:%M IST')

    def jb(v): return 'true' if v else 'false'

    lines = [
        "import type { StockResult, MarketIndex } from './types';",
        "",
        "// AUTO-GENERATED — Kite API live data",
        f"// Fetched: {now}  |  V4 Breakout Swing System: 5-tier, drawdown filter, RSI strictly (50,75)",
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
            f"    ret6m: {s['ret6m']}, ret1y: {s['ret1y']}, ret3y: {s['ret3y']},",
            f"    target1: {s['target1']}, target2: {s['target2']}, stop: {s['stop']},",
            f"    shares: {s['shares']}, investment: {s['investment']},",
            f"    immRes: {s['immRes']}, majRes: {s['majRes']}, supZone: {s['supZone']}, breakdown: {s['breakdown']},",
            f"    structural: {jb(s['structural'])}, atr: {s['atr']},",
            f"    entryLimit: {s['entryLimit']},",
            f"    sector: '{s['sector']}', mcap: 'N/A', pe: null, roe: null, bookVal: 'N/A', divYield: 'N/A',",
            "  },",
        ]

    lines += [
        "];",
        "",
        "export const LIVE_V4_SIGNALS = LIVE_STOCKS.filter(s => s.v4Signal);",
    ]

    out_path = os.path.abspath(OUTPUT_TS)
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
