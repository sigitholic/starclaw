---
description: cara debugging dan melihat log agent AI Starclaw saat ada masalah
---

## Debug Agent - Langkah Sistematis

### 1. Cek Log Real-time

// turbo
```bash
npm run start:all
```
Perhatikan log dengan prefix:
- `[Planner]` - keputusan LLM untuk setiap iterasi
- `[Executor]` - eksekusi tool dan hasilnya
- `[BrowserTool]` - aktivitas browser Playwright
- `[Orchestrator]` - routing task

### 2. Cek Event Store via API

```bash
curl http://localhost:3000/api/events
```
Ini mengembalikan seluruh history event dari semua agent run termasuk observasi Re-Act loop.

### 3. Debug Re-Act Loop

Jika agent berhenti terlalu cepat:
- Cek `plannerDecision` di log — jika selalu `"respond"`, berarti LLM berhenti prematur
- Lihat section `[OBSERVATIONS]` di prompt yang dikirim ke LLM
- Pastikan `workflow.engine.js` `maxIterations` cukup (default: 10)

### 4. Debug Tool Failure

Jika tool gagal:
- Tool output ada di `outputs[].reason` jika status=`error`
- Browser issues: cek `data/screenshots/` untuk visual debugging
- LLM akan otomatis mencoba alternatif (berkat observation injection)

### 5. Debug Reviewer Veto

Jika agent diveto oleh Reviewer:
- Cek log dengan prefix `[Reviewer]`
- Lihat `review.reason` untuk alasan penolakan
- Edit aturan di `core/agent/reviewer.js` `buildReviewPrompt()`

### 6. Jalankan Unit Test

// turbo
```bash
npm test
```

### 7. Test Satu Agent Secara Isolated

```bash
node -e "
const { buildDefaultOrchestrator } = require('./core/orchestrator/orchestrator');
const orc = buildDefaultOrchestrator();
orc.run('noc-query', { message: 'test debug' }).then(console.log).catch(console.error);
"
```
