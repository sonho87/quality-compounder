import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import requests
import xml.etree.ElementTree as ET
import time
import os
import google.generativeai as genai

st.set_page_config(page_title="Quant Terminal: V3 Swing", page_icon="⚡", layout="wide")

# --- ANTI-BLOCKING BROWSER SPOOFER ---
yf_session = requests.Session()
yf_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

# --- SIDEBAR CONTROLS ---
st.sidebar.title("⚡ V3 Swing Terminal")
st.sidebar.subheader("📂 Upload NSE Stock List")
uploaded_file = st.sidebar.file_uploader("Upload CSV with SYMBOL column", type=['csv'])

if st.sidebar.button("🔄 Clear Cache & Restart"): 
    st.cache_data.clear()
    st.sidebar.success("Memory cleared! Ready for fresh data.")

# --- DEVELOPER MODE ---
st.sidebar.divider()
st.sidebar.subheader("🧪 Developer Controls")
offline_mode = st.sidebar.checkbox("🔌 Offline Test Mode (15 Stocks)", value=True)
st.sidebar.caption("When checked, runs offline.")

# --- AI CONFIGURATION ---
st.sidebar.divider()
st.sidebar.subheader("🤖 AI Co-Pilot")
gemini_api_key = st.sidebar.text_input("Enter Gemini API Key", type="password")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)

# --- RISK MANAGEMENT (V3 EXACT PARAMETERS) ---
st.sidebar.divider()
st.sidebar.subheader("🛡️ Swing Risk Limits")
portfolio_capital = st.sidebar.number_input("Capital Per Trade (₹)", min_value=10000, value=33000, step=1000)
max_position_cap_pct = 0.33 # Hardcoded 33% max per stock rule

st.sidebar.divider()
st.sidebar.subheader("🎛️ V3 Momentum Filters")
min_trade_val_lakhs = st.sidebar.number_input("Min Daily Traded Val (Lakhs)", value=50)
st.sidebar.caption("Filters out thin stocks prone to gapping.")

# --- LIVE GOOGLE NEWS ENGINE ---
@st.cache_data(ttl=1800)
def fetch_live_news(query, offline=False):
    if offline:
        return [{"Title": "Test Mode Active - No Internet Required", "Link": "#", "Publisher": "Local Dev", "Date": "Today"}]
    try:
        safe_query = query.replace(' ', '%20')
        url = f"https://news.google.com/rss/search?q={safe_query}&hl=en-IN&gl=IN&ceid=IN:en"
        resp = requests.get(url, timeout=5)
        root = ET.fromstring(resp.content)
        news = []
        for item in root.findall('.//item')[:4]: 
            title = item.find('title').text
            link = item.find('link').text
            pub_date = item.find('pubDate').text
            clean_title = title.rsplit(' - ', 1)[0]
            publisher = title.rsplit(' - ', 1)[-1] if ' - ' in title else "News Source"
            news.append({"Title": clean_title, "Link": link, "Publisher": publisher, "Date": pub_date[:-15]})
        return news
    except: return []

# --- MARKET INDICES ---
@st.cache_data(ttl=300)
def fetch_market_indices(offline=False):
    if offline:
        return [
            {"Name": "NIFTY 50", "Price": 22500, "Change": -0.012},
            {"Name": "BANK", "Price": 48000, "Change": -0.008},
            {"Name": "IT", "Price": 35000, "Change": -0.005},
            {"Name": "METAL", "Price": 8500, "Change": 0.021},
            {"Name": "ENERGY", "Price": 39000, "Change": 0.015}
        ]
    tickers = ['^NSEI', '^NSEBANK', '^CNXIT', '^CNXMETAL', '^CNXENERGY']
    names = ['NIFTY 50', 'BANK', 'IT', 'METAL', 'ENERGY']
    try:
        df = yf.download(tickers, period="5d", progress=False, threads=False)
        if df.empty: return []
        closes = df['Close'].ffill()
        results = []
        for t, n in zip(tickers, names):
            if t in closes.columns and len(closes[t].dropna()) >= 2:
                curr = float(closes[t].dropna().iloc[-1])
                prev = float(closes[t].dropna().iloc[-2])
                pct = (curr / prev) - 1
                results.append({"Name": n, "Price": curr, "Change": pct})
        return results
    except: return []

