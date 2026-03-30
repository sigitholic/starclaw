# Skill: Trading & Financial Analysis

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Analisis pasar (forex, saham, crypto, gold)
- Buat EA (Expert Advisor) / robot trading MT5
- Buat indikator custom MQL5
- Analisis teknikal (RSI, MACD, MA, Bollinger Bands)
- Eksekusi order trading via MT5
- Backtest strategi
- Riset dan analisis fundamental

## Tools yang Tersedia

| Tool | Fungsi |
|------|--------|
| `market-data-tool` | Data harga real-time, OHLCV historis, indikator teknikal |
| `mql5-tool` | Generate kode EA/Indicator/Script MQL5, simpan file |
| `mt5-bridge-tool` | Buka/tutup order langsung di MT5 (butuh bridge server) |
| `fs-tool` | Baca/edit file .mq5 yang sudah dibuat |
| `browser-tool` | Riset berita ekonomi, kalender forex |
| `cron-tool` | Jadwalkan analisis otomatis berkala |

## Workflow Analisis Market

### Analisis Lengkap
1. Ambil harga terkini: `market-data-tool` action `quote`
2. Ambil data OHLCV: action `ohlcv` (period 3mo, interval 1d)
3. Hitung indikator: action `indicators` (SMA, EMA, RSI, MACD, BB)
4. Interpretasi sinyal (lihat panduan di bawah)
5. Buat laporan rekomendasi

### Analisis Multi-Pair
```
market-data-tool multi-quote: ['EURUSD=X', 'GBPUSD=X', 'XAUUSD=X', 'USDJPY=X']
→ Bandingkan pergerakan antar pair
→ Identifikasi pair dengan momentum terkuat
```

## Panduan Indikator Teknikal

### RSI (Relative Strength Index)
| Nilai | Interpretasi | Aksi |
|-------|-------------|------|
| < 30 | Oversold | Potensi BUY |
| 30-50 | Zona netral bearish | Wait |
| 50-70 | Zona netral bullish | Wait |
| > 70 | Overbought | Potensi SELL |
| Divergence | Harga naik tapi RSI turun | Reversal warning |

### MACD
- MACD > 0: Momentum bullish
- MACD < 0: Momentum bearish
- MACD cross dari bawah ke atas Signal Line: BUY signal
- MACD cross dari atas ke bawah Signal Line: SELL signal

### Moving Average (SMA/EMA)
- SMA20 > SMA50: Uptrend jangka pendek
- SMA50 > SMA200: Uptrend jangka menengah (Golden Cross)
- SMA50 < SMA200: Downtrend (Death Cross)
- Harga > MA: Bullish bias
- Harga < MA: Bearish bias

### Bollinger Bands
- Harga menyentuh upper band + RSI overbought: SELL
- Harga menyentuh lower band + RSI oversold: BUY
- Band menyempit (squeeze): Volatilitas rendah → potensi breakout

## Simbol Forex & Aset Penting

| Simbol (Yahoo) | Simbol (Binance) | Nama |
|---------------|-----------------|------|
| EURUSD=X | — | Euro/Dollar |
| GBPUSD=X | — | Pound/Dollar |
| USDJPY=X | — | Dollar/Yen |
| XAUUSD=X | — | Gold/Dollar |
| USDIDX=X (DXY) | — | Dollar Index |
| BTC-USD | BTCUSDT | Bitcoin |
| ETH-USD | ETHUSDT | Ethereum |
| BBCA.JK | — | BCA (IDX) |
| TLKM.JK | — | Telkom (IDX) |
| ^GSPC | — | S&P 500 |

## Workflow Buat EA MQL5

### EA Sederhana dari Deskripsi
1. Klarifikasi strategi dengan user:
   - Pair apa? Timeframe?
   - Sinyal entry (indikator apa, kondisi apa)?
   - Risk management (lot size, SL, TP)?
2. Generate EA: `mql5-tool` action `generate-ea`
   - Berikan `strategy` yang berisi logika OnTick dalam MQL5
3. Review dan jelaskan kode yang dibuat
4. Instruksikan user cara install di MT5

### Template Strategi Populer

**MA Crossover:**
```mql5
double fast = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE);
double slow = iMA(_Symbol, PERIOD_CURRENT, 50, 0, MODE_EMA, PRICE_CLOSE);
double fastPrev = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE);
bool buySignal = (fast > slow);
bool sellSignal = (fast < slow);
```

**RSI Strategy:**
```mql5
double rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE);
double rsiBuffer[];
ArraySetAsSeries(rsiBuffer, true);
CopyBuffer(rsiHandle, 0, 0, 3, rsiBuffer);
bool buySignal = rsiBuffer[1] < 30 && rsiBuffer[0] > 30;  // RSI cross 30 dari bawah
bool sellSignal = rsiBuffer[1] > 70 && rsiBuffer[0] < 70; // RSI cross 70 dari atas
```

**Breakout Strategy:**
```mql5
double highLast20 = 0, lowLast20 = DBL_MAX;
for(int i = 1; i <= 20; i++) {
    double h = iHigh(_Symbol, PERIOD_CURRENT, i);
    double l = iLow(_Symbol, PERIOD_CURRENT, i);
    if(h > highLast20) highLast20 = h;
    if(l < lowLast20) lowLast20 = l;
}
double currentClose = iClose(_Symbol, PERIOD_CURRENT, 1);
bool buySignal = currentClose > highLast20;
bool sellSignal = currentClose < lowLast20;
```

## Risk Management — Aturan Penting

- **Position Sizing**: Risiko maksimal 1-2% per trade dari balance
  ```
  Lot = (Balance × RiskPercent%) / (StopLoss × PipValue)
  ```
- **Stop Loss**: WAJIB ada. Jangan buka order tanpa SL.
- **Risk:Reward**: Minimal 1:2 (TP harus 2x SL)
- **Diversifikasi**: Jangan masuk semua di satu pair
- **Drawdown**: Jika drawdown > 20%, stop trading dan evaluasi

## Peringatan Wajib

⚠️ **SELALU konfirmasi ke user sebelum eksekusi order nyata di akun live.**
⚠️ **Rekomendasi ini bersifat edukatif — bukan financial advice.**
⚠️ **Test di akun demo terlebih dahulu sebelum akun real.**
⚠️ **Trading mengandung risiko kehilangan modal.**
