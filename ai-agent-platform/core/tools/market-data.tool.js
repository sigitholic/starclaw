"use strict";

/**
 * Market Data Tool — Ambil data pasar finansial real-time & historis.
 *
 * Sumber data yang didukung:
 *   1. Yahoo Finance (gratis, tanpa API key) — saham, forex, crypto, indeks
 *   2. Binance API (gratis, tanpa API key) — harga crypto real-time & OHLCV
 *   3. Alpha Vantage (butuh API key gratis) — forex, saham, indikator teknikal
 *
 * Environment variables:
 *   ALPHA_VANTAGE_API_KEY — API key Alpha Vantage (opsional, gratis di alphavantage.co)
 *
 * Simbol yang didukung:
 *   Forex:  EURUSD=X, GBPUSD=X, USDJPY=X, XAUUSD=X (Gold), dll.
 *   Saham:  AAPL, GOOGL, TSLA, BBCA.JK, TLKM.JK, dll.
 *   Crypto: BTC-USD, ETH-USD (Yahoo) atau BTCUSDT (Binance)
 *   Indeks: ^GSPC (S&P500), ^DJI (DJIA), ^IXIC (Nasdaq)
 */
function createMarketDataTool() {

  // ============================================================
  // Yahoo Finance helper
  // ============================================================
  async function yahooQuote(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Starclaw/1.0)" }
    });
    if (!res.ok) throw new Error(`Yahoo Finance error ${res.status} untuk ${symbol}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`Data tidak tersedia untuk simbol '${symbol}'`);
    const meta = result.meta;
    return {
      symbol: meta.symbol,
      currency: meta.currency,
      exchangeName: meta.exchangeName,
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose || meta.chartPreviousClose,
      open: meta.regularMarketOpen || null,
      dayHigh: meta.regularMarketDayHigh || null,
      dayLow: meta.regularMarketDayLow || null,
      volume: meta.regularMarketVolume || null,
      change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose),
      changePercent: ((meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)) / (meta.previousClose || meta.chartPreviousClose) * 100).toFixed(2),
      timestamp: new Date(meta.regularMarketTime * 1000).toISOString(),
    };
  }

  async function yahooOHLCV(symbol, period = "1mo", interval = "1d") {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${period}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Starclaw/1.0)" }
    });
    if (!res.ok) throw new Error(`Yahoo Finance error ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`Data OHLCV tidak tersedia untuk '${symbol}'`);

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};
    const closes = ohlcv.close || [];

    const candles = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      open: ohlcv.open?.[i] ? +ohlcv.open[i].toFixed(5) : null,
      high: ohlcv.high?.[i] ? +ohlcv.high[i].toFixed(5) : null,
      low: ohlcv.low?.[i] ? +ohlcv.low[i].toFixed(5) : null,
      close: ohlcv.close?.[i] ? +ohlcv.close[i].toFixed(5) : null,
      volume: ohlcv.volume?.[i] || null,
    })).filter(c => c.close !== null);

    return {
      symbol,
      interval,
      period,
      candles,
      total: candles.length,
    };
  }

  // ============================================================
  // Binance API helper (gratis, tanpa key, untuk crypto)
  // ============================================================
  async function binancePrice(symbol) {
    const sym = symbol.replace("-", "").replace("/", "").toUpperCase();
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
    if (!res.ok) throw new Error(`Binance error ${res.status} untuk ${sym}`);
    const d = await res.json();
    return {
      symbol: d.symbol,
      price: parseFloat(d.lastPrice),
      priceChange: parseFloat(d.priceChange),
      changePercent: parseFloat(d.priceChangePercent).toFixed(2),
      high: parseFloat(d.highPrice),
      low: parseFloat(d.lowPrice),
      volume: parseFloat(d.volume),
      quoteVolume: parseFloat(d.quoteVolume),
      openTime: new Date(d.openTime).toISOString(),
      closeTime: new Date(d.closeTime).toISOString(),
    };
  }

  async function binanceKlines(symbol, interval = "1h", limit = 100) {
    const sym = symbol.replace("-", "").replace("/", "").toUpperCase();
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
    if (!res.ok) throw new Error(`Binance klines error ${res.status}`);
    const data = await res.json();
    const candles = data.map(k => ({
      date: new Date(k[0]).toISOString(),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
    return { symbol: sym, interval, candles, total: candles.length };
  }

  // ============================================================
  // Indikator teknikal (dihitung dari data OHLCV)
  // ============================================================
  function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(5);
  }

  function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return +ema.toFixed(5);
  }

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return +(100 - 100 / (1 + rs)).toFixed(2);
  }

  function calcMACD(closes) {
    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    if (!ema12 || !ema26) return null;
    const macd = +(ema12 - ema26).toFixed(5);
    return { macd, ema12, ema26 };
  }

  function calcBollingerBands(closes, period = 20, stdMultiplier = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((acc, v) => acc + Math.pow(v - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: +(sma + stdMultiplier * std).toFixed(5),
      middle: +sma.toFixed(5),
      lower: +(sma - stdMultiplier * std).toFixed(5),
      bandwidth: +(stdMultiplier * 2 * std / sma * 100).toFixed(2),
    };
  }

  return {
    name: "market-data-tool",
    description: "Ambil data pasar finansial: harga real-time, data OHLCV historis, dan indikator teknikal (SMA, EMA, RSI, MACD, Bollinger Bands). Mendukung forex (EURUSD=X), saham (AAPL, BBCA.JK), crypto (BTC-USD, BTCUSDT), dan indeks (^GSPC).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'quote' (harga terkini), 'ohlcv' (candle historis), 'indicators' (indikator teknikal), 'crypto-price' (harga crypto Binance real-time), 'crypto-ohlcv' (candle crypto Binance), 'multi-quote' (harga beberapa simbol sekaligus)"
        },
        symbol: {
          type: "string",
          description: "Simbol instrumen. Forex: EURUSD=X, GBPUSD=X, USDJPY=X, XAUUSD=X. Saham: AAPL, TSLA, BBCA.JK. Crypto Yahoo: BTC-USD, ETH-USD. Crypto Binance: BTCUSDT, ETHUSDT. Indeks: ^GSPC, ^DJI"
        },
        symbols: {
          type: "array",
          description: "(untuk multi-quote) Array simbol, contoh: ['EURUSD=X','GBPUSD=X','XAUUSD=X']"
        },
        period: {
          type: "string",
          description: "(untuk ohlcv) Rentang waktu: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y' (default: 1mo)"
        },
        interval: {
          type: "string",
          description: "(untuk ohlcv/crypto-ohlcv) Timeframe candle. Yahoo: '1m','5m','15m','1h','1d','1wk','1mo'. Binance: '1m','5m','15m','1h','4h','1d' (default: 1d)"
        },
        limit: {
          type: "number",
          description: "(untuk crypto-ohlcv) Jumlah candle yang diambil (default: 100, max: 1000)"
        },
        indicators: {
          type: "array",
          description: "(untuk indicators) Array indikator: ['sma20','sma50','ema20','rsi','macd','bb'] (default: semua)"
        },
      },
      required: ["action"],
    },

    async run(input) {
      try {
        switch (input.action) {

          case "quote": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            const data = await yahooQuote(input.symbol);
            return { success: true, ...data };
          }

          case "multi-quote": {
            const syms = input.symbols || (input.symbol ? [input.symbol] : []);
            if (syms.length === 0) return { success: false, error: "symbols (array) atau symbol wajib" };
            const results = [];
            for (const sym of syms) {
              try {
                const d = await yahooQuote(sym);
                results.push(d);
              } catch (e) {
                results.push({ symbol: sym, error: e.message });
              }
            }
            return { success: true, quotes: results, total: results.length };
          }

          case "ohlcv": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            const data = await yahooOHLCV(input.symbol, input.period || "1mo", input.interval || "1d");
            return { success: true, ...data };
          }

          case "indicators": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            const ohlcv = await yahooOHLCV(input.symbol, input.period || "3mo", "1d");
            const closes = ohlcv.candles.map(c => c.close).filter(Boolean);

            if (closes.length < 26) {
              return { success: false, error: `Data tidak cukup untuk menghitung indikator (hanya ${closes.length} candle, butuh minimal 26)` };
            }

            const wantAll = !input.indicators || input.indicators.length === 0;
            const want = input.indicators || [];
            const result = { symbol: input.symbol, price: closes[closes.length - 1], dataPoints: closes.length };

            if (wantAll || want.some(i => i.includes("sma20"))) result.sma20 = calcSMA(closes, 20);
            if (wantAll || want.some(i => i.includes("sma50"))) result.sma50 = calcSMA(closes, 50);
            if (wantAll || want.some(i => i.includes("sma200"))) result.sma200 = calcSMA(closes, 200);
            if (wantAll || want.some(i => i.includes("ema20"))) result.ema20 = calcEMA(closes, 20);
            if (wantAll || want.some(i => i.includes("ema50"))) result.ema50 = calcEMA(closes, 50);
            if (wantAll || want.some(i => i.includes("rsi"))) result.rsi = calcRSI(closes, 14);
            if (wantAll || want.some(i => i.includes("macd"))) result.macd = calcMACD(closes);
            if (wantAll || want.some(i => i.includes("bb"))) result.bollingerBands = calcBollingerBands(closes, 20);

            // Sinyal sederhana berdasarkan indikator
            const signals = [];
            if (result.rsi !== null) {
              if (result.rsi < 30) signals.push("RSI oversold (<30) — potensi reversal naik");
              else if (result.rsi > 70) signals.push("RSI overbought (>70) — potensi reversal turun");
              else signals.push(`RSI netral: ${result.rsi}`);
            }
            if (result.sma20 && result.sma50) {
              if (result.sma20 > result.sma50) signals.push("SMA20 > SMA50 — tren bullish jangka pendek");
              else signals.push("SMA20 < SMA50 — tren bearish jangka pendek");
            }
            if (result.macd) {
              if (result.macd.macd > 0) signals.push(`MACD positif (${result.macd.macd}) — momentum bullish`);
              else signals.push(`MACD negatif (${result.macd.macd}) — momentum bearish`);
            }
            result.signals = signals;

            return { success: true, ...result };
          }

          case "crypto-price": {
            if (!input.symbol) return { success: false, error: "symbol wajib (contoh: BTCUSDT, ETHUSDT)" };
            const data = await binancePrice(input.symbol);
            return { success: true, source: "binance", ...data };
          }

          case "crypto-ohlcv": {
            if (!input.symbol) return { success: false, error: "symbol wajib (contoh: BTCUSDT)" };
            const data = await binanceKlines(input.symbol, input.interval || "1h", input.limit || 100);
            return { success: true, source: "binance", ...data };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: quote, multi-quote, ohlcv, indicators, crypto-price, crypto-ohlcv` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createMarketDataTool };
