"use strict";

/**
 * Plugin Config Tool — Agent bisa mengatur konfigurasi plugin via perintah natural.
 *
 * Contoh perintah user yang akan memicu tool ini:
 *   "set URL GenieACS ke http://10.0.0.1:7557"
 *   "konfigurasi plugin genieacs dengan password admin"
 *   "tampilkan konfigurasi semua plugin"
 *   "apa saja parameter yang dibutuhkan plugin trading?"
 *   "hapus konfigurasi GenieACS lama"
 *
 * Config disimpan di: data/plugin-configs/<plugin-name>/config.json
 * dan otomatis diinjeksi sebagai env saat plugin dijalankan.
 */

const {
  readPluginConfig,
  writePluginConfig,
  setPluginConfigValue,
  deletePluginConfigValue,
  listConfiguredPlugins,
  readPluginManifest,
} = require("../plugins/plugin.config.store");

const fs = require("fs");
const path = require("path");

// Manifest built-in untuk plugin yang sudah kita buat
const BUILTIN_SCHEMAS = {
  "genieacs-monitor": {
    description: "Manajemen perangkat CPE/ONT ISP via GenieACS ACS server (TR-069)",
    configSchema: [
      { key: "GENIEACS_URL", description: "URL ACS server", example: "http://localhost:7557", required: true },
      { key: "GENIEACS_USER", description: "Username (kosongkan jika tanpa auth)", example: "admin", required: false },
      { key: "GENIEACS_PASS", description: "Password (kosongkan jika tanpa auth)", example: "password", required: false, sensitive: true },
    ],
  },
  "social-media": {
    description: "Posting konten ke Telegram, Twitter/X, webhook, email",
    configSchema: [
      { key: "TELEGRAM_BOT_TOKEN", description: "Token bot Telegram dari @BotFather", required: true, sensitive: true },
      { key: "TWITTER_BEARER_TOKEN", description: "Bearer token Twitter/X API v2", required: false, sensitive: true },
      { key: "MAILGUN_API_KEY", description: "API key Mailgun untuk kirim email", required: false, sensitive: true },
      { key: "MAILGUN_DOMAIN", description: "Domain Mailgun (contoh: mg.domain.com)", required: false },
      { key: "SENDGRID_API_KEY", description: "API key SendGrid (alternatif Mailgun)", required: false, sensitive: true },
      { key: "SOCIAL_WEBHOOK_URL", description: "URL webhook default (Discord/Slack/dll)", required: false },
      { key: "PUSHOVER_TOKEN", description: "Token Pushover untuk push notification", required: false, sensitive: true },
      { key: "PUSHOVER_USER", description: "User key Pushover", required: false, sensitive: true },
    ],
  },
  "trading": {
    description: "Trading bot MT5, analisis pasar, EA generator",
    configSchema: [
      { key: "MT5_BRIDGE_URL", description: "URL bridge server Python di mesin Windows MT5", example: "http://192.168.1.100:5000", required: false },
      { key: "MT5_BRIDGE_TOKEN", description: "Token auth bridge server (untuk keamanan)", required: false, sensitive: true },
      { key: "MT5_MQL5_PATH", description: "Path folder MQL5 di instalasi MT5 Windows", required: false },
      { key: "ALPHA_VANTAGE_API_KEY", description: "API key Alpha Vantage untuk data market", required: false, sensitive: true },
    ],
  },
  "github": {
    description: "Integrasi GitHub — baca repo dan issues",
    configSchema: [
      { key: "GITHUB_TOKEN", description: "Personal Access Token GitHub (untuk private repo)", required: false, sensitive: true },
    ],
  },
  "notification": {
    description: "Kirim notifikasi email, Telegram, Pushover, webhook",
    configSchema: [
      { key: "NOTIFICATION_WEBHOOK_URL", description: "URL webhook default untuk notifikasi", required: false },
      { key: "TELEGRAM_DEFAULT_CHAT_ID", description: "Chat ID Telegram default untuk notifikasi", required: false },
      { key: "SMTP_FROM", description: "Alamat email pengirim", example: "noreply@domain.com", required: false },
    ],
  },
};

