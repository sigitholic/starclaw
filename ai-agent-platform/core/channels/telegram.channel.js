"use strict";

const { setTimeout: sleep } = require("timers/promises");
const { createTelegramPairingStore } = require("./telegram.pairing.store");

function createTelegramChannel({
  botToken,
  orchestrator,
  logger,
  pairingCode,
  pairingStorePath,
  pairingEnabled = true,
}) {
  const apiBase = `https://api.telegram.org/bot${botToken}`;
  const store = createTelegramPairingStore({ dataFilePath: pairingStorePath });
  let running = false;
  let offset = 0;

  async function tgCall(method, payload = {}) {
    const response = await fetch(`${apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method} gagal: ${response.status} ${text}`);
    }

    const body = await response.json();
    if (!body.ok) {
      throw new Error(`Telegram API ${method} error: ${JSON.stringify(body)}`);
    }

    return body.result;
  }

  function buildOpenClawSnapshotFromText(text) {
    const lower = String(text || "").toLowerCase();
    return {
      modules: ["agent-core", "basic-tools", lower.includes("orchestrator") ? "orchestrator" : ""].filter(Boolean),
      observability: {
        tracing: lower.includes("tracing"),
        metrics: lower.includes("metrics"),
      },
      reliability: {
        retries: lower.includes("retries"),
        queue: lower.includes("queue"),
      },
      memory: {
        longTerm: lower.includes("long memory") || lower.includes("long-term"),
      },
    };
  }

  async function handleMessage(message) {
    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();
    if (!chatId || !text) {
      return;
    }

    const chatIdStr = String(chatId);

    if (text.startsWith("/pair")) {
      if (!pairingEnabled) {
        await tgCall("sendMessage", {
          chat_id: chatId,
          text: "Mode pairing tidak aktif.",
        });
        return;
      }

      const providedCode = text.replace(/^\/pair\s*/i, "").trim();
      if (!pairingCode) {
        await tgCall("sendMessage", {
          chat_id: chatId,
          text: "Pairing code belum dikonfigurasi di server.",
        });
        return;
      }

      if (providedCode !== pairingCode) {
        await tgCall("sendMessage", {
          chat_id: chatId,
          text: "Pairing code salah.",
        });
        return;
      }

      store.pair(chatIdStr);
      await tgCall("sendMessage", {
        chat_id: chatId,
        text: `Pairing berhasil. Chat ${chatIdStr} sekarang terdaftar.`,
      });
      return;
    }

    if (text.startsWith("/unpair")) {
      store.unpair(chatIdStr);
      await tgCall("sendMessage", {
        chat_id: chatId,
        text: `Chat ${chatIdStr} sudah dihapus dari daftar pairing.`,
      });
      return;
    }

    if (pairingEnabled && !store.isPaired(chatIdStr)) {
      await tgCall("sendMessage", {
        chat_id: chatId,
        text:
          "Akses ditolak. Chat belum terdaftar.\n" +
          "Silakan pairing dulu: /pair <code>",
      });
      return;
    }

    if (text === "/start") {
      await tgCall("sendMessage", {
        chat_id: chatId,
        text:
          "Starclaw aktif. Gunakan:\n" +
          "- /pair <code> untuk pairing\n" +
          "- /audit <teks> untuk audit OpenClaw\n" +
          "- /noc untuk trigger workflow NOC\n" +
          "- /help untuk bantuan",
      });
      return;
    }

    if (text === "/help") {
      await tgCall("sendMessage", {
        chat_id: chatId,
        text: "Command: /pair <code>, /unpair, /audit <teks>, /noc, /start",
      });
      return;
    }

    if (text.startsWith("/noc")) {
      const result = await orchestrator.run("noc-incident-workflow", {
        taskId: `tg-${Date.now()}`,
        signal: "telegram-trigger",
        severity: "high",
        action: "reroute-link",
      });

      await tgCall("sendMessage", {
        chat_id: chatId,
        text:
          "NOC workflow selesai.\n" +
          `Task: ${result.taskId}\n` +
          `Monitor: ${result.monitor.summary}\n` +
          `Analyzer: ${result.analyzer.summary}\n` +
          `Executor: ${result.executor.summary}`,
      });
      return;
    }

    const inputText = text.replace(/^\/audit\s*/i, "").trim() || text;
    const auditResult = await orchestrator.run("openclaw-audit", {
      message: inputText,
      openclawSnapshot: buildOpenClawSnapshotFromText(inputText),
    });

    await tgCall("sendMessage", {
      chat_id: chatId,
      text:
        "Audit OpenClaw selesai.\n" +
        `Score: ${auditResult.score}\n` +
        `Summary: ${auditResult.summary}\n` +
        `Gaps: ${auditResult.gaps.map((g) => `${g.area}`).join(", ") || "-"}`,
    });
  }

  async function pollLoop() {
    running = true;
    logger.info("Telegram channel start polling");

    while (running) {
      try {
        const updates = await tgCall("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message"],
        });

        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message) {
            await handleMessage(update.message);
          }
        }
      } catch (error) {
        logger.error("Telegram polling error", { message: error.message });
        await sleep(1200);
      }
    }
  }

  return {
    async start() {
      if (!botToken) {
        throw new Error("TELEGRAM_BOT_TOKEN belum diset");
      }
      logger.info("Telegram pairing config", {
        pairingEnabled,
        pairedChats: store.list().length,
        pairingStorePath: store.filePath,
      });
      await pollLoop();
    },
    stop() {
      running = false;
    },
  };
}

module.exports = { createTelegramChannel };