# --- BULK PRICE ENGINE ---
@st.cache_data(ttl=600)
def fetch_bulk_price_data(tickers, offline=False):
    if offline:
        tickers = tickers[:15] 
        if os.path.exists("v6_local_test_data.pkl"):
            return pd.read_pickle("v6_local_test_data.pkl")
        else:
            df = yf.download(tickers, period="3y", progress=False, threads=True)
            df.to_pickle("v6_local_test_data.pkl")
            return df

    all_tickers = list(tickers)[:500] 
    chunk_size = 50 
    chunks = [all_tickers[i:i + chunk_size] for i in range(0, len(all_tickers), chunk_size)]
    combined_data = None
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    try:
        for i, chunk in enumerate(chunks):
            status_text.text(f"📥 Downloading Price Batch {i+1} of {len(chunks)}...")
            temp_df = yf.download(chunk, period="3y", progress=False, threads=False)
            if temp_df is not None and not temp_df.empty:
                if combined_data is None: combined_data = temp_df
                else: combined_data = pd.concat([combined_data, temp_df], axis=1)
            time.sleep(2) 
            progress_bar.progress((i + 1) / len(chunks))
            
        status_text.empty()
        progress_bar.empty()
        
        if combined_data is None or combined_data.empty: return None
        combined_data.index = pd.to_datetime(combined_data.index)
        if combined_data.index.tz is not None: combined_data.index = combined_data.index.tz_convert('Asia/Kolkata').tz_localize(None)
        combined_data.index = combined_data.index.normalize()
        combined_data = combined_data.loc[:, ~combined_data.columns.duplicated()]
        return combined_data.ffill() 
    except Exception as e:
        st.error(f"⚠️ Network Error during download: {str(e)}")
        return None

# --- INDICATOR MATH ---
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
        return False, "Insufficient data (< 1 Year)"
    one_year = close_series.tail(250)
    q1 = one_year.iloc[:62].max()
    q2 = one_year.iloc[62:125].max()
    q3 = one_year.iloc[125:187].max()
    q4 = one_year.iloc[187:].max()
    quarters_rising = (q2 >= q1 and q3 >= q2 and q4 >= q3)
    rolling_max = one_year.expanding().max()
    drawdown = (one_year / rolling_max) - 1
    max_dd = drawdown.min()
    limited_drawdown = max_dd > -0.25  
    is_structural = quarters_rising and limited_drawdown
    
    if is_structural: return True, "Consistent quarterly highs + limited drawdowns"
    elif not quarters_rising: return False, "Inconsistent quarterly highs"
    else: return False, f"Excessive drawdown ({max_dd:.1%})"

def classify_compounder(ret_6m, ret_1y, ret_3y, structural, consistent_growth, roe, missing_fundamentals=False):
    if missing_fundamentals and structural:
        return "⚠️ DATA BLOCKED (Strong Structure)", 3
    if (pd.notna(ret_3y) and ret_3y >= 1.50 and structural and consistent_growth and pd.notna(roe) and roe > 0.15):
        return "👑 MONOPOLY/DUOPOLY", 5
    if (pd.notna(ret_1y) and ret_1y >= 0.40 and structural and consistent_growth):
        return "🟢 QUALITY COMPOUNDER", 4
    if (pd.notna(ret_6m) and ret_6m >= 0.30 and structural and consistent_growth):
        return "🟡 EMERGING WINNER", 3
    if pd.notna(ret_6m) and ret_6m >= 0.30 and structural:
        return "🔵 MOMENTUM PLAY", 2
    if not structural: return "🔴 CHOPPY", 0
    return "🔴 WEAK RETURNS", 0

