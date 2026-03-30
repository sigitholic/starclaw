---
description: pipeline format output ke user (Telegram/CLI) — wajib tanpa JSON mentah
---

## Tujuan

Semua teks yang diterima **end user** (utama: Telegram) harus melewati formatter — **bukan** `JSON.stringify(result)` atau objek tool mentah.

## Pipeline yang Benar

```
Tool → Executor → formatResponse() [core/agent/formatter.js]
                 → formatToolResult / response.formatter.js
                 → Channel (Telegram: sendMessageToUser / sendMarkdownToUser / editUserMessageText)
                 → User
```

## File Utama

| Komponen | File | Peran |
|----------|------|--------|
| Formatter agent | `core/agent/formatter.js` | Memanggil `formatToolResult` untuk objek; string JSON `{...}` di-parse lalu diformat |
| Formatter terstruktur | `core/utils/response.formatter.js` | `formatToolResult`, `autoFormat`, format per tool (`doctor-tool`, dll.) |
| BaseAgent | `core/agent/base.agent.js` | Menyimpan `lastToolName` untuk format per-tool; `userFacingMessage` selalu lewat `formatResponse` |
| Telegram | `core/channels/telegram.channel.js` | `sendMessageToUser`, `editUserMessageText`, `sendMarkdownToUser` — objek & string JSON dipaksa lewat formatter |

## Debug

- Sebelum pesan Telegram dikirim, server mencatat: `FINAL USER MESSAGE: ...` (stdout).
- Jika user masih melihat JSON mentah, cek: apakah ada jalur baru yang memanggil `tgCall("sendMessage"` langsung tanpa helper di atas.

## Checklist Saat Menambah Fitur Baru

1. [ ] Output agent ke user → `formatResponse` / `formatToolResult` sudah dipanggil?
2. [ ] Kirim Telegram baru → gunakan `sendMessageToUser` atau `sendMarkdownToUser`, bukan `sendMessage` mentah ke API?
3. [ ] Edit pesan progress → `editUserMessageText`?

## Referensi Plan

Lihat `PLAN.md` — **G13**, **Changelog v0.4.1**, checklist Core Architecture & Channel.
