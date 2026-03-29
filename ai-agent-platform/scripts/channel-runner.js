"use strict";

const { buildDefaultOrchestrator } = require("../core/orchestrator/orchestrator");
const { loadEnvConfig } = require("../config/env.config");
const { createLogger } = require("../core/utils/logger");
const { createTelegramChannel } = require("../core/channels/telegram.channel");

async function runLocalChannel(orchestrator) {
  const result = await orchestrator.run("openclaw-audit", {
    message: "audit architecture",
    openclawSnapshot: {
      modules: ["agent-core", "basic-tools"],
      observability: { tracing: false, metrics: false },
      reliability: { retries: false, queue: false },
      memory: { longTerm: false },
    },
  });
  console.log("[channel:local] audit result:", {
    score: result.score,
    summary: result.summary,
  });
}

async function runCliChannel(orchestrator) {
  const input = process.argv.slice(2).join(" ") || "please audit openclaw architecture";
  const result = await orchestrator.run("openclaw-audit", {
    message: input,
    openclawSnapshot: {
      modules: ["agent-core"],
      observability: { tracing: false, metrics: false },
      reliability: { retries: false, queue: false },
      memory: { longTerm: false },
    },
  });

  console.log("[channel:cli] final response:", result.finalResponse || result.summary);
}

async function main() {
  const env = loadEnvConfig();
  const orchestrator = buildDefaultOrchestrator();
  const logger = createLogger("channel-runner");

  if (env.agentChannel === "cli") {
    await runCliChannel(orchestrator);
    return;
  }

  if (env.agentChannel === "telegram") {
    const telegramChannel = createTelegramChannel({
      botToken: env.telegramBotToken,
      orchestrator,
      logger,
    });
    await telegramChannel.start();
    return;
  }

  await runLocalChannel(orchestrator);
}

main().catch((error) => {
  console.error("channel runner error:", error.message);
  process.exitCode = 1;
});
