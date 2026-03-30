"use strict";

require("../config/load-env").loadEnv();

const { buildDefaultOrchestrator } = require("../core/orchestrator/orchestrator");
const { loadEnvConfig } = require("../config/env.config");
const { createLogger } = require("../core/utils/logger");
const { createTelegramChannel } = require("../core/channels/telegram.channel");

/**
 * Self-healing startup — jalankan diagnostik dan auto-load plugin saat boot.
 * Dijalankan sebelum channel aktif menerima pesan.
 */
async function selfHealingStartup(orchestrator, logger) {
  logger.info("Menjalankan self-healing startup check...");

  try {
    // 1. Jalankan diagnostik platform
    const diagResult = await orchestrator.run("platform-assistant", {
      message: "jalankan doctor-tool action diagnose target all dan laporkan hasilnya secara singkat",
    });

    const response = diagResult.finalResponse || diagResult.summary || "";
    logger.info("Startup diagnostics selesai", { summary: response.slice(0, 200) });

    // 2. Auto-load semua plugin dari folder plugins/
    try {
      const path = require("path");
      const fs = require("fs");
      const { createPluginManager } = require("../core/plugins/plugin.manager");
      const { createToolRegistry } = require("../core/tools");

      const toolsRegistry = createToolRegistry();
      const pluginManager = createPluginManager({ toolsRegistry });
      const pluginsDir = path.resolve(process.cwd(), "plugins");

      if (fs.existsSync(pluginsDir)) {
        const result = pluginManager.loadPlugins(pluginsDir);
        logger.info("Auto-load plugins selesai", {
          loaded: result.loaded,
          errors: result.errors.length,
        });
        if (result.errors.length > 0) {
          result.errors.forEach(e => logger.warn(`Plugin load error: ${e.name} — ${e.error}`));
        }
      }
    } catch (pluginErr) {
      logger.warn("Auto-load plugin gagal (non-critical)", { error: pluginErr.message });
    }

    // 3. Log sessions yang tersimpan
    try {
      const { listSessions } = require("../core/memory/session.store");
      const sessions = listSessions();
      if (sessions.length > 0) {
        logger.info("Session memory ditemukan", {
          sessions: sessions.map(s => `${s.agent}(${s.interactions})`).join(", "),
        });
      }
    } catch (_) {}

    return { healthy: !response.toLowerCase().includes("broken"), response };
  } catch (err) {
    logger.warn("Self-healing startup check gagal (non-critical)", { error: err.message });
    return { healthy: false, response: err.message };
  }
}

async function runLocalChannel(orchestrator, logger) {
  await selfHealingStartup(orchestrator, logger);

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
  const { autoFormat, isAlreadyFormatted } = require("../core/utils/response.formatter");
  const raw = result.finalResponse || result.summary || "";
  const formatted = isAlreadyFormatted(raw) ? raw : autoFormat(raw);
  console.log("\n" + formatted);
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
    // Jalankan self-healing sebelum Telegram channel aktif
    await selfHealingStartup(orchestrator, logger);

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

  await runLocalChannel(orchestrator, logger);
}

main().catch((error) => {
  console.error("channel runner error:", error.message);
  process.exitCode = 1;
});