# --- ON-DEMAND SINGLE STOCK EVALUATOR (V3 UPDATE) ---
@st.cache_data(show_spinner=False, ttl=600)
def evaluate_single_stock(full_ticker, _hist_data, offline, capital, min_trade_val):
    ticker_clean = full_ticker.replace('.NS', '')
    if _hist_data is None or 'Close' not in _hist_data.columns or full_ticker not in _hist_data['Close'].columns:
        return None
        
    df_ticker = pd.DataFrame({
        'Close': _hist_data['Close'][full_ticker],
        'High': _hist_data['High'][full_ticker] if 'High' in _hist_data.columns else _hist_data['Close'][full_ticker],
        'Low': _hist_data['Low'][full_ticker] if 'Low' in _hist_data.columns else _hist_data['Close'][full_ticker],
        'Volume': _hist_data['Volume'][full_ticker] if 'Volume' in _hist_data.columns else 0
    }).dropna()
    
    if len(df_ticker) < 252: return None 
    
    current_price = df_ticker['Close'].iloc[-1]
    avg_vol_20 = df_ticker['Volume'].tail(20).mean()
    traded_val_lakhs = (avg_vol_20 * current_price) / 100000
    
    # Technical Indicators
    high52 = df_ticker['High'].tail(252).max()
    rsi = calc_rsi(df_ticker['Close'], 14)
    current_rsi = rsi.iloc[-1]
    atr = calc_atr(df_ticker, 14)
    current_atr = atr.iloc[-1]
    
    # Quality Scoring logic
    ret_1m = (current_price / df_ticker['Close'].iloc[-22] - 1)
    ret_6m = (current_price / df_ticker['Close'].iloc[-130] - 1) 
    ret_1y = (current_price / df_ticker['Close'].iloc[-250] - 1) 
    ret_3y = (current_price / df_ticker['Close'].iloc[0] - 1) if len(df_ticker) >= 700 else None
    
    structural, structure_reason = detect_structural_strength(df_ticker['Close'])
    
    profit_growth, consistent_growth, roe, pe, sector, mcap = None, False, None, None, "N/A", None
    missing_fundamentals = False
    
    if offline:
        profit_growth, consistent_growth, roe, pe, sector = 0.18, True, 0.22, 45.0, "Technology"
    else:
        try:
            tkr = yf.Ticker(full_ticker)
            info = tkr.info
            if not info or len(info) < 5: missing_fundamentals = True
            else:
                sector = info.get('sector', 'N/A')
                mcap = info.get('marketCap')
                pe = info.get('trailingPE')
                roe = info.get('returnOnEquity')
                q_fin = tkr.quarterly_financials
                if q_fin is not None and not q_fin.empty and 'Net Income' in q_fin.index:
                    ni = q_fin.loc['Net Income'].dropna()
                    if len(ni) >= 3:
                        growth_rates = [(ni.iloc[j] / ni.iloc[j+1]) - 1 for j in range(min(3, len(ni)-1)) if ni.iloc[j+1] != 0]
                        if len(growth_rates) >= 2:
                            profit_growth = growth_rates[0] 
                            consistent_growth = sum(1 for g in growth_rates if g > 0) >= 2
                else: missing_fundamentals = True
        except: missing_fundamentals = True

    rating, score = classify_compounder(ret_6m, ret_1y, ret_3y, structural, consistent_growth, roe, missing_fundamentals)
    
    # V3 EXACT PARAMETER EVALUATION
    is_breakout = current_price >= (high52 * 0.98) # Within 2% of 52w high is considered breakout zone
    is_vol_surge = df_ticker['Volume'].iloc[-1] > (1.5 * avg_vol_20)
    is_rsi_valid = 50 <= current_rsi <= 72
    is_quality = score >= 4 # Matches Quality or Monopoly (35/50 proxy)
    
    v3_signal = False
    fail_reason = []
    
    if traded_val_lakhs < min_trade_val: fail_reason.append(f"Low Traded Val ({traded_val_lakhs:.1f}L)")
    if not is_breakout: fail_reason.append("Not at 52w High")
    if not is_vol_surge: fail_reason.append("No Vol Surge")
    if not is_rsi_valid: fail_reason.append(f"RSI {current_rsi:.1f} outside 50-72")
    if not is_quality: fail_reason.append("Failed Quality Tier")
    
    if not fail_reason: v3_signal = True
    
    # V3 STOP & TARGET MATH
    raw_stop_dist = 1.5 * current_atr
    raw_stop_pct = raw_stop_dist / current_price
    stop_pct = max(0.03, min(0.06, raw_stop_pct)) # Clamp between 3% and 6%
    
    stop_price = current_price * (1 - stop_pct)
    target_1 = current_price * 1.04
    target_2 = current_price * 1.07
    
    # Position Sizing
    shares = int(capital / current_price) if current_price > 0 else 0
    investment = shares * current_price
    
    return {
        "Ticker": ticker_clean, "Full_Ticker": full_ticker,
        "Rating": rating, "Score": score, "V3_Signal": v3_signal, "Fail_Reason": " | ".join(fail_reason),
        "Price (₹)": current_price, "Traded_Val (L)": traded_val_lakhs, "RSI": current_rsi,
        "Structural": "✓" if structural else "✗", "Structure Note": structure_reason,
        "Growth": "✓" if consistent_growth else "?", "Profit↑": profit_growth, "ROE": roe, "P/E": pe,
        "Missing Data": missing_fundamentals,
        "Target 1 (₹)": target_1, "Target 2 (₹)": target_2, "Stop (₹)": stop_price, "Stop Pct": stop_pct,
        "Shares": shares, "Investment (₹)": investment,
        "1-Month": ret_1m, "6-Month": ret_6m, "1-Year": ret_1y,
        "Sector": sector, "M.Cap (Cr)": (mcap / 10000000) if mcap else None
    }

