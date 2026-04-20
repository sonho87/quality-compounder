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

st.set_page_config(page_title="Quality Compounder V6.8", page_icon="👑", layout="wide")

# --- ANTI-BLOCKING BROWSER SPOOFER ---
# This tricks Yahoo into thinking the app is a real human browser
yf_session = requests.Session()
yf_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

# --- SIDEBAR CONTROLS ---
st.sidebar.title("👑 Quality Compounder V6.8")
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

# --- RISK MANAGEMENT ---
st.sidebar.divider()
st.sidebar.subheader("🛡️ Risk Management")
portfolio_capital = st.sidebar.number_input("Total Portfolio Capital (₹)", min_value=10000, value=500000, step=50000)
risk_per_trade_pct = st.sidebar.slider("Max Risk per Trade (%)", 0.5, 5.0, 2.0, 0.5) / 100
max_position_cap_pct = st.sidebar.slider("Max Position Size (% of Port)", 5.0, 30.0, 20.0, 5.0) / 100

# --- COMPOUNDER FILTERS ---
st.sidebar.divider()
st.sidebar.subheader("🎛️ Compounder Filters")
min_6m_return = st.sidebar.slider("Min 6-Month Return (%)", 15, 100, 30)
min_1y_return = st.sidebar.slider("Min 1-Year Return (%)", 20, 150, 40)
min_vol_lakhs = st.sidebar.number_input("Min Daily Volume (Lakhs)", 1, 200, 25)
allow_recent_dips = st.sidebar.checkbox("Allow Recent 2-5% Dips", value=True)

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
        df = yf.download(tickers, period="5d", progress=False, threads=False, session=yf_session)
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
            df = yf.download(tickers, period="3y", progress=False, threads=True, session=yf_session)
            df.to_pickle("v6_local_test_data.pkl")
            return df

    all_tickers = list(tickers)[:500] 
    chunk_size = 100
    chunks = [all_tickers[i:i + chunk_size] for i in range(0, len(all_tickers), chunk_size)]
    combined_data = None
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    try:
        for i, chunk in enumerate(chunks):
            status_text.text(f"📥 Downloading 3-Year Price Batch {i+1} of {len(chunks)}...")
            temp_df = yf.download(chunk, period="3y", progress=False, threads=True, session=yf_session)
            if temp_df is not None and not temp_df.empty:
                if combined_data is None: combined_data = temp_df
                else: combined_data = pd.concat([combined_data, temp_df], axis=1)
            time.sleep(1) 
            progress_bar.progress((i + 1) / len(chunks))
            
        status_text.empty()
        progress_bar.empty()
        
        if combined_data is None or combined_data.empty: return None
        combined_data.index = pd.to_datetime(combined_data.index)
        if combined_data.index.tz is not None: combined_data.index = combined_data.index.tz_convert('Asia/Kolkata').tz_localize(None)
        combined_data.index = combined_data.index.normalize()
        combined_data = combined_data.loc[:, ~combined_data.columns.duplicated()]
        return combined_data.ffill() 
    except Exception as e: return None

# --- V6 QUALITY COMPOUNDER LOGIC ---
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

def calculate_position_size(capital, entry_price, stop_price, risk_pct, max_cap_pct):
    if not stop_price or entry_price <= stop_price: return 0, 0
    risk_per_share = entry_price - stop_price
    max_capital_risk = capital * risk_pct
    shares_allowed = int(max_capital_risk / risk_per_share)
    total_investment = shares_allowed * entry_price
    max_position_value = capital * max_cap_pct
    if total_investment > max_position_value:
        shares_allowed = int(max_position_value / entry_price)
        total_investment = shares_allowed * entry_price
    return shares_allowed, total_investment

