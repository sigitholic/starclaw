---
description: cara menjalankan semua service AI Agent Starclaw (API, Worker, Dashboard)
---

## Jalankan Semua Service (Start All)

// turbo
1. Pastikan file `.env` sudah dikonfigurasi dengan `OPENAI_API_KEY`:
```
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
```

// turbo
2. Install semua dependencies:
```bash
npm install
```

// turbo
3. Jalankan semua service secara paralel:
```bash
npm run start:all
```

4. Verifikasi semua service berhasil berjalan:
   - API Server: `http://localhost:3000`
   - Dashboard: `http://localhost:3001`
   - Worker: cek log terminal untuk status queue worker

## Jalankan Service Individual

// turbo
- Hanya API: `npm run start:api`
// turbo
- Hanya Worker: `npm run start:worker`
// turbo
- Hanya Dashboard: `npm run start:dashboard`

## Mengirim Task ke Agent via API

```bash
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{"taskName": "noc-query", "payload": {"message": "Periksa status server"}}'
```