# --- SCRENER BUILDER ---
@st.cache_data(ttl=60)
def build_v7_screener(tickers_list, offline=False, capital=33000, min_val=50):
    survivors = []
    processing_list = tickers_list[:15] if offline else tickers_list
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    for i, ticker in enumerate(processing_list):
        status_text.text(f"🔍 Validating V3 Exact Parameters for {i+1}/{len(processing_list)}...")
        stock_data = evaluate_single_stock(ticker, hist_data, offline, capital, min_val)
        if stock_data: survivors.append(stock_data)
        progress_bar.progress((i + 1) / len(processing_list))
        
    status_text.empty()
    progress_bar.empty()
    return pd.DataFrame(survivors)

# --- APP EXECUTION ---
if uploaded_file is not None:
    try:
        df_upload = pd.read_csv(uploaded_file)
        df_upload.columns = df_upload.columns.str.strip().str.upper()
        if 'SYMBOL' in df_upload.columns:
            raw_tickers = df_upload['SYMBOL'].dropna().astype(str).tolist()
            all_tickers = [t + '.NS' if not t.endswith(('.NS', '.BO')) else t for t in raw_tickers if ' ' not in t and t.strip() != '']
        else:
            st.sidebar.error("🚨 CSV must have 'SYMBOL' column")
            st.stop()
    except: st.stop()
else:
    st.info("👈 Upload your NSE CSV to begin")
    st.stop()

if offline_mode: st.info("🧪 **OFFLINE MODE ACTIVE:** Reading 15 stocks from local database.")

with st.spinner("📥 Fetching 3-year bulk price data..."):
    hist_data = fetch_bulk_price_data(all_tickers, offline=offline_mode)
    
if hist_data is None or 'Close' not in hist_data.columns:
    st.error("🚨 Connection failed. Please check the network error details above, clear cache, and try again.")
    st.stop()

with st.spinner("🛡️ Running V3 Momentum Swing Funnel..."):
    master_df = build_v7_screener(all_tickers, offline=offline_mode, capital=portfolio_capital, min_val=min_trade_val_lakhs)

# --- UI TABS ---
tab1, tab2, tab3, tab4 = st.tabs(["⚡ V3 Action Signals", "📊 Full Screener", "🔍 Deep Dive", "🤖 AI Co-Pilot"])

def format_pct(val): return f"{val:.1%}" if pd.notna(val) else "N/A"
def style_rating(val):
    if '👑' in val: return 'background-color: #ffd700; color: #000; font-weight: bold;'
    if '🟢' in val: return 'background-color: #d4edda; color: #155724;'
    if '🟡' in val: return 'background-color: #fff3cd; color: #856404;'
    if '⚠️' in val: return 'background-color: #e2e3e5; color: #383d41;'
    if '🔵' in val: return 'background-color: #d1ecf1; color: #0c5460;'
    if '🔴' in val: return 'background-color: #f8d7da; color: #721c24;'
    return ''