# --- ON-DEMAND SINGLE STOCK EVALUATOR ---
@st.cache_data(show_spinner=False, ttl=600)
def evaluate_single_stock(full_ticker, _hist_data, offline, capital, risk_pct, max_cap_pct):
    ticker_clean = full_ticker.replace('.NS', '')
    if _hist_data is None or 'Close' not in _hist_data.columns or full_ticker not in _hist_data['Close'].columns:
        return None
        
    close = _hist_data['Close'][full_ticker].dropna()
    vol = _hist_data['Volume'][full_ticker].dropna() if 'Volume' in _hist_data.columns else pd.Series(dtype='float64')
    
    if len(close) < 20: return None 
    
    avg_vol_lakhs = (vol.tail(20).mean() / 100000)
    current_price = close.iloc[-1]
    
    ret_1m = (close.iloc[-1] / close.iloc[-22] - 1) if len(close) >= 22 else None
    ret_6m = (close.iloc[-1] / close.iloc[-130] - 1) if len(close) >= 130 else None
    ret_1y = (close.iloc[-1] / close.iloc[-250] - 1) if len(close) >= 250 else None
    ret_3y = (close.iloc[-1] / close.iloc[0] - 1) if len(close) >= 700 else None
    
    structural, structure_reason = detect_structural_strength(close)
    
    profit_growth, consistent_growth, roe, pe, sector, mcap = None, False, None, None, "N/A", None
    missing_fundamentals = False
    
    if offline:
        profit_growth, consistent_growth, roe, pe, sector = 0.18, True, 0.22, 45.0, "Technology"
    else:
        try:
            # Using the spoofed session to bypass Yahoo blocks
            tkr = yf.Ticker(full_ticker, session=yf_session)
            info = tkr.info
            
            # If info is completely empty, Yahoo blocked us
            if not info or len(info) < 5:
                missing_fundamentals = True
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
                else:
                    missing_fundamentals = True
        except: 
            missing_fundamentals = True

    rating, score = classify_compounder(ret_6m, ret_1y, ret_3y, structural, consistent_growth, roe, missing_fundamentals)
    
    entry_price = current_price * 0.98 
    stop_price = entry_price * 0.85 
    target_price = entry_price * 1.30 if score == 5 else entry_price * 1.20
    shares, investment = calculate_position_size(capital, entry_price, stop_price, risk_pct, max_cap_pct)
    
    return {
        "Ticker": ticker_clean, "Full_Ticker": full_ticker,
        "Rating": rating, "Score": score,
        "Price (₹)": current_price, "Vol (L)": avg_vol_lakhs,
        "Structural": "✓" if structural else "✗", "Structure Note": structure_reason,
        "Growth": "✓" if consistent_growth else "?", "Profit↑": profit_growth, "ROE": roe, "P/E": pe,
        "Missing Data": missing_fundamentals,
        "Entry (₹)": entry_price, "Target (₹)": target_price, "Stop (₹)": stop_price, 
        "Shares": shares, "Investment (₹)": investment,
        "1-Month": ret_1m, "6-Month": ret_6m, "1-Year": ret_1y, "3-Year": ret_3y,
        "Sector": sector, "M.Cap (Cr)": (mcap / 10000000) if mcap else None
    }

# --- SCRENER BUILDER ---
@st.cache_data(ttl=60)
def build_v6_screener(tickers_list, offline=False, slider_6m=0.30, slider_1y=0.40):
    survivors = []
    processing_list = tickers_list[:15] if offline else tickers_list
    
    for ticker in processing_list:
        if ticker not in hist_data['Close'].columns: continue
        close = hist_data['Close'][ticker].dropna()
        vol = hist_data['Volume'][ticker].dropna() if 'Volume' in hist_data.columns else pd.Series(dtype='float64')
        if len(close) < 250: continue
        
        avg_vol_lakhs = (vol.tail(20).mean() / 100000) if len(vol) >= 20 else 0
        if avg_vol_lakhs < min_vol_lakhs and not offline: continue
        
        ret_1m = (close.iloc[-1] / close.iloc[-22] - 1) if len(close) >= 22 else None
        ret_6m = (close.iloc[-1] / close.iloc[-130] - 1) if len(close) >= 130 else None
        ret_1y = (close.iloc[-1] / close.iloc[-250] - 1) if len(close) >= 250 else None
        
        if allow_recent_dips and pd.notna(ret_1m) and ret_1m < 0:
            if ret_1m < -0.10: continue 
            if not (pd.notna(ret_6m) and ret_6m > 0.25): continue
            
        if pd.notna(ret_6m) and ret_6m >= slider_6m and pd.notna(ret_1y) and ret_1y >= slider_1y:
            survivors.append(ticker)

    results = []
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    for i, ticker in enumerate(survivors):
        status_text.text(f"🔍 Validating Quality Fundamentals for {i+1}/{len(survivors)}...")
        stock_data = evaluate_single_stock(ticker, hist_data, offline, portfolio_capital, risk_per_trade_pct, max_position_cap_pct)
        if stock_data and stock_data["Structural"] == "✓":
            results.append(stock_data)
        progress_bar.progress((i + 1) / len(survivors))
        
    status_text.empty()
    progress_bar.empty()
    return pd.DataFrame(results)

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
    st.error("🚨 Connection failed. Clear cache.")
    st.stop()

