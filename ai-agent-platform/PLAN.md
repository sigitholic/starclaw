# Starclaw AI Agent Platform — Plan & Roadmap

> Dokumen ini adalah acuan pengembangan Starclaw: status terkini, checklist implementasi,
> dan roadmap menuju AI agent yang benar-benar otonom.

---

## Status Terkini: v0.4.0 (30 Maret 2026)

### Changelog v0.4.0
- ✅ G01: Short memory persistence (`session.store.js`) — agent ingat percakapan setelah restart
- ✅ G03: Self-healing proaktif (`channel-runner.js`) — diagnostik + auto-load plugin saat startup
- ✅ G04: Auto plugin discovery (`plugin.watcher.js`) — plugin baru di folder langsung terdeteksi
- ✅ 12 Unit test GenieACS plugin (semua PASS) — `tests/unit/genieacs-plugin.test.js`
- ✅ Workflow guide: `activate-plugin.md` — panduan aktifkan + konfigurasi plugin
- 🔧 Fix skill keyword false positive (genieacs match kata "konten")

---

## Checklist Implementasi Selesai

### Core Architecture ✅ Lengkap
- [x] Re-Act Loop (Think → Act → Observe → ulang) via `workflow.engine.js`
- [x] Planner (LLM-based planning) dengan prompt builder dinamis
- [x] Executor (eksekusi tool dengan retry + timeout + exponential backoff)
- [x] Reviewer / Security Gate (LLM evaluasi plan sebelum eksekusi)
- [x] BaseAgent run loop (orchestrate planner → reviewer → executor → memory)
- [x] WorkflowEngine dengan sliding window observation buffer (max 6)
- [x] Orchestrator dengan dynamic workflow registry
- [x] Task Router (map task name → agent instance)
- [x] Event Bus + Event Store (full observability)

### Memory Management (Keunggulan Starclaw)
- [x] Short Memory: rolling window (max 30 item), token-aware context
- [x] Token Manager: estimasi token dengan koefisien 3 (konservatif untuk Bahasa Indonesia)
- [x] Auto-summarization: rule-based (sync) + LLM-based optional (async)
- [x] Long Memory: JSON persistent + in-memory vector store + cosine similarity
- [x] Semantic search via vector embedding (OpenAI atau mock fallback)
- [x] `buildPlannerContextAsync()` — async version dengan LLM summarizer support

### Smart Prompt Efficiency
- [x] Smart Tool Selection (`tool.selector.js`) — kirim hanya tool relevan ke LLM
  - Hemat 60-80% token untuk request biasa (20 tool → 4-8 tool per prompt)
  - Seleksi berlapis: always-include → required → previous → keyword → fallback
- [x] Skill injection otomatis berdasarkan keyword pesan
- [x] Observation sliding window (cegah context explosion di task panjang)

### Skills System (ala OpenClaw SKILL.md)
- [x] Skill Loader dengan auto-detect berdasarkan keyword
- [x] Skill frontmatter YAML (name, description, requires.env, plugin)
- [x] 7 Skill files: `genieacs`, `social-media`, `coding`, `server-ops`, `networking`, `research`, `trading`
- [x] Skill precedence: custom/ > skills/ > shared/
- [x] `listAvailableSkillsWithStatus()` — cek eligible/missing config per skill

### SOUL System (ala OpenClaw SOUL.md)
- [x] Soul Loader per-agent (`soul.loader.js`)
- [x] 5 Soul files: `DEFAULT`, `social-media-agent`, `devops-agent`, `genieacs-agent`, `trading-agent`
- [x] Auto-inject soul ke system prompt agent

### Plugin System
- [x] Plugin Manager (load/unload/list dengan configKeys & missingConfig)
- [x] Plugin Manifest `plugin.json` per plugin (configSchema, tools, skills, requires)
- [x] Plugin Config Store — config per-plugin di `data/plugin-configs/<name>/config.json`
- [x] Auto-inject plugin config ke env saat plugin load
- [x] `plugin-config-tool` — agent bisa set/get/list/delete config via perintah natural
- [x] ClawHub Registry (install dari GitHub, buat template)
- [x] Process Manager (jalankan plugin sebagai child process dengan port manajemen)
- [x] 4 Plugin dengan manifest lengkap: `hello-world`, `github`, `genieacs-monitor`, `social-media`

