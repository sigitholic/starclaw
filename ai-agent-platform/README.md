# Starclaw AI Agent Platform

Platform AI Agent **otonom** berbasis Node.js yang mampu mengerjakan banyak tugas secara mandiri — dari operasi server, manajemen perangkat ISP (GenieACS/TR-069), posting sosial media, riset web, hingga membuat plugin dan agent baru — semua dikendalikan via Telegram, API HTTP, atau CLI.

---

## Daftar Isi

- [Arsitektur](#arsitektur)
- [Cara Kerja — Alur Eksekusi](#cara-kerja--alur-eksekusi)
- [Struktur Folder](#struktur-folder)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan Platform](#menjalankan-platform)
- [Skills System](#skills-system)
- [SOUL System](#soul-system)
- [Specialized Agents](#specialized-agents)
- [Tools Bawaan](#tools-bawaan)
- [Plugin System (ClawHub)](#plugin-system-clawhub)
- [Channel Telegram](#channel-telegram)
- [Cron & Scheduler](#cron--scheduler)
- [Sub-Agent (Multi-Agent)](#sub-agent-multi-agent)
- [Memory System](#memory-system)
- [GenieACS — Manajemen Perangkat ISP](#genieacs--manajemen-perangkat-isp)
- [Social Media & Notifikasi](#social-media--notifikasi)
- [Workflow NOC](#workflow-noc)
- [API HTTP](#api-http)
- [Dashboard](#dashboard)
- [Panduan Developer](#panduan-developer)

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────────────────┐
│                     STARCLAW AI AGENT PLATFORM                       │
├──────────────────┬────────────────────┬──────────────────────────────┤
│   CHANNEL INPUT  │    ORCHESTRATOR    │         SERVICES             │
│                  │                    │                              │
│  Telegram Bot ───┤                    │  API Server  :8080           │
│  CLI Terminal ───┤──► Task Router ────┤  Dashboard   :3001           │
│  HTTP API    ────►│                    │  WebSocket   /ws             │
│  Local Mode  ────►│   Workflow Engine  │                              │
├──────────────────┴────────────────────┴──────────────────────────────┤
│                         SPECIALIZED AGENTS                           │
│                                                                      │
│  platform-assistant │ social-media │ devops │ genieacs │ research    │
│  noc-monitor        │ noc-analyzer │ noc-executor │ openclaw-audit   │
├──────────────────────────────────────────────────────────────────────┤
│                    AGENT CORE (per agent)                            │
│                                                                      │
│  SOUL ──► Planner ──► Reviewer ──► Executor ──► Memory              │
│  (identity)  (LLM)    (security)   (tools)    (short+long)          │
│                                                                      │
│  SKILLS (auto-injected ke prompt berdasarkan konteks pesan)          │
│  genieacs │ social-media │ coding │ server-ops │ networking │ research│
├──────────────────────────────────────────────────────────────────────┤
│                          TOOL REGISTRY (16 tools)                   │
│                                                                      │
│  shell  │ browser  │ fs  │ http  │ docker  │ doctor  │ cron         │
│  plugin │ sub-agent│ web-search │ codebase │ time                   │
│  genieacs-tool │ social-media-tool │ notification-tool │ database-tool│
├──────────────────────────────────────────────────────────────────────┤
│                      PLUGIN SYSTEM (ClawHub)                        │
│                                                                      │
│  hello-world │ github │ genieacs-monitor v2 │ social-media │ [custom]│
├──────────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE & DATA LAYER                      │
│                                                                      │
│  SQLite DB │ JSON Storage │ In-Memory Vector │ Event Bus │ EventStore │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Cara Kerja — Alur Eksekusi

Starclaw menggunakan pola **Re-Act Loop** (Reasoning + Acting):

```
INPUT (pesan user)
    │
    ▼
[1] ORCHESTRATOR.run(taskName, payload)
    │  ├─ Cek workflow registry (NOC, custom)
    │  └─ Fallback: resolve agent via Task Router
    │
    ▼
[2] AGENT.run(input)
    │  ├─ Short Memory: buildPlannerContext()
    │  └─ Inject context ke Planner
    │
    ▼
[3] PLANNER.createPlan(input)
    │  ├─ Bangun prompt (role + tools schema + context + observasi)
    │  ├─ Kirim ke LLM (OpenAI / Mock)
    │  └─ Normalisasi response → { plannerDecision, steps[], finalResponse }
    │
    ▼
[4] REVIEWER.reviewPlan(plan)   [hanya jika decision = "tool"]
    │  ├─ Evaluasi keamanan plan via LLM
    │  ├─ Jika DITOLAK → return veto result (tanpa eksekusi tool)
    │  └─ Jika DISETUJUI → lanjut ke Executor
    │
    ▼
[5] EXECUTOR.execute(plan, input)
    │  ├─ Loop setiap step dalam plan.steps[]
    │  ├─ Panggil tool: toolsRegistry.get(step.tool).run(step.input)
    │  ├─ Retry jika gagal (maxRetries per step)
    │  ├─ Timeout protection per step (timeoutMs)
    │  └─ Emit events: TOOL_CALLED, TOOL_RESULT
    │
    ▼
[6] RE-ACT LOOP (jika decision = "tool")
    │  ├─ Hasil tool diinjeksi sebagai [OBSERVATIONS] ke prompt berikutnya
    │  ├─ Planner dipanggil lagi dengan observasi baru
    │  └─ Loop berlanjut sampai decision = "respond" (tugas selesai)
    │
    ▼
[7] SHORT MEMORY.remember(result)
    │  └─ Simpan interaksi ke history
    │
    ▼
OUTPUT (finalResponse ke user)
```

### Decision Types dari LLM

| Decision | Arti | Aksi Sistem |
|----------|------|-------------|
| `tool` | LLM ingin memanggil 1 tool | Jalankan 1 step, loop kembali ke Planner |
| `multi-tool` | LLM ingin memanggil beberapa tool berurutan | Jalankan semua steps, loop kembali |
| `respond` | Tugas selesai, siap merespons user | Akhiri loop, kirim finalResponse |

### Security Gate — Reviewer Agent

Setiap kali LLM memutuskan untuk memanggil tool, **Reviewer Agent** (LLM terpisah) mengevaluasi plan sebelum dieksekusi. Reviewer akan **mem-veto** plan yang:
- Menjalankan command berbahaya (`rm -rf /`, `mkfs`, format disk)
- Menghapus file massal tanpa alasan
- Berusaha membocorkan file `.env`, credentials, atau `id_rsa`

---

## Struktur Folder

```
ai-agent-platform/
├── apps/
│   ├── api/            # Express API server + WebSocket
│   ├── dashboard/      # Next.js dashboard UI
│   └── worker/         # Worker process (opsional)
│
├── config/
│   ├── agent.config.js # Token budget, memory window
│   ├── app.config.js   # Port, env settings
│   └── env.config.js   # Parser .env file
│
├── core/
│   ├── agent/
│   │   ├── agent.factory.js     # Factory: buat agent lengkap
│   │   ├── base.agent.js        # Base class agent (run loop)
│   │   ├── executor.js          # Eksekusi tool steps
│   │   ├── planner.js           # LLM planning
│   │   ├── reviewer.js          # Security gate
│   │   └── sub-agent.manager.js # Spawn & manage child agents
│   │
│   ├── channels/
│   │   ├── telegram.channel.js      # Bot Telegram (polling)
│   │   ├── telegram.pairing.store.js # Persistent pairing data
│   │   └── persona.store.js          # Persona & onboarding user
│   │
│   ├── events/
│   │   ├── event.bus.js    # EventEmitter wrapper
│   │   ├── event.store.js  # In-memory event log
│   │   └── event.types.js  # Konstanta event types
│   │
│   ├── llm/
│   │   ├── llm.provider.js      # Factory: pilih provider
│   │   ├── openai.provider.js   # OpenAI (+ circuit breaker + retry)
│   │   ├── mock.provider.js     # Mock provider (testing tanpa API key)
│   │   ├── prompt.builder.js    # Bangun prompt sistem + tools schema
│   │   └── embedding.provider.js # Text embedding (OpenAI / mock)
│   │
│   ├── memory/
│   │   ├── short.memory.js  # Short-term memory (in-memory, max 30 item)
│   │   ├── long.memory.js   # Long-term memory (JSON persistent + vector)
│   │   ├── summarizer.js    # Auto-summarize history lama
│   │   └── token.manager.js # Hitung & batasi token budget
│   │
│   ├── orchestrator/
│   │   ├── orchestrator.js    # Entry point: run task, event routing
│   │   ├── task.router.js     # Map taskName → agent instance
│   │   ├── workflow.engine.js # Jalankan agent.run()
│   │   └── queue.js           # Task queue (opsional)
│   │
│   ├── plugins/
│   │   ├── plugin.manager.js   # Load/unload plugin dari folder
│   │   ├── clawhub.registry.js # Install plugin dari GitHub, buat template
│   │   └── process.manager.js  # Jalankan plugin sebagai child process
│   │
│   ├── scheduler/
│   │   ├── cron.manager.js # Persistent cron jobs (interval/datetime)
│   │   └── time-parser.js  # Parse waktu dari kalimat natural
│   │
│   ├── tools/
│   │   ├── index.js             # Tool registry (daftarkan semua tools)
│   │   ├── browser.tool.js      # Playwright headless (stealth mode)
│   │   ├── codebase-search.tool.js # Cari kode di project
│   │   ├── cron.tool.js         # LLM interface ke cron manager
│   │   ├── docker.tool.js       # Docker container management
│   │   ├── doctor.tool.js       # Diagnostik & self-healing
│   │   ├── fs.tool.js           # Operasi file system
│   │   ├── http.tool.js         # HTTP request
│   │   ├── plugin.tool.js       # LLM interface ke plugin manager
│   │   ├── shell.tool.js        # Eksekusi bash command
│   │   ├── sub-agent.tool.js    # LLM interface ke sub-agent manager
│   │   ├── time.tool.js         # Waktu & timezone
│   │   └── web-search.tool.js   # Pencarian web (DuckDuckGo)
│   │
│   └── utils/
│       ├── ast.parser.js  # Parse JavaScript AST
│       ├── helpers.js     # Utility functions
│       ├── logger.js      # Structured logger
│       └── validator.js   # Validasi tool contract & normalisasi plan
│
├── infrastructure/
│   ├── cache/redis.js          # Redis client (opsional)
│   ├── database/postgres.js    # PostgreSQL client (opsional)
│   ├── queue/queue.js          # Task queue
│   ├── storage/json.storage.js # JSON file storage (digunakan long memory)
│   └── vector/
│       ├── in-memory.vector.js # In-memory vector store (cosine similarity)
│       └── vectordb.js         # External vector DB adapter (opsional)
│
├── modules/
│   ├── noc/                    # Network Operations Center module
│   │   ├── agents/             # Monitor, Analyzer, Executor agents
│   │   ├── tools/              # MikroTik, Ping, SNMP tools
│   │   └── workflows/          # NOC incident workflow
│   │
│   └── shared/
│       ├── agents/
│       │   ├── platform-assistant.agent.js      # Agent utama (semua channel)
│       │   └── openclaw-architecture-mapper.agent.js # Audit arsitektur
│       └── tools/
│           └── openclaw-gap-analyzer.tool.js    # Analisis gap arsitektur
│
├── plugins/                    # Plugin yang terinstall
│   ├── hello-world/            # Contoh plugin minimal
│   ├── github/                 # GitHub API tool
│   └── genieacs-monitor/       # Monitor GenieACS (TR-069)
│
├── scripts/
│   ├── start-all.js    # Start API + Dashboard + Channel sekaligus
│   ├── dev.js          # Start API saja
│   ├── channel-runner.js # Start channel runner saja
│   ├── install.js      # Setup awal (buat folder, dll)
│   └── seed.js         # Seed data contoh
│
├── tests/
│   └── unit/           # Unit tests
│
├── .env.example        # Template konfigurasi environment
├── .nvmrc              # Target Node.js version (20)
└── package.json
```

---

## Instalasi

**Requirement:** Node.js >= 18.0.0 (direkomendasikan: Node.js 20 LTS)

```bash
# Cek versi Node.js
node --version  # harus >= 18

# Jika perlu update Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Clone & install
git clone <repo-url>
cd ai-agent-platform
npm install

# Setup konfigurasi
cp .env.example .env
nano .env
```

---

## Konfigurasi

Edit file `.env`:

```env
# LLM Provider
LLM_PROVIDER=openai        # "openai" atau "mock" (testing tanpa API key)
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...

# Channel (cara agent menerima perintah)
AGENT_CHANNEL=local        # "local" | "cli" | "telegram"

# Telegram (wajib jika AGENT_CHANNEL=telegram)
TELEGRAM_BOT_TOKEN=
TELEGRAM_PAIRING_ENABLED=true
TELEGRAM_PAIRING_CODE=kode-rahasia-anda

# Server
PORT=8080
DASHBOARD_PORT=3001
```

---

## Menjalankan Platform

```bash
# Start semua service sekaligus (API + Dashboard + Channel)
npm run start:all

# Start API saja
npm run dev

# Start channel runner saja
npm run channel:run

# Test dengan CLI
AGENT_CHANNEL=cli node scripts/channel-runner.js "cek status platform"
```

### Apa yang berjalan saat `npm run start:all`:

| Service | Port | Keterangan |
|---------|------|------------|
| API Server | 8080 | REST API + WebSocket |
| Dashboard | 3001 | Next.js UI monitoring |
| Channel Runner | — | Sesuai `AGENT_CHANNEL` di `.env` |

Channel runner di-restart otomatis jika crash (exit code != 0).

---

## Skills System

Skills adalah file Markdown yang diinjeksi ke system prompt LLM, mengajarkan agent **kapan dan bagaimana** menggunakan tools secara efektif — persis seperti OpenClaw SKILL.md.

### Cara Kerja

Saat user mengirim pesan, `skill.loader.js` mendeteksi keyword dan **otomatis menginjeksi** skill yang relevan ke prompt:

```
Pesan: "reboot CPE serial ABC123"
  → terdeteksi keyword "CPE" → inject genieacs.skill.md
  → LLM kini tahu cara menggunakan genieacs-tool dengan benar
```

### Skill yang Tersedia

| Skill File | Aktif Saat | Isi |
|------------|-----------|-----|
| `genieacs.skill.md` | Pesan mengandung: GenieACS, TR-069, CPE, ONT, ACS | GenieACS REST API, parameter TR-069, workflow provisioning |
| `social-media.skill.md` | Pesan mengandung: sosmed, posting, tweet, caption | Format konten per platform, waktu optimal, tone & gaya |
| `coding.skill.md` | Pesan mengandung: code, debug, script, bug, refactor | Workflow debug, pattern Starclaw, checklist review kode |
| `server-ops.skill.md` | Pesan mengandung: server, nginx, docker, deploy, linux | Command monitoring, systemd, nginx, workflow deploy |
| `networking.skill.md` | Pesan mengandung: IP, MikroTik, VLAN, latency, ping | Diagnosa jaringan, MikroTik API, SNMP |
| `research.skill.md` | Pesan mengandung: riset, investigasi, cari informasi | Workflow riset, tips pencarian, format laporan |

### Membuat Skill Baru

Buat file `skills/nama-skill.skill.md`:

```markdown
# Skill: Nama Skill

## Kapan Skill Ini Aktif
[Deskripsikan konteks penggunaan]

## Tools yang Tersedia
[Tabel tool yang relevan]

## Workflow
[Langkah-langkah penggunaan]
```

Tambahkan keyword deteksi di `core/skills/skill.loader.js`:

```js
const SKILL_KEYWORDS = {
  "nama-skill": /keyword1|keyword2|keyword3/i,
};
```

---

## SOUL System

SOUL adalah file Markdown yang mendefinisikan **identitas, kepribadian, dan batasan** agent secara persisten — seperti OpenClaw SOUL.md.

### File SOUL

| File | Agent | Berisi |
|------|-------|--------|
| `soul/DEFAULT.soul.md` | Semua agent (fallback) | Identitas Starclaw, kemampuan inti, batasan umum |
| `soul/social-media-agent.soul.md` | Social Media Agent | Persona kreatif, alur posting, batasan konten |
| `soul/devops-agent.soul.md` | DevOps Agent | Persona teliti, alur troubleshooting, batasan server |
| `soul/genieacs-agent.soul.md` | GenieACS Agent | Persona presisi, alur provisioning, batasan device |

### Membuat SOUL Baru

```markdown
# Nama Agent — Starclaw

## Role
[Deskripsi peran utama]

## Kepribadian
- Sifat 1
- Sifat 2

## Spesialisasi
[Kemampuan khusus]

## Batasan
[Hal yang tidak boleh dilakukan]
```

Simpan di `soul/nama-agent.soul.md`. SOUL otomatis diload saat agent diinisialisasi.

---

## Specialized Agents

Starclaw memiliki beberapa agent yang sudah terspesialisasi, masing-masing dengan SOUL dan Skills yang sesuai:

| Task Name | Agent | Spesialisasi | Skills Otomatis |
|-----------|-------|-------------|-----------------|
| `platform-assistant` | Platform Assistant | Agent generalis, handle semua task | Auto-detect dari pesan |
| `social-media` | Social Media Agent | Buat & post konten sosmed | social-media |
| `devops` | DevOps Agent | Server ops, deploy, monitoring | server-ops |
| `genieacs` | GenieACS Agent | Manajemen CPE/ONT ISP via TR-069 | genieacs, networking |
| `research` | Research Agent | Riset mendalam dari web | research |
| `openclaw-audit` | OpenClaw Mapper | Audit arsitektur platform | — |

### Cara Memanggil Specialized Agent

**Via HTTP API:**
```bash
# Social Media Agent
curl -X POST http://localhost:8080/tasks/run \
  -d '{"task":"social-media","message":"buat caption Instagram tentang layanan internet fiber"}'

# GenieACS Agent
curl -X POST http://localhost:8080/tasks/run \
  -d '{"task":"genieacs","message":"tampilkan semua device yang terdaftar di ACS"}'

# DevOps Agent
curl -X POST http://localhost:8080/tasks/run \
  -d '{"task":"devops","message":"cek status semua service dan laporkan yang bermasalah"}'

# Research Agent
curl -X POST http://localhost:8080/tasks/run \
  -d '{"task":"research","message":"riset 3 kompetitor ISP lokal dan bandingkan paket mereka"}'
```

**Via Telegram** (kirim pesan biasa — platform-assistant akan handle, atau minta langsung):
```
"sebagai social media agent, buat konten tentang promo ramadhan"
"minta genieacs agent cek device dengan serial XYZ123"
```

---

## Tools Bawaan

Semua tools terdaftar otomatis di setiap agent instance (16 tools total):

| Tool | Nama | Fungsi |
|------|------|--------|
| Shell | `shell-tool` | Eksekusi bash command di server |
| Browser | `browser-tool` | Playwright headless (stealth, anti-deteksi) |
| File System | `fs-tool` | Baca/tulis/hapus file |
| HTTP | `http-tool` | HTTP request ke URL eksternal |
| Web Search | `web-search-tool` | Pencarian via DuckDuckGo |
| Codebase Search | `codebase-search-tool` | Cari kode di project |
| Docker | `docker-tool` | Manage container Docker |
| Doctor | `doctor-tool` | Diagnostik & self-repair platform |
| Plugin | `plugin-tool` | Load/unload/buat/install plugin |
| Sub-Agent | `sub-agent-tool` | Spawn child agent untuk tugas paralel |
| Cron | `cron-tool` | Buat/kelola jadwal task otomatis |
| Time | `time-tool` | Info waktu & timezone (WIB) |
| **GenieACS** | `genieacs-tool` | **Manajemen CPE/ONT via GenieACS REST API** |
| **Social Media** | `social-media-tool` | **Post ke Telegram, Twitter/X, webhook** |
| **Notification** | `notification-tool` | **Email (Mailgun/SendGrid), Pushover, webhook** |
| **Database** | `database-tool` | **SQLite lokal — insert/select/query** |

### Contoh Perintah Agent

```
"cek status platform"           → doctor-tool health-report
"cari info tentang Node.js 22"  → browser-tool search
"buat folder backup di /tmp"    → shell-tool + fs-tool
"jadwalkan cek server tiap 5m"  → cron-tool add interval=5m
"spawn agent riset kompetitor"  → sub-agent-tool spawn
"install plugin dari github"    → plugin-tool install-github
```

---

## Plugin System (ClawHub)

Plugin adalah ekstensi yang menambah tools baru ke agent secara dinamis tanpa restart.

### Struktur Plugin

```js
// plugins/nama-plugin/index.js
module.exports = {
  name: "nama-plugin",
  version: "1.0.0",
  description: "Deskripsi plugin",
  tools: [
    {
      name: "nama-tool",
      description: "Deskripsi tool",
      parameters: { type: "object", properties: { ... }, required: [...] },
      async run(input) { return { success: true, ... }; }
    }
  ],
  workflows: [],
  activate(context) { },   // dipanggil saat plugin diload
  deactivate() { },        // dipanggil saat plugin diunload
};
```

### Cara Kelola Plugin

**Via Agent (chat natural):**
```
"load semua plugin"
"buat plugin monitor website"
"install plugin dari github:user/repo"
```

**Via Telegram commands:**
```
/plugin list          → Daftar plugin terinstall
/plugin store         → Browse ClawHub registry
/plugin create <nama> → Buat plugin baru dari template
/plugin install github:user/repo → Install dari GitHub
/plugin run <nama>    → Jalankan plugin sebagai service
/plugin stop <nama>   → Hentikan plugin service
/plugin logs <nama>   → Lihat log plugin
```

**Via API:**
```bash
# Minta agent load semua plugin
curl -X POST http://localhost:8080/tasks/run \
  -H "Content-Type: application/json" \
  -d '{"task":"platform-assistant","message":"load semua plugin"}'
```

### Plugin Bawaan

| Plugin | Deskripsi |
|--------|-----------|
| `hello-world` | Contoh plugin minimal (template referensi) |
| `github` | Baca repo & issues GitHub (butuh `GITHUB_TOKEN` untuk private repo) |
| `genieacs-monitor` | Monitoring GenieACS (TR-069/CWMP) |

---

## Channel Telegram

### Setup Awal

1. Buat bot via [@BotFather](https://t.me/BotFather), dapatkan `TELEGRAM_BOT_TOKEN`
2. Set di `.env`:
   ```env
   AGENT_CHANNEL=telegram
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_PAIRING_ENABLED=true
   TELEGRAM_PAIRING_CODE=kode-rahasia-anda
   ```
3. Jalankan: `npm run start:all`

### Alur Penggunaan Pertama

```
/start              → Bot tampilkan instruksi pairing
/pair kode-rahasia  → Pairing berhasil, chat terdaftar
/start              → Mulai onboarding (setup persona agent)
  → Nama agent?     → "Jarvis"
  → Karakter?       → "profesional, efisien"
  → Skill?          → "coding, monitoring, analisis"
  → Panggilan?      → "Boss"
✅ Agent siap digunakan
```

### Commands Telegram

| Command | Fungsi |
|---------|--------|
| `/start` | Setup persona agent (onboarding) |
| `/help` | Tampilkan semua command |
| `/status` | Status agent, uptime, memory usage |
| `/doctor` | Health check platform |
| `/audit <teks>` | Audit arsitektur OpenClaw |
| `/noc` | Trigger workflow NOC incident |
| `/reset_persona` | Reset & setup ulang persona |
| `/plugin` | Menu kelola plugin |
| `/plugin list` | Daftar plugin terinstall |
| `/plugin store` | Browse ClawHub registry |
| `/plugin create <nama>` | Buat plugin baru |
| `/plugin install <github:user/repo>` | Install dari GitHub |
| `/plugin run <nama>` | Jalankan plugin sebagai service |
| `/plugin stop <nama>` | Hentikan plugin service |
| `/plugin logs <nama>` | Lihat logs plugin |
| `/cron` | Menu cron job |
| `/cron add <interval> <task>` | Buat jadwal baru |
| `/cron list` | Daftar semua jadwal |
| `/cron remove <id>` | Hapus jadwal |
| `/pair <code>` | Daftarkan chat dengan kode akses |
| `/unpair` | Hapus pairing chat |

### Fitur Telegram

- **Persona per-user**: Setiap user bisa set nama, karakter, skill, dan panggilan agent yang berbeda
- **Progress update real-time**: Pesan "⏳ sedang berpikir..." diupdate setiap step tool dipanggil
- **Intercept pengingat otomatis**: Kalimat seperti "ingatkan saya jam 4 sore" langsung dibuat cron job tanpa LLM
- **Plugin manager via chat**: Install, jalankan, hentikan plugin langsung dari Telegram

---

## Cron & Scheduler

Agent dapat menjadwalkan task otomatis yang persist antar restart.

### Format

| Format | Contoh | Arti |
|--------|--------|------|
| Interval | `30s`, `5m`, `1h`, `1d` | Berulang setiap interval |
| Datetime | `2026-03-30T15:00:00+07:00` | Satu kali di waktu tertentu |

### Via Chat (Natural Language)

```
"jadwalkan cek status server setiap 5 menit"
"ingatkan saya jam 9 pagi besok untuk meeting"
"jalankan backup database setiap hari jam 2 malam"
```

### Via Telegram

```
/cron add 5m cek status website
/cron add 1h backup database
/cron list
/cron remove <job-id>
```

Data cron disimpan di `data/cron-jobs.json` dan di-restore saat restart.

---

## Sub-Agent (Multi-Agent)

Agent utama bisa spawn child agent untuk mengerjakan tugas paralel.

```
"riset 3 kompetitor sekaligus, masing-masing satu agent"
→ sub-agent-tool spawn: research-agent-1 (task: riset kompetitor A)
→ sub-agent-tool spawn: research-agent-2 (task: riset kompetitor B)
→ sub-agent-tool spawn: research-agent-3 (task: riset kompetitor C)
→ cek status semua child
→ ambil hasil dan buat laporan gabungan
```

Child agent punya tools lengkap yang sama dengan parent, berjalan non-blocking.

---

## Memory System

### Short Memory (Per Session)

- Kapasitas: max 30 interaksi per agent
- Auto-summarize saat mendekati token budget
- Injeksi ke prompt sebagai konteks percakapan
- Reset saat process restart

### Long Memory (Persistent)

- Backend: JSON file (`data/memory/long-memory.json`)
- Vector search: cosine similarity (in-memory, OpenAI embedding opsional)
- Agent bisa menyimpan fakta penting: `memory.long.put(key, value)`
- Pencarian semantik: `memory.long.searchSimilar(query)`

---

## GenieACS — Manajemen Perangkat ISP

Starclaw terintegrasi penuh dengan **GenieACS ACS server** untuk manajemen perangkat CPE/ONT/Router ISP via protokol TR-069/CWMP.

### Setup

```env
GENIEACS_URL=http://localhost:7557
GENIEACS_USER=admin        # opsional
GENIEACS_PASS=password     # opsional
```

### Contoh Perintah via Chat

```
"tampilkan semua device yang terdaftar di ACS"
"cek status device dengan serial number ABC123"
"reboot CPE dengan ID XYZ-456"
"set DNS device ABC123 ke 8.8.8.8"
"tampilkan semua fault yang ada"
"ubah SSID WiFi device XYZ ke 'MyNetwork' dan password ke 'secret123'"
```

### Operasi yang Didukung

| Operasi | Action |
|---------|--------|
| List semua device | `list-devices` |
| Detail 1 device | `get-device` |
| Reboot device | `reboot` |
| Factory reset | `factory-reset` |
| Set parameter | `set-parameter` |
| Get parameter | `get-parameter` |
| Task kustom TR-069 | `task` |
| List fault | `list-faults` |
| Clear fault | `clear-fault` |
| List preset | `list-presets` |
| Hapus device | `delete-device` |

### Plugin GenieACS

```
/plugin load genieacs-monitor
```

Plugin v2.0 sudah terintegrasi dengan `genieacs-tool` yang lengkap.

---

## Social Media & Notifikasi

### Platform yang Didukung

| Platform | Tool | Konfigurasi |
|----------|------|-------------|
| Telegram broadcast | `social-media-tool` | `TELEGRAM_BOT_TOKEN` |
| Telegram specific chat | `social-media-tool` | `TELEGRAM_BOT_TOKEN` |
| Twitter/X | `social-media-tool` | `TWITTER_BEARER_TOKEN` |
| Discord/Slack/webhook | `social-media-tool` | `SOCIAL_WEBHOOK_URL` |
| Email (Mailgun) | `notification-tool` | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` |
| Email (SendGrid) | `notification-tool` | `SENDGRID_API_KEY` |
| Pushover (push notif) | `notification-tool` | `PUSHOVER_TOKEN`, `PUSHOVER_USER` |
| Webhook notifikasi | `notification-tool` | `NOTIFICATION_WEBHOOK_URL` |

### Contoh Perintah

```
"buat caption Instagram tentang promo internet fiber dan posting ke Telegram"
"broadcast pengumuman maintenance ke semua user Telegram"
"tweet: Platform Starclaw AI Agent kini mendukung GenieACS TR-069 #AI #ISP"
"kirim email ke admin@company.com: server sudah kembali normal"
"jadwalkan posting promo setiap Senin jam 9 pagi"
```

### Plugin Social Media

```
/plugin load social-media
```

Atau load via agent:
```
"load plugin social-media"
```

---

## Workflow NOC

Module khusus untuk Network Operations Center (monitoring jaringan).

### Workflow Incident

Trigger via Telegram `/noc` atau API:

```
POST /tasks/run
{ "task": "noc-incident-workflow", "signal": "link-down", "severity": "high" }
```

Alur:
```
Monitor Agent  → Deteksi anomali jaringan
Analyzer Agent → Analisis root cause
Executor Agent → Eksekusi tindakan (reroute, restart service)
```

Tools NOC:
- `mikrotik-tool`: Manage router MikroTik via API
- `ping-tool`: Cek konektivitas host
- `snmp-tool`: SNMP queries untuk monitoring perangkat

---

## API HTTP

Base URL: `http://localhost:8080`

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/health` | Health check service |
| `GET` | `/events` | Semua event yang tersimpan |
| `GET` | `/agents/status` | Status semua agent (aktif/tidak) |
| `POST` | `/tasks/run` | Jalankan task via agent |

### Contoh Request

```bash
# Health check
curl http://localhost:8080/health

# Jalankan task
curl -X POST http://localhost:8080/tasks/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "platform-assistant",
    "message": "cek status platform dan buat laporan"
  }'

# NOC workflow
curl -X POST http://localhost:8080/tasks/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "noc-incident-workflow",
    "signal": "link-down",
    "severity": "high"
  }'
```

### WebSocket

Connect ke `ws://localhost:8080/ws` untuk menerima event real-time:

```js
const ws = new WebSocket("ws://localhost:8080/ws");
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // event.type: agent_started, tool_called, tool_result, agent_finished, ...
};
```

---

## Dashboard

Dashboard Next.js di `http://localhost:3001` menampilkan:
- Status semua agent (aktif/selesai)
- Event log real-time via WebSocket
- Tombol trigger task langsung dari UI

---

## Panduan Developer

### Menambah Tool Baru

1. Buat file `core/tools/nama.tool.js`:

```js
"use strict";

function createNamaTool() {
  return {
    name: "nama-tool",
    description: "Deskripsi tool yang jelas untuk LLM",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "..." }
      },
      required: ["action"]
    },
    async run(input) {
      // implementasi
      return { success: true, result: "..." };
    }
  };
}

module.exports = { createNamaTool };
```

2. Daftarkan di `core/tools/index.js`:

```js
const { createNamaTool } = require("./nama.tool");
// ... di dalam createToolRegistry():
const builtins = [
  // ...tools lain
  createNamaTool(),
];
```

### Menambah Agent Baru

1. Buat file `modules/shared/agents/nama.agent.js`:

```js
"use strict";
const { createBaseAgent } = require("../../../core/agent/agent.factory");

function createNamaAgent() {
  return createBaseAgent({
    name: "nama-agent",
    customTools: [],  // tool tambahan opsional
  });
}

module.exports = { createNamaAgent };
```

2. Daftarkan di `core/orchestrator/task.router.js`:

```js
const { createNamaAgent } = require("../../modules/shared/agents/nama.agent");

const routes = {
  "platform-assistant": createPlatformAssistantAgent(),
  "nama-task": createNamaAgent(),   // ← tambahkan ini
};
```

### Menambah Workflow Baru

Register dinamis di orchestrator tanpa mengubah file inti:

```js
const orchestrator = buildDefaultOrchestrator();

orchestrator.registerWorkflow("nama-workflow", async ({ payload, eventBus }) => {
  // implementasi workflow
  return { result: "selesai" };
});
```

### Membuat Plugin

```bash
# Via agent chat
"buat plugin monitor-redis"

# Via Telegram
/plugin create monitor-redis

# Manual: buat folder plugins/monitor-redis/index.js
# Lihat plugins/hello-world/index.js sebagai template
```

### Membuat Skill Baru

```markdown
<!-- skills/nama-skill.skill.md -->
# Skill: Nama Skill

## Kapan Skill Ini Aktif
Gunakan saat user meminta [deskripsi konteks]

## Tools yang Tersedia
| Tool | Kapan |
|------|-------|
| `nama-tool` | deskripsi |

## Workflow
1. Langkah pertama
2. Langkah kedua
```

Tambahkan keyword di `core/skills/skill.loader.js`:
```js
const SKILL_KEYWORDS = {
  "nama-skill": /keyword1|keyword2/i,
};
```

### Membuat SOUL Baru

```markdown
<!-- soul/nama-agent.soul.md -->
# Nama Agent

## Role
[Deskripsi peran]

## Kepribadian
- Sifat 1

## Batasan
- Hal yang tidak boleh dilakukan
```

### Struktur Event

Semua event dikirim via `eventBus` dan disimpan di `eventStore`:

| Event | Kapan |
|-------|-------|
| `task.received` | Orchestrator menerima task |
| `agent_started` | Agent mulai run |
| `planner_decision` | Planner selesai membuat plan |
| `tool_called` | Executor memanggil tool |
| `tool_result` | Tool selesai dieksekusi |
| `agent_finished` | Agent selesai (berhasil/gagal) |
| `task.completed` | Task selesai |
| `task.failed` | Task gagal |

---

## Requirement

| Dependency | Versi | Fungsi |
|------------|-------|--------|
| Node.js | >= 18.0.0 | Runtime |
| express | ^5.2.1 | API Server |
| ws | ^8.20.0 | WebSocket |
| next | ^16.2.1 | Dashboard UI |
| playwright | ^1.58.2 | Browser automation |
| react / react-dom | ^19 | Dashboard frontend |

**Optional:**
- `OPENAI_API_KEY` — Tanpa ini platform berjalan dengan Mock Provider (tidak ada AI sebenarnya)
- `GITHUB_TOKEN` — Untuk akses private GitHub repo via plugin github
- Redis, PostgreSQL — Infrastructure opsional (sudah ada adapter-nya)
