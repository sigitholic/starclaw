"use strict";

const fs = require("fs");
const path = require("path");

function injectLocalEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
  } catch (err) {
    // Abaikan jika .env tidak ada
  }
}

injectLocalEnv();

function loadEnvConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 8080),
    dashboardPort: Number(process.env.DASHBOARD_PORT || 3001),
    wsPath: process.env.WS_PATH || "/ws",
    llmProvider: process.env.LLM_PROVIDER || "mock",
    llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    agentChannel: process.env.AGENT_CHANNEL || "local",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramPairingEnabled: (process.env.TELEGRAM_PAIRING_ENABLED || "true").toLowerCase() === "true",
    telegramPairingCode: process.env.TELEGRAM_PAIRING_CODE || "",
    telegramPairingStorePath: process.env.TELEGRAM_PAIRING_STORE_PATH || "",
  };
}

module.exports = { loadEnvConfig };
