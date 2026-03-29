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

## API Monitoring (Phase 5 Backend)

Backend sekarang menggunakan **Express.js** dengan endpoint:

- `GET /health` -> healthcheck service
- `POST /tasks/run` -> jalankan task (`openclaw-audit` atau `noc-incident-workflow`)
- `GET /events` -> ambil semua event agent
- `GET /agents/status` -> status aktif/nonaktif tiap agent berdasarkan lifecycle event

Contoh jalankan task:

```bash
curl -X POST http://localhost:8080/tasks/run \
  -H "Content-Type: application/json" \
  -d '{"task":"openclaw-audit","openclawSnapshot":{"modules":["agent-core"]}}'
```

## Dashboard Realtime (Phase 6 Frontend)

Frontend dashboard menggunakan **Next.js** + **React Flow** dan menerima event realtime dari backend via WebSocket.

- WebSocket endpoint backend: `ws://127.0.0.1:8080/ws`
- Dashboard URL: `http://127.0.0.1:3001`

Jalankan backend + dashboard:

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:dashboard
```

Fitur dashboard:
- Event timeline realtime (log list)
- Graph agent workflow (monitor -> analyzer -> executor)
- Tombol trigger workflow NOC dari UI

## Prinsip arsitektur

- Core system harus stabil, modular, dan tidak tercampur logic infra.
- Use case domain ditempatkan di `modules/`.
- Integrasi eksternal harus lewat layer tools/provider.
- Event bus + workflow engine jadi tulang punggung orkestrasi.
