"use strict";

const express = require("express");
const { createLogger } = require("../../core/utils/logger");
const { appConfig } = require("../../config/app.config");
const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");
const { EVENT_TYPES } = require("../../core/events/event.types");

const logger = createLogger("apps/api");
const orchestrator = buildDefaultOrchestrator();
const app = express();

app.use(express.json());

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
    const task = body.task || "openclaw-audit";
    const payload = { ...body };
    delete payload.task;
    const result = await orchestrator.run(task, payload);
    res.status(200).json({ ok: true, result });
  } catch (error) {
    logger.error("Task execution error", { message: error.message });
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(appConfig.port, () => {
  logger.info("API aktif", { port: appConfig.port });
});
