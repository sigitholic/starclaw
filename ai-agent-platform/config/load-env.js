"use strict";

/**
 * Muat variabel dari .env ke process.env sedini mungkin.
 * Dipanggil dari entrypoint (api, worker, CLI) sebelum modul lain.
 */
function loadEnv() {
  try {
    // eslint-disable-next-line global-require
    const dotenv = require("dotenv");
    const result = dotenv.config();
    if (result.error && result.error.code !== "ENOENT") {
      console.warn("[load-env] dotenv:", result.error.message);
    }
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      console.warn("[load-env] Paket 'dotenv' tidak terpasang; lewati load .env");
    } else {
      console.warn("[load-env]", err.message);
    }
  }
}

module.exports = { loadEnv };
