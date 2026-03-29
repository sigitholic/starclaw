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

## Instalasi cepat (seperti OpenClaw style)

```bash
cd ai-agent-platform
npm run install:quick
npm run start:all
```

Perintah di atas akan:
- install dependency
- generate `.env` default bila belum ada
- menjalankan backend API + dashboard sekaligus

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

## Konfigurasi model, provider, dan channel

Konfigurasi via `.env`:

```env
LLM_PROVIDER=mock         # mock | openai
LLM_MODEL=gpt-4o-mini     # model OpenAI (jika provider=openai)
OPENAI_API_KEY=           # wajib jika provider=openai
AGENT_CHANNEL=local       # local | cli | telegram
TELEGRAM_BOT_TOKEN=       # wajib jika channel=telegram
TELEGRAM_PAIRING_ENABLED=true
TELEGRAM_PAIRING_CODE=change-me
TELEGRAM_PAIRING_STORE_PATH=   # optional, default: ./data/telegram.pairing.json
PORT=8080
DASHBOARD_PORT=3001
WS_PATH=/ws
```

Menjalankan channel runner:

```bash
# pakai AGENT_CHANNEL dari .env
npm run channel:run

# contoh mode cli dengan input custom
AGENT_CHANNEL=cli npm run channel:run -- "audit openclaw reliability gap"

# contoh mode telegram
AGENT_CHANNEL=telegram TELEGRAM_BOT_TOKEN=123456:ABC npm run channel:run
```

Command Telegram yang didukung:
- `/start`
- `/help`
- `/pair <code>` (wajib untuk registrasi chat)
- `/unpair`
- `/audit <teks>` (atau kirim teks biasa)
- `/noc`

## Security: Telegram Pairing Mode

Untuk keamanan, hanya chat Telegram yang sudah pairing yang bisa berkomunikasi dengan Starclaw.

Alur:
1. Set `TELEGRAM_PAIRING_ENABLED=true`
2. Set code rahasia di `TELEGRAM_PAIRING_CODE`
3. User chat bot lalu jalankan:
   - `/pair <code-rahasia>`
4. Chat ID yang berhasil pairing disimpan di store lokal:
   - default: `data/telegram.pairing.json`

Semua chat yang belum paired akan ditolak untuk command operasional.

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
