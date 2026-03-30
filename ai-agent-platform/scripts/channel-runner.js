"use strict";

const { buildDefaultOrchestrator } = require("../core/orchestrator/orchestrator");
const { loadEnvConfig } = require("../config/env.config");
const { createLogger } = require("../core/utils/logger");
const { createTelegramChannel } = require("../core/channels/telegram.channel");

async function runLocalChannel(orchestrator) {
  // Jalankan health-check awal saat startup
  const result = await orchestrator.run("platform-assistant", {
    message: "status platform starclaw",
  });
  console.log("[channel:local] assistant result:", {
    summary: result.summary,
    response: result.finalResponse,
  });

  // Tahan event loop agar proses tidak exit (signal listener saja tidak cukup di Node.js)
  const keepAlive = setInterval(() => {}, 1 << 30);

  console.log("[channel:local] Channel siaga. Tekan Ctrl+C untuk berhenti.");
  await new Promise((resolve) => {
    process.once("SIGINT", () => { clearInterval(keepAlive); resolve(); });
    process.once("SIGTERM", () => { clearInterval(keepAlive); resolve(); });
  });
}

async function runCliChannel(orchestrator) {
  const input = process.argv.slice(2).join(" ") || "status platform starclaw";
  const result = await orchestrator.run("platform-assistant", {
    message: input,
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
      pairingEnabled: env.telegramPairingEnabled,
      pairingCode: env.telegramPairingCode,
      pairingStorePath: env.telegramPairingStorePath || undefined,
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
