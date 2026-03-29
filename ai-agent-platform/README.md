# Starclaw AI Agent Platform

Starclaw adalah platform agent AI modular untuk membangun use case operasional (contoh: NOC), dengan fokus awal melakukan audit arsitektur **OpenClaw** lalu menghasilkan daftar gap dan rekomendasi perbaikan yang bisa dieksekusi.

## Tujuan awal

1. Memetakan komponen OpenClaw saat ini.
2. Mencari kekurangan arsitektur (missing module, coupling, observability, memory, reliability).
3. Menghasilkan prioritas improvement untuk roadmap Starclaw.

## Struktur

Struktur folder mengikuti blueprint:

- `apps/` -> lapisan aplikasi (API, dashboard, worker).
- `core/` -> engine utama (agent, memory, tools, llm, events, orchestrator).
- `modules/` -> use case spesifik dan agent audit OpenClaw.
- `infrastructure/` -> adapter infra (database, cache, vector, queue).
- `config/` -> konfigurasi aplikasi/agent/env.
- `tests/` -> test unit, integration, dan agent.

## Menjalankan project

```bash
cd ai-agent-platform
npm run seed
npm run dev
npm test
```

## Cara pakai agent audit OpenClaw

Jalankan:

```bash
npm run seed
```

Script akan mengeksekusi `openclaw-architecture-mapper` terhadap snapshot komponen OpenClaw contoh, lalu menampilkan:

- komponen yang ditemukan
- gap utama
- rekomendasi improvement Starclaw

## Prinsip arsitektur

- Core system harus stabil, modular, dan tidak tercampur logic infra.
- Use case domain ditempatkan di `modules/`.
- Integrasi eksternal harus lewat layer tools/provider.
- Event bus + workflow engine jadi tulang punggung orkestrasi.
