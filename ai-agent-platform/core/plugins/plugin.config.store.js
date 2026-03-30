"use strict";

/**
 * Plugin Config Store — Sistem konfigurasi per-plugin ala OpenClaw.
 *
 * Setiap plugin memiliki config JSON sendiri di:
 *   data/plugin-configs/<plugin-name>/config.json
 *
 * Config ini diinjeksi sebagai env variable saat plugin dijalankan,
 * sehingga agent bisa mengatur konfigurasi plugin via perintah natural
 * tanpa harus mengedit .env global.
 *
 * Alur:
 *   1. User: "set GenieACS URL ke http://10.0.0.1:7557"
 *   2. Agent: plugin-config-tool set genieacs-monitor GENIEACS_URL http://10.0.0.1:7557
 *   3. Store: simpan ke data/plugin-configs/genieacs-monitor/config.json
 *   4. Plugin: saat run, inject config sebagai process.env
 */

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(process.cwd(), "data", "plugin-configs");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getConfigPath(pluginName) {
  return path.join(CONFIG_DIR, pluginName, "config.json");
}

function readPluginConfig(pluginName) {
  const configPath = getConfigPath(pluginName);
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (_) {
    return {};
  }
}

function writePluginConfig(pluginName, config) {
  const dir = path.join(CONFIG_DIR, pluginName);
  ensureDir(dir);
  fs.writeFileSync(getConfigPath(pluginName), JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Inject config plugin ke process.env.
 * Dipanggil sebelum tool plugin dijalankan.
 * Hanya inject jika env belum di-set (tidak override .env global).
 *
 * @returns {Function} restore — panggil untuk mengembalikan env asli
 */
function injectPluginConfig(pluginName) {
  const config = readPluginConfig(pluginName);
  const restored = {};

  for (const [key, value] of Object.entries(config)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      restored[key] = process.env[key];
      process.env[key] = String(value);
    }
  }

  return function restore() {
    for (const [key, origValue] of Object.entries(restored)) {
      if (origValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = origValue;
      }
    }
  };
}

/**
 * Set satu nilai config plugin.
 */
function setPluginConfigValue(pluginName, key, value) {
  const config = readPluginConfig(pluginName);
  config[key] = value;
  writePluginConfig(pluginName, config);
  return config;
}

/**
 * Hapus satu nilai config plugin.
 */
function deletePluginConfigValue(pluginName, key) {
  const config = readPluginConfig(pluginName);
  delete config[key];
  writePluginConfig(pluginName, config);
  return config;
}

/**
 * List semua plugin yang punya config.
 */
function listConfiguredPlugins() {
  ensureDir(CONFIG_DIR);
  try {
    return fs.readdirSync(CONFIG_DIR)
      .filter(name => {
        const configPath = getConfigPath(name);
        return fs.existsSync(configPath);
      })
      .map(name => ({
        plugin: name,
        config: readPluginConfig(name),
      }));
  } catch (_) {
    return [];
  }
}

/**
 * Baca manifest plugin (plugin.json) untuk mendapatkan configSchema.
 */
function readPluginManifest(pluginName) {
  const candidates = [
    path.join(process.cwd(), "plugins", pluginName, "plugin.json"),
    path.join(process.cwd(), "core", "plugins", pluginName, "plugin.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch (_) {}
    }
  }
  return null;
}

module.exports = {
  readPluginConfig,
  writePluginConfig,
  injectPluginConfig,
  setPluginConfigValue,
  deletePluginConfigValue,
  listConfiguredPlugins,
  readPluginManifest,
};