with tab1:
    st.subheader("📊 Market Overview")
    indices = fetch_market_indices(offline=offline_mode)
    if indices:
        cols = st.columns(len(indices))
        for i, idx in enumerate(indices):
            cols[i].metric(idx['Name'], f"₹{idx['Price']:,.0f}", f"{idx['Change']:.2%}")
    
    st.divider()
    st.subheader("⚡ V3 Swing Breakouts (Action Required)")
    
    if not master_df.empty:
        # Filter for strictly V3 Signal passing stocks
        top_df = master_df[master_df['V3_Signal'] == True].copy() if not offline_mode else master_df.copy()
        
        if len(top_df) > 0:
            display_cols = ['Ticker', 'Rating', 'Price (₹)', 'Stop (₹)', 'Target 1 (₹)', 'RSI', 'Traded_Val (L)']
            display_df = top_df[display_cols].copy()
            
            display_df['Price (₹)'] = display_df['Price (₹)'].apply(lambda x: f"₹{x:.2f}")
            display_df['Stop (₹)'] = display_df['Stop (₹)'].apply(lambda x: f"₹{x:.2f}")
            display_df['Target 1 (₹)'] = display_df['Target 1 (₹)'].apply(lambda x: f"₹{x:.2f}")
            display_df['RSI'] = display_df['RSI'].apply(lambda x: f"{x:.1f}")
            display_df['Traded_Val (L)'] = display_df['Traded_Val (L)'].apply(lambda x: f"₹{x:,.0f} L")
            
            st.dataframe(display_df.style.map(style_rating, subset=['Rating']), use_container_width=True, hide_index=True)
        else:
            st.warning("⚠️ No stocks passed the strict V3 Swing parameters today.")
    else:
        st.warning("No stocks passed the initial technical screen.")

with tab2:
    st.subheader("📊 Full Screener Results (V3 Diagnostics)")
    if not master_df.empty:
        sector_df = master_df.sort_values(['Score', '1-Year'], ascending=[False, False])
        display_cols = ['Ticker', 'Rating', 'V3_Signal', 'Fail_Reason', 'Price (₹)', 'RSI', 'Traded_Val (L)']
        display_df = sector_df[display_cols].copy()
        
        display_df['V3_Signal'] = display_df['V3_Signal'].apply(lambda x: "✅ PASS" if x else "❌ FAIL")
        display_df['Price (₹)'] = display_df['Price (₹)'].apply(lambda x: f"₹{x:.2f}")
        display_df['RSI'] = display_df['RSI'].apply(lambda x: f"{x:.1f}")
        display_df['Traded_Val (L)'] = display_df['Traded_Val (L)'].apply(lambda x: f"₹{x:,.0f} L")
        
        st.dataframe(display_df.style.map(style_rating, subset=['Rating']), use_container_width=True, hide_index=True)

