"use strict";

const { createHttpServer } = require("../../core/utils/helpers");
const { createLogger } = require("../../core/utils/logger");
const { appConfig } = require("../../config/app.config");
const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");

const logger = createLogger("apps/api");
const orchestrator = buildDefaultOrchestrator();

const server = createHttpServer(async (req, res, body) => {
  if (req.url === "/health" && req.method === "GET") {
    return {
      statusCode: 200,
      payload: { status: "ok", service: "starclaw-api" },
    };
  }

  if (req.url === "/tasks/run" && req.method === "POST") {
    const task = body && body.task ? body.task : "openclaw-audit";
    const result = await orchestrator.run(task, body || {});
    return { statusCode: 200, payload: { ok: true, result } };
  }

  return { statusCode: 404, payload: { error: "Not Found" } };
});

server.listen(appConfig.port, () => {
  logger.info("API aktif", { port: appConfig.port });
});
