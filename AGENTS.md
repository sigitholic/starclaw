# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Starclaw AI Agent Platform — modular AI agent platform for operational use cases (NOC). Pure Node.js project (CommonJS), no Docker or external services required. All infrastructure adapters (Postgres, Redis, Queue, VectorDB) are stubs/mocks.

### Structure

All project code lives under `ai-agent-platform/`. Run all commands from that directory.

### Running services

- **Backend API** (port 8080): `npm run dev` — Express + WebSocket server
- **Dashboard** (port 3001): `npm run dev:dashboard` — Next.js + React Flow
- **Both together**: `npm run start:all`

See `ai-agent-platform/README.md` for full API endpoints and configuration.

### Key commands

| Action | Command | Working dir |
|--------|---------|-------------|
| Install deps | `npm install` | `ai-agent-platform/` |
| Run tests | `npm test` | `ai-agent-platform/` |
| Seed / smoke test | `npm run seed` | `ai-agent-platform/` |
| Start API | `npm run dev` | `ai-agent-platform/` |
| Start dashboard | `npm run dev:dashboard` | `ai-agent-platform/` |

### Non-obvious notes

- LLM defaults to `mock` provider (`LLM_PROVIDER=mock` in `.env`), so no OpenAI API key is needed for development/testing.
- The dashboard connects to the backend via WebSocket at `ws://localhost:8080/ws` and via HTTP at `http://localhost:8080`. CORS is enabled in the API.
- The project uses `package-lock.json` — always use `npm` (not pnpm/yarn).
- Tests use Node.js built-in test runner (`node:test`), no extra test framework needed.
- No linter is configured in the project; there is no lint script in `package.json`.