function getSchema(pluginName) {
  // Coba baca dari file plugin.json dulu
  const manifest = readPluginManifest(pluginName);
  if (manifest && manifest.configSchema) return manifest;
  // Fallback ke built-in schema
  return BUILTIN_SCHEMAS[pluginName] || null;
}

function maskSensitive(value) {
  if (!value || value.length <= 4) return "****";
  return value.slice(0, 4) + "****" + value.slice(-2);
}

function formatConfig(pluginName, config, schema) {
  if (!schema) {
    const keys = Object.keys(config);
    if (keys.length === 0) return "Belum ada konfigurasi.";
    return keys.map(k => `• ${k} = ${config[k]}`).join("\n");
  }

  return schema.configSchema.map(field => {
    const value = config[field.key] || process.env[field.key] || "";
    const source = config[field.key] ? "plugin config" : (process.env[field.key] ? ".env" : "");
    const displayVal = field.sensitive && value ? maskSensitive(value) : (value || "(belum diset)");
    const required = field.required ? " *WAJIB*" : "";
    const sourceTag = source ? ` [dari ${source}]` : "";
    return `• ${field.key}${required}: ${displayVal}${sourceTag}\n  └ ${field.description}`;
  }).join("\n");
}

function createPluginConfigTool() {
  return {
    name: "plugin-config-tool",
    description: "Atur konfigurasi plugin (API key, URL, password, dll) tanpa mengedit .env. Agent bisa set, get, dan list konfigurasi semua plugin. Config disimpan per-plugin dan diinjeksi otomatis saat plugin dijalankan.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'set' (set satu nilai), 'get' (tampilkan config plugin), 'list' (semua plugin terkonfigurasi), 'schema' (lihat parameter yang dibutuhkan plugin), 'delete' (hapus satu nilai), 'reset' (hapus semua config plugin)"
        },
        plugin: {
          type: "string",
          description: "Nama plugin: 'genieacs-monitor', 'social-media', 'trading', 'github', 'notification', atau nama plugin lain"
        },
        key: {
          type: "string",
          description: "(untuk set/delete) Nama parameter/env variable, contoh: GENIEACS_URL, TELEGRAM_BOT_TOKEN"
        },
        value: {
          type: "string",
          description: "(untuk set) Nilai yang ingin disimpan"
        },
      },
      required: ["action"],
    },

    async run(input) {
      try {
        switch (input.action) {

          case "schema": {
            if (!input.plugin) {
              // Tampilkan semua schema yang tersedia
              const schemas = Object.entries(BUILTIN_SCHEMAS).map(([name, s]) => {
                return `📦 *${name}*\n   ${s.description}\n   Parameter: ${s.configSchema.map(f => f.key + (f.required ? "*" : "")).join(", ")}`;
              }).join("\n\n");
              return {
                success: true,
                message: `Schema konfigurasi plugin yang tersedia:\n\n${schemas}\n\n(*) = wajib diisi`,
              };
            }

            const schema = getSchema(input.plugin);
            if (!schema) {
              return { success: false, error: `Schema untuk plugin '${input.plugin}' tidak ditemukan. Plugin ini mungkin tidak membutuhkan konfigurasi tambahan.` };
            }

            const currentConfig = readPluginConfig(input.plugin);
            const details = schema.configSchema.map(f => {
              const hasValue = !!(currentConfig[f.key] || process.env[f.key]);
              const status = hasValue ? "✅ sudah diset" : (f.required ? "❌ BELUM DISET (wajib)" : "⬜ belum diset (opsional)");
              return `• ${f.key} — ${status}\n  └ ${f.description}${f.example ? `\n  └ Contoh: ${f.example}` : ""}`;
            }).join("\n");

            return {
              success: true,
              plugin: input.plugin,
              description: schema.description,
              message: `Konfigurasi plugin '${input.plugin}':\n\n${details}\n\nGunakan: plugin-config-tool set ${input.plugin} <KEY> <value>`,
            };
          }

          case "set": {
            if (!input.plugin) return { success: false, error: "plugin wajib" };
            if (!input.key) return { success: false, error: "key wajib (nama parameter, contoh: GENIEACS_URL)" };
            if (input.value === undefined || input.value === null) return { success: false, error: "value wajib" };

            const schema = getSchema(input.plugin);
            const fieldInfo = schema ? schema.configSchema.find(f => f.key === input.key) : null;

            const config = setPluginConfigValue(input.plugin, input.key, input.value);

            // Juga inject ke env langsung agar efektif tanpa restart
            process.env[input.key] = String(input.value);

            const displayVal = fieldInfo && fieldInfo.sensitive ? maskSensitive(input.value) : input.value;

            return {
              success: true,
              plugin: input.plugin,
              key: input.key,
              message: `✅ Konfigurasi disimpan: ${input.key} = ${displayVal}\n\nPlugin '${input.plugin}' siap digunakan dengan konfigurasi baru ini. Efektif langsung tanpa restart.`,
              totalKeys: Object.keys(config).length,
            };
          }

          case "get": {
            if (!input.plugin) return { success: false, error: "plugin wajib" };

            const config = readPluginConfig(input.plugin);
            const schema = getSchema(input.plugin);
            const formatted = formatConfig(input.plugin, config, schema);

            return {
              success: true,
              plugin: input.plugin,
              message: `Konfigurasi plugin '${input.plugin}':\n\n${formatted}`,
              config: Object.fromEntries(
                Object.entries(config).map(([k, v]) => {
                  const field = schema ? schema.configSchema.find(f => f.key === k) : null;
                  return [k, field && field.sensitive ? maskSensitive(v) : v];
                })
              ),
            };
          }

          case "list": {
            const configured = listConfiguredPlugins();

            // Tambahkan plugin yang punya schema tapi belum terkonfigurasi
            const allPlugins = new Set([
              ...configured.map(p => p.plugin),
              ...Object.keys(BUILTIN_SCHEMAS),
            ]);

            const lines = Array.from(allPlugins).map(pluginName => {
              const config = readPluginConfig(pluginName);
              const schema = getSchema(pluginName);
              const configCount = Object.keys(config).length;

              // Cek required fields yang belum diset
              const missingRequired = schema
                ? schema.configSchema
                    .filter(f => f.required && !config[f.key] && !process.env[f.key])
                    .map(f => f.key)
                : [];

              const status = missingRequired.length > 0
                ? `⚠️ Butuh: ${missingRequired.join(", ")}`
                : configCount > 0
                  ? `✅ ${configCount} key terkonfigurasi`
                  : "⬜ Belum dikonfigurasi";

              return `📦 ${pluginName}\n   ${schema ? schema.description : "Plugin"}\n   ${status}`;
            });

            return {
              success: true,
              message: `Status konfigurasi semua plugin:\n\n${lines.join("\n\n")}\n\nGunakan 'schema <plugin>' untuk lihat parameter yang dibutuhkan.`,
              total: allPlugins.size,
            };
          }

          case "delete": {
            if (!input.plugin) return { success: false, error: "plugin wajib" };
            if (!input.key) return { success: false, error: "key wajib" };

            const config = deletePluginConfigValue(input.plugin, input.key);
            // Hapus juga dari env aktif
            delete process.env[input.key];

            return {
              success: true,
              message: `🗑️ ${input.key} dihapus dari konfigurasi plugin '${input.plugin}'.`,
              remainingKeys: Object.keys(config).length,
            };
          }

          case "reset": {
            if (!input.plugin) return { success: false, error: "plugin wajib" };

            const configPath = require("path").join(process.cwd(), "data", "plugin-configs", input.plugin, "config.json");
            const oldConfig = readPluginConfig(input.plugin);

            // Hapus env yang berasal dari config ini
            for (const key of Object.keys(oldConfig)) {
              if (process.env[key] === String(oldConfig[key])) {
                delete process.env[key];
              }
            }

            writePluginConfig(input.plugin, {});

            return {
              success: true,
              message: `🔄 Semua konfigurasi plugin '${input.plugin}' dihapus. Plugin akan menggunakan nilai dari .env jika ada.`,
              removedKeys: Object.keys(oldConfig),
            };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: set, get, list, schema, delete, reset` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createPluginConfigTool };
