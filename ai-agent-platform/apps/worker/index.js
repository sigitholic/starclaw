"use strict";

require("../../config/load-env").loadEnv();

const { createLogger } = require("../../core/utils/logger");
const { buildDefaultOrchestrator } = require("../../core/orchestrator/orchestrator");

const logger = createLogger("apps/worker");
const orchestrator = buildDefaultOrchestrator();

async function runWorkerLoop() {
  logger.info("Worker start (single-run mode)");
  const result = await orchestrator.run("openclaw-audit", {
    openclawSnapshot: {
      modules: ["agent-core", "basic-tools", "single-memory"],
      observability: { tracing: false, metrics: false, logs: true },
      reliability: { retries: false, queue: false },
    },
  });

  logger.info("Worker selesai", { score: result.score, gapCount: result.gaps.length });
}

runWorkerLoop().catch((error) => {
  logger.error("Worker gagal", { message: error.message });
  process.exitCode = 1;
});
