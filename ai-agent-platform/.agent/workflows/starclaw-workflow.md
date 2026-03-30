---
description: alur eksekusi agent Starclaw — Re-Act loop, planner, executor, dan kebijakan respons setelah tool sukses
---

## Ringkasan

Dokumen ini menjelaskan **workflow runtime** platform (bukan cara mendaftarkan workflow custom — lihat `add-workflow.md`). Ini adalah jalur dari input user hingga `finalResponse`.

## Alur utama (Re-Act + Workflow Engine)

1. **Orchestrator** memanggil `workflow.engine` → `agent.run(payload)`.
2. **Planner** (`planner` + **PlannerGuard**) menghasilkan plan: `plannerDecision` + `steps[]` atau respons langsung.
3. **Reviewer** (opsional) mengevaluasi plan jika `decision === "tool"`.
4. **Executor** menjalankan setiap step: `tool.run()` → hasil dinormalisasi ke `{ success, data, message, ... }`.
5. **Workflow engine** dapat mengulang iterasi: observasi / trace diinjeksikan ke putaran berikutnya.

## Kebijakan: respons setelah tool sukses (lanjutan iterasi)

Jika pada iterasi sebelumnya ada output tool dengan **`success === true`**, engine mengisi **`__lastToolResult`** pada payload iterasi berikutnya. **Base agent** menerapkan `applyPlannerSuccessRespondPolicy`:

- Plan yang masih `tool` diubah menjadi **`plannerDecision: "respond"`** dengan **`finalResponse`** yang diformat dari hasil tool (tidak memanggil tool lagi hanya untuk “merangkum”).

Ini menjaga stabilitas: satu putaran tool yang sukses cukup untuk menutup tugas bila tidak ada langkah wajib lain.

## Format jawaban akhir (`formatFinalAnswer`)

`finalResponse` dibentuk dari hasil tool terstruktur dengan urutan prioritas payload tampilan:

1. `result.data` (jika ada)
2. `result.verdict` (jika ada)
3. `message` bermakna
4. stringify objek relevan / penuh (fallback)

Hindari menampilkan `undefined` ketika `data` kosong tetapi ada field lain (`verdict`, dll.).

## Tool registry & plugin

- **Registrasi duplikat** nama tool diabaikan (builtin menang; plugin tidak menimpa).
- Plugin **tanpa `plugin.json`**: sistem dapat menulis **metadata default** ke disk dan melanjutkan load (cek log peringatan).

## Environment (`.env`)

- **`config/load-env.js`** memuat **`dotenv`** di startup entrypoint (API, worker, skrip dev/channel/start-all, CLI agent).
- Variabel seperti **`GENIEACS_URL`** tersedia di **`process.env`** setelah load; konfigurasi per-plugin tetap lewat `data/plugin-configs/` dan injeksi saat load plugin.

## Structured Workflow (mode deterministik)

Modul **`core/orchestrator/structured.workflow.js`** memakai **Structured Planner** (plan penuh sebelum eksekusi) + validator step. Berbeda dari loop Re-Act per iterasi planner; dipakai untuk alur instruksi kompleks yang sudah di-plan sebagai array step.

## Referensi file inti

| Komponen | File |
|----------|------|
| Loop & injeksi `__lastToolResult` | `core/orchestrator/workflow.engine.js` |
| Policy respond setelah sukses | `core/utils/validator.js` → `applyPlannerSuccessRespondPolicy` |
| Format jawaban akhir | `core/llm/modelRouter.js` → `formatFinalAnswer` |
| Eksekusi step | `core/agent/executor.js` |
| Guard tool name | `core/agent/planner.guard.js` |
| Registry tool | `core/tools/index.js` |
| Plugin load + manifest default | `core/plugins/plugin.manager.js` |
