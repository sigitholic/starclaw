"use strict";

/**
 * MT5 Bridge Tool — Konek ke MetaTrader 5 untuk trading otonom.
 *
 * Arsitektur bridge:
 *
 *   [Starclaw Agent]
 *        │
 *        │  HTTP REST
 *        ▼
 *   [MT5 Bridge Server]  ← script Python berjalan di mesin Windows dengan MT5
 *        │
 *        │  MetaTrader5 Python Library
 *        ▼
 *   [MetaTrader 5 Terminal]
 *
 * Setup MT5 Bridge Server (di mesin Windows dengan MT5):
 *   1. Install Python: https://python.org
 *   2. Install library: pip install MetaTrader5 flask
 *   3. Simpan dan jalankan: python scripts/mt5-bridge-server.py
 *   4. Set MT5_BRIDGE_URL di .env Starclaw ke http://<windows-ip>:5000
 *
 * Jika MT5_BRIDGE_URL tidak diset, tool akan return instruksi setup.
 *
 * Alternatif tanpa bridge: gunakan market-data-tool untuk analisis,
 * dan mql5-tool untuk buat EA yang dijalankan langsung di MT5.
 *
 * Environment variables:
 *   MT5_BRIDGE_URL      — URL bridge server (contoh: http://192.168.1.100:5000)
 *   MT5_BRIDGE_TOKEN    — Token auth bridge (opsional, untuk keamanan)
 */
function createMt5BridgeTool() {

  function getBridgeUrl() {
    return (process.env.MT5_BRIDGE_URL || "").replace(/\/$/, "");
  }

  async function bridgeCall(endpoint, body = null) {
    const url = `${getBridgeUrl()}${endpoint}`;
    const opts = {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
    };
    if (process.env.MT5_BRIDGE_TOKEN) {
      opts.headers["Authorization"] = `Bearer ${process.env.MT5_BRIDGE_TOKEN}`;
    }
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bridge error ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  function notConfigured() {
    return {
      success: false,
      error: "MT5_BRIDGE_URL belum dikonfigurasi.",
      setup: {
        step1: "Di mesin Windows yang menjalankan MT5, install Python dan library: pip install MetaTrader5 flask flask-cors",
        step2: "Jalankan bridge server: node scripts/generate-mt5-bridge.js → simpan output sebagai mt5_bridge.py → python mt5_bridge.py",
        step3: "Set di .env Starclaw: MT5_BRIDGE_URL=http://<ip-windows>:5000",
        step4: "Set opsional: MT5_BRIDGE_TOKEN=rahasia untuk keamanan",
        alternative: "Tanpa bridge: gunakan market-data-tool untuk analisis + mql5-tool untuk buat EA yang dijalankan manual di MT5",
      },
    };
  }

  return {
    name: "mt5-bridge-tool",
    description: "Konek langsung ke MetaTrader 5 via bridge server Python. Bisa cek akun, ambil harga, buka/tutup order, ambil posisi aktif, dan jalankan backtest. Butuh MT5_BRIDGE_URL di .env (MT5 bridge server Python harus aktif di mesin Windows).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'account-info' (info akun MT5), 'symbol-info' (info simbol/harga), 'positions' (posisi aktif), 'history' (histori order), 'buy' (buka posisi buy), 'sell' (buka posisi sell), 'close-position' (tutup posisi), 'close-all' (tutup semua), 'status' (cek koneksi bridge)"
        },
        symbol: {
          type: "string",
          description: "Simbol trading, contoh: EURUSD, GBPUSD, XAUUSD, BTCUSD"
        },
        volume: {
          type: "number",
          description: "(untuk buy/sell) Volume lot, contoh: 0.01, 0.1, 1.0"
        },
        stopLoss: {
          type: "number",
          description: "(untuk buy/sell) Stop Loss dalam pips (opsional)"
        },
        takeProfit: {
          type: "number",
          description: "(untuk buy/sell) Take Profit dalam pips (opsional)"
        },
        comment: {
          type: "string",
          description: "(untuk buy/sell) Komentar order (opsional)"
        },
        magic: {
          type: "number",
          description: "(untuk buy/sell) Magic number EA (default: 99999)"
        },
        ticket: {
          type: "number",
          description: "(untuk close-position) Nomor tiket posisi yang ingin ditutup"
        },
        days: {
          type: "number",
          description: "(untuk history) Jumlah hari ke belakang (default: 7)"
        },
      },
      required: ["action"],
    },

    async run(input) {
      const bridgeUrl = getBridgeUrl();
      if (!bridgeUrl) return notConfigured();

      try {
        switch (input.action) {

          case "status": {
            const data = await bridgeCall("/status");
            return { success: true, ...data };
          }

          case "account-info": {
            const data = await bridgeCall("/account");
            return { success: true, account: data };
          }

          case "symbol-info": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            const data = await bridgeCall(`/symbol/${encodeURIComponent(input.symbol)}`);
            return { success: true, symbol: data };
          }

          case "positions": {
            const data = await bridgeCall("/positions" + (input.symbol ? `?symbol=${input.symbol}` : ""));
            return { success: true, positions: data, total: Array.isArray(data) ? data.length : 0 };
          }

          case "history": {
            const days = input.days || 7;
            const data = await bridgeCall(`/history?days=${days}`);
            return { success: true, history: data, days };
          }

          case "buy": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            if (!input.volume) return { success: false, error: "volume wajib (contoh: 0.01)" };
            const data = await bridgeCall("/order", {
              type: "buy",
              symbol: input.symbol,
              volume: input.volume,
              sl_pips: input.stopLoss || 0,
              tp_pips: input.takeProfit || 0,
              comment: input.comment || "Starclaw Agent",
              magic: input.magic || 99999,
            });
            return { success: true, message: `BUY ${input.volume} ${input.symbol} berhasil`, order: data };
          }

          case "sell": {
            if (!input.symbol) return { success: false, error: "symbol wajib" };
            if (!input.volume) return { success: false, error: "volume wajib" };
            const data = await bridgeCall("/order", {
              type: "sell",
              symbol: input.symbol,
              volume: input.volume,
              sl_pips: input.stopLoss || 0,
              tp_pips: input.takeProfit || 0,
              comment: input.comment || "Starclaw Agent",
              magic: input.magic || 99999,
            });
            return { success: true, message: `SELL ${input.volume} ${input.symbol} berhasil`, order: data };
          }

          case "close-position": {
            if (!input.ticket) return { success: false, error: "ticket wajib" };
            const data = await bridgeCall("/close", { ticket: input.ticket });
            return { success: true, message: `Posisi tiket ${input.ticket} ditutup`, result: data };
          }

          case "close-all": {
            const data = await bridgeCall("/close-all" + (input.symbol ? `?symbol=${input.symbol}` : ""));
            return { success: true, message: "Semua posisi ditutup", result: data };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: status, account-info, symbol-info, positions, history, buy, sell, close-position, close-all` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createMt5BridgeTool };
