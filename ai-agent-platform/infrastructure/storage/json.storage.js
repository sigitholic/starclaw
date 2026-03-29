"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Persistent JSON Storage — simpan dan load data dari file JSON.
 * Cocok untuk long-term memory yang perlu bertahan antar restart server.
 * Untuk produksi high-traffic: ganti dengan SQLite/PostgreSQL.
 */
function createJsonStorage(filePath) {
  const normalizedPath = path.resolve(filePath);
  const dir = path.dirname(normalizedPath);

  // Pastikan direktori ada
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load data yang ada (jika file sudah ada)
  let data = {};
  if (fs.existsSync(normalizedPath)) {
    try {
      const raw = fs.readFileSync(normalizedPath, "utf-8");
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(`[JsonStorage] Gagal load ${normalizedPath}: ${err.message}. Mulai dari kosong.`);
      data = {};
    }
  }

  // Debounce save: tidak langsung write setiap kali, batasi ke 1x per 2 detik
  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return; // sudah dijadwalkan
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(normalizedPath, JSON.stringify(data, null, 2), "utf-8");
      } catch (err) {
        console.error(`[JsonStorage] Gagal save ke ${normalizedPath}: ${err.message}`);
      }
      saveTimer = null;
    }, 2000);
  }

  return {
    put(key, value) {
      data[key] = { value, at: new Date().toISOString() };
      scheduleSave();
    },

    get(key) {
      return data[key] || null;
    },

    all() {
      return Object.entries(data).map(([key, payload]) => ({ key, ...payload }));
    },

    delete(key) {
      delete data[key];
      scheduleSave();
    },

    /**
     * Flush paksa — simpan data ke disk sekarang (bypass debounce).
     * Panggil sebelum shutdown.
     */
    flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        fs.writeFileSync(normalizedPath, JSON.stringify(data, null, 2), "utf-8");
      } catch (err) {
        console.error(`[JsonStorage] Gagal flush ke ${normalizedPath}: ${err.message}`);
      }
    },

    get filePath() { return normalizedPath; },
    get size() { return Object.keys(data).length; },
  };
}

module.exports = { createJsonStorage };