### Specialized Agents (6 agent)
- [x] `platform-assistant` — agent generalis untuk semua task
- [x] `social-media` — konten & posting sosmed
- [x] `devops` — server ops, deployment, monitoring
- [x] `genieacs` — manajemen CPE/ONT ISP via TR-069
- [x] `research` — riset & investigasi mendalam
- [x] `trading` — analisis pasar, EA MQL5, trading MT5

### Tools (20 tools)
- [x] `shell-tool` — eksekusi bash command
- [x] `browser-tool` — Playwright headless stealth (anti-deteksi)
- [x] `fs-tool` — operasi file system
- [x] `http-tool` — HTTP request ke URL eksternal
- [x] `web-search-tool` — pencarian DuckDuckGo
- [x] `codebase-search-tool` — cari kode di project (Acorn AST)
- [x] `docker-tool` — manage container Docker
- [x] `doctor-tool` — diagnostik & self-repair platform
- [x] `plugin-tool` — load/unload/install plugin
- [x] `plugin-config-tool` — atur config plugin via perintah natural
- [x] `sub-agent-tool` — spawn & manage child agent paralel
- [x] `cron-tool` — jadwal task otomatis (persist)
- [x] `time-tool` — waktu & timezone WIB
- [x] `genieacs-tool` — full GenieACS REST API (TR-069)
- [x] `social-media-tool` — Telegram broadcast, Twitter/X, webhook
- [x] `notification-tool` — email (Mailgun/SendGrid), Pushover, webhook
- [x] `database-tool` — SQLite lokal + JSON fallback
- [x] `market-data-tool` — harga real-time, OHLCV, indikator teknikal (Yahoo+Binance)
- [x] `mql5-tool` — generate EA/Indicator/Script MQL5
- [x] `mt5-bridge-tool` — eksekusi order langsung ke MT5

### Channel
- [x] Telegram Channel (polling, pairing, persona per-user)
- [x] Onboarding flow: nama → karakter → skill → panggilan
- [x] 18 Telegram commands: /start, /help, /status, /doctor, /plugin, /cron, dll.
- [x] Progress update real-time (edit message saat tool dipanggil)
- [x] Intercept pengingat tanpa LLM (parse waktu natural)
- [x] Auto-fallback Markdown → plain text (fix "can't parse entities")
- [x] CLI Channel
- [x] Local Channel (standby mode)

### API & Dashboard
- [x] REST API (port 8080): /health, /events, /agents/status, /tasks/run
- [x] WebSocket /ws: streaming event real-time
- [x] CORS middleware (izinkan jaringan lokal)
- [x] Next.js Dashboard (port 3001): event timeline + agent graph ReactFlow
- [x] Dashboard dynamic API URL (window.location.hostname)

### Scheduler
- [x] CronManager: interval (30s/5m/1h/1d) + datetime one-shot
- [x] Persistent cron jobs (data/cron-jobs.json, survive restart)
- [x] Time parser natural language ("jam 4 sore", "besok jam 9")

### Persistence & Autonomy (v0.4.0)
- [x] Session Memory Persistence — `session.store.js` persist 10 interaksi per agent
- [x] Auto-load session saat agent init (ingat percakapan setelah restart)
- [x] Self-healing startup — doctor-tool diagnostik saat channel boot
- [x] Auto plugin discovery + load dari folder saat startup
- [x] Plugin Watcher — `plugin.watcher.js` deteksi plugin baru real-time

### Testing
- [x] 12 unit test GenieACS plugin (`tests/unit/genieacs-plugin.test.js`) — 12/12 PASS
- [x] Test: plugin load, manifest validation, config set/get/delete/reset
- [x] Test: session memory persist & restore
- [x] Test: password masking di display

### Ops & Quality
- [x] Node.js version validation (>=18) di startup
- [x] Auto free port saat restart (cegah EADDRINUSE)
- [x] Channel auto-restart saat crash (exit code ≠ 0)
- [x] Graceful shutdown (flush memory, tutup HTTP server)
- [x] Fix retry logic bug di executor (exponential backoff)
- [x] `.nvmrc` target Node.js 20
- [x] `.env.example` lengkap semua variabel

