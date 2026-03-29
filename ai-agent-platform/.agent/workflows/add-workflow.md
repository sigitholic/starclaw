---
description: cara mendaftarkan workflow baru ke orchestrator AI Agent Starclaw
---

## Menambahkan Workflow Baru

### Apa itu Workflow?
Workflow adalah pipeline multi-agent yang berjalan di luar standard agent loop.
Contoh: workflow NOC menjalankan beberapa agent (collector, analyzer, responder) secara berurutan.

### Langkah 1: Buat File Workflow

Buat file di `modules/<nama-modul>/workflows/`:

```javascript
// modules/my-module/workflows/my-workflow.js
"use strict";

async function runMyWorkflow({ payload, eventBus }) {
  const { message } = payload;
  
  // Implementasi pipeline multi-agent atau logika kompleks
  const step1Result = await doStep1(message);
  const step2Result = await doStep2(step1Result);
  
  return {
    success: true,
    summary: "Workflow selesai",
    finalResponse: step2Result,
    outputs: [step1Result, step2Result],
  };
}

module.exports = { runMyWorkflow };
```

### Langkah 2: Daftarkan ke Orchestrator

Di file entry point aplikasi (misal `apps/api/server.js` atau `apps/worker/index.js`):

```javascript
const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { runMyWorkflow } = require("../../modules/my-module/workflows/my-workflow");

const orchestrator = buildDefaultOrchestrator();

// Daftarkan workflow baru — tanpa modifikasi orchestrator.js!
orchestrator.registerWorkflow("my-workflow-name", runMyWorkflow);
```

### Langkah 3: Panggil Workflow via API

```bash
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{"taskName": "my-workflow-name", "payload": {"message": "input ke workflow"}}'
```

### Format Return Value Workflow

Workflow harus mengembalikan object dengan struktur:
```javascript
{
  success: true/false,
  summary: "Ringkasan singkat hasil",
  finalResponse: "Teks respons akhir untuk user",
  outputs: []  // Array hasil dari setiap step (opsional)
}
```
