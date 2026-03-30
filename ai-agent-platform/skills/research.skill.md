---
name: research
description: Riset topik, investigasi kompetitor, pengumpulan dan analisis data dari web
requires.env: []
---

# Skill: Research & Information Gathering

## Kapan Skill Ini Aktif
Gunakan panduan ini saat user meminta:
- Riset topik tertentu secara mendalam
- Investigasi kompetitor atau produk
- Pengumpulan data dari berbagai sumber
- Verifikasi informasi atau fact-checking
- Analisis dan perbandingan

## Tools yang Tersedia

| Tool | Kapan Digunakan |
|------|----------------|
| `browser-tool` | Buka URL spesifik, baca konten halaman, screenshot |
| `web-search-tool` | Cari informasi umum via DuckDuckGo |
| `http-tool` | Fetch API atau data terstruktur |
| `fs-tool` | Simpan hasil riset ke file |
| `database-tool` | Simpan data terstruktur untuk query lanjutan |

## Workflow Riset Efektif

### Riset Topik Umum
1. **Search** — `web-search-tool` dengan keyword spesifik
2. **Browse** — `browser-tool` goto ke URL hasil pencarian terbaik
3. **Extract** — `browser-tool` getText untuk ambil konten
4. **Verify** — Cross-check dengan sumber kedua
5. **Synthesize** — Rangkum dan analisis
6. **Save** (jika diminta) — `fs-tool` simpan ke file atau `database-tool`

### Riset Kompetitor
1. Cari profil perusahaan: nama, produk, harga, keunggulan
2. Cari review/feedback user di forum, media sosial
3. Analisis positioning vs produk user
4. Buat laporan perbandingan

### Fact-Checking
1. Cari klaim original
2. Cari sumber primer (situs resmi, jurnal, berita kredibel)
3. Cross-check minimal 2-3 sumber berbeda
4. Tentukan: Benar / Salah / Belum terverifikasi

## Tips Pencarian Efektif

```
# Pencarian spesifik
"exact phrase"                  → harus mengandung frasa ini
site:domain.com query           → cari di domain tertentu
filetype:pdf query              → cari file PDF
after:2024 query                → berita setelah tahun 2024
-kata_yang_dikecualikan         → exclude kata tertentu
```

## Format Laporan Riset

```markdown
# Laporan Riset: [Topik]
**Tanggal**: [tanggal]
**Sumber**: [daftar URL]

## Ringkasan Eksekutif
[2-3 kalimat kesimpulan utama]

## Temuan
1. [Poin pertama + sumber]
2. [Poin kedua + sumber]

## Analisis
[Interpretasi dan insight dari temuan]

## Rekomendasi
[Tindak lanjut yang disarankan]
```

## Batasan
- Selalu cantumkan sumber informasi
- Tidak membuat fakta tanpa sumber
- Jika informasi tidak ditemukan, katakan dengan jelas
- Batasi penggunaan browser untuk menghindari rate limiting