---

## Gap yang Masih Ada (Belum Diimplementasi)

### P1 — Kritis untuk Otonomi Penuh

| ID | Gap | Status | Dampak |
|----|-----|--------|--------|
| G01 | **Conversation persistence** | ✅ SELESAI 30/3/26 | `session.store.js` — persist 10 interaksi terakhir per agent |
| G02 | **Streaming response** | ❌ Belum | UX lambat task panjang — butuh SSE/stream OpenAI |
| G03 | **Self-healing proaktif** | ✅ SELESAI 30/3/26 | `channel-runner.js` — doctor-tool startup + auto-load plugins |
| G04 | **Auto plugin discovery** | ✅ SELESAI 30/3/26 | `plugin.watcher.js` + scan folder saat startup |

### P2 — Penting untuk Skala

| ID | Gap | Status | Dampak |
|----|-----|--------|--------|
| G05 | **Infrastructure real** | ❌ Belum | queue, redis, postgres masih stub |
| G06 | **tiktoken** | ❌ Belum | Estimasi token lebih akurat `npm install tiktoken` |
| G07 | **Rate limiting** | ❌ Belum | Cegah spam ke LLM saat loop |
| G08 | **Unit test coverage** | 🔄 Partial | 1 test file → 12 test (genieacs), butuh lebih banyak |

### P3 — Nice to Have

| ID | Gap | Dampak | Kompleksitas |
|----|-----|--------|-------------|
| G09 | **Multi-user Telegram** — persona per-user tapi memory tidak terisolasi | Agent bisa "bingung" di multi-user | Sedang |
| G10 | **Agent-to-agent communication** — sub-agent tidak bisa kirim pesan balik ke parent real-time | Paralel task terbatas | Tinggi |
| G11 | **Dashboard upgrade** — hanya event log, tidak ada control panel | Sulit monitor di produksi | Sedang |
| G12 | **Plugin marketplace UI** — ClawHub hanya via command | Sulit discovery plugin | Sedang |

---

## Roadmap — Menuju Full Autonomy

### Phase 1 — Stabilitas & Persistensi (Prioritas Segera)

**Tujuan:** Agent tidak kehilangan konteks setelah restart dan bisa self-heal.

```
[ ] G01 — Short memory persistence
    - Simpan state short memory ke data/memory/sessions/<agent>.json
    - Load ulang saat startup jika ada file
    - Strategi: hanya simpan 10 interaksi terakhir per agent

[ ] G03 — Self-healing proaktif saat startup
    - channel-runner.js: jalankan doctor-tool diagnose saat startup
    - Jika ada module broken → auto repair
    - Notifikasi ke Telegram jika ada critical issue

[ ] G04 — Auto plugin discovery
    - Watch folder plugins/ dengan fs.watch
    - Auto load plugin baru yang ditambahkan
    - Reload plugin yang file-nya berubah (development mode)
```

### Phase 2 — Akurasi Token & Kualitas (1-2 sprint)

**Tujuan:** Penggunaan token lebih efisien dan akurat.

```
[ ] G06 — tiktoken integration
    npm install tiktoken
    - Ganti estimasi karakter/3 dengan cl100k_base tokenizer
    - Akurasi 95%+ untuk semua model OpenAI
    - Fallback ke estimasi jika tiktoken tidak tersedia

[ ] Prompt compression
    - Kompres observation output > 500 karakter (summarize key info)
    - Trim tool schemas — hapus field 'parameters' untuk tool yang tidak dipilih
    - Target: 40% lebih hemat token per request

[ ] LLM Summarizer activation
    - Set agentConfig.useLLMSummarizer = true di environment production
    - Tambah toggle via plugin-config-tool
```

### Phase 3 — Streaming & UX (Opsional)

**Tujuan:** Respons real-time, agent terasa lebih "hidup".

```
[ ] G02 — Streaming response untuk Telegram
    - Gunakan OpenAI stream=true
    - Edit Telegram message secara bertahap (setiap ~100 token)
    - Tambah typing indicator

[ ] Progress yang lebih informatif
    - Tampilkan: "Step 2/4: Membaca file konfigurasi..."
    - Estimasi waktu tersisa
    - Cancel button untuk task panjang
```

