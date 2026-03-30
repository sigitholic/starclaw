---
name: social-media
description: Membuat konten, posting ke Telegram, Twitter/X, webhook, dan jadwalkan
requires.env: []
plugin: social-media
---

# Skill: Social Media Management

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Membuat konten / caption untuk sosial media
- Posting ke Telegram, Twitter/X, atau platform lain
- Menjadwalkan konten (schedule post)
- Analisis engagement atau strategi konten
- Broadcast pesan ke banyak user

## Tools yang Tersedia

| Tool | Fungsi |
|------|--------|
| `social-media-tool` | Post ke berbagai platform (Telegram, webhook) |
| `cron-tool` | Jadwalkan posting otomatis |
| `http-tool` | Kirim ke webhook, API sosmed eksternal |
| `time-tool` | Cek waktu optimal posting |

## Panduan Membuat Konten

### Format Konten Berkualitas
1. **Hook** (kalimat pertama) — harus menarik perhatian dalam 3 detik
2. **Value** — berikan informasi/hiburan/inspirasi yang nyata
3. **CTA** (Call to Action) — ajak interaksi (like, share, komentar, klik link)
4. **Hashtag** — relevan, 5-10 hashtag untuk Instagram, minimal untuk Twitter/X

### Template per Platform

**Telegram (Channel/Group):**
```
🚀 [JUDUL MENARIK]

[Body konten — bisa paragraf, bisa list]
[Bold untuk poin penting] dengan *asterisk*
[Italic] dengan _underscore_

🔗 [Link jika ada]
#hashtag1 #hashtag2
```

**Twitter/X (max 280 karakter):**
```
[Poin utama singkat + konteks] 🧵

[Thread jika panjang — awali dengan 1/n]
#hashtag
```

**Instagram Caption:**
```
[Hook — 1-2 kalimat pertama yang terlihat sebelum "more"]

[Body — value, cerita, tips]

[CTA — "Bagikan jika bermanfaat!", "Tag temanmu!"]

.
.
.
#hashtag1 #hashtag2 #hashtag3 (30 max)
```

## Workflow Social Media

### Buat dan Post Sekarang
1. Tanya: platform tujuan, topik/produk, tone (formal/casual/humor)
2. Generate konten sesuai template platform
3. Post via `social-media-tool` action `post`
4. Konfirmasi hasil posting ke user

### Schedule Post
1. Buat konten terlebih dahulu
2. Tanya waktu posting yang diinginkan
3. Gunakan `cron-tool` action `add` dengan `datetime` (ISO8601)
4. Konfirmasi jadwal ke user

### Broadcast ke Telegram
1. Gunakan `social-media-tool` action `telegram-broadcast`
2. Kirim ke semua chat yang paired, atau specific chatId
3. Bisa dengan format Markdown

## Waktu Optimal Posting (WIB)

| Platform | Waktu Terbaik |
|----------|--------------|
| Instagram | 07:00-09:00, 11:00-13:00, 19:00-21:00 |
| Twitter/X | 08:00-10:00, 12:00, 17:00-18:00 |
| Telegram | 08:00-10:00, 20:00-22:00 |
| LinkedIn | 07:00-09:00 (Selasa-Kamis) |

## Tone & Gaya Bahasa

- **Formal**: Untuk bisnis, B2B, laporan — kalimat lengkap, tidak ada slang
- **Casual**: Untuk B2C, lifestyle — santai, boleh singkatan, emoji secukupnya
- **Humor**: Untuk entertainment — meme reference, wordplay, jangan berlebihan
- **Inspirational**: Quote + cerita + moral — akhiri dengan refleksi

## Aturan Konten

- JANGAN posting informasi pribadi user tanpa izin eksplisit
- JANGAN buat konten yang menyinggung SARA, politik kontroversial
- Selalu konfirmasi sebelum posting ke platform publik
- Watermark konten jika diperlukan brand consistency