with st.spinner("🛡️ Running V6.8 Compounder Funnel..."):
    master_df = build_v6_screener(all_tickers, offline=offline_mode, slider_6m=min_6m_return/100, slider_1y=min_1y_return/100)

# --- UI TABS ---
tab1, tab2, tab3, tab4 = st.tabs(["👑 Quality Compounders", "📊 Full Screener", "🔍 Deep Dive", "🤖 AI Co-Pilot"])

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
    st.subheader("👑 Top Quality Compounders")
    
    if not master_df.empty:
        top_df = master_df.copy()
        top_df = top_df.sort_values(['Score', '1-Year'], ascending=[False, False]).head(20)
        
        if len(top_df) > 0:
            display_cols = ['Ticker', 'Rating', 'Structural', 'Growth', 'Price (₹)', 'Entry (₹)', 'Investment (₹)', '6-Month', '1-Year']
            display_df = top_df[display_cols].copy()
            
            display_df['6-Month'] = display_df['6-Month'].apply(format_pct)
            display_df['1-Year'] = display_df['1-Year'].apply(format_pct)
            display_df['Price (₹)'] = display_df['Price (₹)'].apply(lambda x: f"₹{x:.2f}")
            display_df['Entry (₹)'] = display_df['Entry (₹)'].apply(lambda x: f"₹{x:.2f}")
            display_df['Investment (₹)'] = display_df['Investment (₹)'].apply(lambda x: f"₹{x:,.0f}")
            
            st.dataframe(display_df.style.map(style_rating, subset=['Rating']), use_container_width=True, hide_index=True)
        else:
            st.warning("⚠️ No stocks passed the V6.8 Quality criteria today.")
    else:
        st.warning("No stocks passed the initial technical screen.")

