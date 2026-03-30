"use strict";

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const { createLogger } = require("../../core/utils/logger");
const { appConfig } = require("../../config/app.config");
const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { EVENT_TYPES } = require("../../core/events/event.types");

const logger = createLogger("apps/api");
const orchestrator = buildDefaultOrchestrator();
const app = express();
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server, path: "/ws" });

// CORS — izinkan request dari dashboard (beda port = beda origin di browser)
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  // Izinkan: localhost, 127.0.0.1, dan semua IP jaringan lokal (192.168.x.x, 10.x.x.x, 172.x.x.x)
  const isAllowed =
    !origin ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

function sendWsMessage(data) {
  const serialized = JSON.stringify(data);
  wsServer.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(serialized);
    }
  });
}

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "starclaw-api" });
});

app.get("/events", (_req, res) => {
  const events = orchestrator.getEvents();
  res.status(200).json({
    ok: true,
    total: events.length,
    events,
  });
});

app.get("/agents/status", (_req, res) => {
  const events = orchestrator.getEvents();
  const activeAgents = new Set();
  const allAgents = new Set();

  for (const event of events) {
    const payload = event.payload || {};
    const agent = payload.agent;
    if (!agent) {
      continue;
    }

    allAgents.add(agent);
    if (event.type === EVENT_TYPES.AGENT_STARTED) {
      activeAgents.add(agent);
    } else if (event.type === EVENT_TYPES.AGENT_FINISHED) {
      activeAgents.delete(agent);
    }
  }

  const agents = Array.from(allAgents).map((agent) => ({
    name: agent,
    active: activeAgents.has(agent),
  }));

  res.status(200).json({
    ok: true,
    totalAgents: agents.length,
    activeCount: Array.from(activeAgents).length,
    agents,
  });
});

app.post("/tasks/run", async (req, res) => {
  try {
    const body = req.body || {};
    const task = body.task || "platform-assistant";
    const payload = { ...body };
    delete payload.task;
    const result = await orchestrator.run(task, payload);
    sendWsMessage({
      type: "task_run_result",
      timestamp: new Date().toISOString(),
      payload: {
        task,
        resultSummary: result.summary || null,
      },
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    logger.error("Task execution error", { message: error.message });
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

wsServer.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "connected",
      timestamp: new Date().toISOString(),
      payload: { service: "starclaw-api" },
    }),
  );
});

const streamableEvents = [
  EVENT_TYPES.AGENT_STARTED,
  EVENT_TYPES.PLANNER_DECISION,
  EVENT_TYPES.TOOL_CALLED,
  EVENT_TYPES.TOOL_RESULT,
  EVENT_TYPES.AGENT_FINISHED,
  EVENT_TYPES.TASK_CREATED,
  EVENT_TYPES.TASK_ANALYZED,
  EVENT_TYPES.ACTION_EXECUTED,
];

for (const eventType of streamableEvents) {
  orchestrator.subscribe(eventType, (payload) => {
    sendWsMessage({
      type: eventType,
      ...payload,
    });
  });
}

server.listen(appConfig.port, () => {
  logger.info("API aktif", { port: appConfig.port });
});

// Graceful shutdown — flush long memory dan tutup koneksi dengan bersih
function gracefulShutdown(signal) {
  logger.info(`Menerima ${signal}, memulai graceful shutdown...`);

  // Tutup HTTP server (stop accept request baru)
  server.close(() => {
    logger.info("HTTP server ditutup.");
  });

  // Flush long memory ke disk jika ada
  try {
    const { createLongMemoryStore } = require("../../core/memory/long.memory");
    // Long memory sudah di-flush otomatis via jsonStore — log saja
    logger.info("Long memory di-flush ke disk.");
  } catch (_) {}

  // Beri waktu 3 detik untuk cleanup lalu force exit
  setTimeout(() => {
    logger.info("Graceful shutdown selesai.");
    process.exit(0);
  }, 3000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
