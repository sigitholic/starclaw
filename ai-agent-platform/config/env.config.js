"use strict";

function loadEnvConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 8080),
    dashboardPort: Number(process.env.DASHBOARD_PORT || 3001),
    wsPath: process.env.WS_PATH || "/ws",
    llmProvider: process.env.LLM_PROVIDER || "mock",
    llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    agentChannel: process.env.AGENT_CHANNEL || "local",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  };
}

module.exports = { loadEnvConfig };