### Phase 4 — Infrastruktur & Scale

**Tujuan:** Platform bisa di-deploy serius, multi-user, multi-instance.

```
[ ] G05 — Real infrastructure
    - Redis: session state, rate limiting, pub/sub antar instance
    - PostgreSQL: event log persisten, conversation history
    - Queue: task queue dengan priority dan dead-letter

[ ] G09 — Memory isolation per user (Telegram)
    - Buat memory instance per chatId
    - Sinkronisasi ke database

[ ] G07 — Rate limiting
    - Token bucket per LLM provider
    - Circuit breaker sudah ada di openai.provider.js — expose ke config
```

### Phase 5 — Ekosistem Plugin

**Tujuan:** Komunitas bisa membuat dan berbagi plugin.

```
[ ] Dashboard upgrade
    - Real-time agent monitoring
    - Plugin manager UI
    - Config editor per plugin
    - Log viewer dengan filter

[ ] Plugin SDK
    - Dokumentasi lengkap cara buat plugin
    - Template generator via CLI
    - Test harness untuk plugin

[ ] ClawHub Public
    - Registry publik plugin Starclaw
    - Auto-install dari URL
    - Version management
```

---

## Perbandingan Starclaw vs OpenClaw (Teknis)

| Fitur | Starclaw | OpenClaw | Catatan |
|-------|----------|----------|---------|
| Re-Act Loop | ✅ | ✅ | Setara |
| Multi-agent / Sub-agent | ✅ | ✅ | Setara |
| Skills System | ✅ | ✅ | Starclaw: keyword-based auto-inject |
| SOUL / Agent Identity | ✅ | ✅ | Setara |
| Plugin Config per-plugin | ✅ | ✅ | Setara |
| **Token efficiency** | ✅ Smart selection | ❓ Tidak diekspos | **Keunggulan Starclaw** |
| **Short memory token-aware** | ✅ | ✅ Basic | **Keunggulan Starclaw** |
| **Sliding observation window** | ✅ | ❓ | **Keunggulan Starclaw** |
| **Auto summarization** | ✅ Rule+LLM | ✅ LLM only | **Keunggulan Starclaw** |
| Streaming response | ❌ | ✅ | Gap Starclaw |
| Conversation persist | ❌ | ✅ | Gap Starclaw |
| Computer-use (klik UI desktop) | ❌ | ✅ (Windows) | By design: Starclaw = server |
| Infrastructure (Redis/PG) | ❌ Stub | ✅ | Gap Starclaw |
| Language | Node.js | TypeScript | Pilihan desain |
| Platform | Linux server | Windows/Mac/Linux | Desain berbeda |

---

## Cara Menjalankan di Produksi

```bash
# Update ke versi terbaru
cd /opt/starclaw/ai-agent-platform
git pull origin main
npm install

# Konfigurasi
cp .env.example .env
nano .env   # set OPENAI_API_KEY, AGENT_CHANNEL=telegram, dll.

# Jalankan (gunakan screen/tmux agar survive SSH disconnect)
screen -S starclaw
npm run start:all
# Ctrl+A lalu D untuk detach

# Konfigurasi plugin via chat Telegram
# "tampilkan semua konfigurasi plugin"
# "set URL GenieACS ke http://10.0.0.1:7557"
```

---

## Konfigurasi Performa (agent.config.js)

```js
{
  defaultTokenBudget: 4000,      // Token context budget
  maxShortMemoryItems: 30,       // Max item short memory
  plannerRecentWindow: 5,        // Interaksi terakhir di context
  useLLMSummarizer: false,       // true = LLM summarize (akurat), false = rule-based (hemat)
  smartToolSelection: true,      // Hemat 60-80% token tool schema
  maxToolsInPrompt: 8,           // Max tool yang dikirim ke LLM
  maxIterations: 12,             // Max Re-Act loop per task
  maxObservations: 6,            // Sliding window observation
  defaultToolTimeoutMs: 30000,   // Timeout per tool
  defaultToolMaxRetries: 1,      // Retry saat tool gagal
  trackTokenUsage: true,         // Log token usage per iterasi
}
```

---

*Dokumen ini diperbarui: 30 Maret 2026*
*Versi platform: 0.3.0*