with tab3:
    st.subheader("🔍 Universal Deep Dive Analysis")
    colA, colB = st.columns([1, 2.5])
    with colA:
        full_stock_list = sorted([t.replace('.NS', '') for t in all_tickers])
        selected = st.selectbox("Search ANY Uploaded Stock (Type to search):", full_stock_list, key="deepdive_search")
        full_ticker = next(t for t in all_tickers if t.startswith(selected))
        
        row = None
        if not master_df.empty and selected in master_df['Ticker'].values:
            row = master_df[master_df['Ticker'] == selected].iloc[0].to_dict()
        else:
            with st.spinner(f"Running instant algorithmic analysis on {selected}..."):
                row = evaluate_single_stock(full_ticker, hist_data, offline_mode, portfolio_capital, min_trade_val_lakhs)
        
        if row is None:
            st.error(f"Not enough historical data available to analyze {selected}.")
        else:
            st.divider()
            st.metric("Current Price (Market Entry)", f"₹{row['Price (₹)']:.2f}")
            
            if row['V3_Signal']:
                st.success("#### 🎯 V3 Action: ⚡ BUY BREAKOUT")
            else:
                st.error("#### 🎯 V3 Action: 🔴 AVOID")
                st.caption(f"**Failed Because:** {row['Fail_Reason']}")
            
            st.divider()
            st.markdown("### 🏆 Compounder Tier")
            st.write(f"**Classification:** {row['Rating']}")

            if "⚠️" in row['Rating']: st.warning("⚠️ **API DATA BLOCKED:** Verify fundamental quality externally.")
            elif "👑" in row['Rating']: st.success("✅ **MONOPOLY/DUOPOLY**")
            elif "🟢" in row['Rating']: st.success("✅ **QUALITY COMPOUNDER**")
            elif "🟡" in row['Rating']: st.info("⚡ **EMERGING WINNER**")
            elif "🔵" in row['Rating']: st.warning("⚠️ **MOMENTUM PLAY**")
            elif "CHOPPY" in row['Rating']: st.error("❌ **CHOPPY TREND - AVOID**")
            elif "WEAK" in row['Rating']: st.error("❌ **WEAK RETURNS - AVOID**")
            
            st.divider()
            st.markdown("### 📝 Strict V3 Execution Plan")
            st.info(f"🔵 **Entry:** Market Price (₹{row['Price (₹)']:.2f})")
            st.error(f"🔴 **Stop Loss:** ₹{row['Stop (₹)']:.2f} *(-{row['Stop Pct']:.1%} | 1.5x ATR)*")
            st.success(f"🟢 **Target 1 (+4%):** ₹{row['Target 1 (₹)']:.2f} *(Sell 50%, Move Stop to Break-Even)*")
            st.success(f"🟢 **Target 2 (+7%):** ₹{row['Target 2 (₹)']:.2f} *(Sell Remaining 50%)*")
            st.warning("⏱️ **TIME STOP:** Friday @ 3:10 PM. Cancel GTTs, Sell at Market. Zero exceptions.")
            
            st.write(f"**Capital Allocated:** ₹{row['Investment (₹)']:,.0f}")
            
            st.divider()
            st.markdown("### 🏢 Technicals & Fundamentals")
            st.write(f"**14-Day RSI:** {row['RSI']:.1f}")
            st.write(f"**Daily Traded Val:** ₹{row['Traded_Val (L)']:.0f} Lakhs")
            
            if row.get('Missing Data', False):
                st.error("Data provider blocked fundamental request. Check externally.")
            else:
                profit_display = format_pct(row['Profit↑'])
                st.write(f"**QoQ Profit Growth:** {profit_display}") 
                st.write(f"**ROE:** {format_pct(row['ROE'])}")
            
    with colB:
        if row is not None and full_ticker in hist_data['Close'].columns:
            chart_data = pd.DataFrame({'Close': hist_data['Close'][full_ticker], 'Volume': hist_data['Volume'][full_ticker]}).tail(250).dropna()
            if not chart_data.empty:
                chart_data['MA50'] = chart_data['Close'].rolling(50).mean()
                chart_data['MA200'] = chart_data['Close'].rolling(200).mean()
                
                fig = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.05, row_heights=[0.7, 0.3])
                fig.add_trace(go.Scatter(x=chart_data.index, y=chart_data['Close'], name='Price', line=dict(color='#2962FF', width=2)), row=1, col=1)
                fig.add_trace(go.Scatter(x=chart_data.index, y=chart_data['MA50'], name='50-MA', line=dict(color='orange', width=1.5)), row=1, col=1)
                fig.add_trace(go.Scatter(x=chart_data.index, y=chart_data['MA200'], name='200-MA', line=dict(color='red', width=1.5, dash='dot')), row=1, col=1)
                
                diffs = chart_data['Close'].diff()
                vol_colors = ['#26A69A' if d >= 0 else '#EF5350' for d in diffs]
                vol_colors[0] = '#26A69A' 
                
                fig.add_trace(go.Bar(x=chart_data.index, y=chart_data['Volume'], name='Volume', marker_color=vol_colors), row=2, col=1)
                
                fig.update_layout(template='plotly_white', height=500, showlegend=True, margin=dict(l=0, r=0, t=30, b=0))
                
                # Add horizontal lines for V3 Targets and Stops
                fig.add_hline(y=row['Target 1 (₹)'], line_dash="dash", line_color="green", annotation_text="T1 (+4%)")
                fig.add_hline(y=row['Target 2 (₹)'], line_dash="dash", line_color="darkgreen", annotation_text="T2 (+7%)")
                fig.add_hline(y=row['Stop (₹)'], line_dash="dash", line_color="red", annotation_text="Stop Loss")
                
                st.plotly_chart(fig, use_container_width=True)
                
        if row is not None:
            st.divider()
            st.subheader(f"📰 Recent News: {selected}")
            with st.spinner("Fetching news..."):
                news = fetch_live_news(f"{selected} NSE stock India news", offline=offline_mode)
            
            if news:
                for item in news:
                    st.markdown(f"**[{item['Title']}]({item['Link']})**")
                    st.caption(f"{item['Publisher']} • {item['Date']}")
                    st.write("---")

