---
description: cara mengatur konfigurasi plugin (API key, URL, password) via agent
---

## Mengatur Konfigurasi Plugin

Plugin Starclaw memiliki konfigurasi sendiri yang terpisah dari `.env` global.
Agent bisa mengatur konfigurasi plugin langsung via perintah natural di Telegram atau CLI.

### Alur Kerja

1. **Lihat plugin apa yang butuh konfigurasi:**
   ```
   plugin-config-tool list
   ```

2. **Lihat parameter yang dibutuhkan plugin tertentu:**
   ```
   plugin-config-tool schema genieacs-monitor
   ```

3. **Set nilai konfigurasi:**
   ```
   plugin-config-tool set genieacs-monitor GENIEACS_URL http://10.0.0.1:7557
   plugin-config-tool set genieacs-monitor GENIEACS_USER admin
   plugin-config-tool set genieacs-monitor GENIEACS_PASS mypassword
   ```

4. **Verifikasi konfigurasi:**
   ```
   plugin-config-tool get genieacs-monitor
   ```

### Contoh Perintah Natural di Telegram/CLI

```
"set URL GenieACS ke http://10.0.0.1:7557 dengan user admin password secret"
→ Agent akan: plugin-config-tool set genieacs-monitor GENIEACS_URL http://10.0.0.1:7557
              plugin-config-tool set genieacs-monitor GENIEACS_USER admin
              plugin-config-tool set genieacs-monitor GENIEACS_PASS secret

"tampilkan semua konfigurasi plugin"
→ Agent akan: plugin-config-tool list

"konfigurasi plugin trading dengan bridge URL http://192.168.1.100:5000"
→ Agent akan: plugin-config-tool set trading MT5_BRIDGE_URL http://192.168.1.100:5000

"set token Telegram untuk plugin social media"
→ Agent akan: plugin-config-tool schema social-media (untuk lihat key yang dibutuhkan)
              plugin-config-tool set social-media TELEGRAM_BOT_TOKEN <value dari user>
```

### Penyimpanan

Config tersimpan di: `data/plugin-configs/<plugin-name>/config.json`

Config **otomatis diinjeksi** ke env saat plugin diload/dijalankan.
Config **tidak tertimpa** oleh nilai di `.env` global — plugin config punya prioritas lebih rendah.

### Plugin yang Mendukung Konfigurasi

| Plugin | Parameter Utama |
|--------|----------------|
| `genieacs-monitor` | GENIEACS_URL, GENIEACS_USER, GENIEACS_PASS |
| `social-media` | TELEGRAM_BOT_TOKEN, TWITTER_BEARER_TOKEN, MAILGUN_API_KEY |
| `trading` | MT5_BRIDGE_URL, MT5_BRIDGE_TOKEN, ALPHA_VANTAGE_API_KEY |
| `github` | GITHUB_TOKEN |
