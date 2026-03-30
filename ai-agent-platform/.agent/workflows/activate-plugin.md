---
description: cara mengaktifkan plugin dan mengatur konfigurasinya via agent
---

## Mengaktifkan Plugin di Starclaw

### Perintah Natural (via Telegram atau CLI)

```
"aktifkan plugin genieacs"
"load plugin genieacs-monitor"
"muat semua plugin"
```

Agent akan menggunakan `plugin-tool` untuk load plugin dari folder `plugins/`.

### Alur Lengkap: Aktifkan + Konfigurasi GenieACS

**1. Aktifkan plugin:**
```
User: aktifkan plugin genieacs-monitor
Agent: [plugin-tool] action=load pluginName=genieacs-monitor
→ "Plugin genieacs-monitor dimuat, tapi GENIEACS_URL belum dikonfigurasi"
```

**2. Cek konfigurasi yang dibutuhkan:**
```
User: apa konfigurasi yang dibutuhkan plugin genieacs?
Agent: [plugin-config-tool] action=schema plugin=genieacs-monitor
→ Tampilkan: GENIEACS_URL (wajib), GENIEACS_USER, GENIEACS_PASS
```

**3. Set konfigurasi:**
```
User: set URL GenieACS ke http://10.0.0.1:7557 dengan user admin password rahasia123
Agent: [plugin-config-tool] action=set plugin=genieacs-monitor key=GENIEACS_URL value=http://10.0.0.1:7557
       [plugin-config-tool] action=set plugin=genieacs-monitor key=GENIEACS_USER value=admin
       [plugin-config-tool] action=set plugin=genieacs-monitor key=GENIEACS_PASS value=rahasia123
→ "Konfigurasi disimpan, efektif langsung"
```

**4. Verifikasi dan test:**
```
User: tampilkan semua device yang terdaftar di ACS
Agent: [genieacs-tool] action=list-devices
→ Daftar device atau error koneksi jika GenieACS tidak reachable
```

### Penyimpanan Config

Config tersimpan di: `data/plugin-configs/genieacs-monitor/config.json`

```json
{
  "GENIEACS_URL": "http://10.0.0.1:7557",
  "GENIEACS_USER": "admin",
  "GENIEACS_PASS": "rahasia123"
}
```

Config **bertahan setelah restart** dan **diinjeksi otomatis** ke env saat platform start.

### Status Plugin

| Status | Arti | Tindakan |
|--------|------|----------|
| `active` | Plugin berjalan normal | - |
| `config-needed` | Ada required field belum diset | Jalankan `schema` lalu `set` |

### Auto-load saat Startup

Plugin otomatis di-scan dan dimuat saat `npm run start:all` — tidak perlu manual load setiap restart.
