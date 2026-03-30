---
name: coding
description: Menulis, debug, dan review kode; automasi script; arsitektur sistem
requires.env: []
---

# Skill: Coding & Software Development

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Menulis, debug, atau refactor kode
- Review kode yang ada
- Buat script otomasi
- Analisis error/bug dan perbaikannya
- Arsitektur sistem atau desain API

## Tools yang Tersedia

| Tool | Kapan Digunakan |
|------|----------------|
| `shell-tool` | Jalankan kode, install package, test |
| `fs-tool` | Baca/tulis file kode |
| `codebase-search-tool` | Cari pattern/fungsi di project |
| `http-tool` | Test API endpoint, fetch dokumentasi |
| `browser-tool` | Baca dokumentasi online, cari contoh kode |

## Workflow Debug

1. **Baca error** — gunakan `fs-tool` baca file yang error, atau minta user paste error
2. **Reproduksi** — gunakan `shell-tool` jalankan kode yang bermasalah
3. **Analisis** — identifikasi root cause dari stack trace
4. **Fix** — gunakan `fs-tool` edit file, atau tunjukkan patch ke user
5. **Verifikasi** — jalankan ulang untuk konfirmasi fix berhasil

## Workflow Menulis Kode Baru

1. **Klarifikasi requirement** — tanya jika ada yang ambigu
2. **Desain** — tentukan struktur/arsitektur terlebih dahulu
3. **Implementasi** — tulis kode bertahap, fungsi per fungsi
4. **Test** — jalankan via `shell-tool`, verifikasi output
5. **Dokumentasi** — tambah JSDoc/komentar yang diperlukan

## Panduan Kode Berkualitas

### Node.js / JavaScript
```javascript
"use strict";                    // selalu pakai strict mode
// Gunakan async/await, bukan callback pyramid
// Handle error dengan try/catch, return { success: false, error } bukan throw
// Batasi fungsi < 50 baris — pisah jika lebih
// Nama variabel deskriptif, bukan x, y, temp
```

### Shell Script
```bash
set -euo pipefail             # exit on error, undefined var, pipe fail
# Quote semua variabel: "$VAR" bukan $VAR
# Tambah komentar untuk command yang tidak obvious
# Test di environment aman sebelum production
```

### Prinsip SOLID (Simplified)
- **S** — Satu fungsi satu tanggung jawab
- **O** — Terbuka untuk ekstensi, tertutup untuk modifikasi
- **D** — Depend on abstraction (interface/factory), bukan konkret

## Pattern yang Sering Digunakan di Starclaw

### Buat Tool Baru
```javascript
function createNamaTool() {
  return {
    name: "nama-tool",
    description: "Deskripsi untuk LLM",
    parameters: { type: "object", properties: { ... }, required: [...] },
    async run(input) {
      try {
        // implementasi
        return { success: true, result: ... };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };
}
module.exports = { createNamaTool };
```

### Buat Plugin Baru
```javascript
module.exports = {
  name: "nama-plugin",
  version: "1.0.0",
  description: "...",
  tools: [ createNamaTool() ],
  workflows: [],
  activate(context) {},
  deactivate() {},
};
```

## Penanganan Error

- **Selalu return error**, jangan throw dari tool `run()`
- Format error: `{ success: false, error: "pesan error" }`
- Log error dengan context: `logger.error("Pesan", { detail, stack })`
- Untuk operasi kritis: gunakan try-catch + fallback

## Review Kode Checklist

- [ ] Tidak ada `console.log` debug yang tertinggal
- [ ] Semua input divalidasi sebelum digunakan
- [ ] Error handling ada di setiap async operation
- [ ] Tidak ada hardcoded credentials/URL
- [ ] Fungsi tidak lebih dari 50 baris
- [ ] Nama variabel/fungsi deskriptif