with tab2:
    st.subheader("📊 Full Screener Results")
    if not master_df.empty:
        sector_df = master_df.sort_values(['Score', '1-Year'], ascending=[False, False])
        display_cols = ['Ticker', 'Rating', 'Structural', 'Price (₹)', 'Entry (₹)', '1-Month', '6-Month', '1-Year', 'P/E']
        display_df = sector_df[display_cols].copy()
        
        display_df['1-Month'] = display_df['1-Month'].apply(format_pct)
        display_df['6-Month'] = display_df['6-Month'].apply(format_pct)
        display_df['1-Year'] = display_df['1-Year'].apply(format_pct)
        display_df['Price (₹)'] = display_df['Price (₹)'].apply(lambda x: f"₹{x:.2f}")
        display_df['Entry (₹)'] = display_df['Entry (₹)'].apply(lambda x: f"₹{x:.2f}")
        display_df['P/E'] = display_df['P/E'].apply(lambda x: f"{x:.1f}" if pd.notna(x) else "N/A")
        
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
                row = evaluate_single_stock(full_ticker, hist_data, offline_mode, portfolio_capital, risk_per_trade_pct, max_position_cap_pct)
        
        if row is None:
            st.error(f"Not enough historical data available to analyze {selected}.")
        else:
            st.divider()
            st.metric("Current Price", f"₹{row['Price (₹)']:.2f}")
            
            if row.get('Missing Data', False):
                st.warning("#### 🎯 Action Required: 🔍 VERIFY EXTERNALLY")
            elif '👑' in row['Rating'] or '🟢' in row['Rating']:
                st.success("#### 🎯 Action Required: 🟢 BUY ON DIP (Strong Setup)")
            elif '🟡' in row['Rating']:
                st.info("#### 🎯 Action Required: 🟢 BUY ON DIP (Emerging Winner)")
            elif '🔵' in row['Rating']:
                st.warning("#### 🎯 Action Required: 🟡 WATCH (No Fundamentals)")
            else:
                st.error("#### 🎯 Action Required: 🔴 AVOID (Failed Screener)")
            
            st.divider()
            st.markdown("### 🏆 Compounder Tier")
            st.write(f"**Classification:** {row['Rating']}")

            if "⚠️" in row['Rating']:
                st.warning("⚠️ **API DATA BLOCKED:** Yahoo Finance refused to provide fundamental data for this stock. The chart looks strong, but you must check Screener.in manually to confirm ROE and Profit Growth.")
            elif "👑" in row['Rating']:
                st.success("✅ **MONOPOLY/DUOPOLY:** Structural market leader with pricing power. Hold through 2-3% dips confidently.")
            elif "🟢" in row['Rating']:
                st.success("✅ **QUALITY COMPOUNDER:** Strong fundamentals + consistent growth.")
                st.caption("💡 *To reach '👑 MONOPOLY': Need 3-Year Return > 150% + ROE > 15%*")
            elif "🟡" in row['Rating']:
                st.info("⚡ **EMERGING WINNER:** Building momentum with growing earnings.")
                st.caption("💡 *To reach '👑 MONOPOLY': Need 3-Year Return > 150% + ROE > 15%*")
            elif "🔵" in row['Rating']:
                st.warning("⚠️ **MOMENTUM PLAY:** Price strength but fundamentals unconfirmed.")
                st.caption("💡 *To upgrade to 🟢 QUALITY: Need consistent profit growth (2 of 3 quarters positive)*")
            elif "CHOPPY" in row['Rating']:
                st.error("❌ **CHOPPY TREND - AVOID**")
                st.write("**Why it failed:**")
                st.write("• Quarterly highs NOT rising consistently, OR")
                st.write("• Drawdown exceeded 25%")
                st.caption(f"Details: {row['Structure Note']}")
            elif "WEAK" in row['Rating']:
                st.error("❌ **WEAK RETURNS - AVOID**")
                st.write("**Why it failed:**")
                st.write("• 6-Month return < 30%, OR")
                st.write("• 1-Year return < 40%")
            
            st.divider()
            st.markdown("### 📝 Strict Execution Plan")
            st.warning("⚠️ **Wait for the 2% Dip. Do not buy at Current Market Price.**")
            st.info(f"🔵 **Limit Order Entry:** ₹{row['Entry (₹)']:.2f}")
            st.success(f"🟢 **Target (6m):** ₹{row['Target (₹)']:.2f}")
            st.error(f"🔴 **Stop Loss:** ₹{row['Stop (₹)']:.2f} *(15% buffer)*")
            
            st.write(f"**Shares to Buy:** {row['Shares']}")
            st.write(f"**Total Capital Required:** ₹{row['Investment (₹)']:,.0f}")
            
            st.divider()
            st.markdown("### 🏢 Fundamentals")
            if row.get('Missing Data', False):
                st.error("Data provider blocked fundamental request. Check externally.")
            else:
                st.write(f"**Sector:** {row['Sector']}")
                profit_display = format_pct(row['Profit↑'])
                if isinstance(row['Profit↑'], (int, float)) and row['Profit↑'] > 0: profit_display = f"🟢 {profit_display}"
                elif isinstance(row['Profit↑'], (int, float)) and row['Profit↑'] < 0: profit_display = f"🔴 {profit_display}"
                st.write(f"**QoQ Profit Growth:** {profit_display}") 
                st.write(f"**ROE:** {format_pct(row['ROE'])}")
                st.write(f"**P/E Ratio:** {row['P/E']:.1f}" if pd.notna(row['P/E']) else "**P/E:** N/A")
            
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
                fig.add_hline(y=row['Entry (₹)'], line_dash="dash", line_color="green", annotation_text="Limit Entry (2% Dip)")
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
                    ai_row = evaluate_single_stock(ai_full_ticker, hist_data, offline_mode, portfolio_capital, risk_per_trade_pct, max_position_cap_pct)

            if ai_row is None:
                st.error("Cannot load data for this stock.")
            else:
                st.info("💡 **Try asking:**\n- Summarize the recent news impact.\n- Why is this marked as '🔴 AVOID'?\n- Is a 2% dip a realistic entry point today?")
                
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
                        with st.spinner("Analyzing quantitative data and news..."):
                            try:
                                system_context = f"""
                                You are a quantitative trading assistant advising a professional trader. 
                                Analyze the following stock context and answer the user's prompt directly and concisely.
                                
                                Stock Ticker: {selected_ai_stock}
                                System Rating: {ai_row['Rating']}
                                Current Price: ₹{ai_row['Price (₹)']}
                                Limit Order Entry: ₹{ai_row['Entry (₹)']}
                                1-Year Return: {ai_row['1-Year']:.1%}
                                QoQ Profit Growth: {ai_row['Profit↑']}
                                P/E Ratio: {ai_row['P/E']}
                                ROE: {ai_row['ROE']}
                                Reason for System Rating: {ai_row['Structure Note']}
                                
                                Recent News Headlines:
                                {news_text}
                                """
                                
                                model = genai.GenerativeModel('gemini-1.5-pro')
                                response = model.generate_content(system_context + "\n\nUser Prompt: " + prompt)
                                
                                st.markdown(response.text)
                                st.session_state.messages.append({"role": "assistant", "content": response.text})
                            except Exception as e:
                                st.error(f"AI Error: Make sure your API key is valid. Detail: {e}")