# --- TAB 4: GEMINI AI CO-PILOT ---
with tab4:
    st.subheader("🤖 Universal Gemini Quant Co-Pilot")
    
    if not gemini_api_key:
        st.warning("⚠️ Please enter your Gemini API Key in the sidebar to activate the AI Co-Pilot.")
    else:
        colA, colB = st.columns([1, 2])
        
        with colA:
            st.markdown("### Context Selection")
            ai_stock_list = sorted([t.replace('.NS', '') for t in all_tickers])
            selected_ai_stock = st.selectbox("Select ANY Stock to Feed AI:", ai_stock_list, key="ai_select")
            ai_full_ticker = next(t for t in all_tickers if t.startswith(selected_ai_stock))
            
            ai_row = None
            if not master_df.empty and selected_ai_stock in master_df['Ticker'].values:
                ai_row = master_df[master_df['Ticker'] == selected_ai_stock].iloc[0].to_dict()
            else:
                with st.spinner(f"Evaluating {selected_ai_stock} for the AI..."):
                    ai_row = evaluate_single_stock(ai_full_ticker, hist_data, offline_mode, portfolio_capital, min_trade_val_lakhs)

            if ai_row is None:
                st.error("Cannot load data for this stock.")
            else:
                st.info("💡 **Try asking:**\n- Summarize the recent news impact.\n- Why did this fail the V3 parameters?\n- Is the RSI confirming momentum?")
                
                with st.spinner("Gathering context for AI..."):
                    recent_news = fetch_live_news(f"{selected_ai_stock} NSE stock India news", offline=offline_mode)
                    news_text = "\n".join([f"- {item['Title']} ({item['Publisher']})" for item in recent_news]) if recent_news else "No recent news."
                    
                st.success(f"Context loaded for {selected_ai_stock}. The AI is ready.")

        with colB:
            if ai_row is not None:
                if "messages" not in st.session_state:
                    st.session_state.messages = []

                for message in st.session_state.messages:
                    with st.chat_message(message["role"]):
                        st.markdown(message["content"])

                if prompt := st.chat_input(f"Ask Gemini about {selected_ai_stock}..."):
                    st.session_state.messages.append({"role": "user", "content": prompt})
                    with st.chat_message("user"):
                        st.markdown(prompt)

                    with st.chat_message("assistant"):
                        with st.spinner("Analyzing V3 swing data and news..."):
                            try:
                                system_context = f"""
                                You are a quantitative trading assistant advising a professional swing trader. 
                                Analyze the following stock context and answer the user's prompt directly and concisely.
                                
                                Stock Ticker: {selected_ai_stock}
                                V3 Signal Status: {'PASS' if ai_row['V3_Signal'] else 'FAIL - ' + ai_row['Fail_Reason']}
                                Current Price: ₹{ai_row['Price (₹)']}
                                14-Day RSI: {ai_row['RSI']:.1f}
                                Stop Loss: ₹{ai_row['Stop (₹)']}
                                Target 1: ₹{ai_row['Target 1 (₹)']}
                                Target 2: ₹{ai_row['Target 2 (₹)']}
                                System Rating: {ai_row['Rating']}
                                
                                Recent News Headlines:
                                {news_text}
                                """
                                
                                model = genai.GenerativeModel('gemini-1.5-pro')
                                response = model.generate_content(system_context + "\n\nUser Prompt: " + prompt)
                                
                                st.markdown(response.text)
                                st.session_state.messages.append({"role": "assistant", "content": response.text})
                            except Exception as e:
                                st.error(f"AI Error: Make sure your API key is valid. Detail: {e}")
