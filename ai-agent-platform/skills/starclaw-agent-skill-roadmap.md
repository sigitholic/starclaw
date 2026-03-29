# Starclaw Agent Skill Roadmap (Step-by-Step)

Dokumen ini menyimpan **skill prompt bertahap** sebagai acuan implementasi Starclaw, dimulai dari single-agent core hingga observability dashboard real-time.

---

## PHASE 1 — Minimal Agent Core (Planner-Executor)

### Prompt Inti
You are building a minimal AI agent core system in Node.js.

Requirements:
- Implement a single-agent loop using a planner-executor pattern
- Use an LLM function (mock or real API) as the planner
- The planner decides:
  1. Respond directly
  2. Call a tool

Components:
1. planner.js
   - Input: user message + history
   - Output: JSON { action: "respond" | "tool", tool_name?, input? }

2. executor.js
   - Execute tool if requested
   - Return result

3. tools/
   - Create at least 2 tools:
     - getTime()
     - simpleHttpRequest(url)

4. memory.js
   - Store last 5 interactions only

5. logger.js
   - Log each step:
     - planner decision
     - tool call
     - result

Constraints:
- Keep it modular
- No framework (pure Node.js)
- All outputs must be structured JSON internally

Goal:
Agent must complete a loop and print final response.

### Acceptance Criteria
- Planner selalu mengembalikan JSON valid (`respond` atau `tool`).
- Executor hanya mengeksekusi tool terdaftar.
- Memory rolling window berisi maksimal 5 interaksi.
- Logger mencatat keputusan planner dan hasil final.

### Deliverable
- `core/agent/planner.js`
- `core/agent/executor.js`
- `core/tools/time.tool.js`
- `core/tools/http.tool.js`
- `core/memory/short.memory.js`
- `core/utils/logger.js`

---

## PHASE 2 — Token-Aware Memory Management

### Prompt Inti
Enhance the existing agent system with token-aware memory management.

Requirements:
1. Implement context window limit (e.g. max 3000 tokens simulated)
2. If history exceeds limit:
   - Summarize older messages into a compact form
3. Keep:
   - recent messages (last 3)
   - summarized history
4. Add token estimation function:
   - Rough estimate: 1 token = 4 chars
5. Modify planner input:
   - Include only relevant context
6. Add logs:
   - token usage per step
   - when summarization happens

Goal:
Prevent context explosion while preserving reasoning quality.

### Acceptance Criteria
- Ada token estimator yang konsisten digunakan planner.
- Saat limit terlewati, summarization terjadi otomatis.
- Planner menerima konteks gabungan: `summary + recent(3)`.
- Log token usage tersedia per loop.

### Deliverable
- `core/memory/token.manager.js`
- `core/memory/summarizer.js`
- update `core/agent/planner.js`
- update `core/memory/short.memory.js`

---

## PHASE 3 — Multi-Agent Architecture

### Prompt Inti
Extend the system into a multi-agent architecture.

Requirements:
1. Create agent types:
   - monitorAgent
   - analyzerAgent
   - executorAgent
2. Implement orchestrator:
   - Receives task
   - Routes to appropriate agent
3. Agents communicate via events:
   - task_created
   - task_analyzed
   - action_executed
4. Use simple event bus (Node.js EventEmitter)
5. Each agent:
   - Has its own planner
   - Has limited memory

Goal:
Simulate a workflow:
monitor → analyzer → executor

### Acceptance Criteria
- Routing task berbasis jenis pekerjaan berjalan benar.
- Event antar-agent terkirim berurutan sesuai workflow.
- Tiap agent memiliki memory terisolasi.

### Deliverable
- `modules/noc/agents/monitor.agent.js`
- `modules/noc/agents/analyzer.agent.js`
- `modules/noc/agents/executor.agent.js`
- `core/orchestrator/orchestrator.js`
- `core/events/event.bus.js`

---

## PHASE 4 — Event-Driven Traceability

### Prompt Inti
Implement an event-driven architecture for the agent system.

Requirements:
1. Create global event bus
2. Emit events:
   - agent_started
   - planner_decision
   - tool_called
   - tool_result
   - agent_finished
3. Each event must include:
   - timestamp
   - agent name
   - payload
4. Store events in memory (array)

Goal:
All agent activity must be traceable step-by-step.

### Acceptance Criteria
- Semua transisi penting agent termonitor sebagai event.
- Payload event konsisten (timestamp, agent, payload).
- Event store bisa di-query untuk audit.

### Deliverable
- `core/events/event.types.js`
- `core/events/event.store.js`
- update orchestrator + planner/executor hooks

---

## PHASE 5 — Backend API Monitoring (Express)

### Prompt Inti
Create a backend API for agent monitoring.

Requirements:
1. Endpoint: /events
   - Return all agent events
2. Endpoint: /agents/status
   - Show active agents
3. Use Express.js

Goal:
Expose agent activity for frontend visualization.

### Acceptance Criteria
- `/events` mengembalikan event timeline JSON.
- `/agents/status` mengembalikan state agent aktif/nonaktif.
- API tahan terhadap request paralel dasar.

### Deliverable
- `apps/api` berbasis Express
- event read model untuk endpoint monitoring

---

## PHASE 6 — Frontend Real-Time Dashboard (Next.js)

### Prompt Inti
Build a real-time dashboard using Next.js.

Requirements:
1. Connect to backend via WebSocket
2. Display:
   - Event timeline (logs)
   - Agent graph (nodes and connections)
3. Use:
   - React Flow (for graph)
   - Simple list (for logs)
4. Each node:
   - Represents agent
   - Changes state when active

Goal:
User can visually see agent workflow in real-time.

### Acceptance Criteria
- Dashboard menerima event stream real-time.
- Graph workflow memperlihatkan transisi monitor→analyzer→executor.
- Node state berubah sesuai event.

### Deliverable
- `apps/dashboard` (Next.js app)
- websocket client + state manager
- komponen timeline + graph

---

## Improvement yang Direkomendasikan (Tambahan dari Prompt Awal)

1. **Tambahkan JSON schema untuk planner output**  
   Mencegah output planner ambigu saat pindah dari mock ke LLM real.

2. **Tambah retry + timeout wrapper di executor**  
   Tool call lebih tahan gagal dan siap untuk production use case.

3. **Buat scoring framework gap analysis**  
   Misal score berdasarkan reliability, observability, modularity, security.

4. **Pisahkan event store read model**  
   Memudahkan backend API melayani timeline dan status agent tanpa coupling ke engine utama.

5. **Tambah test matrix per fase**  
   - unit test (planner/memory/tools)  
   - integration test (orchestrator + event bus)  
   - e2e smoke (API + dashboard stream)

6. **Tambahkan contract untuk tool registry**  
   Validasi bahwa semua tool wajib punya `name` dan `run(input)`.

---

## Definition of Done (Roadmap Keseluruhan)

- Sistem agent berjalan end-to-end dari task masuk hingga event terekam.
- Memory aman terhadap context explosion.
- Multi-agent workflow dapat ditelusuri via API.
- Dashboard menampilkan workflow real-time secara visual.
- Seluruh fase punya test minimal yang lulus.
