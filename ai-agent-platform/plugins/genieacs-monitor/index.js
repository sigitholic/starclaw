"use strict";

const { createGenieAcsTool } = require("../../core/tools/genieacs.tool");

/**
 * Plugin: GenieACS Monitor
 *
 * Plugin manajemen perangkat ISP via GenieACS ACS server (TR-069/CWMP).
 * Plugin ini mendaftarkan genieacs-tool yang sudah lengkap ke agent.
 *
 * Konfigurasi (set di .env):
 *   GENIEACS_URL  — URL ACS server (default: http://localhost:7557)
 *   GENIEACS_USER — Username (opsional)
 *   GENIEACS_PASS — Password (opsional)
 *
 * Kemampuan:
 *   - List semua device CPE/ONT yang terdaftar di ACS
 *   - Get detail info perangkat (IP, firmware, serial, last inform)
 *   - Reboot, factory reset perangkat via TR-069
 *   - Set/get parameter (DNS, SSID, password WiFi, dll)
 *   - Lihat dan clear fault
 *   - Manage preset provisioning
 */
module.exports = {
  name: "genieacs-monitor",
  version: "2.0.0",
  description: "Manajemen perangkat CPE/ONT ISP via GenieACS ACS server (TR-069/CWMP). Butuh GENIEACS_URL di .env.",

  tools: [createGenieAcsTool()],

  workflows: [],

  activate(context) {
    const url = process.env.GENIEACS_URL || "http://localhost:7557";
    console.log(`[Plugin:genieacs-monitor] Aktif — ACS URL: ${url}`);
    if (!process.env.GENIEACS_URL) {
      console.warn("[Plugin:genieacs-monitor] ⚠️  GENIEACS_URL tidak diset di .env, menggunakan default: http://localhost:7557");
    }
  },

  deactivate() {
    console.log("[Plugin:genieacs-monitor] Dinonaktifkan.");
  },
};
